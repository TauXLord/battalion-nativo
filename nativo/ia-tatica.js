// IA tática: avaliação doutrinária (terreno, economia por vaga, papéis) + solucionador de abate
// + checagem defensiva das Warmachines. Mesma assinatura de chooseAction de ia.js.
// Todos os pesos ficam em `defaultParams` para serem ajustados por treino (perfil format 2).
import { allied, raining, buildCells, buildCost, buildTargetScore, canAttack, canCounter, canRepair, damageAmount,
  distance, isRanged, moveCost, neighbors, reachable, snapshot, terrainAt, terrainMoveCost,
  terrainTurnDamage } from './partida.js'
import { chooseAction as baselineAction } from './ia.js'

export const defaultParams = {
  linchpinValue: 2600,     // valor de uma Warmachine (multiplicado quando restam poucas)
  killBonus: .45,          // bônus por destruir uma unidade (fração do valor)
  riskFactor: .55,         // quanto do dano inimigo potencial conta como perda esperada
  progress: 9,             // peso de avançar no campo de objetivo (por casa)
  progressCap: 8,
  terrainCover: 40,        // bônus por casa com defesa (por 10% de redução de dano)
  cohesion: 4,             // bônus por aliado próximo (até 3)
  screen: 26,              // bônus por ocupar casa vizinha a uma Warmachine aliada exposta
  wmDanger: 1.4,           // peso do dano letal potencial contra Warmachines aliadas
  wmSafeMove: 70,          // bônus para Warmachine sair de casa ameaçada
  buildBase: 60,
  buildPower: .09,         // valor das trocas previstas da unidade construída
  buildDurability: .25,
  antiAirNeed: 70,
  captureNeed: 55,
  spamPenalty: 10,
  budgetTurns: 6,
  reserve: 300,            // saldo mínimo por Warmachine sem renda garantida
  lowFunds: 1400,          // abaixo disso (saldo + renda prevista) a Warmachine prioriza minério
  extractLowBudget: 140,
  oreSeek: 60,
  captureScore: 120,
  refineryClaim: 230,      // valor de pisar numa refinaria por capturar (rende 300/turno por Warmachine)
  escort: 4,               // atração do exército por refinarias em disputa
  repairBase: 18,
  endThreshold: 2,
  // Ilhas (sem caminho por terra até as Warmachines inimigas): frota e aviação.
  strandedPenalty: 120,    // unidade terrestre que não alcança o inimigo
  navalBonus: 45,          // navio ou avião que alcança o inimigo
  shoreSeek: 60,           // Warmachine ir para a costa para poder construir navios
  // Chuva: estrutura é para-raios para unidades terrestres e navais (o raio não causa dano nelas).
  lightningShelter: 20,
}

const has = (spec,name) => spec.mods.includes(name)
const isOre = name => name === 'Ore Deposit' || name === 'Enriched Ore Deposit'
const refining = (rules,tile) => rules.terrain[tile.name].mods.some(mod=>mod.includes('Oil Refining'))

function paramsFrom(profile) {
  if (profile?.format === 2 && profile.params && typeof profile.params === 'object') {
    const merged = {...defaultParams}
    for (const key of Object.keys(defaultParams)) {
      const value = Number(profile.params[key])
      if (Number.isFinite(value)) merged[key] = value
    }
    return merged
  }
  return defaultParams
}

export function validTacticalProfile(profile) {
  return profile?.format === 2 && profile.params && typeof profile.params === 'object' &&
    Object.values(profile.params).every(Number.isFinite)
}

// Custo mínimo de deslocamento até qualquer casa de `goals`, para um tipo de movimento.
function distanceField(rules,map,view,spec,goals,side) {
  const size = map.tiles.length
  const costs = new Float64Array(size).fill(Infinity)
  if (!goals.length) return costs
  const blocked = new Uint8Array(size)
  for (const unit of view.units) if (!allied(view,unit.side,side)) blocked[unit.cell] = 1
  const step = new Float64Array(size).fill(NaN)
  const cost = cell => Number.isNaN(step[cell]) ? (step[cell] = moveCost(rules,map,view,spec,cell,side)) : step[cell]
  const queue = []
  for (const cell of new Set(goals)) { costs[cell] = 0; queue.push(cell) }
  for (let i=0;i<queue.length;i++) {
    const cell = queue[i], here = costs[cell] + (Number.isFinite(cost(cell)) ? cost(cell) : 1)
    for (const next of neighbors(map,cell)) {
      if (blocked[next] && !goals.includes(next)) continue
      if (!Number.isFinite(cost(next)) || here >= costs[next]) continue
      costs[next] = here
      queue.push(next)
    }
  }
  return costs
}

