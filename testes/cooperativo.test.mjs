// Testes da campanha em dupla (roda a missão de verdade, sem rede). Rodar: node --test testes
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { coopCampaign, coopEligible } from '../nativo/cooperativo.js'

const data = JSON.parse(readFileSync(new URL('../nativo/dados.json',import.meta.url)))
const bootcamp = JSON.parse(readFileSync(new URL('../nativo/bootcamp.json',import.meta.url)))
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))

test('missões com menos de duas Warmachines não liberam a dupla',() => {
  assert.equal(coopEligible(bootcamp.find(mission=>mission.number === 1)),false)
  assert.equal(coopEligible(bootcamp.find(mission=>mission.number === 6)),true)
})

test('dupla: divide unidades, bloqueia a do parceiro e só encerra com os dois',async () => {
  const mission = bootcamp.find(entry=>entry.number === 6)
  const coop = coopCampaign({data,mission,difficulty:0,aiTime:0,group:'vengeance-bootcamp',chapter:6})
  let changes = 0
  coop.start(()=>changes++)
  try {
    // Passa pelas falas iniciais.
    for (let i=0; i<80 && coop.stateFor(1)?.dialog; i++) { coop.advance(); await pause(20) }
    const state = coop.stateFor(1)
    assert.ok(state && !state.dialog,'missão começou')
    const owners = state.coop.owners
    const counts = Object.values(owners).reduce((sum,player)=>(sum[player] = (sum[player] ?? 0)+1,sum),{})
    assert.ok(counts[1] > 0 && counts[2] > 0,'os dois jogadores têm unidades')
    const partner = state.units.find(unit=>unit.side === 1 && owners[unit.id] === 2)
    await assert.rejects(coop.command(1,{type:'repair',unit:partner.id,version:state.version}),/parceiro/)
    await assert.rejects(coop.command(1,{type:'undo',version:state.version}),/Desfazer/)
    await coop.command(1,{type:'end',version:state.version})
    assert.equal(coop.stateFor(2).turn,1,'turno não passa com só um encerrando')
    assert.deepEqual(coop.stateFor(2).coop.waiting,[1])
    await coop.command(2,{type:'end',version:state.version})
    await pause(50)
    assert.notEqual(coop.stateFor(1).coop.waiting.length,1,'encerramento dos dois foi aceito')
  } finally { coop.close() }
})
