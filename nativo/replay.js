// Replay: refaz uma partida avulsa a partir do estado inicial e da lista de jogadas (o motor é determinístico).
import { order, snapshot } from './partida.js'
import { combatTimeline } from './combate.js'
import { movementDuration } from './movimento.js'

const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))

export function validReplay(replay) {
  return replay && replay.format === 'battalion-replay' && replay.version === 1 && replay.board &&
    Array.isArray(replay.board.tiles) && replay.initial && Array.isArray(replay.actions) && Array.isArray(replay.teams) &&
    replay.actions.length <= 200000
}

// Transporte de partida que só reproduz (espectador): `speed` multiplica a velocidade das animações.
export function replayTransport(data,replay,{back = '/?partida=ias',speed = () => 1} = {}) {
  const {rules} = data
  const map = replay.board
  const state = structuredClone(replay.initial)
  let receive, cancelled = false, result = null, index = 0
  const publish = () => {
    if (!cancelled && receive) receive({...snapshot(state,0),teams:replay.teams,dialog:null,result,viewer:0,
      objective:`Replay · ${index}/${replay.actions.length}`})
  }
  const duration = () => {
    const event = state.last
    if (event?.type === 'attack') return combatTimeline(data,event).duration + movementDuration(event.movement?.path.length ?? 0)
    if (event?.type === 'move') return movementDuration(event.path.length)
    return 0
  }
  async function run() {
    await pause(600)
    for (; index < replay.actions.length && !cancelled; ) {
      const {side,action} = replay.actions[index++]
      try { order(rules,map,state,side,action) }
      catch (error) { result = {error:'O replay não bate com esta versão do jogo: ' + error.message}; publish(); return }
      publish()
      await pause((duration() + 160) / Math.max(.25,speed()))
    }
    if (!cancelled) {
      result = {winner:state.winner,replay:true}
      publish()
    }
  }
  return {
    back,
    replaying:true,
    listen(onState) {
      receive = onState
      publish()
      void run()
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