function context(rules,map,state,side,params) {
  const view = snapshot(state,side)
  const mine = view.units.filter(unit=>unit.side === side)
  const enemies = view.units.filter(unit=>!allied(view,unit.side,side) && !unit.cloaked)
  const occupied = new Map(view.units.map(unit=>[unit.cell,unit]))
  const machinesOf = list => list.filter(unit=>has(rules.units[unit.transported ?? unit.name],'Linchpin'))
  const myMachines = machinesOf(mine), enemyMachines = machinesOf(enemies)
  const refineries = view.structures.filter(tile=>refining(rules,tile))
  const owned = refineries.filter(tile=>tile.side === side).length
  // Cada refinaria paga 150 por Warmachine no início e no fim do turno.
  const incomePerMachine = view.campaign ? 0 : 300*owned
  const enemyAir = enemies.filter(unit=>rules.units[unit.name].unitType === 'air')
  // Neblina sem Warmachine inimiga à vista: o exército vai explorar onde ela deve estar (posição inicial das
  // Warmachines inimigas no mapa e as estruturas do inimigo), em vez de ficar parado passando a vez.
  const fogged = Array.isArray(view.fog) || Boolean(state.fog)
  const scouts = fogged && !enemyMachines.length ? [
    ...(map.units ?? []).filter(unit=>unit.side && !allied(view,unit.side,side) && has(rules.units[unit.name] ?? {mods:[]},'Linchpin')),
    ...view.structures.filter(tile=>tile.side && !allied(view,tile.side,side)),
  ].map(item=>({cell:item.cell})) : []
  const ctx = {rules,map,view,side,params,mine,enemies,occupied,myMachines,enemyMachines,refineries,owned,scouts,
    incomePerMachine,enemyAir,fields:new Map(),threatCache:new Map(),reach:new Map()}
  // Alcance de cada inimigo no próximo turno (as nossas unidades bloqueiam o caminho).
  for (const enemy of enemies) {
    const spec = rules.units[enemy.name]
    if (!spec.damage) continue
    const ready = {...enemy,moved:false,fired:false,disabled:false}
    const cells = isRanged(spec) ? new Set([enemy.cell]) :
      new Set([enemy.cell,...reachable(rules,map,view,ready).keys()])
    ctx.reach.set(enemy.id,{enemy:ready,spec,cells})
  }
  return ctx
}

function unitValue(ctx,unit) {
  const spec = ctx.rules.units[unit.transported ?? unit.name]
  if (has(spec,'Linchpin')) {
    const own = unit.side === ctx.side ? ctx.myMachines.length : ctx.enemyMachines.length
    return ctx.params.linchpinValue * (1 + 1.5/Math.max(1,own))
  }
  return Math.max(60,spec.cost)
}

function hitValue(ctx,unit,damage) {
  const max = ctx.rules.units[unit.name].health
  const fraction = Math.min(unit.hp,damage)/max
  return unitValue(ctx,unit) * (fraction + (damage >= unit.hp ? ctx.params.killBonus : 0))
}

// Dano que cada inimigo poderia causar a `unit` se ela estivesse em `cell` (próximo turno do inimigo).
function threatsAt(ctx,unit,cell,ignore) {
  const key = unit.name+':'+unit.hp+':'+cell+':'+(ignore ?? '')
  const cached = ctx.threatCache.get(key)
  if (cached) return cached
  const {rules,map,view} = ctx
  const target = {...unit,cell,cloaked:false}
  const hits = []
  for (const [id,{enemy,spec,cells}] of ctx.reach) {
    if (id === ignore) continue
    if (distance(map.width,enemy.cell,cell) > spec.range + spec.weaponRangeMax + 2) continue
    let ok = false
    if (isRanged(spec)) ok = canAttack(rules,map,view,enemy,target)
    else for (const from of neighbors(map,cell)) {
      if (cells.has(from) && (from === enemy.cell || !ctx.occupied.has(from) || from === unit.cell) &&
          canAttack(rules,map,view,{...enemy,cell:from},target,from)) { ok = true; break }
    }
    if (ok) hits.push({id,damage:damageAmount(rules,map,view,enemy,target),melee:!isRanged(spec)})
  }
  hits.sort((a,b)=>b.damage-a.damage)
  ctx.threatCache.set(key,hits)
  return hits
}

