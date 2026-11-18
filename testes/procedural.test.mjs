// Testes do gerador de mapas procedurais. Rodar: node --test testes
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateMap, mapRecipe } from '../nativo/procedural.js'

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
