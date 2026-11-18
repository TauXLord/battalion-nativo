// Retomar uma partida a partir de um arquivo salvo da tela (ex.: visão de espectador depois que a conexão caiu).
// O arquivo tem {estado, mapa}: o estado visível da partida e o mapa. Aqui ele vira um estado completo do motor,
// com o time escolhido como equipe 1 (o jogador deste computador / o anfitrião da sala).
const has = (spec,name) => spec.mods.includes(name)
const MAX_SIDE = 9

function fail(message) { throw Error(message) }
const integer = (value,min,max) => Number.isInteger(value) && value >= min && value <= max

// Confere o arquivo e devolve a quantidade de equipes e o nome de cada uma (para a tela de escolha).
export function describeSaved(rules,file) {
  const {estado:state,mapa:map} = file ?? {}
  if (!state || !map || !Array.isArray(state.units) || !Array.isArray(state.structures) || !Array.isArray(state.colors)) {
    fail('Este arquivo não é uma partida salva do Battalion.')
  }
  if (!integer(map.width,4,100) || !integer(map.height,4,100) || !Array.isArray(map.tiles) ||
      map.tiles.length !== map.width*map.height) fail('O mapa deste arquivo está incompleto.')
  const count = state.colors.length
  if (!integer(count,2,MAX_SIDE) || !state.colors.every(color=>typeof color === 'string' && /^[0-9a-f]{8}$/i.test(color))) {
    fail('As equipes deste arquivo estão incompletas.')
  }
  const cells = map.width*map.height
  for (const unit of state.units) {
    if (!unit || !rules.units[unit.name] || !integer(unit.side,1,count) || !integer(unit.cell,0,cells-1) ||
        !integer(unit.id,1,1e9) || typeof unit.hp !== 'number' || !(unit.hp > 0)) fail('Há uma unidade inválida no arquivo.')
  }
  for (const tile of state.structures) {
    if (!tile || typeof tile.name !== 'string' || !integer(tile.side ?? 0,0,count) || !integer(tile.cell,0,cells-1)) {
      fail('Há um prédio inválido no arquivo.')
    }
  }
  if (!integer(state.turn,1,count) || !integer(state.round ?? 1,1,1e6)) fail('O turno deste arquivo é inválido.')
  if (state.winner) fail('Esta partida já terminou.')
  const teams = state.colors.map((color,index)=>({
    side:index+1, color,
    name:typeof state.teams?.[index]?.name === 'string' ? state.teams[index].name.slice(0,24) : '',
    units:state.units.filter(unit=>unit.side === index+1).length,
    machines:state.units.filter(unit=>unit.side === index+1 && has(rules.units[unit.name],'Constructor')).length,
  }))
  return {teams,title:typeof map.title === 'string' ? map.title : '',round:state.round ?? 1,turn:state.turn,
    width:map.width,height:map.height}
}

// mine: equipe que passa a ser a 1; credits[i]: créditos de cada Warmachine da equipe i+1 (na numeração original),
// porque a visão de espectador não mostra o dinheiro das máquinas.
export function restoreMatch(rules,file,{mine = 1,credits = []} = {}) {
  const {teams} = describeSaved(rules,file)
  const count = teams.length
  if (!integer(mine,1,count)) fail('Escolha uma equipe da partida.')
  const order = [mine,...teams.map(team=>team.side).filter(side=>side !== mine)]
  const sideOf = side => side ? order.indexOf(side)+1 : 0
  const reorder = list => Array.isArray(list) && list.length === count ? order.map(side=>list[side-1]) : undefined
  const saved = structuredClone(file.estado), map = structuredClone(file.mapa)
  const money = side => {
    const value = Number(credits[side-1])
    return Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value),999999) : 0
  }
  const units = saved.units.map(unit => {
    const spec = rules.units[unit.name]
    const restored = {...unit,side:sideOf(unit.side),
      credits:Number.isFinite(unit.credits) ? unit.credits : has(spec,'Constructor') ? money(unit.side) : -1,
      moved:Boolean(unit.moved),fired:Boolean(unit.fired),repairing:Boolean(unit.repairing),cloaked:Boolean(unit.cloaked)}
    if (restored.hp > spec.health) restored.hp = spec.health
    return restored
  })
  const structures = saved.structures.map(tile=>({...tile,side:sideOf(tile.side ?? 0),capturer:sideOf(tile.capturer ?? 0),
    strength:Number.isFinite(tile.strength) ? tile.strength : 8}))
  const alliances = order.map(side=>(saved.alliances?.[side-1] ?? []).filter(other=>integer(other,1,count)).map(sideOf))
  const state = {
    version:integer(saved.version,0,1e9) ? saved.version : 0,
    turn:sideOf(saved.turn), round:saved.round ?? 1, colors:reorder(saved.colors), winner:0,
    ore:saved.ore && typeof saved.ore === 'object' ? saved.ore : {},
    nextId:Math.max(0,...units.map(unit=>unit.id))+1,
    structures, units, last:null, undo:null,
    attackScale:reorder(saved.attackScale)?.map(value=>Number.isFinite(value) ? value : 1) ?? order.map(()=>1),
    incomeScale:reorder(saved.incomeScale), campaign:false, alliances,
    defeated:(saved.defeated ?? []).filter(side=>integer(side,1,count)).map(sideOf),
  }
  if (Array.isArray(saved.activeSides)) {
    state.activeSides = saved.activeSides.filter(side=>integer(side,1,count)).map(sideOf).sort((a,b)=>a-b)
    state.turnEnded = (saved.turnEnded ?? []).filter(side=>integer(side,1,count)).map(sideOf)
    state.sideVersion = state.colors.map(()=>0)
  }
  if (saved.victory?.mode === 'rei' && integer(saved.victory.cell,0,map.width*map.height-1)) {
    state.victory = {...saved.victory,holder:sideOf(saved.victory.holder ?? 0)}
  } else if (saved.victory?.mode === 'pontos') state.victory = {mode:'pontos',limit:saved.victory.limit ?? 20}
  const board = {...map,slots:count,coalitions:undefined,
    units:(map.units ?? []).filter(unit=>integer(unit.side,1,count)).map(unit=>({...unit,side:sideOf(unit.side)})),
    structures:(map.structures ?? []).map(tile=>({...tile,side:sideOf(tile.side ?? 0)}))}
  const names = reorder(teams.map(team=>team.name))
  return {state,board,names}
}
