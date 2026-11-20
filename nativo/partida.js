import { movementDirection } from './movimento.js'

const has = (spec, name) => spec.mods.includes(name)
export const allied = (state,a,b) => a === b || Boolean(state.alliances?.[a-1]?.includes(b) || state.alliances?.[b-1]?.includes(a))
export const scenarioSlots = map => map.slots ?? 2
export const activeSides = state => state.activeSides ?? [state.turn]
export const canTakeTurn = (state,side) => activeSides(state).includes(side) &&
  !state.turnEnded?.includes(side) && !state.defeated?.includes(side) && !state.winner
// Níveis da IA: 0 Fácil, 1 Médio, 2 Difícil, 3 Skynet (IA treinada ao máximo com 40% a mais de dano).
export const AI_LEVELS = [0,1,2,3]
export const levelAttackScale = level => [.85,1,1,1.4][level] ?? 1
export const levelIncomeScale = level => [.8,1,1.15,1.3][level] ?? 1
export const teamAttackScale = (count,humans,difficulty) =>
  Array.from({length:count},(_,index)=>index < humans ? 1 : levelAttackScale(difficulty))

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
// Jammer em cima de uma colina: o bloqueio alcança 1 casa a mais em todas as direções.
export const onHill = (map,cell) => map.tiles[cell]?.[0] === 'Hill'
export const jamRadius = (map,cell) => JAM_RADIUS + (onHill(map,cell) ? 1 : 0)
export function jammingZone(map, origin) {
  const radius = jamRadius(map,origin)
  const centerX = origin % map.width, centerY = Math.floor(origin / map.width)
  const result = []
  for (let dy = -radius; dy <= radius; dy++) {
    const y = centerY + dy
    if (y < 0 || y >= map.height) continue
    const reach = radius - Math.abs(dy)
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
      enemyJammers(rules,state,side).some(unit => distance(map.width,unit.cell,cell) <= jamRadius(map,unit.cell))) return Infinity
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
  let max = isRanged(spec) ?
    modify(rules.terrainEffects,terrain.mods,'attackRange',spec,spec.weaponRangeMax) : spec.weaponRangeMax
  // Chuva: artilharia (ataque a distância) alcança 1 casa a menos.
  if (raining(state) && isRanged(spec)) max = Math.max(spec.weaponRangeMin,max - 1)
  return [spec.weaponRangeMin,max]
}

// Clima (opcional): ciclo guardado no estado, sorteado com uma semente própria (o replay repete igual).
// limpo → nuvens chegando por um canto (2 rodadas) → aviso de chuva (1) → chuva (2 a 4) → nuvens indo embora (1) → limpo.
// Na chuva: 1 casa a menos de visão na neblina e de alcance da artilharia.
export const raining = state => state?.weather?.phase === 'chuva'
export function newWeather(seed) {
  return {seed:(seed >>> 0) || 1,phase:'limpo',left:2,from:0,cycle:0}
}
function weatherRandom(weather) {
  let value = weather.seed
  value ^= value << 13; value >>>= 0
  value ^= value >>> 17
  value ^= value << 5; value >>>= 0
  weather.seed = value || 1
  return weather.seed / 4294967296
}
// Mapas de até 24×24 têm um raio a cada 5 jogadas; a frequência cresce até 2 jogadas em mapas de 40×40 ou maiores.
// O sorteio continua por casa, com a semente do clima, igual no multiplayer e no replay.
const LIGHTNING_DAMAGE = 100
// Para-raios: toda estrutura protege a unidade terrestre ou naval que está nela (aviões não); a Torre (Turret) nunca
// leva dano de raio. O raio cai na casa do mesmo jeito (o sorteio não muda), só não causa dano.
export const lightningProtected = (rules,state,unit) => unit.name === 'Turret' ||
  rules.units[unit.name].unitType !== 'air' && state.structures.some(tile => tile.cell === unit.cell)