// Dano máximo que o inimigo concentra numa unidade: corpo a corpo limitado às casas vizinhas livres.
function focusedDamage(ctx,unit,cell,ignore) {
  const hits = threatsAt(ctx,unit,cell,ignore)
  const free = neighbors(ctx.map,cell).filter(next=>!ctx.occupied.has(next) || next === unit.cell).length
  let total = 0, melee = 0
  for (const hit of hits) {
    if (hit.melee && melee >= free) continue
    if (hit.melee) melee++
    total += hit.damage
  }
  return total
}

function expectedLoss(ctx,unit,cell,ignore) {
  const spec = ctx.rules.units[unit.name]
  const damage = has(spec,'Linchpin') ? focusedDamage(ctx,unit,cell,ignore) :
    threatsAt(ctx,unit,cell,ignore).slice(0,2).reduce((sum,hit,i)=>sum+hit.damage*(i ? .5 : 1),0)
  if (!damage) return 0
  const lethal = damage >= unit.hp
  const weight = has(spec,'Linchpin') ? ctx.params.wmDanger : ctx.params.riskFactor
  return weight * hitValue(ctx,unit,damage) * (lethal || has(spec,'Linchpin') ? 1 : .8)
}

function defenseBonus(ctx,spec,cell) {
  const [,terrain] = terrainAt(ctx.rules,ctx.map,ctx.view,cell)
  let reduction = 0
  for (const mod of terrain.mods) {
    for (const [field,,matches] of ctx.rules.terrainEffects[mod] ?? []) {
      if (field !== 'defense') continue
      for (const [type,match,effects] of matches) {
        if (type === 'unitType' && spec.unitType === match) reduction += -parseFloat(effects[0]) || 0
      }
    }
  }
  // Canyon: imune a artilharia e aéreos.
  if (terrain.mods.includes('Shielded') && spec.unitType === 'ground') reduction += 25
  return reduction/10
}

function field(ctx,spec,kind,goals) {
  const key = spec.movementType+':'+spec.unitType+':'+kind
  if (!ctx.fields.has(key)) ctx.fields.set(key,distanceField(ctx.rules,ctx.map,ctx.view,spec,goals,ctx.side))
  return ctx.fields.get(key)
}

function attackGoals(ctx,spec,targets = ctx.enemyMachines.length ? ctx.enemyMachines : [...ctx.enemies,...ctx.scouts]) {
  const {map,rules,view} = ctx
  const cells = new Set()
  for (const target of targets) {
    const r = isRanged(spec) ? spec.weaponRangeMax : 1
    const x = target.cell % map.width, y = Math.floor(target.cell/map.width)
    for (let dy=-r;dy<=r;dy++) for (let dx=-r+Math.abs(dy);dx<=r-Math.abs(dy);dx++) {
      const cx = x+dx, cy = y+dy
      if (cx<0 || cy<0 || cx>=map.width || cy>=map.height || !dx && !dy) continue
      const cell = cy*map.width+cx
      if (Math.abs(dx)+Math.abs(dy) < spec.weaponRangeMin) continue
      if (Number.isFinite(moveCost(rules,map,view,spec,cell,ctx.side))) cells.add(cell)
    }
  }
  return [...cells]
}

// Ilhado: nenhuma Warmachine nossa tem caminho por terra até uma Warmachine inimiga.
function isStranded(ctx) {
  if (ctx.stranded !== undefined) return ctx.stranded
  const machine = ctx.myMachines.find(unit=>!unit.transported)
  if (!machine || !ctx.enemyMachines.length) return ctx.stranded = false
  const spec = ctx.rules.units[machine.name]
  const link = field(ctx,spec,'link',ctx.enemyMachines.map(unit=>unit.cell))
  return ctx.stranded = !ctx.myMachines.some(unit=>Number.isFinite(link[unit.cell]))
}

// Distância por mar até atirar nas Warmachines inimigas; se o mar não chega a elas, até qualquer inimigo.
function navalField(ctx,spec) {
  const kind = 'attack:'+spec.weaponRangeMin+'-'+spec.weaponRangeMax
  const machines = field(ctx,spec,kind,attackGoals(ctx,spec))
  if (machines.some(Number.isFinite)) return machines
  return field(ctx,spec,kind+':todos',attackGoals(ctx,spec,ctx.enemies))
}

// Casas de costa (onde a Warmachine constrói navios) com mar ligado aos inimigos.
function launchShores(ctx) {
  if (ctx.shores) return ctx.shores
  const {rules,map,view} = ctx
  const hull = rules.units['Battlecruiser'] ?? Object.values(rules.units).find(spec=>spec.unitType === 'sea' && spec.damage)
  if (!hull) return ctx.shores = []
  const sea = navalField(ctx,hull)
  return ctx.shores = map.tiles.flatMap(([name],cell)=>terrainAt(rules,map,view,cell)[0] === 'Shore' &&
    neighbors(map,cell).some(next=>Number.isFinite(sea[next])) &&
    (!ctx.occupied.has(cell) || ctx.occupied.get(cell).side === ctx.side) ? [cell] : [])
}

