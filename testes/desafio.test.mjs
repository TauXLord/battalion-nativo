// Desafio diário: mesmo dia = mesmo mapa e mesmas regras; dias diferentes mudam.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dailyChallenge } from '../nativo/desafio.js'
import { checkAchievements } from '../nativo/conquistas.js'

const data = JSON.parse(readFileSync(new URL('../nativo/dados.json',import.meta.url)))

test('o desafio do dia é igual para todo mundo e muda no dia seguinte',() => {
  const a = dailyChallenge(data,'2026-11-18'), b = dailyChallenge(data,'2026-11-18')
  assert.deepEqual(a.board.tiles,b.board.tiles)
  assert.deepEqual([a.teams,a.fog,a.level,a.size],[b.teams,b.fog,b.level,b.size])
  const days = ['2026-11-19','2026-11-20','2026-11-21'].map(day=>JSON.stringify(dailyChallenge(data,day).board.tiles))
  assert.ok(days.some(tiles=>tiles !== JSON.stringify(a.board.tiles)))
  assert.equal(a.board.slots,a.teams)
})

test('conquistas: desbloqueiam uma vez só',() => {
  const memory = new Map()
  globalThis.localStorage = {getItem:key=>memory.get(key) ?? null,setItem:(key,value)=>memory.set(key,String(value))}
  const stats = {partidas:1,destruidas:3}
  const first = checkAchievements('ia',{victory:true,lost:0,machinesLost:0,rounds:8,difficulty:2},stats)
  assert.deepEqual(first.map(item=>item.id).sort(),['blitz','elite','fortaleza','intocavel','primeira-vitoria'])
  assert.deepEqual(checkAchievements('ia',{victory:true,lost:0},stats),[],'não repete')
  delete globalThis.localStorage
})
