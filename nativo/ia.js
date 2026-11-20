import { allied, buildCells, buildCost, buildTargetScore, canAttack, canCounter, canRepair, damageAmount,
  distance, enemyJammers, factoryAt, isRanged, jammingZone, moveCost, neighbors, order, reachable, snapshot,
  terrainAt, terrainMoveCost, terrainTurnDamage,
  transportOptions } from './partida.js'
import { neuralScore, validProfile } from './rede-ia.js'

export const defaultAiTime = 1
export const validAiTime = seconds => Number.isInteger(seconds) && seconds >= 0 && seconds <= 60
const isOre = name => name === 'Ore Deposit' || name === 'Enriched Ore Deposit'

function valueOf(rules,unit) {
  const spec = rules.units[unit.name]
  return Math.max(60,spec.cost) * (spec.mods.includes('Linchpin') ? 1.6 : 1)
}

function hitValue(rules,unit,damage) {
  const fraction = Math.min(unit.hp,damage)/rules.units[unit.name].health
  return valueOf(rules,unit) * (fraction + (damage >= unit.hp ? .45 : 0))
}

function nearest(map,cell,targets) {
  return targets.reduce((best,target)=>Math.min(best,distance(map.width,cell,target.cell)),Infinity)
}

const boardNeighbors = new WeakMap()
const boardShores = new WeakMap()

// Terrain and jamming stay fixed while evaluating all routes for one decision.
function approachCosts(rules,map,state,side) {
  const size = map.tiles.length
  let adjacent = boardNeighbors.get(map)
  if (!adjacent) {
    adjacent = Array.from({length:size},(_,cell)=>neighbors(map,cell))
    boardNeighbors.set(map,adjacent)
  }
  const occupied = new Uint8Array(size)
  for (const unit of state.units) if (!allied(state,side,unit.side)) occupied[unit.cell] = 1
  const jammerCells = new Set(enemyJammers(rules,state,side).flatMap(unit=>jammingZone(map,unit.cell)))
  const terrainByCell = Array(size)
  const movementByUnit = new Map()
  return (spec,goals) => {
    if (!goals.length) return null
    let movement = movementByUnit.get(spec)
    if (!movement) {
      const byCell = new Float64Array(size).fill(NaN)
      const byTerrain = new Map()
      movement = cell => {
        if (!Number.isNaN(byCell[cell])) return byCell[cell]
        if (spec.movementType === 'wings' && jammerCells.has(cell)) return byCell[cell] = Infinity
        const terrain = terrainByCell[cell] ??= terrainAt(rules,map,state,cell)[1]
        if (!byTerrain.has(terrain)) byTerrain.set(terrain,terrainMoveCost(rules,spec,terrain))
        return byCell[cell] = byTerrain.get(terrain)
      }
      movementByUnit.set(spec,movement)
    }
    const queue = [...new Set(goals)]
    const costs = new Float64Array(size).fill(Infinity)
    for (const cell of queue) costs[cell] = 0
    for (let index=0; index<queue.length; index++) {
      const cell = queue[index], cost = costs[cell] + movement(cell)
      for (const next of adjacent[cell]) {
        if (occupied[next] || cost >= costs[next] || !Number.isFinite(movement(next))) continue
        queue.push(next)
        costs[next] = cost
      }
    }
    return costs
  }
}

function firingPositions(rules,map,view,unit,enemies) {
  const spec = rules.units[unit.name], cells = new Set()
  const ready = {...unit,moved:false,fired:false}
  // Jammers inimigos calculados uma vez (antes, a cada casa testada).
  const jammers = spec.movementType === 'wings' ? enemyJammers(rules,view,unit.side) : undefined
  for (const target of enemies) {
    const x = target.cell % map.width, y = Math.floor(target.cell / map.width)
    const radius = spec.weaponRangeMax + Number(isRanged(spec))
    for (let dy=-radius;dy<=radius;dy++) for (let dx=-radius+Math.abs(dy);dx<=radius-Math.abs(dy);dx++) {
      const cx=x+dx, cy=y+dy
      if (cx<0 || cx>=map.width || cy<0 || cy>=map.height || !dx && !dy) continue
      const cell = cy*map.width+cx
      if (!cells.has(cell) && canAttack(rules,map,view,{...ready,cell},target) &&
          Number.isFinite(moveCost(rules,map,view,spec,cell,unit.side,jammers))) cells.add(cell)
    }
  }
  return [...cells]
}

