// Análise de uma partida a partir do replay (estado inicial + jogadas; o motor é determinístico):
// tropas, valor do exército e dinheiro de cada equipe a cada rodada, abates e perdas, e as marcas de turno
// usadas pela linha do tempo do replay.
import { order } from './partida.js'

const CHECKPOINT = 40

// Valor do exército: soma do custo das unidades, proporcional à vida que resta.
function armyValue(rules,state,side) {
  return Math.round(state.units.filter(unit=>unit.side === side)
    .reduce((sum,unit)=>sum + rules.units[unit.name].cost * unit.hp / rules.units[unit.name].health,0))
}
function sample(rules,state) {
  return {round:state.round,turn:state.turn,teams:state.colors.map((_,index)=>{
    const side = index+1
    const units = state.units.filter(unit=>unit.side === side)
    return {units:units.length,value:armyValue(rules,state,side),
      credits:units.reduce((sum,unit)=>sum + Math.max(0,unit.credits ?? 0),0) + Math.max(0,state.teamCredits?.[index] ?? 0)}
  })}
}

export function analyzeReplay(rules,replay) {
  const map = replay.board
  const state = structuredClone(replay.initial)
  const count = state.colors.length
  const kills = Array(count).fill(0), losses = Array(count).fill(0), built = Array(count).fill(0)
  const samples = [sample(rules,state)]
  // marks[i]: índice da jogada onde começa cada turno (para voltar/avançar turno na linha do tempo).
  const marks = [{index:0,round:state.round,turn:state.turn}]
  const checkpoints = new Map([[0,structuredClone(state)]])
  let error = null
  for (let index=0; index<replay.actions.length; index++) {
    const {side,action} = replay.actions[index]
    const before = new Map(state.units.map(unit=>[unit.id,unit.side]))
    const {round,turn} = state
    try { order(rules,map,state,side,action) }
    catch (failure) { error = failure.message; break }
    for (const [id,owner] of before) {
      if (!state.units.some(unit=>unit.id === id)) {
        losses[owner-1]++
        if (owner !== side) kills[side-1]++
      }
    }
    for (const unit of state.units) if (!before.has(unit.id) && unit.side === side) built[side-1]++
    if (state.round !== round || state.turn !== turn) {
      marks.push({index:index+1,round:state.round,turn:state.turn})
      if (state.round !== round) samples.push(sample(rules,state))
    }
    if ((index+1) % CHECKPOINT === 0) checkpoints.set(index+1,structuredClone(state))
  }
  // Situação final (fim da partida, no meio da última rodada).
  samples.push({...sample(rules,state),final:true})
  return {samples,kills,losses,built,marks,checkpoints,winner:state.winner,rounds:state.round,error,
    total:replay.actions.length}
}

// Estado da partida depois de `index` jogadas, partindo do ponto salvo mais próximo (rápido para pular no tempo).
export function stateAt(rules,replay,analysis,index) {
  const start = Math.floor(index / CHECKPOINT) * CHECKPOINT
  const base = analysis.checkpoints.get(start) ?? analysis.checkpoints.get(0)
  const state = structuredClone(base)
  for (let step = analysis.checkpoints.has(start) ? start : 0; step < index; step++) {
    const {side,action} = replay.actions[step]
    order(rules,replay.board,state,side,action)
  }
  return state
}
