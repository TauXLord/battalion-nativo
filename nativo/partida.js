import { movementDirection } from './movimento.js'

const has = (spec, name) => spec.mods.includes(name)
export const allied = (state,a,b) => a === b || Boolean(state.alliances?.[a-1]?.includes(b) || state.alliances?.[b-1]?.includes(a))
export const scenarioSlots = map => map.slots ?? 2
export const activeSides = state => state.activeSides ?? [state.turn]
export const canTakeTurn = (state,side) => activeSides(state).includes(side) &&
  !state.turnEnded?.includes(side) && !state.defeated?.includes(side) && !state.winner
export const teamAttackScale = (count,humans,difficulty) =>
  Array.from({length:count},(_,index)=>index < humans ? 1 : [.7,1,1.4][difficulty] ?? 1)

export function scenarioMatch(board,colors,humans,enabled) {
  const groups = board.coalitions
  if (!enabled || !groups) return {board,colors,alliances:[]}
  const commanders = groups.map((group,index)=>{
    if (index < humans || groups.slice(0,humans).includes(group)) return index
    return groups.indexOf(group)
  })
  const active = [...new Set(commanders)]
  const sideFor = commanders.map(commander=>active.indexOf(commander)+1)
  const assign = item => ({...item,side:item.side ? sideFor[item.side-1] : 0})
  const alliances = active.map(commander=>active.flatMap((other,index)=>
    other !== commander && groups[other] === groups[commander] ? [index+1] : []))
  return {
    board:{...board,units:board.units.map(assign),structures:board.structures.map(assign),slots:active.length},
    colors:active.map(index=>colors[index]),alliances,
  }
}
export const distance = (width, a, b) => Math.abs(a % width - b % width) +
  Math.abs(Math.floor(a / width) - Math.floor(b / width))

const JAM_RADIUS = 2
export function jammingZone(map, origin) {
  const centerX = origin % map.width, centerY = Math.floor(origin / map.width)
  const result = []
  for (let dy = -JAM_RADIUS; dy <= JAM_RADIUS; dy++) {
    const y = centerY + dy
    if (y < 0 || y >= map.height) continue
    const reach = JAM_RADIUS - Math.abs(dy)
    for (let x = Math.max(0,centerX-reach); x <= Math.min(map.width-1,centerX+reach); x++) {
      result.push(y * map.width + x)
    }
  }
  return result
}

export function enemyJammers(rules, state, side) {
  return state.units.filter(unit => !allied(state,unit.side,side) && unit.hp > 0 && has(rules.units[unit.name],'Jamming'))
}

export function neighbors(map, cell) {
  const x = cell % map.width, y = Math.floor(cell / map.width)
  const cells = []
  if (x > 0) cells.push(cell - 1)
  if (x < map.width - 1) cells.push(cell + 1)
  if (y > 0) cells.push(cell - map.width)
  if (y < map.height - 1) cells.push(cell + map.width)
  return cells
}

function modifierValue(value, effects) {
  for (const effect of effects) {
    if (effect.endsWith('%')) value *= 1 + Number(effect.slice(0,-1)) / 100
    else if (effect[0] === '*') value *= Number(effect.slice(1))
    else if (effect[0] === '+' || effect[0] === '-') value += Number(effect)
    else value = Number(effect)
  }
  return value
}

function modify(table, mods, field, subject, value) {
  for (const mod of mods) {
    for (const [name, effects, matches] of table[mod] ?? []) {
      if (name !== field) continue
      value = modifierValue(value,effects)
      for (const [type, match, conditional] of matches) {
        if (subject && (type === 'modifier' ? has(subject,match) : subject[type] === match)) {
          value = modifierValue(value,conditional)
        }
      }
    }
  }
  return value
}

export function terrainAt(rules, map, state, cell) {
  const structure = state.structures.find(tile => tile.cell === cell)
  const name = structure?.name ?? state.ore[cell] ?? map.tiles[cell][0]
  return [name,rules.terrain[name]]
}

export function moveCost(rules, map, state, spec, cell, side) {
  if (spec.movementType === 'wings' &&
      enemyJammers(rules,state,side).some(unit => distance(map.width,unit.cell,cell) <= JAM_RADIUS)) return Infinity
  const [,terrain] = terrainAt(rules,map,state,cell)
  return terrainMoveCost(rules,spec,terrain)
}

export function terrainMoveCost(rules,spec,terrain) {
  const cost = modify(rules.terrainEffects,terrain.mods,'movementCost',spec,terrain.cost)
  // Infantaria (Sure-Footed) anda só 3 casas, mas floresta e montanha não a atrasam. O que é intransponível continua.
  return has(spec,'Sure-Footed') && Number.isFinite(cost) ? Math.min(cost,terrain.cost) : cost
}

