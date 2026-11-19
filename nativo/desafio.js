// Desafio diário: um mapa procedural por dia, igual para todo mundo (a semente vem da data).
// Você comanda a equipe 1 contra a IA; o melhor resultado de cada dia fica guardado neste computador.
import { generateMap, mapRecipe } from './procedural.js'

const key = 'battalion-nativo-desafios'

export const todayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

// Número pseudoaleatório estável a partir de um texto (FNV-1a) e um gerador simples a partir dele.
function hash(text) {
  let value = 2166136261
  for (const char of text) { value ^= char.charCodeAt(0); value = Math.imul(value,16777619) >>> 0 }
  return value
}
function random(seed) {
  let state = seed || 1
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296 }
}

// Regras do desafio do dia: tamanho, nº de equipes, alianças das IAs, nível da IA e neblina.
export function dailyChallenge(data,day = todayKey()) {
  const roll = random(hash('battalion-desafio-' + day))
  const pick = list => list[Math.floor(roll() * list.length)]
  const teams = pick([2,2,3,3,4])
  const size = pick([24,32,32,40])
  const islands = roll() < .3
  const fog = roll() < .4
  const level = pick([1,1,2])
  // Com 3 ou 4 equipes, às vezes as IAs se juntam contra você.
  const together = teams > 2 && roll() < .5
  const recipe = mapRecipe({seed:hash('mapa-' + day),width:size,height:size,teams,islands,veins:pick([1,2])})
  let board
  const makeBoard = () => board ??= {...generateMap(data,recipe),title:'Desafio ' + day}
  const levels = Array.from({length:teams},(_,index)=>index ? level : 1)
  const alliances = Array.from({length:teams},(_,index)=>together && index ?
    Array.from({length:teams-1},(_,j)=>j+2).filter(side=>side !== index+1) : [])
  // O mapa só é gerado quando alguém for jogar (o menu mostra só as regras).
  return {day,get board() { return makeBoard() },teams,size,islands,fog,level,together,levels,alliances}
}

export function dailyResults() {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}')
    return value && typeof value === 'object' ? value : {}
  } catch { return {} }
}
export const dailyWins = () => Object.values(dailyResults()).filter(result=>result.victory).length

// Guarda o resultado do dia: vale o melhor (vitória antes de derrota; entre vitórias, o menor tempo).
export function recordDaily(day,{victory,elapsed,rounds}) {
  const results = dailyResults()
  const previous = results[day]
  const better = !previous || victory && !previous.victory ||
    victory === previous.victory && victory && (elapsed ?? Infinity) < (previous.elapsed ?? Infinity)
  if (better) results[day] = {victory:Boolean(victory),elapsed,rounds,at:Date.now()}
  try { localStorage.setItem(key,JSON.stringify(results)) } catch {}
  return results[day]
}

export const formatClock = ms => {
  const seconds = Math.max(0,Math.floor((ms ?? 0)/1000))
  const two = value => String(value).padStart(2,'0')
  return two(Math.floor(seconds/3600)) + ':' + two(Math.floor(seconds/60)%60) + ':' + two(seconds%60)
}

// Texto para compartilhar com os amigos (todos jogam o mesmo mapa no mesmo dia).
export const shareText = (day,result,t) => result?.victory ?
  t('Battalion · Desafio {day} · vitória em {time} · {n} rodadas',{day,time:formatClock(result.elapsed),n:result.rounds}) :
  t('Battalion · Desafio {day} · ainda não venci',{day})