export const lightningInterval = map => Math.max(2,Math.min(5,Math.round(5 - 3*(map.width*map.height - 576)/1024)))
function lightningStrike(rules,state,map,action) {
  const weather = state.weather
  if (!raining(state) || action.type === 'undo') return
  weather.moves = (weather.moves ?? 0) + 1
  if (weather.moves % lightningInterval(map)) return
  const cell = Math.floor(weatherRandom(weather) * map.width * map.height)
  const strike = {cell,version:state.version + 1}
  const target = state.units.find(unit => unit.cell === cell)
  if (target && lightningProtected(rules,state,target)) Object.assign(strike,{unit:target.id,side:target.side,hp:target.hp,protected:true})
  else if (target) {
    target.hp = Math.max(0,target.hp - LIGHTNING_DAMAGE)
    Object.assign(strike,{unit:target.id,side:target.side,hp:target.hp})
    if (target.hp <= 0) {
      for (const tile of state.structures.filter(item => item.capturer === target.id)) { tile.capturer = 0; tile.strength = 8 }
      state.units = state.units.filter(unit => unit !== target)
    }
  }
  state.lightning = strike
  state.undo = null
}
// Há 40% de chance por rodada chuvosa de surgir um redemoinho. Permanece até a chuva passar.
// Navios podem atravessá-lo, sofrendo 30 de dano por deslocamento e no começo e no fim do seu turno dentro dele.
export const WHIRLPOOL_SIZE = 3
const WHIRLPOOL_DAMAGE = 30
export const whirlpoolAt = state => state?.weather?.phase === 'chuva' && Number.isInteger(state.weather.whirlpool) ? state.weather.whirlpool : -1
export function whirlpoolCells(state,map) {
  const corner = whirlpoolAt(state)
  if (corner < 0 || corner % map.width + WHIRLPOOL_SIZE > map.width ||
      Math.floor(corner/map.width) + WHIRLPOOL_SIZE > map.height) return []
  return Array.from({length:WHIRLPOOL_SIZE*WHIRLPOOL_SIZE},(_,index)=>
    corner + Math.floor(index/WHIRLPOOL_SIZE)*map.width + index % WHIRLPOOL_SIZE)
}
const whirlpoolDamageAt = (rules,map,state,unit,cell) => rules.units[unit.name].unitType === 'sea' &&
  whirlpoolCells(state,map).includes(cell) ? WHIRLPOOL_DAMAGE : 0