export function reachable(rules, map, state, unit) {
  const results = new Map()
  if (unit.moved || unit.fired || unit.disabled) return results
  const spec = rules.units[unit.name]
  const cells = new Map(state.units.map(other => [other.cell,other]))
  const start = {cell:unit.cell,cost:0,path:[]}
  const queue = [start]
  const best = new Map([[unit.cell,0]])
  while (queue.length) {
    queue.sort((a,b) => b.cost - a.cost)
    const current = queue.pop()
    if (best.get(current.cell) !== current.cost) continue
    if (!cells.has(current.cell)) results.set(current.cell,current.path)
    for (const cell of neighbors(map,current.cell)) {
      const occupant = cells.get(cell)
      if (occupant && !allied(state,occupant.side,unit.side)) continue
      const cost = current.cost + moveCost(rules,map,state,spec,cell,unit.side)
      if (cost > spec.range || cost >= (best.get(cell) ?? Infinity)) continue
      best.set(cell,cost)
      queue.push({cell,cost,path:[...current.path,cell]})
    }
  }
  return results
}

export function legalMovePath(rules, map, state, unit, path) {
  if (unit.fired || unit.moved || unit.disabled || !Array.isArray(path) || !path.length || path.length >= map.tiles.length) return false
  const spec = rules.units[unit.name]
  const occupied = new Map(state.units.map(other=>[other.cell,other]))
  const visited = new Set([unit.cell])
  let previous = unit.cell, cost = 0
  for (const [index,cell] of path.entries()) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= map.tiles.length ||
        visited.has(cell) || distance(map.width,previous,cell) !== 1) return false
    const occupant = occupied.get(cell)
    if (occupant && (!allied(state,occupant.side,unit.side) || index === path.length-1)) return false
    cost += moveCost(rules,map,state,spec,cell,unit.side)
    if (cost > spec.range) return false
    visited.add(cell)
    previous = cell
  }
  return true
}

export const isRanged = spec => spec.weaponRangeMax > 1 || spec.weaponRangeMin > 1

export function firingRange(rules, map, state, unit, from) {
  const spec = rules.units[unit.name]
  const [,terrain] = terrainAt(rules,map,state,from)
  const max = isRanged(spec) ?
    modify(rules.terrainEffects,terrain.mods,'attackRange',spec,spec.weaponRangeMax) : spec.weaponRangeMax
  return [spec.weaponRangeMin,max]
}

function canTarget(attacker, defender) {
  if (!attacker.damage) return false
  if (defender.unitType === 'air') return has(attacker,'Skysweeper')
  return !has(attacker,'Air Bound') &&
    !(has(attacker,'Ground Bound') && defender.unitType !== 'ground') &&
    !(has(attacker,'Sea Bound') && defender.unitType !== 'sea') &&
    !(has(defender,'Submerged') && !has(attacker,'Anti-Sub'))
}

function weapons(rules, map, state, unit, target, from) {
  if (allied(state,unit.side,target.side) || unit.disabled || target.cloaked) return false
  const a = rules.units[unit.name], b = rules.units[target.name]
  const range = distance(map.width,from,target.cell)
  const ranged = isRanged(a)
  if (range < a.weaponRangeMin || !ranged && range > a.weaponRangeMax || !canTarget(a,b)) return false
  const here = ranged ? terrainAt(rules,map,state,from)[1] : null
  if (ranged && range > modify(rules.terrainEffects,here.mods,'attackRange',a,a.weaponRangeMax)) return false
  if (b.unitType === 'air') return true
  if (b.unitType === 'ground' && (a.unitType === 'air' || ranged)) {
    const [,there] = terrainAt(rules,map,state,target.cell)
    if (a.unitType === 'air' && has(there,'Air Cover') || ranged && has(there,'Shielded')) return false
  }
  return !ranged || !has(here,'Canopy')
}

export function canAttack(rules, map, state, unit, target, from = unit.cell) {
  const spec = rules.units[unit.name]
  if (unit.fired || isRanged(spec) && (unit.moved || from !== unit.cell)) return false
  return weapons(rules,map,state,unit,target,from)
}

export function attackPath(rules,map,state,unit,target,moves,preferred) {
  if (preferred?.length && canAttack(rules,map,state,unit,target,preferred.at(-1))) return preferred
  if (canAttack(rules,map,state,unit,target)) return []
  const spec = rules.units[unit.name]
  if (isRanged(spec) || unit.moved || unit.fired) return null
  let route = null, best = Infinity
  for (const cell of neighbors(map,target.cell)) {
    const path = moves.get(cell)
    if (!path || !canAttack(rules,map,state,unit,target,cell)) continue
    const cost = path.reduce((sum,step)=>sum+moveCost(rules,map,state,spec,step,unit.side),0)
    if (cost < best || cost === best && route && path.length < route.length) {
      best = cost
      route = path
    }
  }
  return route
}

