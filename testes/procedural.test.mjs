// Testes do gerador de mapas procedurais. Rodar: node --test testes
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateMap, mapRecipe, reorderSides, teamPlan } from '../nativo/procedural.js'

const data = JSON.parse(readFileSync(new URL('../nativo/dados.json',import.meta.url)))
const wet = name => ['Sea','Reef','Shore','Archipelago','Rock Formation','High Bridge'].includes(name)

const cases = [[24,24,2],[32,32,4],[40,40,9],[16,16,9],[100,24,4],[24,60,6]]
for (const [width,height,teams] of cases) for (const islands of [false,true]) {
  test(`mapa ${width}×${height}, ${teams} equipes${islands ? ', ilhas' : ''}`,() => {
    for (let seed=1; seed<=3; seed++) {
      const map = generateMap(data,mapRecipe({seed,width,height,teams,islands,veins:1}))
      assert.equal(map.tiles.length,width*height)
      const missing = map.tiles.flatMap(([,art])=>art[1]).filter(name=>!data.assets[name])
      assert.deepEqual([...new Set(missing)],[],'toda arte existe')
      const cells = map.units.map(unit=>unit.cell)
      assert.equal(new Set(cells).size,cells.length,'duas unidades na mesma casa')
      assert.ok(cells.every(cell=>Number.isInteger(cell) && cell >= 0 && cell < map.tiles.length),'unidade fora do mapa')
      const machines = new Set(map.units.filter(unit=>unit.name === 'Warmachine').map(unit=>unit.side))
      assert.equal(machines.size,teams,'cada equipe tem Warmachine')
      // Uma refinaria por equipe + a central.
      assert.equal(map.structures.filter(tile=>tile.name === 'Oil Refinery').length,teams+1)
    }
  })
}

test('falésias: toda água encostada na terra é mar (com borda) ou praia',() => {
  for (let seed=1; seed<=6; seed++) for (const islands of [false,true]) {
    const map = generateMap(data,mapRecipe({seed,width:32,height:32,teams:2,islands}))
    const {width} = map
    for (const [cell,[name]] of map.tiles.entries()) {
      if (!wet(name) || ['Sea','Shore','High Bridge'].includes(name)) continue
      const x = cell%width, y = Math.floor(cell/width)
      for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const nx = x+dx, ny = y+dy
        if (nx<0 || ny<0 || nx>=width || ny>=map.height) continue
        assert.ok(wet(map.tiles[ny*width+nx][0]),`${name} encostado na terra em ${x},${y}`)
      }
    }
  }
})

test('mesma semente gera o mesmo mapa',() => {
  const recipe = mapRecipe({seed:42,width:32,height:32,teams:3})
  assert.deepEqual(generateMap(data,recipe),generateMap(data,recipe))
})

test('equipes do gerador: humanos primeiro, níveis da IA e times viram alianças',() => {
  const plan = teamPlan([{control:'2',group:0},{control:'human',group:1},{control:'0',group:2},{control:'human',group:1}])
  assert.equal(plan.humans,2)
  assert.deepEqual(plan.order,[2,4,1,3])
  assert.deepEqual(plan.levels,[1,1,2,0])
  assert.deepEqual(plan.alliances,[[2],[1],[],[]])
  const free = teamPlan([{control:'human',group:0},{control:'1',group:0},{control:'1',group:0}])
  assert.deepEqual(free.alliances,[[],[],[]],'sozinhas: todos contra todos')
})

test('reorderSides troca a numeração das equipes do mapa',() => {
  const board = {slots:3,units:[{side:1,cell:0},{side:3,cell:5}],structures:[{side:0,cell:2},{side:2,cell:4}]}
  const moved = reorderSides(board,[3,1,2])
  assert.deepEqual(moved.units.map(unit=>unit.side),[2,1])
  assert.deepEqual(moved.structures.map(tile=>tile.side),[0,3])
  assert.throws(() => reorderSides(board,[1,1,2]))
})
