// Salvamento automático: a partida salva no turno do jogador pode ser continuada do mesmo ponto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { campaignTransport } from '../nativo/campanha.js'

const data = JSON.parse(readFileSync(new URL('../nativo/dados.json',import.meta.url)))
const bootcamp = JSON.parse(readFileSync(new URL('../nativo/bootcamp.json',import.meta.url)))
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))

test('salva no turno do jogador e continua do mesmo ponto',async () => {
  const mission = bootcamp.find(entry=>entry.number === 6)
  let saved, latest
  const first = campaignTransport(data,mission,0,{group:'teste',aiTime:0,onSave:engine=>{ if (engine) saved = engine }})
  const stop = first.listen(state=>{ latest = state })
  for (let i=0; i<80 && latest?.dialog !== null; i++) { first.advance(); await pause(20) }
  await first.send({type:'end',version:latest.version})
  for (let i=0; i<200 && !(latest.turn === 1 && latest.round === 2); i++) await pause(50)
  await pause(400)
  stop()
  assert.equal(saved?.state.round,2,'salvou na rodada 2, no turno do jogador')

  let resumed
  const second = campaignTransport(data,mission,0,{group:'teste',aiTime:0,resume:saved})
  const stopSecond = second.listen(state=>{ resumed = state })
  await pause(50)
  stopSecond()
  assert.equal(resumed.round,2)
  assert.equal(resumed.turn,1)
  assert.equal(resumed.dialog,null,'falas iniciais não se repetem')
  assert.equal(resumed.units.length,latest.units.length)
})
