// Mecânicas de terreno e transformação: Jammer na colina, floresta na neblina e transformar sem gastar o turno.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGame, fogVision, jammingZone, moveCost, order, transportOptions } from '../nativo/partida.js'

const data = JSON.parse(readFileSync(new URL('../nativo/dados.json',import.meta.url)))
const {rules} = data
const width = 12, height = 12
// Mapa de planície com uma colina em (3,3), uma floresta em (8,8) e uma faixa de mar com costa à direita.
function board(units) {
  const tiles = Array.from({length:width*height},(_,cell) => {
    const x = cell % width
    const name = cell === 3*width+3 ? 'Hill' : cell === 8*width+8 ? 'Forest' : x === 11 ? 'Sea' : x === 10 ? 'Shore' : 'Plains'
    return [name,['single',['plains_1']]]
  })
  return {width,height,slots:2,tiles,units,structures:[]}
}
const at = (x,y) => y*width+x

test('Jammer em cima da colina bloqueia 1 casa a mais em todas as direções',() => {
  const map = board([])
  assert.equal(jammingZone(map,at(6,6)).length,13,'raio 2 na planície')
  assert.equal(jammingZone(map,at(3,3)).length,25,'raio 3 na colina')
  const game = createGame(rules,map,['ff00ff00','ff0000ff'])
  game.units.push({id:90,name:'Jammer Truck',side:2,cell:at(3,3),hp:50})
  const fighter = rules.units['Raptor Fighter']
  assert.equal(moveCost(rules,map,game,fighter,at(6,3),1),Infinity,'3 casas da colina: aeronave bloqueada')
  game.units.at(-1).cell = at(3,4)
  assert.ok(Number.isFinite(moveCost(rules,map,game,fighter,at(6,4),1)),'fora da colina o raio volta a 2')
})

test('na neblina, Jammer na colina enxerga mais e quem está na floresta enxerga menos',() => {
  const map = board([{name:'Jammer Truck',side:1,cell:at(3,3)},{name:'Lancer Tank',side:1,cell:at(8,8)},
    {name:'Warmachine',side:2,cell:at(0,11)}])
  const game = createGame(rules,map,['ff00ff00','ff0000ff'],{fog:true})
  const seen = fogVision(game,1)
  // Jammer (Radar): 3 + 2 + 1 da colina = 6 casas.
  assert.ok(seen.has(at(3,9)),'Jammer na colina vê 6 casas')
  // Tanque na floresta: 3 - 1 = 2 casas.
  assert.ok(seen.has(at(8,6)) && !seen.has(at(8,5)),'tanque na floresta vê só 2 casas')
})

test('virar Leviathan não gasta o turno, mas só para quem começou o turno na costa',() => {
  const map = board([{name:'Heavy Commando',side:1,cell:at(10,5)},{name:'Lancer Tank',side:1,cell:at(9,7)},
    {name:'Warmachine',side:2,cell:at(0,0)}])
  const game = createGame(rules,map,['ff00ff00','ff0000ff'])
  const [commando,tank] = game.units
  assert.ok(transportOptions(rules,map,game,commando).includes('Leviathan Barge'))
  order(rules,map,game,1,{type:'transport',unit:commando.id,name:'Leviathan Barge',version:game.version})
  assert.equal(commando.name,'Leviathan Barge')
  assert.equal(commando.moved,false,'ainda pode se mover depois de virar Leviathan')
  assert.deepEqual(transportOptions(rules,map,game,commando),[],'não transforma de novo no mesmo turno')
  // O tanque anda até a costa: neste turno não pode mais virar Leviathan.
  order(rules,map,game,1,{type:'move',unit:tank.id,cell:at(10,7),path:[at(10,7)],version:game.version})
  assert.deepEqual(transportOptions(rules,map,game,tank),[])
})

test('soldado vira Albatross e Leviathan desembarca sem gastar o turno',() => {
  const map = board([{name:'Strike Commando',side:1,cell:at(5,5)},{name:'Lancer Tank',side:1,cell:at(10,8)},
    {name:'Warmachine',side:2,cell:at(0,0)}])
  const game = createGame(rules,map,['ff00ff00','ff0000ff'])
  const [commando,tank] = game.units
  order(rules,map,game,1,{type:'transport',unit:commando.id,name:'Albatross Transport',version:game.version})
  assert.equal(commando.name,'Albatross Transport')
  assert.equal(commando.moved,false)
  order(rules,map,game,1,{type:'transport',unit:tank.id,name:'Leviathan Barge',version:game.version})
  // Próximo turno do time 1: a barcaça começa na costa e desembarca de graça.
  order(rules,map,game,1,{type:'end',version:game.version})
  order(rules,map,game,2,{type:'end',version:game.version})
  order(rules,map,game,1,{type:'transport',unit:tank.id,name:'unload',version:game.version})
  assert.equal(tank.name,'Lancer Tank')
  assert.equal(tank.moved,false,'o tanque desembarcado ainda pode andar')
})