function buildChoices(rules,map,view,builder,enemies,army,{reserve = 0,navalOnly = false,launch} = {}) {
  const local = enemies.slice().sort((a,b)=>distance(map.width,builder.cell,a.cell)-distance(map.width,builder.cell,b.cell)).slice(0,8)
  const counts = new Map()
  for (const unit of army) counts.set(unit.name,(counts.get(unit.name) ?? 0)+1)
  const canCapture = army.some(unit=>rules.units[unit.name].mods.includes('Capture'))
  const choices = []
  for (const [name,spec] of Object.entries(rules.units)) {
    const naval = spec.unitType === 'sea'
    if (!spec.damage || navalOnly && !naval) continue
    const cost = buildCost(rules,view,builder,spec)
    if (!naval && builder.credits-cost < reserve) continue
    const cells = buildCells(rules,map,view,builder,spec)
    if (!cells.length) continue
    const unit = {name,hp:spec.health,side:builder.side}
    const matchups = local.map(target=>buildTargetScore(rules,map,view,unit,target) / Math.max(75,rules.units[target.name].cost))
    const effectiveness = matchups.reduce((sum,score)=>sum+Math.max(0,score),0) / local.length
    if (!effectiveness && local.length) continue
    const repeats = counts.get(name) ?? 0
    let best
    for (const cell of cells) {
      const closest = nearest(map,cell,local)
      if (naval && launch && !launch(name,cell)) continue
      if (naval && !launch && !local.some(enemy=>rules.units[enemy.name].unitType === 'sea' ||
        neighbors(map,enemy.cell).some(next=>Number.isFinite(moveCost(rules,map,view,spec,next,builder.side))))) continue
      const value = 22 + 52*effectiveness + .025*spec.health + 2*spec.range - .027*cost -
        (repeats*7 + Math.max(0,repeats-1)*9) - .6*closest +
        (spec.mods.includes('Capture') && !canCapture ? 12 : 0) + (navalOnly ? 38 : 0)
      if (!best || value > best.value) best = {name,cell,value,repeats,naval}
    }
    if (best) choices.push(best)
  }
  const varied = choices.filter(choice=>choice.repeats < 3 && choice.value > 0)
  return (varied.length ? varied : choices).sort((a,b)=>b.value-a.value)
}

function navalProduction(rules,map,view,side,army,enemies,occupied,approach,resources) {
  const machines = army.filter(unit=>unit.credits>=0 && !unit.disabled &&
    rules.units[unit.name].mods.includes('Constructor'))
  if (!machines.length || !enemies.length) return
  const roster = view.buildable?.[side-1]
  const hulls = ['Corvette Fighter','Battlecruiser','U-Boat','Hunter Support'].filter(name=>
    rules.units[name] && (!roster || roster.includes(name)))
  if (!hulls.length) return
  const hostileShips = enemies.filter(unit=>rules.units[unit.name].unitType === 'sea')
  const fleetSize = army.filter(unit=>!unit.transported && rules.units[unit.name].unitType === 'sea').length
  const desiredFleet = Math.min(4, Math.max(map.islands ? 2 : 1,hostileShips.length+(map.islands ? 1 : 0)))
  if (fleetSize >= desiredFleet) return
  if (!boardShores.has(map)) boardShores.set(map,map.tiles.flatMap(([name],cell)=>name === 'Shore' ? [cell] : []))
  const shores = boardShores.get(map).filter(cell=>terrainAt(rules,map,view,cell)[0] === 'Shore')
  if (!shores.length) return
  const targets = hostileShips.length ? hostileShips : enemies
  const fields = new Map()
  const launch = (name,cell) => {
    const spec = rules.units[name]
    if (!fields.has(name)) {
      const ship = {name,side,hp:spec.health}
      fields.set(name,approach(spec,firingPositions(rules,map,view,ship,targets)))
    }
    return Number.isFinite(fields.get(name)?.[cell]) &&
      moveCost(rules,map,view,spec,cell,side) <= spec.range
  }
  const income = view.structures.some(tile=>tile.side === side &&
    rules.terrain[tile.name].mods.some(mod=>mod.includes('Oil Refining')))
  let best
  for (const name of hulls) {
    const reserve = rules.units[name].cost
    const docks = shores.filter(cell=>neighbors(map,cell).some(next=>!occupied.has(next) && launch(name,next)))
    if (!docks.length) continue
    const routes = new Map(), oreRoutes = new Map()
    for (const machine of machines) {
      const spec = rules.units[machine.name]
      const needsCredits = machine.credits < reserve
      if (!routes.has(spec)) routes.set(spec,approach(spec,docks))
      const route = routes.get(spec)
      if (!Number.isFinite(route?.[machine.cell])) continue
      if (needsCredits && !oreRoutes.has(spec)) oreRoutes.set(spec,approach(spec,resources))
      const mining = oreRoutes.get(spec)
      const onOre = isOre(terrainAt(rules,map,view,machine.cell)[0])
      if (needsCredits && !income && !onOre && !Number.isFinite(mining?.[machine.cell])) continue
      const priority = route[machine.cell] + (needsCredits ? 12 : 0) + reserve/100
      if (!best || priority < best.priority) best = {unit:machine.id,reserve,route,launch,priority}
    }
  }
  return best
}

