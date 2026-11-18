// Replay: reaplicar as jogadas gravadas reproduz exatamente a partida.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { campaignTransport } from '../nativo/campanha.js'
import { generateMap, mapRecipe } from '../nativo/procedural.js'
import { order } from '../nativo/partida.js'
import { validReplay } from '../nativo/replay.js'

const data = JSON.parse(readFileSync(new URL('../nativo/dados.json',import.meta.url)))
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))

test('IA x IA gravada e reaplicada chega ao mesmo estado',{timeout:120000},async () => {
  const board = generateMap(data,mapRecipe({seed:11,width:24,height:24,teams:2}))
  const mission = {board,events:[],teams:[{name:'A',color:'ff00ff00'},{name:'B',color:'ff0000ff'}]}
  let latest
  const match = campaignTransport(data,mission,0,{mode:'spectator',humans:0,aiTime:0,fastAI:()=>true})
  const stop = match.listen(state=>{ latest = state })
  for (let i=0; i<400 && (match.replay()?.actions.length ?? 0) < 40 && !latest?.winner; i++) await pause(50)
  stop()
  await pause(100)
  const replay = match.replay()
  assert.ok(validReplay(replay),'arquivo de replay válido')
  assert.ok(replay.actions.length >= 10,'gravou jogadas')
  const state = structuredClone(replay.initial)
  for (const {side,action} of replay.actions) order(data.rules,board,state,side,action)
  // O estado reaplicado é igual ao da partida ao vivo no fim da gravação (unidades visíveis ao espectador).
  const final = units => units.map(({id,name,side,cell,hp})=>({id,name,side,cell,hp})).sort((a,b)=>a.id-b.id)
  const live = new Set(latest.units.map(unit=>unit.id))
  assert.equal(state.version,latest.version,'mesma quantidade de jogadas')
  assert.deepEqual(final(state.units.filter(unit=>live.has(unit.id))),final(latest.units))
  assert.equal(state.round,latest.round)
})

test('arquivo que não é replay é recusado',() => {
  assert.equal(Boolean(validReplay({format:'outro'})),false)
  assert.equal(Boolean(validReplay(null)),false)
})
