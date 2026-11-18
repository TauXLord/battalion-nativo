// Retomar partida de um arquivo salvo da visão de espectador (testes/dados/partida-espectador.json, rodada 32).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { order, snapshot } from '../nativo/partida.js'
import { describeSaved, restoreMatch } from '../nativo/retomar.js'

const data = JSON.parse(readFileSync(new URL('../nativo/dados.json',import.meta.url)))
const file = JSON.parse(readFileSync(new URL('./dados/partida-espectador.json',import.meta.url)))

test('o arquivo do espectador é reconhecido com as duas equipes',() => {
  const info = describeSaved(data.rules,file)
  assert.equal(info.teams.length,2)
  assert.equal(info.round,32)
  assert.deepEqual(info.teams.map(team=>team.units),[55,20])
  assert.throws(() => describeSaved(data.rules,{estado:{},mapa:{}}),/não é uma partida/)
})

test('retomar mantém as unidades, devolve os créditos e o jogo continua',() => {
  const {state,board} = restoreMatch(data.rules,file,{credits:[1200,800]})
  assert.equal(state.units.length,75)
  assert.equal(state.turn,1)
  const machines = state.units.filter(unit=>data.rules.units[unit.name].mods.includes('Constructor'))
  assert.ok(machines.length > 0)
  for (const unit of machines) assert.equal(unit.credits,unit.side === 1 ? 1200 : 800)
  for (let i=0; i<6; i++) order(data.rules,board,state,state.turn,{type:'end',version:state.version})
  assert.equal(state.round,35)
  assert.ok(snapshot(state,1).units.length > 0)
})

test('escolher a equipe 2 a transforma na equipe 1 (com cor, unidades e vez trocadas)',() => {
  const {state,names} = restoreMatch(data.rules,file,{mine:2})
  assert.deepEqual(state.colors,[file.estado.colors[1],file.estado.colors[0]])
  assert.equal(state.units.filter(unit=>unit.side === 1).length,20)
  assert.equal(state.turn,2)
  assert.deepEqual(names,['DODO','Dragão Rabugento!'])
})