test('equipe sem Warmachine é derrotada e as unidades restantes vão para a explosão em sequência',() => {
  const map = board([{name:'Warmachine',side:1,cell:at(1,1)},{name:'Lancer Tank',side:1,cell:at(5,5)},
    {name:'Warmachine',side:2,cell:at(5,6)},{name:'Lancer Tank',side:2,cell:at(0,9)},{name:'Heavy Commando',side:2,cell:at(2,9)},
    {name:'Warmachine',side:3,cell:at(9,0)}])
  map.slots = 3
  const game = createGame(rules,map,['ff00ff00','ff0000ff','ffff0000'])
  const tank = game.units[1], target = game.units[2]
  target.hp = 1
  order(rules,map,game,1,{type:'attack',unit:tank.id,target:target.id,version:game.version})
  assert.ok(game.defeated.includes(2),'equipe 2 derrotada')
  assert.equal(game.units.filter(unit=>unit.side === 2).length,0,'as unidades da equipe 2 saíram do mapa')
  assert.deepEqual(game.last.eliminated.map(unit=>unit.name).sort(),['Heavy Commando','Lancer Tank'])
  assert.equal(game.winner,0,'a partida segue com as equipes 1 e 3')
})

test('na neblina, unidade dentro da floresta só é vista pelo inimigo 1 casa mais perto',async () => {
  const {snapshot} = await import('../nativo/partida.js')
  // Tanque do time 2 na floresta (8,8); tanque do time 1 a 3 casas: no limite da visão normal.
  const map = board([{name:'Lancer Tank',side:1,cell:at(8,5)},{name:'Warmachine',side:1,cell:at(0,0)},
    {name:'Lancer Tank',side:2,cell:at(8,8)},{name:'Warmachine',side:2,cell:at(11,0)}])
  const game = createGame(rules,map,['ff00ff00','ff0000ff'],{fog:true})
  const enemy = game.units[2]
  let view = snapshot(game,1)
  assert.ok(view.fog.includes(at(8,8)),'a casa da floresta aparece')
  assert.ok(!view.units.some(unit=>unit.id === enemy.id),'mas o tanque escondido nela não')
  game.units[0].cell = at(8,6)
  view = snapshot(game,1)
  assert.ok(view.units.some(unit=>unit.id === enemy.id),'1 casa mais perto ele aparece')
  enemy.cell = at(8,9)
  game.units[0].cell = at(8,6)
  assert.ok(snapshot(game,1).units.some(unit=>unit.id === enemy.id),'fora da floresta, a 3 casas, aparece')
})

test('clima: nuvens 2 rodadas antes do aviso, chuva tira 1 de alcance da artilharia e 1 de visão',async () => {
  const {firingRange} = await import('../nativo/partida.js')
  const map = board([{name:'Warmachine',side:1,cell:at(0,0)},{name:'Warmachine',side:2,cell:at(9,9)}])
  const game = createGame(rules,map,['ff00ff00','ff0000ff'],{weather:12345,fog:true})
  const phases = []
  for (let i = 0; i < 40; i++) {
    phases.push(game.weather.phase)
    order(rules,map,game,game.turn,{type:'end',version:game.version})
  }
  const byRound = phases.filter((_,index)=>index % 2 === 0)
  const firstRain = byRound.indexOf('chuva')
  assert.ok(firstRain > 0,'choveu em algum momento')
  assert.deepEqual(byRound.slice(firstRain-3,firstRain),['nuvens','nuvens','aviso'],'nuvens 2 rodadas, depois o aviso, depois chuva')
  // Mesma semente = mesmo clima (o replay repete igual).
  const again = createGame(rules,map,['ff00ff00','ff0000ff'],{weather:12345})
  const repeat = []
  for (let i = 0; i < 40; i++) { repeat.push(again.weather.phase); order(rules,map,again,again.turn,{type:'end',version:again.version}) }
  assert.deepEqual(repeat,phases)
  // Na chuva: artilharia alcança 1 casa a menos.
  const artillery = Object.keys(rules.units).find(name=>rules.units[name].weaponRangeMax > 2 && rules.units[name].weaponRangeMax > rules.units[name].weaponRangeMin)
  const unit = {name:artillery,side:1,cell:at(4,4)}
  game.weather.phase = 'limpo'
  const [,dry] = firingRange(rules,map,game,unit,unit.cell)
  game.weather.phase = 'chuva'
  const [,wet] = firingRange(rules,map,game,unit,unit.cell)
  assert.equal(wet,dry - 1)
})

