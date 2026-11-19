// Replay: refaz uma partida avulsa a partir do estado inicial e da lista de jogadas (o motor é determinístico).
import { order, snapshot } from './partida.js'
import { combatTimeline } from './combate.js'
import { movementDuration } from './movimento.js'
import { analyzeReplay, stateAt } from './analise.js'

const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))

export function validReplay(replay) {
  return replay && replay.format === 'battalion-replay' && replay.version === 1 && replay.board &&
    Array.isArray(replay.board.tiles) && replay.initial && Array.isArray(replay.actions) && Array.isArray(replay.teams) &&
    replay.actions.length <= 200000
}

// Transporte de partida que só reproduz (espectador), com linha do tempo: tocar/pausar, voltar e avançar
// turnos e pular para qualquer jogada. `speed` multiplica a velocidade das animações.
export function replayTransport(data,replay,{back = '/?partida=ias',speed = () => 1} = {}) {
  const {rules} = data
  const map = replay.board
  const analysis = analyzeReplay(rules,replay)
  const total = analysis.error ? analysis.marks.at(-1).index : replay.actions.length
  let state = structuredClone(replay.initial)
  let receive, cancelled = false, result = null, index = 0, playing = true, generation = 0, rate = 1
  const listeners = new Set()
  const changed = () => { for (const listener of listeners) listener() }
  const publish = (seek = false) => {
    result = index >= total ? (analysis.error && index < replay.actions.length ?
      {error:'O replay não bate com esta versão do jogo: ' + analysis.error} : {winner:state.winner,replay:true}) : null
    if (!cancelled && receive) receive({...snapshot(state,0),teams:replay.teams,dialog:null,result,viewer:0,seek,
      objective:`Replay · ${index}/${total}`})
    changed()
  }
  const duration = () => {
    const event = state.last
    if (event?.type === 'attack') return combatTimeline(data,event).duration + movementDuration(event.movement?.path.length ?? 0)
    if (event?.type === 'move') return movementDuration(event.path.length)
    return 0
  }
  async function run(current) {
    await pause(600)
    while (current === generation && playing && index < total && !cancelled) {
      const {side,action} = replay.actions[index++]
      order(rules,map,state,side,action)
      publish()
      await pause((duration() + 160) / Math.max(.25,speed() * rate))
    }
    if (current === generation && index >= total) { playing = false; changed() }
  }
  function seek(target) {
    const next = Math.max(0,Math.min(total,Math.round(target)))
    generation++
    state = stateAt(rules,replay,analysis,next)
    index = next
    publish(true)
    if (playing) void run(generation)
  }
  const timeline = {
    total, marks:analysis.marks.filter(mark=>mark.index <= total),
    index:() => index, round:() => state.round, turn:() => state.turn, playing:() => playing,
    seek,
    toggle() {
      playing = !playing
      generation++
      if (playing) { if (index >= total) seek(0); else void run(generation) }
      changed()
    },
    // Volta para o começo do turno atual (ou do anterior, se já estiver no começo) e avança para o próximo.
    back() { const mark = timeline.marks.findLast(item=>item.index < index); seek(mark ? mark.index : 0) },
    forward() { const mark = timeline.marks.find(item=>item.index > index); seek(mark ? mark.index : total) },
    setRate(value) { rate = Number(value) || 1 },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
  return {
    back,
    replaying:true,
    timeline,
    listen(onState) {
      receive = onState
      publish()
      void run(generation)
      return () => { cancelled = true }
    },
    async send() { throw Error('Replay: só para assistir.') },
  }
}

// Baixa o replay como arquivo .json (escolhido pelo próprio jogador, na tela de fim de partida).
export function downloadReplay(replay) {
  const blob = new Blob([JSON.stringify(replay)],{type:'application/json'})
  const link = document.createElement('a')
  const date = new Date(replay.savedAt ?? Date.now()).toISOString().slice(0,16).replace(/[:T]/g,'-')
  link.href = URL.createObjectURL(blob)
  link.download = `replay-battalion-${date}.json`
  document.body.append(link)
  link.click()
  setTimeout(()=>{ URL.revokeObjectURL(link.href); link.remove() },1000)
}
