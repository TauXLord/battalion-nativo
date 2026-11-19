// Salvamento automático: a última partida local (contra a IA, mesmo dispositivo ou campanha) fica guardada
// no IndexedDB a cada turno do jogador e pode ser continuada pelo menu.
const database = 'battalion-nativo-partidas', store = 'partidas', key = 'atual'

function openDatabase() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(database,1)
    request.onupgradeneeded = () => request.result.createObjectStore(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function run(mode,work) {
  const db = await openDatabase()
  try {
    return await new Promise((resolve,reject) => {
      const tx = db.transaction(store,mode)
      const request = work(tx.objectStore(store))
      tx.oncomplete = () => resolve(request?.result)
      tx.onerror = tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

export async function loadSavedMatch() {
  try { return await run('readonly',objects=>objects.get(key)) ?? null } catch { return null }
}
export async function saveMatch(match) {
  try { await run('readwrite',objects=>objects.put({...match,savedAt:Date.now()},key)) } catch {}
}
export async function clearSavedMatch() {
  try { await run('readwrite',objects=>objects.delete(key)) } catch {}
}
export async function deleteSavesStorage() {
  await new Promise(resolve => {
    const request = indexedDB.deleteDatabase(database)
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })
}

// Partida em rede: cada computador guarda a última visão recebida ({estado, mapa}), no mesmo formato do arquivo
// que "Continuar partida de arquivo" abre. Serve para retomar se quem hospedava a sala cair.
const networkKey = 'rede'
export async function loadNetworkMatch() {
  try { return await run('readonly',objects=>objects.get(networkKey)) ?? null } catch { return null }
}
export async function saveNetworkMatch(match) {
  try { await run('readwrite',objects=>objects.put({...match,salvoEm:Date.now()},networkKey)) } catch {}
}
export async function clearNetworkMatch() {
  try { await run('readwrite',objects=>objects.delete(networkKey)) } catch {}
}

// Replay aberto pelo botão "Ver replay" do fim de partida (a página recarrega em /?replay e lê daqui).
export async function saveLastReplay(replay) {
  try { await run('readwrite',objects=>objects.put(replay,'replay')) } catch {}
}
export async function loadLastReplay() {
  try { return await run('readonly',objects=>objects.get('replay')) ?? null } catch { return null }
}
