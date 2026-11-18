// Neblina de guerra e modos de vitória de teste dos mapas procedurais.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGame, order, snapshot } from '../nativo/partida.js'
import { generateMap, mapRecipe } from '../nativo/procedural.js'

const data = JSON.parse(readFileSync(new URL('../nativo/dados.json',import.meta.url)))
const colors = ['ff00ff00','ff0000ff']

test('neblina: inimigos longe somem; espectador vê todos',() => {
  const board = generateMap(data,mapRecipe({seed:4,width:40,height:40,teams:2}))
  const state = createGame(data.rules,board,colors,{fog:true})
  const view = snapshot(state,1)
  assert.ok(view.units.every(unit=>unit.side === 1),'nenhum inimigo visível no começo (bases longe)')
  assert.ok(view.fog.length > 0 && view.fog.length < board.width*board.height,'parte do mapa visível')
  assert.ok(snapshot(state,0).units.some(unit=>unit.side === 2),'espectador vê o inimigo')
  const open = createGame(data.rules,board,colors,{})
  assert.ok(snapshot(open,1).units.some(unit=>unit.side === 2),'sem neblina vê tudo')
})

const endTurns = (state,board,count) => {
  for (let i=0; i<count && !state.winner; i++) order(data.rules,board,state,state.turn,{type:'end',version:state.version})
}

test('vitória por pontos ao fim do limite de rodadas',() => {
  const board = generateMap(data,mapRecipe({seed:4,width:24,height:24,teams:2,victory:'pontos'}))
  assert.equal(board.victory.mode,'pontos')
  const state = createGame(data.rules,board,colors,{victory:{mode:'pontos',limit:2}})
  // Equipe 2 perde uma unidade: fica com menos pontos.
  const victim = state.units.find(unit=>unit.side === 2 && unit.name !== 'Warmachine')
  state.units = state.units.filter(unit=>unit !== victim)
  endTurns(state,board,10)
  assert.equal(state.winner,1)
  assert.ok(state.victory.scores[0] > state.victory.scores[1])
})

test('rei da refinaria central: segurar por N rodadas vence',() => {
  const board = generateMap(data,mapRecipe({seed:4,width:24,height:24,teams:2,victory:'rei'}))
  assert.equal(board.victory.cell,board.center)
  const state = createGame(data.rules,board,colors,{victory:{...board.victory,rounds:2}})
  state.structures.find(tile=>tile.cell === board.center).side = 2
  endTurns(state,board,10)
  assert.equal(state.winner,2)
})