function damageWhirlpool(rules,map,state,unit,event,cell = unit.cell) {
  const amount = whirlpoolDamageAt(rules,map,state,unit,cell)
  if (!amount || unit.hp <= 0) return 0
  unit.hp = Math.max(0,unit.hp - amount)
  if (unit.hp === 0) {
    if (event) (event.eliminated ??= []).push({...combatant(unit),cell,cloaked:unit.cloaked})
    for (const tile of state.structures) if (tile.capturer === unit.id) { tile.capturer = 0; tile.strength = 8 }
  }
  return amount
}
function placeWhirlpool(state,map) {
  const weather = state.weather, {width,height} = map
  const occupied = new Set([...state.units,...state.structures].map(item=>item.cell))
  const sea = (x,y) => x >= 0 && y >= 0 && x < width && y < height && ['Sea','Reef'].includes(map.tiles[y*width + x][0])
  const free = cell => map.tiles[cell][0] === 'Sea' && !occupied.has(cell)
  const block = (x,y,margin) => {
    for (let dy = -margin; dy < WHIRLPOOL_SIZE + margin; dy++) {
      for (let dx = -margin; dx < WHIRLPOOL_SIZE + margin; dx++) {
        if (!sea(x+dx,y+dy)) return false
        if (dx >= 0 && dy >= 0 && dx < WHIRLPOOL_SIZE && dy < WHIRLPOOL_SIZE && !free((y+dy)*width + x+dx)) return false
      }
    }
    return true
  }
  const corners = margin => map.tiles.flatMap((_,cell)=>block(cell % width,Math.floor(cell/width),margin) ? [cell] : [])
  const openSea = corners(1)
  const options = openSea.length ? openSea : corners(0)
  weather.whirlpool = options.length ? options[Math.floor(weatherRandom(weather) * options.length)] : undefined
}
function advanceWeather(state,map) {
  const weather = state.weather
  if (!weather) return
  const remaining = --weather.left
  if (remaining > 0) {
    if (raining(state) && whirlpoolAt(state) < 0 && weatherRandom(weather) < .4 && map) placeWhirlpool(state,map)
    return
  }
  if (weather.phase === 'limpo') Object.assign(weather,{phase:'nuvens',left:2,from:Math.floor(weatherRandom(weather)*4),cycle:weather.cycle+1})
  else if (weather.phase === 'nuvens') Object.assign(weather,{phase:'aviso',left:1})
  else if (weather.phase === 'aviso') {
    Object.assign(weather,{phase:'chuva',left:2 + Math.floor(weatherRandom(weather)*3),moves:0,whirlpool:undefined})
    if (weatherRandom(weather) < .4 && map) placeWhirlpool(state,map)
  }
  else if (weather.phase === 'chuva') Object.assign(weather,{phase:'dispersando',left:1,whirlpool:undefined})
  else Object.assign(weather,{phase:'limpo',left:3 + Math.floor(weatherRandom(weather)*4)})
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
  turnDamage(rules,rules.units[unit.name],terrainAt(rules,map,state,cell)[1]) + whirlpoolDamageAt(rules,map,state,unit,cell)
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
  alliances = [], simultaneous = false, fog = false, victory = null, weather = false} = {}) {
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
  // Neblina de guerra (opcional): cada equipe só vê o que está no alcance de visão das suas unidades e prédios.
  if (fog) result.fog = {width:map.width,
    air:Object.keys(rules.units).filter(name=>rules.units[name].unitType === 'air'),
    radar:Object.keys(rules.units).filter(name=>has(rules.units[name],'Radar')),
    jammers:Object.keys(rules.units).filter(name=>has(rules.units[name],'Jamming')),
    hills:map.tiles.flatMap(([name],cell)=>name === 'Hill' ? [cell] : []),
    forests:map.tiles.flatMap(([name],cell)=>name === 'Forest' ? [cell] : [])}
  // Modo de vitória de teste (mapas procedurais): segurar a refinaria central ou pontos ao fim de N rodadas.
  if (victory?.mode === 'rei' && Number.isInteger(victory.cell)) {
    result.victory = {mode:'rei',cell:victory.cell,rounds:victory.rounds ?? 5,holder:0,count:0}
  } else if (victory?.mode === 'pontos') result.victory = {mode:'pontos',limit:victory.limit ?? 20}
  if (weather) result.weather = newWeather(typeof weather === 'number' ? weather : Math.floor(Math.random()*4294967296))
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

// Alcance de visão na neblina: terrestres e navios 3 casas, aeronaves 4, Radar +2; prédios da equipe 2.
// Jammer em cima de uma colina enxerga 1 casa a mais (fog.hills: casas de colina do mapa);
// quem está numa floresta enxerga 1 casa a menos (fog.forests), e quem está nela também é visto 1 casa mais perto
// (spotted). Aeronaves voam por cima: não perdem visão nem se escondem.
const visionRange = (fog,unit,rain = false) => (fog.air.includes(unit.name) ? 4 : 3) + (fog.radar.includes(unit.name) ? 2 : 0) - (rain ? 1 : 0) +
  (fog.jammers?.includes(unit.name) && fog.hills?.includes(unit.cell) ? 1 : 0) -
  (!fog.air.includes(unit.name) && fog.forests?.includes(unit.cell) ? 1 : 0)
export function fogVision(state,side) {
  if (!state.fog || side === 0) return null
  const {width} = state.fog
  const seen = new Set()
  // margin: quantas casas sobram de alcance em cada casa vista (0 = bem no limite da visão).
  const margin = new Map()
  const reveal = (cell,range) => {
    const x = cell%width, y = Math.floor(cell/width)
    for (let dy=-range; dy<=range; dy++) for (let dx=-range+Math.abs(dy); dx<=range-Math.abs(dy); dx++) {
      if (x+dx < 0 || x+dx >= width || y+dy < 0) continue
      const target = (y+dy)*width+x+dx, left = range-Math.abs(dx)-Math.abs(dy)
      seen.add(target)
      if (!(margin.get(target) >= left)) margin.set(target,left)
    }
  }
  for (const unit of state.units) if (allied(state,unit.side,side)) reveal(unit.cell,visionRange(state.fog,unit,raining(state)))
  for (const tile of state.structures) if (tile.side && allied(state,tile.side,side)) reveal(tile.cell,2)
  seen.margin = margin
  return seen
}
// Unidade inimiga vista na neblina? Terrestres e navios dentro de uma floresta só aparecem 1 casa mais perto
// (o terreno da floresta continua visível no alcance normal); aeronaves voam por cima e não se escondem.
export function spotted(state,vision,unit) {
  if (!vision) return true
  if (!vision.has(unit.cell)) return false
  const fog = state.fog
  return fog.air.includes(unit.name) || !fog.forests?.includes(unit.cell) || vision.margin.get(unit.cell) >= 1
}

export function snapshot(state, side) {
  const vision = fogVision(state,side)
  const units = state.units.filter(unit => allied(state,unit.side,side) ||
    visibleTo(unit,side) && spotted(state,vision,unit)).map(unit => {
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
  // Neblina: jogada inimiga cuja unidade terminou fora da visão não é mostrada (nem a animação).
  if (vision && event && !allied(state,event.side,side) && event.unit !== undefined &&
      !units.some(unit=>unit.id === event.unit)) event = null
  // Explosão final de uma equipe derrotada: não revela unidades camufladas nem as que estão fora da visão.
  if (event?.eliminated && side !== 0) {
    const shown = event.eliminated.filter(unit=>allied(state,unit.side,side) ||
      !unit.cloaked && spotted(state,vision,unit))
    event = {...event,eliminated:shown.length ? shown : undefined}
  }
  return {version,turn,round,colors,winner,ore,structures,units,last:event,attackScale,alliances,buildable,campaign,
    activeSides,turnEnded,defeated,victory:state.victory,weather:state.weather,
    // Raio: onde caiu é público (todo mundo vê o clarão); a unidade atingida só aparece se estiver à vista.
    lightning:state.lightning && {cell:state.lightning.cell,version:state.lightning.version},
    fog:vision ? [...vision] : undefined,
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
      // As unidades que sobraram explodem em seguida (eliminateTeams, com animação na tela).
      state.defeated.push(structure.side)
    }
    structure.strength = 8
    structure.side = unit.side
    structure.capturer = 0
  }
}

function beginTurn(rules, map, state, event) {
  const sides = activeSides(state)
  const gains = state.campaign ? payRefineries(rules,state) : sides.flatMap(side=>payScenarioRefineries(rules,state,side))
  for (const unit of state.units) {
    if (!sides.includes(unit.side)) continue
    const spec = rules.units[unit.name]
    const [,terrain] = terrainAt(rules,map,state,unit.cell)
    unit.moved = unit.fired = false
    unit.transformed = false
    unit.hp -= turnDamage(rules,spec,terrain)
    damageWhirlpool(rules,map,state,unit,event)
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

// Equipe que perdeu todas as Warmachines (ou o prédio principal, nas missões) é derrotada:
// as unidades que sobraram são removidas e vão para o evento, para a tela explodir uma por uma.
function eliminateTeams(rules,map,state,event) {
  const eliminated = []
  for (const side of state.colors.map((_,index)=>index+1)) {
    const hadLinchpin = map.units.some(unit => unit.side === side && has(rules.units[unit.name],'Linchpin'))
    if (!state.defeated.includes(side) && hadLinchpin && !state.units.some(unit => unit.side === side &&
        unit.hp > 0 && has(rules.units[unit.transported ?? unit.name],'Linchpin'))) state.defeated.push(side)
    if (!state.defeated.includes(side)) continue
    const leftovers = state.units.filter(unit => unit.side === side)
    if (!leftovers.length) continue
    eliminated.push(...leftovers.map(unit => ({id:unit.id,name:unit.name,side,cell:unit.cell,left:unit.left,
      facing:unit.facing,hp:unit.hp,cloaked:unit.cloaked})))
    state.units = state.units.filter(unit => unit.side !== side)
  }
  if (eliminated.length) event.eliminated = [...event.eliminated ?? [],...eliminated]
}

export function checkWinner(rules,map,state) {
  const alive = state.colors.map((_,index)=>index+1).filter(side=>remaining(rules,map,state,side))
  if (!alive.length) state.winner = state.turn
  else if (alive.every(side=>allied(state,side,alive[0]))) state.winner = alive[0]
}

// Modos de vitória de teste, avaliados a cada rodada completa:
// "rei": quem segurar a refinaria central por N rodadas seguidas vence;
// "pontos": ao fim do limite de rodadas vence quem tiver mais pontos (valor das unidades + 500 por prédio).
function roundVictory(rules,state) {
  const victory = state.victory
  if (!victory) return
  if (victory.mode === 'rei') {
    const holder = state.structures.find(tile=>tile.cell === victory.cell)?.side ?? 0
    victory.count = holder && holder === victory.holder ? victory.count + 1 : holder ? 1 : 0
    victory.holder = holder
    if (holder && victory.count >= victory.rounds) state.winner = holder
  } else if (victory.mode === 'pontos' && state.round > victory.limit) {
    const scores = teamScores(rules,state)
    victory.scores = scores
    const best = Math.max(...scores)
    state.winner = scores.indexOf(best) + 1
  }
}
export function teamScores(rules,state) {
  return state.colors.map((_,index)=>{
    const side = index+1
    if (state.defeated.includes(side)) return 0
    const units = state.units.filter(unit=>unit.side === side)
      .reduce((sum,unit)=>sum + rules.units[unit.name].cost * unit.hp / rules.units[unit.name].health,0)
    return Math.round(units + 500*state.structures.filter(tile=>tile.side === side).length)
  })
}

function advanceTurn(rules,map,state,event) {
  const previous = activeSides(state)
  const sides = state.colors.map((_,index)=>index+1)
  const leaders = state.activeSides ? sides.filter(side=>sides.find(other=>allied(state,side,other)) === side) : sides
  const current = leaders.indexOf(state.turn)
  for (let step = 1; step <= leaders.length; step++) {
    const next = leaders[(current+step) % leaders.length]
    const group = sides.filter(side=>(state.activeSides ? allied(state,next,side) : side === next) &&
      remaining(rules,map,state,side))
    if (!group.length) continue
    if (next <= state.turn) {
      state.round++
      advanceWeather(state,map)
      roundVictory(rules,state)
      if (state.winner) return []
    }
    state.turn = next
    if (state.activeSides) {
      state.activeSides = group
      state.turnEnded = []
      state.sideVersion.fill(state.version+1)
    }
    state.undo = null
    const gains = beginTurn(rules,map,state,event)
    if (group.some(side=>remaining(rules,map,state,side))) return gains
    return [...gains,...advanceTurn(rules,map,state,event)]
  }
  return []
}

function moveUnit(rules,map,state,unit,path,event) {
  const {cell:origin,left,facing,side,cloaked} = unit
  const positions = []
  let revealed = false, blocked = false
  // Neblina: o caminho foi aceito com a visão do jogador, que pode não ver o Jammer inimigo. Avião para antes de entrar
  // na zona de exclusão aérea de verdade (e a jogada não pode ser desfeita, para não servir de sonda).
  const jammers = rules.units[unit.name].movementType === 'wings' ? enemyJammers(rules,state,side) : []
  for (const destination of path) {
    if (jammers.some(jammer => distance(map.width,jammer.cell,destination) <= jamRadius(map,jammer.cell))) {
      blocked = true
      break
    }
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
  const hazard = positions.findIndex(cell=>whirlpoolDamageAt(rules,map,state,unit,cell) > 0)
  const damaged = hazard >= 0 && damageWhirlpool(rules,map,state,unit,event,positions[hazard]) > 0
  if (unit.hp <= 0) positions.splice(hazard + 1)
  unit.cell = positions.at(-1) ?? origin
  unit.left = unit.cell % map.width === origin % map.width ? left : unit.cell % map.width < origin % map.width
  if (positions.length) unit.facing = movementDirection(map.width,positions.at(-2) ?? origin,unit.cell)
  unit.moved = true
  const stealth = has(rules.units[unit.name],'Cloaking')
  const jammed = stealth && enemyJammers(rules,state,side).some(jammer =>
    positions.some(cell => distance(map.width,jammer.cell,cell) <= jamRadius(map,jammer.cell)))
  if (stealth && positions.length) unit.cloaked = !jammed && !detectedAt(rules,map,state,unit)
  if (cloaked && !unit.cloaked) revealed = true
  revealed = detect(rules,map,state,unit) || revealed
  state.undo = damaged || revealed || jammed || blocked ? null : {id:unit.id,cell:origin,left,facing,cloaked,side}
  return {type:'move',side,unit:unit.id,from:origin,path:positions,jammed,...(blocked ? {blocked} : {}),public:!cloaked && !unit.cloaked}
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
      Object.assign(event,moveUnit(rules,map,state,unit,path,event))
      break
    }
    case 'attack': {
      const target = state.units.find(other => other.id === action.target)
      requireOrder(target)
      if (action.path !== undefined) {
        const path = action.path
        requireOrder(legalMovePath(rules,map,snapshot(state,side),unit,path) &&
          canAttack(rules,map,state,unit,target,path.at(-1)))
        const movement = moveUnit(rules,map,state,unit,path,event)
        if (unit.hp <= 0 || unit.cell !== path.at(-1)) {
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
      unit.hp = Math.max(1,Math.round(unit.hp * rules.units[changed].health / rules.units[unit.name].health))
      unit.transported = leaving ? undefined : unit.name
      unit.name = changed
      unit.cloaked = false
      // Transformar não gasta o turno: só vale para quem ainda não se moveu (começou o turno ali),
      // e a unidade não pode se transformar de novo no mesmo turno. A Albatross pode pousar depois de voar.
      unit.transformed = true
      state.undo = null
      break
    }
    case 'end': {
      const resourceGains = state.campaign ? [] : payScenarioRefineries(rules,state,side)
      for (const unit of state.units) {
        if (unit.side === side) damageWhirlpool(rules,map,state,unit,event)
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
  state.units = state.units.filter(unit=>unit.hp > 0)
  lightningStrike(rules,state,map,action)
  eliminateTeams(rules,map,state,event)
  checkWinner(rules,map,state)
  if (!state.winner && (state.activeSides
    ? !state.activeSides.some(team=>canTakeTurn(state,team) && remaining(rules,map,state,team))
    : action.type === 'end' || !remaining(rules,map,state,side))) {
    const gains = advanceTurn(rules,map,state,event)
    if (gains.length) event.resourceGains = [...event.resourceGains ?? [],...gains]
    eliminateTeams(rules,map,state,event)
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

