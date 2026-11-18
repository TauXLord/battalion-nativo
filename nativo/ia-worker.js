import { chooseGameAction as chooseAction } from './ia-tatica.js'

const port = typeof process === 'undefined' ? globalThis : (await import('node:worker_threads')).parentPort
let rules, map
function receive({setup,state,options}) {
  if (setup) {
    rules = setup.rules
    map = setup.map
    return
  }
  try {
    const action = chooseAction(rules,map,state,{...options,onProgress:progress=>port.postMessage({progress})})
    port.postMessage({action})
  }
  catch (error) { port.postMessage({error:error.message}) }
}

if (port.on) port.on('message',receive)
else port.onmessage = event => receive(event.data)