function roleOf(ctx,unit) {
  const spec = ctx.rules.units[unit.name]
  if (has(spec,'Linchpin')) return 'machine'
  if (has(spec,'Capture') && spec.unitType === 'ground' &&
      ctx.refineries.some(tile=>!tile.side || !allied(ctx.view,ctx.side,tile.side))) return 'capture'
  if (has(spec,'Skysweeper') && spec.unitType === 'ground' && ctx.enemyAir.length) return 'guard'
  return 'attack'
}

function positionValue(ctx,unit,cell) {
  const {params,rules,map} = ctx
  const spec = rules.units[unit.name]
  const role = roleOf(ctx,unit)
  let value = -expectedLoss(ctx,unit,cell)
  value += params.terrainCover * defenseBonus(ctx,spec,cell) * (role === 'machine' ? 1.5 : .5)
  const hazard = terrainTurnDamage(rules,map,ctx.view,unit,cell)
  if (hazard > 0) value -= hitValue(ctx,unit,hazard)
  if (raining(ctx.view) && spec.unitType !== 'air' && ctx.view.structures.some(tile=>tile.cell === cell)) value += params.lightningShelter
  if (role === 'machine') return value
  let goal
  if (role === 'capture') {
    const targets = ctx.refineries.filter(tile=>(!tile.side || !allied(ctx.view,ctx.side,tile.side)) &&
      (!ctx.occupied.has(tile.cell) || ctx.occupied.get(tile.cell).id === unit.id)).map(tile=>tile.cell)
    goal = field(ctx,spec,'capture',targets)
    if (targets.includes(cell)) value += params.refineryClaim * (1 + .5*ctx.myMachines.length/3)
  } else if (role === 'guard') {
    const anchors = ctx.myMachines.flatMap(machine=>neighbors(map,machine.cell))
    goal = field(ctx,spec,'guard',anchors.length ? anchors : attackGoals(ctx,spec))
  } else goal = field(ctx,spec,'attack:'+spec.weaponRangeMin+'-'+spec.weaponRangeMax,attackGoals(ctx,spec))
  const remaining = goal[cell]
  if (Number.isFinite(remaining)) value -= params.progress * Math.min(remaining,40)
  else value -= params.progress * 40
  // Coesão: avançar em grupo.
  let friends = 0
  for (const other of ctx.mine) if (other.id !== unit.id && distance(map.width,other.cell,cell) <= 2) friends++
  value += params.cohesion * Math.min(3,friends)
  // Escolta: ficar perto de refinarias ainda não nossas protege os commandos e nega a captura inimiga.
  if (role === 'attack') {
    const open = ctx.refineries.filter(tile=>tile.side !== ctx.side)
    if (open.length) {
      const near = Math.min(...open.map(tile=>distance(map.width,tile.cell,cell)))
      value += params.escort * Math.max(0,6-near)
    }
  }
  // Escudo: ocupar casa vizinha a Warmachine aliada sob ameaça corpo a corpo.
  for (const machine of ctx.myMachines) {
    if (distance(map.width,machine.cell,cell) === 1 && ctx.machineDanger?.get(machine.id) > 0) value += params.screen
  }
  return value
}

// Solucionador de abate: menor conjunto de ataques que destrói `target` neste turno.
function killPlan(ctx,target) {
  const {rules,map,view} = ctx
  const options = []
  for (const unit of ctx.mine) {
    if (unit.fired || unit.disabled) continue
    const spec = rules.units[unit.name]
    if (!spec.damage) continue
    if (canAttack(rules,map,view,unit,target)) {
      options.push({unit,cell:unit.cell,path:undefined,damage:damageAmount(rules,map,view,unit,target)})
      continue
    }
    if (isRanged(spec) || unit.moved) continue
    const moves = reachable(rules,map,view,unit)
    let best
    for (const cell of neighbors(map,target.cell)) {
      const path = moves.get(cell)
      if (!path || !canAttack(rules,map,view,unit,target,cell)) continue
      const exposure = expectedLoss(ctx,unit,cell,target.id)
      if (!best || exposure < best.exposure) best = {unit,cell,path,exposure,damage:damageAmount(rules,map,view,{...unit,cell},target)}
    }
    if (best) options.push(best)
  }
  if (options.reduce((sum,option)=>sum+option.damage,0) < target.hp) return null
  options.sort((a,b)=>b.damage-a.damage)
  let best = null
  const chosen = []
  const search = (index,hp,cells,cost) => {
    if (best && cost >= best.cost) return
    if (hp <= 0) { best = {cost,steps:[...chosen]}; return }
    if (index >= options.length || chosen.length >= 5) return
    let rest = 0
    for (let i=index;i<options.length;i++) rest += options[i].damage
    if (rest < hp) return
    const option = options[index]
    if (!option.path || !cells.has(option.cell)) {
      chosen.push(option)
      const next = option.path ? new Set([...cells,option.cell]) : cells
      search(index+1,hp-option.damage,next,cost+unitValue(ctx,option.unit)*.02+(option.exposure ?? 0)*.3)
      chosen.pop()
    }
    search(index+1,hp,cells,cost)
  }
  search(0,target.hp,new Set(),0)
  if (!best) return null
  // Ordem: quem atira sem se mover primeiro, depois os que precisam se aproximar.
  best.steps.sort((a,b)=>Number(Boolean(a.path))-Number(Boolean(b.path)))
  return best
}