function armorMultiplier(rules, attacker, defender) {
  return rules.ballistics[attacker.weaponType]?.[defender.armorType] ?? 1
}

export function attackRating(rules, unit, target) {
  const attacker = rules.units[unit.name], defender = rules.units[target.name]
  if (!canTarget(attacker,defender)) return -1
  return Math.sign(armorMultiplier(rules,attacker,defender) - 1)
}

export function damageAmount(rules, map, state, unit, target, counter = false, useTerrain = true) {
  const a = rules.units[unit.name], b = rules.units[target.name]
  const mods = unit.cloaked ? [...a.mods,'Cloak Damage'] : a.mods
  let amount = modify(rules.unitEffects,mods,'damage',b,a.damage)
  if (useTerrain && state.structures.some(tile => tile.cell === unit.cell)) {
    amount = modify(rules.unitEffects,mods,'structureBonus',b,amount)
  }
  amount = modify(rules.unitEffects,mods,counter ? 'returnAttackBonus' : 'attackBonus',b,amount)
  const weapon = armorMultiplier(rules,a,b)
  const health = Math.ceil(4 * unit.hp / a.health) / 4
  let defense = 1
  if (useTerrain) {
    const [,terrain] = terrainAt(rules,map,state,target.cell)
    defense = modify(rules.terrainEffects,terrain.mods,'defense',b,defense)
    if (isRanged(a)) defense = modify(rules.terrainEffects,terrain.mods,'rangedDefense',b,defense)
  }
  const damage = amount * weapon * health * defense * (state.attackScale?.[unit.side - 1] ?? 1)
  return useTerrain ? Math.round(damage) : damage
}

export function buildTargetScore(rules,map,state,unit,target) {
  const attacker = rules.units[unit.name], defender = rules.units[target.name]
  if (!canTarget(attacker,defender)) return 0
  const damage = damageAmount(rules,map,state,unit,target,false,false)
  const value = damage / defender.health * defender.cost
  const hp = target.hp-damage
  const retaliates = isRanged(defender) ? has(defender,'Counter Battery') :
    !isRanged(attacker) && !has(defender,'Blind Spot')
  if (hp <= 0 || !retaliates || !canTarget(defender,attacker)) return value
  const returned = damageAmount(rules,map,state,{...target,hp},unit,true,false)
  return value - Math.min(returned,unit.hp) / attacker.health * attacker.cost
}

export function canCounter(rules,map,state,attacker,defender) {
  const spec = rules.units[defender.name]
  return defender.hp > 0 && !has(rules.units[attacker.name],'Stun') && !has(spec,'Blind Spot') &&
    (!isRanged(spec) || has(spec,'Counter Battery')) && weapons(rules,map,state,defender,attacker,defender.cell)
}

const radarRange = (rules,spec) => modify(rules.unitEffects,spec.mods,'radar',spec,1)
const turnDamage = (rules,spec,terrain) => modify(rules.terrainEffects,terrain.mods,'damage',spec,0)
export const terrainTurnDamage = (rules,map,state,unit,cell) =>
  turnDamage(rules,rules.units[unit.name],terrainAt(rules,map,state,cell)[1])
const repairAmount = (spec, hp) => Math.min(spec.health-hp,spec.health/4)

function healthAfterTurn(rules,spec,unit,hp) {
  const repair = unit.repairing ? repairAmount(spec,hp) : 0
  return Math.min(spec.health,hp + repair + modify(rules.unitEffects,spec.mods,'heal',spec,0))
}

export function repairPrice(rules,map,state,unit) {
  if (!state.campaign || !map.classic) return 0
  const spec = rules.units[unit.name]
  const {cost} = controlledUnitCost(rules,state,unit.side,spec)
  return cost * repairAmount(spec,unit.hp) / spec.health
}

export function canRepair(rules,map,state,unit) {
  const spec = rules.units[unit.name]
  return !unit.fired && !unit.moved && !unit.disabled && unit.hp < spec.health && !has(spec,'Irreparable') &&
    (state.teamCredits?.[unit.side-1] ?? 0) >= repairPrice(rules,map,state,unit)
}

