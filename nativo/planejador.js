import { chooseGameAction as chooseAction } from './ia-tatica.js'
import { snapshot } from './partida.js'

export function aiPlanner(rules,map,WorkerType = globalThis.Worker,profile) {
  let worker, finish, progress
  function close() {
    const pending = finish
    finish = null
    worker?.terminate()
    worker = null
    pending?.(progress ?? null)
  }
  return {
    async choose(state,options) {
      const view = snapshot(state,options.side)
      // Um perfil por chamada (ex.: partida de avaliação, um perfil por equipe) tem prioridade sobre o perfil da sala.
      const chosen = 'profile' in options ? options.profile : profile
      const fallback = () => chooseAction(rules,map,view,{...options,profile:chosen,seconds:0})
      if (!WorkerType) return fallback()
      try {
        if (!worker) {
          worker = new WorkerType(new URL('./ia-worker.js',import.meta.url),{type:'module'})
          const job = worker
          const reply = data => {
            if (worker !== job || !finish) return
            if (data.progress) progress = data.progress
            else finish(data.action ?? progress ?? null)
          }
          const failed = () => {
            if (worker === job) close()
          }
          if (job.on) {
            job.on('message',reply)
            job.on('error',failed)
            job.on('exit',failed)
          } else {
            job.onmessage = event => reply(event.data)
            job.onerror = failed
          }
          job.postMessage({setup:{rules,map}})
        }
        const action = await new Promise(resolve => {
          progress = null
          // A IA tática pode levar mais de 1 s em turnos grandes. Se o prazo estourar, a jogada é recalculada
          // na thread da página e a tela congela; por isso o prazo do worker é folgado.
          const timer = setTimeout(close,Math.max(8,options.seconds+2)*1000)
          finish = action => {clearTimeout(timer); finish = null; resolve(action)}
          worker.postMessage({state:view,options:{...options,profile:chosen}})
        })
        return action ?? fallback()
      } catch {
        close()
        return fallback()
      }
    },
    close,
  }
}