test('raio: na chuva, a cada 5 jogadas cai numa casa e tira 100 de vida de quem estiver lá',() => {
  const map = board([{name:'Warmachine',side:1,cell:at(0,0)},{name:'Warmachine',side:2,cell:at(9,9)}])
  const game = createGame(rules,map,['ff00ff00','ff0000ff'],{weather:777})
  game.weather.phase = 'chuva'
  game.weather.left = 99
  for (let i = 0; i < 4; i++) order(rules,map,game,game.turn,{type:'end',version:game.version})
  assert.equal(game.lightning,undefined,'4 jogadas: ainda nada')
  // A 5ª jogada chama o raio; ponho uma unidade exatamente onde ele vai cair (mesma semente = mesmo lugar).
  const preview = structuredClone(game)
  order(rules,map,preview,preview.turn,{type:'end',version:preview.version})
  const cell = preview.lightning.cell
  game.units.push({id:500,name:'Lancer Tank',side:1,cell,hp:rules.units['Lancer Tank'].health,credits:-1})
  order(rules,map,game,game.turn,{type:'end',version:game.version})
  assert.equal(game.lightning.cell,cell)
  assert.equal(game.lightning.unit,500)
  assert.ok(!game.units.some(unit=>unit.id === 500),'100 de dano destruiu o tanque')
})

test('raios: intervalo cai de 5 para 2 jogadas conforme a área do mapa',async () => {
  const {lightningInterval} = await import('../nativo/partida.js')
  assert.equal(lightningInterval({width:12,height:12}),5)
  assert.equal(lightningInterval({width:24,height:24}),5)
  assert.equal(lightningInterval({width:36,height:34}),3)
  assert.equal(lightningInterval({width:40,height:40}),2)
  assert.equal(lightningInterval({width:100,height:100}),2)
  const map = {...board([{name:'Warmachine',side:1,cell:0},{name:'Warmachine',side:2,cell:1599}]),width:40,height:40,
    tiles:Array.from({length:1600},()=>['Plains',['single',['plains_1']]])}
  const game = createGame(rules,map,['ff00ff00','ff0000ff'],{weather:777})
  Object.assign(game.weather,{phase:'chuva',left:99})
  order(rules,map,game,1,{type:'end',version:game.version})
  assert.equal(game.lightning,undefined)
  order(rules,map,game,2,{type:'end',version:game.version})
  assert.equal(game.lightning.version,2)
  assert.ok(game.lightning.cell >= 0 && game.lightning.cell < 1600)
})

function seaBoard(units = []) {
  const map = board([{name:'Warmachine',side:1,cell:at(0,0)},{name:'Warmachine',side:2,cell:at(0,9)},...units])
  for (let cell=0;cell<map.tiles.length;cell++) if (cell%width >= 5) map.tiles[cell] = ['Sea',['single',['plains_1']]]
  return map
}

test('redemoinho: sorteio por rodada chuvosa, nove casas no mar e reprodução determinística',async () => {
  const {whirlpoolCells} = await import('../nativo/partida.js')
  let appeared = 0, absent = 0, later = 0
  for (let seed=1;seed<=40;seed++) {
    const map = seaBoard()
    const game = createGame(rules,map,['ff00ff00','ff0000ff'],{weather:seed})
    Object.assign(game.weather,{phase:'aviso',left:1})
    const repeat = structuredClone(game)
    for (const side of [1,2]) {
      order(rules,map,game,side,{type:'end',version:game.version})
      order(rules,map,repeat,side,{type:'end',version:repeat.version})
    }
    assert.deepEqual(game,repeat)
    const cells = whirlpoolCells(game,map)
    assert.equal(game.weather.phase,'chuva')
    if (cells.length) {
      appeared++
      assert.equal(cells.length,9)
      assert.ok(cells.every(cell=>cell>=0 && cell<map.tiles.length && map.tiles[cell][0]==='Sea'))
    } else {
      absent++
      Object.assign(game.weather,{phase:'chuva',left:5})
      order(rules,map,game,1,{type:'end',version:game.version})
      order(rules,map,game,2,{type:'end',version:game.version})
      if (whirlpoolCells(game,map).length) later++
    }
  }
  assert.ok(appeared > 0 && absent > 0,'o redemoinho não surge em toda chuva')
  assert.ok(later > 0,'pode aparecer depois de a chuva começar')
})