export function attackThreats(rules,map,state,unit,cell) {
  const enemies = state.units.filter(other=>!allied(state,other.side,unit.side) && !other.cloaked)
  const target = {...unit,cell,cloaked:unit.cloaked && !enemies.some(enemy =>
    enemy.name !== 'Blockade' && distance(map.width,cell,enemy.cell) <= radarRange(rules,rules.units[enemy.name]))}
  const threats = new Map()
  for (const enemy of enemies) {
    const spec = rules.units[enemy.name]
    const [,terrain] = terrainAt(rules,map,state,enemy.cell)
    const hp = enemy.hp - turnDamage(rules,spec,terrain)
    if (hp <= 0 || !weapons(rules,map,state,enemy,target,enemy.cell)) continue
    const ready = {...enemy,hp:healthAfterTurn(rules,spec,enemy,hp)}
    threats.set(enemy.id,damageAmount(rules,map,state,ready,target) >= target.hp)
  }
  return threats
}

function damage(rules, map, state, unit, target, counter = false) {
  target.hp = Math.max(0,target.hp - damageAmount(rules,map,state,unit,target,counter))
  target.repairing = false
}

function behindTarget(rules,map,state,attacker,target) {
  const column = 2*(target.cell%map.width) - attacker.cell%map.width
  const row = 2*Math.floor(target.cell/map.width) - Math.floor(attacker.cell/map.width)
  if (column < 0 || column >= map.width || row < 0 || row >= map.height) return undefined
  const unit = state.units.find(item=>item.cell === row*map.width+column)
  if (!unit || unit.side !== attacker.side && allied(state,unit.side,attacker.side)) return undefined
  const spec = rules.units[unit.name]
  if (spec.unitType === 'air' || has(spec,'Submerged')) return undefined
  return unit
}

function combatant({id,name,side,cell,hp,left,facing,repairing}) {
  return {id,name,side,cell,hp,left,facing,repairing}
}

export function unitFor(rules, info, id) {
  const spec = rules.units[info.name]
  return { ...info, id, hp:spec.health, credits:has(spec,'Constructor') ? 3000 : -1,
    cloaked:has(spec,'Cloaking'), moved:false, fired:false, repairing:false, left:info.left ?? info.side === 2 }
}

export const scenarioStructure = name => name === 'Factory' ? 'Oil Refinery' : name

export function createGame(rules, map, colors, {attackScale, incomeScale, campaign = false, credits = 0,
  alliances = [], simultaneous = false} = {}) {
  const result = {
    version:0, turn:1, round:1, colors, winner:0, ore:{}, nextId:map.units.length + 1,
    structures:map.structures.map(tile => ({
      ...tile, name:campaign ? tile.name : scenarioStructure(tile.name), strength:8, capturer:0,
      oilReserve:campaign && oilModifier(rules,tile,'resources',0) > 0 ? 1000 : undefined,
    })),
    units:map.units.map((unit,index) => unitFor(rules,
      {...unit,left:unit.cell % map.width > map.width / 2},index + 1)),
    last:null, undo:null, attackScale, incomeScale, campaign, alliances, defeated:[],
    teamCredits:campaign ? colors.map(()=>credits) : undefined,
    buildable:campaign ? colors.map(()=>null) : undefined,
  }
  if (simultaneous && alliances.some(team=>team.length)) {
    result.activeSides = colors.flatMap((_,index)=>allied(result,1,index+1) ? [index+1] : [])
    result.turnEnded = []
    result.sideVersion = colors.map(()=>0)
  }
  const resourceGains = beginTurn(rules,map,result)
  if (resourceGains.length) result.last = {type:'start',side:result.turn,public:true,resourceGains}
  return result
}

export const visibleTo = (unit, side) => side === 0 || unit.side === side || !unit.cloaked

export function snapshot(state, side) {
  const units = state.units.filter(unit => allied(state,unit.side,side) || visibleTo(unit,side)).map(unit => {
    if (unit.side === side) return {...unit}
    const {credits: balance, ...publicUnit} = unit
    return publicUnit
  })
  const {version,turn,round,colors,winner,ore,structures,last,undo,attackScale,alliances,buildable,campaign,
    activeSides,turnEnded,defeated} = state
  // An order on a concealed unit must not disclose its coordinates, even for animations.
  let event = last && (side === 0 || last.side === side || last.public) ? last : null
  if (event?.movement && side !== 0 && event.side !== side && !event.movement.public) {
    const {movement,...publicAttack} = event
    event = publicAttack
  }
  if (event?.combatants && side !== 0) {
    const hidden = event.combatants.find(unit=>unit.cloaked && !allied(state,unit.side,side))
    if (hidden) event = {...event,combatants:event.combatants.filter(unit=>unit.id !== hidden.id),
      hits:event.hits.filter(hit=>hit.target !== hidden.id)}
  }
  return {version,turn,round,colors,winner,ore,structures,units,last:event,attackScale,alliances,buildable,campaign,
    activeSides,turnEnded,defeated,
    teamCredits:state.teamCredits?.map((credits,index)=>index+1 === side ? credits : null),
    canUndo:canTakeTurn(state,side) && undo?.side === side}
}