function attackOptions(ctx,unit,offer) {
  const {rules,map,view,params} = ctx
  const spec = rules.units[unit.name]
  if (unit.fired || unit.disabled || !spec.damage) return
  const moves = unit.moved ? new Map() : reachable(rules,map,view,unit)
  const evaluate = (target,cell,path) => {
    if (!canAttack(rules,map,view,{...unit,cell},target,path ? cell : undefined)) return
    const attacker = {...unit,cell}
    const dealt = damageAmount(rules,map,view,attacker,target)
    if (!dealt) return
    const after = {...target,hp:target.hp-dealt}
    const received = after.hp > 0 && !target.repairing && canCounter(rules,map,view,attacker,after) ?
      damageAmount(rules,map,view,after,attacker,true) : 0
    const survivor = {...unit,hp:unit.hp-received}
    let score = hitValue(ctx,target,dealt) - hitValue(ctx,unit,received)
    if (survivor.hp > 0) score += positionValue(ctx,survivor,cell) - positionValue(ctx,unit,unit.cell)
    // Commandos com refinaria por capturar só lutam se valer muito (são frágeis e únicos que capturam).
    const capturing = roleOf(ctx,unit) === 'capture' && dealt < target.hp
    offer({type:'attack',unit:unit.id,target:target.id,...(path ? {path} : {})},capturing ? score*.25 : score*.6 + 20)
  }
  for (const target of ctx.enemies) {
    evaluate(target,unit.cell)
    if (!isRanged(spec)) for (const cell of neighbors(map,target.cell)) {
      const path = moves.get(cell)
      if (path) evaluate(target,cell,path)
    }
  }
}