const types = ['attack','move','build','factoryBuild','transport','capture','extract','repair']
export function chooseAction(rules,map,state,{
  side = state.turn,difficulty = 1,seconds = 0,profile,random,exploration = 0,stopAt = Infinity,onProgress,
} = {}) {
  const view = snapshot(state,side)
  const enemies = view.units.filter(unit=>!allied(view,unit.side,side) && !unit.cloaked)
  const partners = view.units.filter(unit=>unit.side !== side && allied(view,unit.side,side))
  const army = view.units.filter(unit=>unit.side === side)
  if (!enemies.length && !army.length) return {type:'end'}
  const deadline = Math.min(stopAt,performance.now() + seconds*1000)
  const weights = validProfile(profile) ? profile.weights : null
  const strategic = Boolean(weights || seconds || random)
  const candidates = []
  const offer = (action,score,unit,cell,target,dealt,received) => {
    if (score <= 0) return
    const spec = unit && rules.units[unit.name]
    const features = weights && [
      Math.tanh(score/65), ...types.map(type=>Number(type === action.type)),
      Math.min(1,(dealt ?? 0)/100),Math.min(1,(received ?? 0)/100),Number(target && dealt>=target.hp || false),
      unit ? unit.hp/spec.health : 0,Math.max(0,Math.min(1,(unit?.credits ?? 0)/3000)),
      spec ? Math.min(1,spec.range/8) : 0,spec?.unitType === 'sea' ? 1 : 0,
      spec?.unitType === 'air' ? 1 : 0,
      Math.min(1,army.length/24),Math.min(1,enemies.length/24),
      cell !== undefined && enemies.length ? 1/(1+nearest(map,cell,enemies)/8) : 0,
      Number(map.islands === true),Math.min(1,state.round/15),
    ]
    score += (weights ? neuralScore(weights,features) : 0) + (random ? (random()-.5)*12 : 0)
    candidates.push({action,score,unit,cell,target,dealt,received})
  }
  const occupied = new Set(view.units.map(unit=>unit.cell))
  const threateningPartners = new Set(enemies.filter(enemy=>partners.some(partner=>canAttack(rules,map,view,
    {...enemy,moved:false,fired:false},partner))).map(unit=>unit.id))
  const resources = map.tiles.flatMap(([name],cell)=>isOre(view.ore[cell] ?? name) && !occupied.has(cell) ? [cell] : [])
  const properties = view.structures.filter(tile=>!tile.side || !allied(view,side,tile.side))
  const fieldCache = new Map()
  let approach, production

  for (const unit of army) {
    if (performance.now() >= stopAt) break
    if (unit.fired || unit.disabled) continue
    const spec = rules.units[unit.name]
    const tile = view.structures.find(item=>item.cell === unit.cell)
    const capture = spec.mods.includes('Capture')
    const builder = spec.mods.includes('Constructor')
    if (!view.campaign && tile && !allied(view,side,tile.side) && capture && tile.capturer !== unit.id) {
      offer({type:'capture',unit:unit.id},75,unit,unit.cell)
    }
    const moves = reachable(rules,map,view,unit)
    const attack = (target,cell,path) => {
      if (!canAttack(rules,map,view,unit,target,cell)) return
      const attacker = {...unit,cell}
      const dealt = damageAmount(rules,map,view,attacker,target)
      if (!dealt) return
      const defender = {...target,hp:target.hp-dealt}
      const received = defender.repairing ? 0 : canCounter(rules,map,view,attacker,defender) ?
        damageAmount(rules,map,view,defender,attacker,true) : 0
      const gain = hitValue(rules,target,dealt), loss = hitValue(rules,unit,received)
      const score = 36 + .32*gain - (difficulty === 0 ? .07 : .30)*loss - Number(Boolean(path)) * 4 +
        (threateningPartners.has(target.id) ? 15 : 0)
      offer({type:'attack',unit:unit.id,target:target.id,...(path ? {path} : {})},score,unit,cell,target,dealt,received)
    }
    for (const target of enemies) {
      attack(target,unit.cell)
      if (moves.size && !isRanged(spec)) for (const cell of neighbors(map,target.cell)) {
        const path = moves.get(cell)
        if (path) attack(target,cell,path)
      }
    }
    const transport = transportOptions(rules,map,view,unit)
    const landingTargets = [...enemies,...properties]
    if (transport.includes('unload') && (nearest(map,unit.cell,landingTargets) < 5 ||
        !map.islands && unit.moved)) {
      offer({type:'transport',unit:unit.id,name:'unload'},28,unit,unit.cell)
    }
    if (unit.moved) continue
    let port, mining
    if (builder && unit.credits >= 0) {
      approach ??= approachCosts(rules,map,view,side)
      production ??= navalProduction(rules,map,view,side,army,enemies,occupied,approach,resources) ?? false
      if (production.unit === unit.id) port = production
      const [ground] = terrainAt(rules,map,view,unit.cell)
      const threatNearby = nearest(map,unit.cell,enemies) <= 5
      const needsCredits = unit.credits < (port?.reserve ?? 850)
      if (needsCredits) mining = approach(spec,resources)
      const savingForFleet = port && unit.credits < port.reserve
      const hasOre = isOre(ground)
      if (spec.mods.includes('Extractor') && hasOre && unit.credits < 2000) {
        const extractionScore = needsCredits ? (threatNearby && !savingForFleet ? 55 : 94) : 29
        offer({type:'extract',unit:unit.id},extractionScore,unit,unit.cell)
      }
      if (enemies.length && army.length < 32 && !savingForFleet) {
        const reserve = !port && !threatNearby && (hasOre || Number.isFinite(mining?.[unit.cell])) ? 250 : 0
        const choices = buildChoices(rules,map,view,unit,enemies,army,{
          reserve,navalOnly:Boolean(port),launch:port?.launch,
        }).slice(0,strategic ? 8 : 1)
        for (const choice of choices) offer({type:'build',unit:unit.id,name:choice.name,cell:choice.cell},
          choice.value,{...unit,id:-unit.id,name:choice.name,hp:rules.units[choice.name].health},choice.cell)
      }
    }
    if (unit.hp <= spec.health*.7 && canRepair(rules,map,view,unit)) {
      offer({type:'repair',unit:unit.id},14+21*(1-unit.hp/spec.health),unit,unit.cell)
    }
    if (!moves.size) continue
    approach ??= approachCosts(rules,map,view,side)
    if (!fieldCache.has(unit.name)) fieldCache.set(unit.name,approach(spec,firingPositions(rules,map,view,unit,enemies)))
    const fighting = fieldCache.get(unit.name)
    const economic = capture ? properties.filter(tile=>tile.cell === unit.cell || !occupied.has(tile.cell)).map(tile=>tile.cell) : []
    const progress = mining ?? approach(spec,economic)
    const goToPort = port && unit.credits >= port.reserve
    const sail = !port && !unit.transported && map.islands && enemies.length && !Number.isFinite(fighting?.[unit.cell]) &&
      spec.unitType === 'ground' && rules.units['Leviathan Barge']
    const shore = sail ? map.tiles.flatMap(([name],cell)=>name === 'Shore' && (!occupied.has(cell) || cell === unit.cell) ? [cell] : []) : []
    const docks = approach(spec,shore)
    for (const [cell,path] of moves) {
      const distanceGain = (field,weight) => {
        const remaining = field?.[cell] ?? Infinity
        const origin = field?.[unit.cell] ?? Infinity
        return Number.isFinite(remaining) && remaining < origin ?
          weight + Math.min(8,origin-remaining)*1.6 + 14/(1+remaining) : 0
      }
      let score = Math.max(distanceGain(fighting,builder ? 2 : 9),
        distanceGain(progress,mining ? (port ? 72 : 52) : 20),
        distanceGain(goToPort ? port.route : null,78),distanceGain(docks,10))
      if (!enemies.length && spec.damage) {
        const scouting = Math.floor(map.height/2)*map.width + Math.floor(map.width/2)
        score = Math.max(score,(distance(map.width,unit.cell,scouting)-distance(map.width,cell,scouting))*3)
      }
      if (unit.transported) {
        const landing = transportOptions(rules,map,view,{...unit,cell,moved:false,transformed:false}).includes('unload')
        const goal = enemies.length ? enemies : properties
        if (goal.length && nearest(map,cell,goal) < nearest(map,unit.cell,goal)) score += landing ? 24 : 12
      }
      const hazard = terrainTurnDamage(rules,map,view,unit,cell)
      if (hazard > 0) score -= Math.min(70,hitValue(rules,unit,hazard)*.12)
      offer({type:'move',unit:unit.id,cell,path},score,unit,cell)
    }
    if (transport.includes('Albatross Transport') && !Number.isFinite(fighting?.[unit.cell]) &&
        !Number.isFinite(progress?.[unit.cell]) && enemies.length) {
      offer({type:'transport',unit:unit.id,name:'Albatross Transport'},16,unit,unit.cell)
    }
    if (sail && transport.includes('Leviathan Barge')) {
      offer({type:'transport',unit:unit.id,name:'Leviathan Barge'},builder ? 18 : 24,unit,unit.cell)
    }
  }
  if (enemies.length && army.length < 32) for (const tile of view.structures) {
    const factory = factoryAt(view,side,tile.cell)
    if (!factory) continue
    const choices = buildChoices(rules,map,view,factory,enemies,army).slice(0,strategic ? 8 : 1)
    for (const choice of choices) offer({type:'factoryBuild',factory:tile.cell,name:choice.name,cell:choice.cell},choice.value)
  }
  if (!seconds && candidates.length > 1 && exploration && random && random() < exploration) {
    return candidates[Math.floor(random()*candidates.length)].action
  }
  candidates.sort((a,b)=>b.score-a.score)
  if (!candidates.length || !seconds) return candidates[0]?.score > 0 ? candidates[0].action : {type:'end'}
  onProgress?.(candidates[0].action)

  // Estimate replies on the current board, then inspect promising positions on the projected board.
  const movesByEnemy = new Map()
  function replyRisk(candidate,exact) {
    const {unit,cell,target,dealt,received} = candidate
    if (!unit) return 0
    const defender = {...unit,cell,hp:unit.hp-(received ?? 0),cloaked:false}
    if (defender.hp <= 0) return 0
    const board = exact ? {...view,units:[...(unit.id < 0 ? [defender] : []),...view.units.flatMap(other=>{
      if (other.id === defender.id) return [defender]
      if (other.id !== target?.id) return [other]
      return other.hp <= dealt ? [] : [{...other,hp:other.hp-dealt}]
    })]} : view
    let strongest = 0, second = 0
    for (const enemy of enemies) {
      if (performance.now() >= deadline) return null
      const spec = rules.units[enemy.name]
      if (distance(map.width,enemy.cell,cell) > spec.range+spec.weaponRangeMax+1) continue
      const hp = enemy.hp - (enemy.id === target?.id ? dealt : 0)
      if (hp <= 0) continue
      const attacker = {...enemy,hp,moved:false,fired:false}
      let damage = canAttack(rules,map,board,attacker,defender) ?
        damageAmount(rules,map,board,attacker,defender) : 0
      if (!isRanged(spec)) {
        if (!exact && !movesByEnemy.has(enemy.id)) movesByEnemy.set(enemy.id,reachable(rules,map,board,attacker))
        const paths = exact ? reachable(rules,map,board,attacker) : movesByEnemy.get(enemy.id)
        for (const from of neighbors(map,cell)) {
          if (paths.has(from) && canAttack(rules,map,board,attacker,defender,from)) {
            damage = Math.max(damage,damageAmount(rules,map,board,{...attacker,cell:from},defender))
          }
        }
      }
      if (damage >= strongest) {second = strongest; strongest = damage}
      else second = Math.max(second,damage)
    }
    const combined = strongest + (difficulty === 2 ? .65 : .3)*second
    return (difficulty === 2 ? .24 : .14)*hitValue(rules,defender,combined)
  }
  const shortlist = []
  const limit = difficulty === 2 ? 10 + Math.floor(Math.sqrt(seconds)*6) : 6
  let best, bestScore = 0
  for (const candidate of candidates) {
    if (performance.now() >= deadline || shortlist.length >= limit && candidate.score <= shortlist.at(-1).score) break
    const risk = replyRisk(candidate,false)
    if (risk === null) break
    const score = candidate.score-risk
    shortlist.push({candidate,score})
    shortlist.sort((a,b)=>b.score-a.score)
    if (shortlist.length > limit) shortlist.pop()
    if (score > bestScore) {best = candidate; bestScore = score}
  }
  if (shortlist.length && performance.now() < deadline) {
    let refined, refinedScore = 0
    for (const {candidate} of shortlist) {
      if (candidate.score <= refinedScore) continue
      const risk = replyRisk(candidate,true)
      if (risk === null) break
      const score = candidate.score-risk
      if (score > refinedScore) {refined = candidate; refinedScore = score}
    }
    if (refined) best = refined
  }
  const fallback = best?.action ?? (performance.now() >= deadline ? candidates[0].action : {type:'end'})
  onProgress?.(fallback)
  const plans = shortlist.slice(0,difficulty === 2 ? 6 : 4).filter(({score})=>score>0)
  return plans.length > 1 && performance.now()<deadline ?
    simulatePlans(rules,map,view,side,plans,{difficulty,profile,deadline,onProgress}) : fallback
}