function detectedAt(rules,map,state,unit) {
  return state.units.some(enemy=>enemy.hp > 0 && enemy.name !== 'Blockade' && !allied(state,enemy.side,unit.side) &&
    distance(map.width,enemy.cell,unit.cell) <= radarRange(rules,rules.units[enemy.name]))
}

function detect(rules, map, state, scout) {
  const spec = rules.units[scout.name]
  if (scout.name === 'Blockade' || scout.hp <= 0) return false
  const range = radarRange(rules,spec)
  let revealed = false
  for (const unit of state.units) {
    if (!allied(state,unit.side,scout.side) && unit.cloaked && distance(map.width,scout.cell,unit.cell) <= range) {
      unit.cloaked = false
      revealed = true
    }
  }
  if (scout.cloaked && detectedAt(rules,map,state,scout)) {
    scout.cloaked = false
    revealed = true
  }
  return revealed
}

function oilModifier(rules,tile,field,amount) {
  return modify(rules.terrainEffects,rules.terrain[tile.name].mods,field,null,amount)
}

function payScenarioRefineries(rules,state,side) {
  const machines = state.units.filter(unit=>unit.side === side && unit.credits >= 0)
  if (!machines.length) return []
  const gains = state.structures.filter(tile=>tile.side === side && oilModifier(rules,tile,'resources',0) > 0)
    .map(tile=>({cell:tile.cell,amount:150}))
  for (const machine of machines) machine.credits += 150*gains.length
  return gains
}

function payRefineries(rules,state) {
  const payout = state.teamCredits.map(()=>0)
  const gains = []
  const slices = payout.length
  for (const tile of state.structures) {
    if (!tile.side || tile.oilReserve === undefined) continue
    const share = Math.trunc(oilModifier(rules,tile,'resources',0) / slices)
    // Flash prorates the reduced rate again when the reserve cannot cover the share.
    const amount = tile.oilReserve >= share ? share : oilModifier(rules,tile,'reducedResources',share) / slices
    tile.oilReserve = Math.max(0,tile.oilReserve - share)
    const index = tile.side-1
    const scale = state.incomeScale?.[index] ?? 1
    // Carry rounding between refineries so the labels sum to the amount credited.
    const before = Math.round(payout[index]*scale)
    payout[index] += amount
    const paid = Math.round(payout[index]*scale)-before
    state.teamCredits[index] += paid
    if (paid > 0) gains.push({cell:tile.cell,amount:paid})
  }
  return gains
}

function capture(rules, state, unit, structure) {
  if (structure.capturer !== unit.id) structure.strength = 8
  structure.capturer = unit.id
  structure.strength -= Math.ceil(4 * unit.hp / rules.units[unit.name].health)
  if (structure.strength <= 0) {
    if (structure.side && has(rules.terrain[structure.name],'Mission Critical')) {
      state.defeated.push(structure.side)
      state.units = state.units.filter(other=>other.side !== structure.side)
    }
    structure.strength = 8
    structure.side = unit.side
    structure.capturer = 0
  }
}

function beginTurn(rules, map, state) {
  const sides = activeSides(state)
  const gains = state.campaign ? payRefineries(rules,state) : sides.flatMap(side=>payScenarioRefineries(rules,state,side))
  for (const unit of state.units) {
    if (!sides.includes(unit.side)) continue
    const spec = rules.units[unit.name]
    const [,terrain] = terrainAt(rules,map,state,unit.cell)
    unit.moved = unit.fired = false
    unit.transformed = false
    unit.hp -= turnDamage(rules,spec,terrain)
    if (unit.hp <= 0) continue
    unit.hp = healthAfterTurn(rules,spec,unit,unit.hp)
    unit.repairing = false
    detect(rules,map,state,unit)
  }
  state.units = state.units.filter(unit => unit.hp > 0)
  for (const tile of state.structures) {
    const unit = state.units.find(other => other.cell === tile.cell && !allied(state,other.side,tile.side) &&
      !other.disabled && has(rules.units[other.name],'Capture'))
    if (!unit) {
      tile.strength = 8
      tile.capturer = 0
    } else if (sides.includes(unit.side) && (state.campaign || tile.capturer === unit.id)) capture(rules,state,unit,tile)
  }
  return gains
}

function requireOrder(ok) {
  if (!ok) throw Error('Ação indisponível.')
}

function remaining(rules,map,state,side) {
  if (state.defeated.includes(side)) return false
  const hadLinchpin = map.units.some(unit => unit.side === side && has(rules.units[unit.name],'Linchpin'))
  return state.units.some(unit => unit.side === side && unit.hp > 0 &&
    (hadLinchpin ? has(rules.units[unit.transported ?? unit.name],'Linchpin') : !has(rules.units[unit.name],'Fixed')))
}