// Escolha de produção: valor por vaga com orçamento que garante as próximas vagas.
function buildOptions(ctx,machine,offer) {
  const {rules,map,view,params} = ctx
  if (machine.credits === undefined || machine.credits < 0 || machine.moved || machine.fired || machine.disabled) return
  const horizon = params.budgetTurns
  const budget = (machine.credits + ctx.incomePerMachine*horizon)/horizon
  const counts = new Map()
  for (const unit of ctx.mine) counts.set(unit.name,(counts.get(unit.name) ?? 0)+1)
  const capturers = ctx.mine.filter(unit=>has(rules.units[unit.name],'Capture') && rules.units[unit.name].unitType === 'ground').length
  const openRefineries = ctx.refineries.filter(tile=>!tile.side || !allied(view,ctx.side,tile.side)).length
  const enemyAirValue = ctx.enemyAir.reduce((sum,unit)=>sum+rules.units[unit.name].cost,0)
  const myAA = ctx.mine.filter(unit=>has(rules.units[unit.name],'Skysweeper') && !has(rules.units[unit.name],'Linchpin')).length
  const local = ctx.enemies.slice().sort((a,b)=>distance(map.width,machine.cell,a.cell)-distance(map.width,machine.cell,b.cell)).slice(0,10)
  const danger = ctx.machineDanger.get(machine.id) ?? 0
  const stranded = isStranded(ctx)
  // Inimigos terrestres já desembarcados perto desta Warmachine.
  const invaders = stranded ? ctx.enemies.filter(unit=>rules.units[unit.name].unitType === 'ground' &&
    !has(rules.units[unit.name],'Linchpin') &&
    distance(map.width,unit.cell,machine.cell) <= 8).length : 0
  for (const [name,spec] of Object.entries(rules.units)) {
    if (!spec.damage || has(spec,'Unbuildable')) continue
    const cost = buildCost(rules,view,machine,spec)
    if (!Number.isFinite(cost) || cost > machine.credits) continue
    const cells = buildCells(rules,map,view,machine,spec)
    if (!cells.length) continue
    const probe = {name,hp:spec.health,side:ctx.side,cell:machine.cell}
    let power = 0, weight = 0
    for (const enemy of local) {
      const w = 1/(1+distance(map.width,machine.cell,enemy.cell)/10)
      power += w*Math.max(0,buildTargetScore(rules,map,view,probe,enemy))
      weight += w
    }
    if (local.length) power /= weight
    else power = spec.damage*2
    if (spec.unitType === 'sea') {
      // Naval só se o mar ligar a algum inimigo.
      const sea = stranded ? navalField(ctx,spec) : distanceField(rules,map,view,spec,attackGoals(ctx,spec),ctx.side)
      if (!cells.some(cell=>Number.isFinite(sea[cell]))) continue
    }
    let value = params.buildBase + params.buildPower*power + params.buildDurability*spec.health*(spec.armorType === 'heavy' ? 1.5 : 1)
    if (stranded) {
      // Ilhas: só vale o que chega ao inimigo; terrestres apenas para defender a própria ilha.
      if (spec.unitType === 'ground') {
        const goal = field(ctx,spec,'attack:'+spec.weaponRangeMin+'-'+spec.weaponRangeMax,attackGoals(ctx,spec))
        const defending = danger > 0 || invaders > 0 || has(spec,'Skysweeper') && enemyAirValue
        if (!cells.some(cell=>Number.isFinite(goal[cell])) && !defending) value -= params.strandedPenalty
      } else if (power > 0) value += params.navalBonus * (spec.unitType === 'sea' ? 1 : .5)
    }
    if (has(spec,'Skysweeper') && enemyAirValue) value += params.antiAirNeed*Math.min(2,enemyAirValue/600)/((1+myAA)**1.5)
    if (has(spec,'Capture') && spec.unitType === 'ground' && capturers < Math.min(3,openRefineries)) value += params.captureNeed
    if (has(spec,'Capture') && spec.unitType === 'ground' && capturers >= Math.max(2,openRefineries)) value -= 40
    const repeats = counts.get(name) ?? 0
    value -= params.spamPenalty*Math.max(0,repeats-2)
    // Orçamento: acima do valor por vaga custa caro; abaixo, desperdiça a vaga.
    if (cost > budget) value -= (cost-budget)*.12
    // Nunca zerar o caixa sem renda: perder vagas futuras é pior que construir algo menor agora.
    if (!ctx.incomePerMachine && machine.credits-cost < params.reserve && danger <= 0) value -= 80
    // Casa de saída: prefere bloquear acesso corpo a corpo à Warmachine ameaçada e ficar segura.
    let bestCell, bestCellScore = -Infinity
    for (const cell of cells) {
      const unit = {...probe,cell,id:-1}
      let s = -expectedLoss(ctx,unit,cell)*.5
      if (danger > 0) s += 25
      s -= .3*Math.min(...ctx.enemyMachines.map(target=>distance(map.width,cell,target.cell)),40)
      if (s > bestCellScore) { bestCellScore = s; bestCell = cell }
    }
    offer({type:'build',unit:machine.id,name,cell:bestCell},value + bestCellScore*.2)
  }
}

