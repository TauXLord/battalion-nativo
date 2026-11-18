// Testes do motor do jogo (regras de movimento, alvos e pontos fortes/fracos). Rodar: node --test testes
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTargetScore, terrainMoveCost } from '../nativo/partida.js'

const data = JSON.parse(readFileSync(new URL('../nativo/dados.json',import.meta.url)))
const {rules} = data
const cost = (unit,terrain) => terrainMoveCost(rules,rules.units[unit],rules.terrain[terrain])

test('soldados e Spider Tank andam em floresta e montanha sem penalidade',() => {
  for (const unit of ['Strike Commando','Heavy Commando','Spider Tank']) {
    assert.equal(cost(unit,'Forest'),1,unit+' na floresta')
    assert.equal(cost(unit,'Mountain'),1,unit+' na montanha')
    assert.equal(cost(unit,'Desert'),Infinity,unit+' no deserto (arame farpado)')
  }
})

test('tanques continuam com penalidade de terreno',() => {
  assert.equal(cost('Scorpion Tank','Forest'),2)
  assert.equal(cost('Scorpion Tank','Mountain'),Infinity)
})

const versus = (attacker,defender) => {
  const map = {width:10,height:10,tiles:Array(100).fill(['Plains']),structures:[]}
  const state = {units:[],structures:[],ore:{},colors:['ffff0000','ff0000ff']}
  const a = {name:attacker,side:1,hp:rules.units[attacker].health}, d = {name:defender,side:2,hp:rules.units[defender].health}
  return buildTargetScore(rules,map,state,a,d) - buildTargetScore(rules,map,state,d,a)
}

test('aeronaves são fracas contra antiaéreo leve e soldados não as atacam',() => {
  assert.ok(versus('Raptor Fighter','Flak Tank') < -25,'Raptor perde para Flak Tank')
  assert.ok(versus('Strike Commando','Raptor Fighter') < 0,'soldado não consegue revidar aeronave')
})

test('navios: Corvette e Battlecruiser atacam terra, Hunter/U-Boat/Intrepid não',() => {
  const hits = name => !rules.units[name].mods.includes('Sea Bound')
  for (const name of ['Corvette Fighter','Battlecruiser']) assert.ok(hits(name),name)
  for (const name of ['Hunter Support','U-Boat','Intrepid']) assert.ok(!hits(name),name)
})