export function checkWinner(rules,map,state) {
  const alive = state.colors.map((_,index)=>index+1).filter(side=>remaining(rules,map,state,side))
  if (!alive.length) state.winner = state.turn
  else if (alive.every(side=>allied(state,side,alive[0]))) state.winner = alive[0]
}

function advanceTurn(rules,map,state) {
  const previous = activeSides(state)
  const sides = state.colors.map((_,index)=>index+1)
  const leaders = state.activeSides ? sides.filter(side=>sides.find(other=>allied(state,side,other)) === side) : sides
  const current = leaders.indexOf(state.turn)
  for (let step = 1; step <= leaders.length; step++) {
    const next = leaders[(current+step) % leaders.length]
    const group = sides.filter(side=>(state.activeSides ? allied(state,next,side) : side === next) &&
      remaining(rules,map,state,side))
    if (!group.length) continue
    if (next <= state.turn) state.round++
    state.turn = next
    if (state.activeSides) {
      state.activeSides = group
      state.turnEnded = []
      state.sideVersion.fill(state.version+1)
    }
    state.undo = null
    const gains = beginTurn(rules,map,state)
    if (group.some(side=>remaining(rules,map,state,side))) return gains
    return [...gains,...advanceTurn(rules,map,state)]
  }
  return []
}

function moveUnit(rules,map,state,unit,path) {
  const {cell:origin,left,facing,side,cloaked} = unit
  const positions = []
  let revealed = false
  for (const destination of path) {
    const ambush = state.units.find(other => other.cell === destination && !allied(state,other.side,side))
    if (ambush) {
      ambush.cloaked = false
      revealed = true
      break
    }
    positions.push(destination)
  }
  // Friendly units may be crossed, but a movement cannot end on one.
  while (positions.length && state.units.some(other => other.cell === positions.at(-1))) positions.pop()
  unit.cell = positions.at(-1) ?? origin
  unit.left = unit.cell % map.width === origin % map.width ? left : unit.cell % map.width < origin % map.width
  if (positions.length) unit.facing = movementDirection(map.width,positions.at(-2) ?? origin,unit.cell)
  unit.moved = true
  const stealth = has(rules.units[unit.name],'Cloaking')
  const jammed = stealth && enemyJammers(rules,state,side).some(jammer =>
    positions.some(cell => distance(map.width,jammer.cell,cell) <= JAM_RADIUS))
  if (stealth && positions.length) unit.cloaked = !jammed && !detectedAt(rules,map,state,unit)
  if (cloaked && !unit.cloaked) revealed = true
  revealed = detect(rules,map,state,unit) || revealed
  state.undo = revealed || jammed ? null : {id:unit.id,cell:origin,left,facing,cloaked,side}
  return {type:'move',side,unit:unit.id,from:origin,path:positions,jammed,public:!cloaked && !unit.cloaked}
}