function machineOptions(ctx,machine,offer) {
  const {rules,map,view,params} = ctx
  const spec = rules.units[machine.name]
  const [ground] = terrainAt(rules,map,view,machine.cell)
  const danger = ctx.machineDanger.get(machine.id) ?? 0
  const funds = machine.credits + ctx.incomePerMachine*params.budgetTurns
  const low = funds < params.lowFunds
  if (has(spec,'Extractor') && isOre(ground) && !machine.moved && machine.credits >= 0) {
    offer({type:'extract',unit:machine.id},(low ? params.extractLowBudget : 15) - danger*.5)
  }
  if (machine.moved) return
  const here = positionValue(ctx,machine,machine.cell)
  // Sem dinheiro: procurar minério livre e seguro.
  let ore
  if (low && has(spec,'Extractor') && !isOre(ground)) {
    const deposits = map.tiles.flatMap(([name],cell)=>isOre(view.ore[cell] ?? name) && !ctx.occupied.has(cell) ? [cell] : [])
    ore = distanceField(rules,map,view,spec,deposits,ctx.side)
  }
  // Ilhas: ir para a costa ligada ao inimigo, onde dá para construir navios.
  let shore, docked = false, runner = false
  if (isStranded(ctx)) {
    const shores = launchShores(ctx)
    docked = ctx.myMachines.some(unit=>unit.id !== machine.id && shores.includes(unit.cell))
    if (shores.length && !shores.includes(machine.cell)) {
      shore = distanceField(rules,map,view,spec,shores,ctx.side)
      // Sem nenhuma Warmachine na costa, a mais próxima dela viaja (perde vagas por alguns turnos).
      const trip = unit => unit.transported ? Infinity : shore[unit.cell]
      runner = !docked && Number.isFinite(shore[machine.cell]) && danger <= 0 &&
        ctx.myMachines.every(unit=>unit.id === machine.id || trip(unit) > shore[machine.cell] ||
          trip(unit) === shore[machine.cell] && unit.id > machine.id)
    }
  }
  for (const [cell,path] of reachable(rules,map,view,machine)) {
    let gain = positionValue(ctx,machine,cell) - here
    if (ore && Number.isFinite(ore[cell]) && ore[cell] < ore[machine.cell]) gain += params.oreSeek + 8*(ore[machine.cell]-ore[cell])
    if (shore && Number.isFinite(shore[cell]) && shore[cell] < shore[machine.cell]) {
      gain += params.shoreSeek + 8*(shore[machine.cell]-shore[cell])
      // Chegar à costa vale a vaga perdida neste turno: dali em diante ela constrói navios.
      // Uma Warmachine na costa já basta para a frota; as outras ganham menos.
      if (shore[cell] === 0) gain += params.shoreSeek * (docked ? 1 : 3)
    }
    // Mover custa a vaga de construção: só vale se reduzir muito o perigo ou buscar recurso.
    const safer = danger > 0 && focusedDamage(ctx,machine,cell) < focusedDamage(ctx,machine,machine.cell)
    const toShore = runner && shore[cell] < shore[machine.cell] ? params.shoreSeek*3 + 20*(shore[machine.cell]-shore[cell]) : 0
    offer({type:'move',unit:machine.id,cell,path},gain*.5 + toShore + (safer ? params.wmSafeMove : ore || shore ? 0 : -30))
  }
}

// Níveis da IA (todos usam a IA tática treinada):
//   0 Fácil: erra de propósito (ruído nas escolhas) e luta sem medo de perder unidades;
//   1 Médio: pouco ruído, combate equilibrado;
//   2 Difícil: a IA treinada pura, igual ao treino;
//   3 Skynet: a IA treinada pura com 40% a mais de dano (o bônus de dano fica em levelAttackScale, partida.js).
// Perfil format 1 (rede antiga) vale só para a IA padrão (engine 'padrao'); format 2 ajusta os pesos da IA tática.
const LEVEL_NOISE = [36,8,0,0]
export function chooseGameAction(rules,map,state,options = {}) {
  const level = Math.max(0,Math.min(3,options.difficulty ?? 1))
  if (options.engine === 'padrao') return baselineAction(rules,map,state,{...options,difficulty:Math.min(2,level)})
  const profile = validTacticalProfile(options.profile) ? options.profile : undefined
  const noise = LEVEL_NOISE[level]
  const random = options.random ?? (noise ? Math.random : undefined)
  return chooseAction(rules,map,state,{...options,profile,difficulty:Math.min(2,level),combatLevel:Math.min(2,level),noise,random})
}

// Melhor avanço de exploração (neblina): a tropa parada que mais se aproxima dos alvos prováveis sem se expor.
function scoutMove(ctx) {
  const {rules,map,view} = ctx
  let best = null
  for (const unit of ctx.mine) {
    const spec = rules.units[unit.name]
    if (unit.moved || unit.fired || unit.disabled || unit.transported || has(spec,'Linchpin')) continue
    const here = positionValue(ctx,unit,unit.cell)
    for (const [cell,path] of reachable(rules,map,view,unit)) {
      const gain = positionValue(ctx,unit,cell) - here
      if (gain > 1 && (!best || gain > best.gain)) best = {gain,action:{type:'move',unit:unit.id,cell,path}}
    }
  }
  return best?.action ?? null
}