test('redemoinho: atravessar tira 30 uma vez, fim e início do turno tiram mais 30',async () => {
  const {whirlpoolCells,terrainTurnDamage} = await import('../nativo/partida.js')
  const map = seaBoard([{name:'Battlecruiser',side:1,cell:at(6,5)}])
  const game = createGame(rules,map,['ff00ff00','ff0000ff'],{weather:777})
  Object.assign(game.weather,{phase:'chuva',left:99,whirlpool:at(7,4)})
  const ship = game.units.find(unit=>unit.name==='Battlecruiser')
  const hp = ship.hp
  assert.equal(whirlpoolCells(game,map).length,9)
  assert.ok(Number.isFinite(moveCost(rules,map,game,rules.units[ship.name],at(7,5),1)))
  assert.equal(terrainTurnDamage(rules,map,game,ship,at(8,5)),30,'IA percebe o terreno perigoso')
  order(rules,map,game,1,{type:'move',unit:ship.id,cell:at(9,5),path:[at(7,5),at(8,5),at(9,5)],version:game.version})
  assert.equal(ship.hp,hp-30,'três casas no mesmo movimento causam 30')
  assert.equal(game.undo,null,'dano não pode ser desfeito')
  order(rules,map,game,1,{type:'end',version:game.version})
  assert.equal(ship.hp,hp-60,'30 ao encerrar o turno')
  order(rules,map,game,2,{type:'end',version:game.version})
  assert.equal(ship.hp,hp-90,'30 ao começar o turno seguinte')
})

test('redemoinho: dano letal interrompe movimento, remove a unidade e registra uma explosão',() => {
  const map = seaBoard([{name:'Battlecruiser',side:1,cell:at(6,5)}])
  const game = createGame(rules,map,['ff00ff00','ff0000ff'],{weather:777})
  Object.assign(game.weather,{phase:'chuva',left:99,whirlpool:at(7,4)})
  const ship = game.units.find(unit=>unit.name==='Battlecruiser')
  ship.hp=20
  order(rules,map,game,1,{type:'move',unit:ship.id,cell:at(9,5),path:[at(7,5),at(8,5),at(9,5)],version:game.version})
  assert.ok(!game.units.some(unit=>unit.id===ship.id))
  assert.deepEqual(game.last.path,[at(7,5)])
  assert.equal(game.last.eliminated.filter(unit=>unit.id===ship.id).length,1)
  assert.equal(game.last.eliminated[0].cell,at(7,5))
})

test('redemoinho: mortes no começo e no fim do turno são removidas corretamente',() => {
  for (const side of [1,2]) {
    const map = seaBoard([{name:'Battlecruiser',side,cell:at(8,5)}])
    const game = createGame(rules,map,['ff00ff00','ff0000ff'],{weather:777})
    Object.assign(game.weather,{phase:'chuva',left:99,whirlpool:at(7,4)})
    const ship = game.units.find(unit=>unit.name==='Battlecruiser')
    ship.hp=30
    order(rules,map,game,1,{type:'end',version:game.version})
    assert.ok(!game.units.some(unit=>unit.id===ship.id))
    assert.equal(game.last.eliminated.filter(unit=>unit.id===ship.id).length,1)
  }
})

test('redemoinho: não surge quando o mar não comporta três casas de largura',async () => {
  const {whirlpoolCells} = await import('../nativo/partida.js')
  const map = board([{name:'Warmachine',side:1,cell:at(0,0)},{name:'Warmachine',side:2,cell:at(0,9)}])
  for (let y=0;y<height;y++) map.tiles[at(10,y)] = ['Sea',['single',['plains_1']]]
  for (let seed=1;seed<=10;seed++) {
    const game = createGame(rules,map,['ff00ff00','ff0000ff'],{weather:seed})
    Object.assign(game.weather,{phase:'aviso',left:1})
    order(rules,map,game,1,{type:'end',version:game.version})
    order(rules,map,game,2,{type:'end',version:game.version})
    assert.deepEqual(whirlpoolCells(game,map),[])
  }
})

test('redemoinho: destruir a última Warmachine transportada passa a vez numa partida de três equipes',() => {
  const map = seaBoard([{name:'Warmachine',side:3,cell:at(1,9)}])
  map.units[0] = {name:'Warmachine',side:1,cell:at(6,5)}
  map.tiles[at(6,5)] = ['Shore',['single',['plains_1']]]
  const game = createGame(rules,map,['ff00ff00','ff0000ff','ffff0000'],{weather:777})
  Object.assign(game.weather,{phase:'chuva',left:99,whirlpool:at(7,4)})
  const barge = game.units.find(unit=>unit.side===1)
  order(rules,map,game,1,{type:'transport',unit:barge.id,name:'Leviathan Barge',version:game.version})
  barge.hp=20
  order(rules,map,game,1,{type:'move',unit:barge.id,cell:at(7,5),path:[at(7,5)],version:game.version})
  assert.ok(game.defeated.includes(1))
  assert.equal(game.turn,2)
  assert.ok(!game.winner)
  assert.equal(game.last.eliminated.filter(unit=>unit.id===barge.id).length,1)
})