export function order(rules, map, state, side, action) {
  requireOrder(action && Number.isInteger(action.version) && action.version <= state.version &&
    action.version >= (state.sideVersion?.[side-1] ?? state.version) && canTakeTurn(state,side))
  const unit = state.units.find(other => other.id === action.unit && other.side === side)
  if (!['end','undo','factoryBuild'].includes(action.type)) requireOrder(unit && !unit.disabled)
  const event = {type:action.type,side,public:true}
  switch (action.type) {
    case 'move': {
      const view = snapshot(state,side)
      const path = action.path === undefined ? reachable(rules,map,view,unit).get(action.cell) : action.path
      requireOrder(legalMovePath(rules,map,view,unit,path) && path.at(-1) === action.cell)
      Object.assign(event,moveUnit(rules,map,state,unit,path))
      break
    }
    case 'attack': {
      const target = state.units.find(other => other.id === action.target)
      requireOrder(target)
      if (action.path !== undefined) {
        const path = action.path
        requireOrder(legalMovePath(rules,map,snapshot(state,side),unit,path) &&
          canAttack(rules,map,state,unit,target,path.at(-1)))
        const movement = moveUnit(rules,map,state,unit,path)
        if (unit.cell !== path.at(-1)) {
          Object.assign(event,movement)
          break
        }
        event.movement = movement
      } else requireOrder(canAttack(rules,map,state,unit,target))
      const a = rules.units[unit.name]
      // Both units are visible once the shot starts. Leave private balances out of the event.
      event.combatants = [unit,target].map(combatant)
      const wasRepairing = target.repairing
      damage(rules,map,state,unit,target)
      event.hits = [{unit:unit.id,target:target.id,hp:target.hp}]
      unit.cloaked = false
      unit.fired = true
      unit.moved = true
      const pierced = has(a,'Piercing') && behindTarget(rules,map,state,unit,target)
      if (pierced) {
        event.combatants.push({...combatant(pierced),cloaked:pierced.cloaked})
        damage(rules,map,state,unit,pierced)
        event.hits.push({unit:unit.id,target:pierced.id,hp:pierced.hp,piercing:true})
      }
      if (!wasRepairing && canCounter(rules,map,state,unit,target)) {
        damage(rules,map,state,target,unit,true)
        event.hits.push({unit:target.id,target:unit.id,hp:unit.hp})
      }
      if (target.hp <= 0 && has(a,'Scavenge')) unit.moved = unit.fired = false
      for (const dead of state.units.filter(other => other.hp <= 0)) {
        for (const tile of state.structures.filter(item => item.capturer === dead.id)) {
          tile.capturer = 0
          tile.strength = 8
        }
      }
      state.units = state.units.filter(other => other.hp > 0)
      state.undo = null
      Object.assign(event,{unit:unit.id,name:unit.name,from:unit.cell,cell:target.cell,
        destroyed:target.hp <= 0,sound:a.sounds.fire ?? 'ExplosionSound'})
      break
    }
    case 'undo': {
      const previous = action.version === state.version && state.undo
      const moved = previous && state.units.find(item => item.id === previous.id && item.side === side)
      requireOrder(moved)
      Object.assign(moved,{cell:previous.cell,left:previous.left,facing:previous.facing,
        cloaked:previous.cloaked ?? moved.cloaked,moved:false})
      state.undo = null
      event.public = !moved.cloaked
      break
    }
    case 'extract': {
      const [name] = terrainAt(rules,map,state,unit.cell)
      requireOrder(unit.credits >= 0 && has(rules.units[unit.name],'Extractor') &&
        !unit.moved && !unit.fired && ['Ore Deposit','Enriched Ore Deposit'].includes(name))
      const amount = 500
      unit.credits += amount
      unit.moved = true
      state.ore[unit.cell] = name === 'Enriched Ore Deposit' ? 'Ore Deposit' : 'Depleted Ore Deposit'
      state.undo = null
      event.resourceGains = [{cell:unit.cell,amount}]
      event.public = !unit.cloaked
      break
    }
    case 'capture': {
      const tile = state.structures.find(tile => tile.cell === unit.cell && tile.side !== side)
      requireOrder(!state.campaign && has(rules.units[unit.name],'Capture') && !unit.fired && tile && !allied(state,side,tile.side))
      capture(rules,state,unit,tile)
      unit.fired = unit.moved = true
      state.undo = null
      break
    }
    case 'repair': {
      requireOrder(canRepair(rules,map,state,unit))
      if (state.teamCredits) state.teamCredits[side-1] -= Math.round(repairPrice(rules,map,state,unit))
      unit.repairing = unit.moved = unit.fired = true
      state.undo = null
      event.public = !unit.cloaked
      break
    }
    case 'build': {
      const spec = Object.hasOwn(rules.units,action.name) && rules.units[action.name]
      const view = snapshot(state,side)
      requireOrder(buildCells(rules,map,view,unit,spec).includes(action.cell))
      requireOrder(!state.units.some(other => other.cell === action.cell))
      unit.credits -= spec.cost
      unit.moved = unit.fired = true
      const built = unitFor(rules,{cell:action.cell,name:action.name,side},state.nextId++)
      built.facing = movementDirection(map.width,unit.cell,built.cell)
      built.moved = built.fired = true
      state.units.push(built)
      state.undo = null
      Object.assign(event,{deployment:{unit:built.id,from:unit.cell,to:built.cell},
        public:!built.cloaked && !unit.cloaked})
      break
    }
    case 'factoryBuild': {
      const factory = factoryAt(state,side,action.factory)
      const spec = Object.hasOwn(rules.units,action.name) && rules.units[action.name]
      requireOrder(factory && buildCells(rules,map,state,factory,spec).includes(action.cell))
      state.teamCredits[side-1] -= buildCost(rules,state,factory,spec)
      const built = unitFor(rules,{cell:action.cell,name:action.name,side},state.nextId++)
      built.moved = built.fired = true
      state.units.push(built)
      state.undo = null
      event.public = !built.cloaked
      break
    }
    case 'transport': {
      requireOrder(transportOptions(rules,map,state,unit).includes(action.name))
      const leaving = Boolean(unit.transported)
      const changed = leaving ? unit.transported : action.name
      const flight = [unit.name,changed].includes('Albatross Transport')
      unit.hp = Math.max(1,Math.round(unit.hp * rules.units[changed].health / rules.units[unit.name].health))
      unit.transported = leaving ? undefined : unit.name
      unit.name = changed
      unit.cloaked = false
      if (flight) unit.transformed = true
      else unit.moved = unit.fired = true
      state.undo = null
      break
    }
    case 'end': {
      const resourceGains = state.campaign ? [] : payScenarioRefineries(rules,state,side)
      for (const unit of state.units) {
        if (unit.side === side && !unit.moved && !unit.fired && !unit.disabled && has(rules.units[unit.name],'Cloaking')) {
          unit.cloaked = !detectedAt(rules,map,state,unit)
        }
      }
      state.turnEnded?.push(side)
      state.undo = null
      if (resourceGains.length) event.resourceGains = resourceGains
      break
    }
    default: requireOrder(false)
  }
  checkWinner(rules,map,state)
  if (!state.winner && (state.activeSides
    ? !state.activeSides.some(team=>canTakeTurn(state,team) && remaining(rules,map,state,team))
    : action.type === 'end')) {
    const gains = advanceTurn(rules,map,state)
    if (gains.length) event.resourceGains = [...event.resourceGains ?? [],...gains]
    checkWinner(rules,map,state)
  }
  if (state.sideVersion) {
    state.sideVersion[side-1] = state.version+1
    for (const team of state.activeSides) {
      if (!remaining(rules,map,state,team) && !state.turnEnded.includes(team)) state.turnEnded.push(team)
    }
  }
  state.last = event
  state.version++
}