export function chooseAction(rules,map,state,options = {}) {
  const side = options.side ?? state.turn
  // Campanha e fábricas fixas ainda usam a IA padrão (produção por fábrica).
  if (state.campaign || state.teamCredits?.some(value=>value != null)) return baselineAction(rules,map,state,options)
  const params = paramsFrom(options.profile)
  const ctx = context(rules,map,state,side,params)
  const {view} = ctx
  if (!ctx.enemies.length && !ctx.scouts.length) return baselineAction(rules,map,state,{...options,profile:undefined,difficulty:options.combatLevel ?? 2,seconds:0})
  ctx.machineDanger = new Map(ctx.myMachines.map(machine=>[machine.id,focusedDamage(ctx,machine,machine.cell)]))

  // 1. Abate de Warmachine inimiga se houver combinação letal neste turno.
  let bestKill
  for (const target of ctx.enemyMachines) {
    const plan = killPlan(ctx,target)
    if (plan && (!bestKill || plan.cost < bestKill.cost)) bestKill = {...plan,target}
  }
  if (bestKill && !(options.noise >= 30 && options.random?.() < .5)) {
    const step = bestKill.steps[0]
    return {type:'attack',unit:step.unit.id,target:bestKill.target.id,...(step.path ? {path:step.path} : {})}
  }

  const candidates = []
  const offer = (action,score) => {
    if (!Number.isFinite(score)) return
    if (options.random) score += (options.random()-.5)*(options.noise || 2)
    candidates.push({action,score})
  }
  if (options.tactics !== 'own') {
    // 2. Camada estratégica: Warmachines (produção, minério, segurança) e capturas.
    for (const unit of ctx.mine) {
      const spec = rules.units[unit.name]
      if (unit.disabled) continue
      const tile = view.structures.find(item=>item.cell === unit.cell)
      if (tile && has(spec,'Capture') && !unit.fired && !allied(view,side,tile.side) && tile.capturer !== unit.id) {
        offer({type:'capture',unit:unit.id},params.captureScore)
      }
      if (has(spec,'Linchpin') && !unit.fired) {
        buildOptions(ctx,unit,offer)
        machineOptions(ctx,unit,offer)
      }
    }
    candidates.sort((a,b)=>b.score-a.score)
    if (candidates[0]?.score > params.endThreshold) return candidates[0].action
    // 3. Combate local: motor tático da IA padrão, sem acesso às Warmachines (já decididas acima).
    const units = state.units.map(unit=>unit.side === side && has(rules.units[unit.transported ?? unit.name],'Linchpin') ?
      {...unit,moved:true,fired:true} : unit)
    // Igual ao treino (tools/treinar-tatica.mjs): combate guloso de dificuldade 2, sem busca por tempo.
    // Repassar options.seconds faria o jogo pensar ~1 s por movimento e mudaria o comportamento treinado.
    const combat = baselineAction(rules,map,{...state,units},{...options,side,profile:undefined,difficulty:options.combatLevel ?? 2,seconds:0})
    // Neblina: a IA padrão não anda sem inimigo à vista; aí as tropas paradas avançam explorando.
    if (combat?.type === 'end' && ctx.scouts.length) return scoutMove(ctx) ?? combat
    return combat
  }
  // 2. Abates de alto valor contra outras unidades.
  for (const target of ctx.enemies) {
    if (has(rules.units[target.name],'Linchpin')) continue
    const plan = killPlan(ctx,target)
    if (!plan || plan.steps.length > 3) continue
    const step = plan.steps[0]
    const gain = unitValue(ctx,target)*(1+params.killBonus) - plan.cost*20
    offer({type:'attack',unit:step.unit.id,target:target.id,...(step.path ? {path:step.path} : {})},gain*.6 + 10)
  }
  for (const unit of ctx.mine) {
    if (unit.disabled) continue
    const spec = rules.units[unit.name]
    const tile = view.structures.find(item=>item.cell === unit.cell)
    if (tile && has(spec,'Capture') && !unit.fired && !allied(view,side,tile.side) && tile.capturer !== unit.id) {
      offer({type:'capture',unit:unit.id},params.captureScore + (refining(rules,tile) ? 40 : 0))
    }
    if (has(spec,'Linchpin')) {
      buildOptions(ctx,unit,offer)
      machineOptions(ctx,unit,offer)
      continue
    }
    attackOptions(ctx,unit,offer)
    if (!unit.moved && !unit.fired && unit.hp <= spec.health*.6 && canRepair(rules,map,view,unit)) {
      offer({type:'repair',unit:unit.id},params.repairBase + 30*(1-unit.hp/spec.health) - expectedLoss(ctx,unit,unit.cell)*.3)
    }
    if (unit.moved || unit.fired) continue
    const here = positionValue(ctx,unit,unit.cell)
    for (const [cell,path] of reachable(rules,map,view,unit)) {
      const gain = positionValue(ctx,unit,cell) - here
      offer({type:'move',unit:unit.id,cell,path},Math.min(gain,params.progress*params.progressCap*2+60))
    }
  }
  candidates.sort((a,b)=>b.score-a.score)
  const best = candidates[0]
  if (!best || best.score <= params.endThreshold) return {type:'end'}
  return best.action
}