export function sideValue(rules,game,side) {
  let total = 0
  for (const unit of game.units) {
    if (unit.side !== side) continue
    const spec = rules.units[unit.name]
    total += valueOf(rules,{name:unit.transported ?? unit.name}) * (.25+.75*unit.hp/spec.health)
    total += Math.max(0,unit.credits ?? 0)*.12
  }
  total += 170*game.structures.filter(tile=>tile.side === side).length
  return total
}

function simulatePlans(rules,map,view,side,plans,{difficulty,profile,deadline,onProgress}) {
  let decision = plans[0].candidate.action
  const margin = game => game.colors.reduce((sum,_,index)=>{
    const value = sideValue(rules,game,index+1)
    return sum + (allied(game,side,index+1) ? value : -value)
  },0)
  const original = margin(view)
  const sums = plans.map(()=>0)
  let seed
  const random = () => {
    seed = (Math.imul(seed,1664525) + 1013904223) >>> 0
    return seed/0x100000000
  }
  for (let trial=0; performance.now()<deadline; trial++) {
    const sample = []
    for (const {candidate} of plans) {
      if (performance.now()>=deadline) return decision
      seed = (view.version + side*37813 + trial*547813)>>>0
      const simulation = {...view,turn:side,activeSides:undefined,turnEnded:undefined,undo:null,
        defeated:[...view.defeated ?? []],ore:{...view.ore},structures:view.structures.map(tile=>({...tile})),
        units:view.units.map(unit=>({...unit,credits:unit.credits ??
          (rules.units[unit.transported ?? unit.name].mods.includes('Constructor') ? 600 : -1)})),
        teamCredits:view.teamCredits?.map(credits=>credits ?? 300),
        nextId:Math.max(0,...view.units.map(unit=>unit.id))+1}
      const play = action => order(rules,map,simulation,simulation.turn,{...action,version:simulation.version})
      try {
        play(candidate.action)
        const horizon = Math.min(12,3 + trial)
        for (let step=0;step<horizon && !simulation.winner && performance.now()<deadline;step++) {
          const samePhase = simulation.turn === side && step%3 === 2
          const reply = samePhase ? {type:'end'} : chooseAction(rules,map,simulation,{
            difficulty,seconds:0,random,stopAt:deadline,profile:simulation.turn === side ? profile : undefined,
          })
          try { play(reply) } catch { play({type:'end'}) }
        }
        const victory = simulation.winner ? (allied(simulation,simulation.winner,side) ? 180 : -180) : 0
        sample.push(victory+75*Math.tanh((margin(simulation)-original)/850))
      } catch { sample.push(-180) }
    }
    if (performance.now()>=deadline) return decision
    let best = -Infinity
    for (const [index,{candidate,score}] of plans.entries()) {
      sums[index] += sample[index]
      const blended = score + sums[index]/(trial+1)
      if (blended > best) {best = blended; decision = candidate.action}
    }
    onProgress?.(decision)
  }
  return decision
}
