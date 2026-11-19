// Análise do replay: amostras por rodada, abates, marcas de turno e estado em qualquer ponto da linha do tempo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGame, order } from '../nativo/partida.js'
import { analyzeReplay, stateAt } from '../nativo/analise.js'

const data = JSON.parse(readFileSync(new URL('../nativo/dados.json',import.meta.url)))
const {rules} = data
const width = 10
const at = (x,y) => y*width+x
const board = {width,height:10,slots:2,structures:[],
  tiles:Array.from({length:100},()=>['Plains',['single',['plains_1']]]),
  units:[{name:'Warmachine',side:1,cell:at(0,0)},{name:'Lancer Tank',side:1,cell:at(5,5)},
    {name:'Warmachine',side:2,cell:at(9,9)},{name:'Lancer Tank',side:2,cell:at(5,6)}]}

test('relatório e linha do tempo a partir do replay',() => {
  const game = createGame(rules,board,['ff00ff00','ff0000ff'])
  game.units[3].hp = 1
  const initial = structuredClone(game)
  const actions = []
  const play = (side,action) => { actions.push({side,action:{...action,version:game.version}}); order(rules,board,game,side,{...action,version:game.version}) }
  play(1,{type:'attack',unit:game.units[1].id,target:game.units[3].id})
  play(1,{type:'end'})
  play(2,{type:'end'})
  play(1,{type:'end'})
  const replay = {board,initial,actions,teams:[{name:'A'},{name:'B'}]}
  const analysis = analyzeReplay(rules,replay)
  assert.equal(analysis.error,null)
  assert.deepEqual(analysis.kills,[1,0])
  assert.deepEqual(analysis.losses,[0,1])
  assert.deepEqual(analysis.marks.map(mark=>mark.index),[0,2,3,4],'um marco a cada troca de turno')
  assert.equal(analysis.samples[0].teams[1].units,2)
  assert.equal(analysis.samples.at(-1).teams[1].units,1)
  const middle = stateAt(rules,replay,analysis,1)
  assert.equal(middle.units.length,3,'depois da 1ª jogada o tanque inimigo já saiu')
  assert.equal(stateAt(rules,replay,analysis,4).round,game.round)
})