export function buildCells(rules, map, state, unit, spec) {
  const roster = state.buildable?.[unit.side-1]
  if (unit.credits < 0 || unit.moved || unit.fired || unit.disabled || !spec || buildCost(rules,state,unit,spec) > unit.credits ||
      has(spec,'Unbuildable') || roster && !roster.some(name=>rules.units[name] === spec)) return []
  if (!unit.factory && !has(rules.units[unit.name],'Constructor')) return []
  const adjacent = neighbors(map,unit.cell)
  if (unit.factory && spec.unitType === 'sea' &&
      !adjacent.some(cell=>Number.isFinite(moveCost(rules,map,state,spec,cell,unit.side)))) return []
  if (!unit.factory && spec.unitType === 'sea' && terrainAt(rules,map,state,unit.cell)[0] !== 'Shore') return []
  return (unit.factory ? [unit.cell] : adjacent).filter(cell=>{
    if (state.units.some(other=>other.cell === cell)) return false
    const cost = moveCost(rules,map,state,spec,cell,unit.side)
    return unit.factory ? Number.isFinite(cost) : cost <= spec.range
  })
}

export function buildCost(rules,state,builder,spec) {
  if (!builder.factory) return spec.cost
  const {cost,unlocked} = controlledUnitCost(rules,state,builder.side,spec)
  return unlocked ? cost : Infinity
}

function controlledUnitCost(rules,state,side,spec) {
  const field = spec.unitType + 'Cost'
  let factor = 1, unlocked = false
  for (const tile of state.structures) {
    if (tile.side !== side) continue
    const modified = modify(rules.terrainEffects,rules.terrain[tile.name].mods,field,null,factor)
    // The first matching control unlocks this unit type. Additional ones lower the price.
    if (modified < factor && !unlocked) unlocked = true
    else factor = modified
  }
  return {unlocked,cost:Math.round(spec.cost * factor)}
}

export function factoryAt(state,side,cell) {
  if (state.teamCredits?.[side-1] == null ||
      !state.structures.some(tile=>tile.cell === cell && tile.side === side && tile.name === 'Factory')) return null
  return {factory:true,cell,side,credits:state.teamCredits[side-1]}
}

export function transportOptions(rules,map,state,unit) {
  if (unit.fired || unit.disabled || unit.transformed || unit.moved && unit.name !== 'Albatross Transport') return []
  if (unit.transported) {
    return Number.isFinite(moveCost(rules,map,state,rules.units[unit.transported],unit.cell,unit.side)) ? ['unload'] : []
  }
  const spec = rules.units[unit.name]
  if (spec.unitType !== 'ground' || !spec.range) return []
  const options = []
  const [,terrain] = terrainAt(rules,map,state,unit.cell)
  if (has(terrain,'Shore') && neighbors(map,unit.cell).some(cell =>
    Number.isFinite(moveCost(rules,map,state,rules.units['Leviathan Barge'],cell,unit.side)))) options.push('Leviathan Barge')
  if (unit.name.includes('Commando') && (!state.campaign || !map.structures.length ||
    state.structures.some(tile=>tile.name === 'Air Control' && tile.side === unit.side))) options.push('Albatross Transport')
  return options
}

