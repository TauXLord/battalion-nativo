// Perfil do jogador: nome e foto (PNG, JPG ou GIF) guardados neste computador e mostrados nas partidas.
// A foto fica no IndexedDB (aceita arquivos grandes); o localStorage tem só uns 5 MB por site.
const key = 'battalion-nativo-perfil'
const database = 'battalion-nativo', store = 'perfil'
export const maxNameLength = 24
// GIF fica como está para continuar animado; a partida reduz os quadros ao tamanho do retrato.
export const maxGifBytes = 20_000_000
// Mesma proporção do retrato da barra lateral (130 × 150), com o dobro de resolução.
const portrait = {width:260,height:300}
const photoPattern = /^data:image\/(png|jpeg|gif);base64,/

function openDatabase() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(database,1)
    request.onupgradeneeded = () => request.result.createObjectStore(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function transaction(mode,work) {
  const db = await openDatabase()
  try {
    return await new Promise((resolve,reject) => {
      const tx = db.transaction(store,mode)
      const request = work(tx.objectStore(store))
      tx.oncomplete = () => resolve(request?.result)
      tx.onerror = tx.onabort = () => reject(tx.error ?? Error('Falha ao acessar os dados do perfil.'))
    })
  } finally { db.close() }
}

export async function loadProfile() {
  try {
    let profile = await transaction('readonly',objects=>objects.get(key))
    if (!profile) {
      // Perfil antigo (versão que guardava tudo no localStorage): migra para o IndexedDB.
      const old = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (old) {
        profile = old
        await saveProfile(old)
      }
    }
    if (!profile || typeof profile !== 'object') return null
    const name = typeof profile.name === 'string' ? profile.name.trim().slice(0,maxNameLength) : ''
    const avatar = typeof profile.avatar === 'string' && photoPattern.test(profile.avatar) ? profile.avatar : ''
    return name || avatar ? {name,avatar} : null
  } catch { return null }
}

export async function saveProfile(profile) {
  try { localStorage.removeItem(key) } catch {}
  try {
    if (!profile) await transaction('readwrite',objects=>objects.delete(key))
    else await transaction('readwrite',objects=>objects.put({name:profile.name ?? '',avatar:profile.avatar ?? ''},key))
  } catch { throw Error('Sem espaço no computador para guardar esta foto. Escolha uma imagem menor.') }
}

// Apaga o perfil guardado (usado por "Excluir meus dados" e "Desinstalar").
export async function deleteProfileStorage() {
  try { localStorage.removeItem(key) } catch {}
  await new Promise(resolve => {
    const request = indexedDB.deleteDatabase(database)
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })
}

const readAsDataUrl = file => new Promise((resolve,reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(Error('Não foi possível ler a imagem.'))
  reader.readAsDataURL(file)
})

// Converte o arquivo escolhido em uma foto de perfil (data URL).
export async function profilePhoto(file) {
  const type = file.type
  if (!['image/png','image/jpeg','image/gif'].includes(type)) throw Error('Use uma imagem PNG, JPG ou GIF.')
  if (file.size > maxGifBytes) throw Error(type === 'image/gif' ? 'GIF grande demais. Use um de até 20 MB.' : 'Imagem grande demais.')
  if (type === 'image/gif') {
    const url = await readAsDataUrl(file)
    await decode(url)
    return url
  }
  const image = await decode(await readAsDataUrl(file))
  // Recorta no centro para a proporção do retrato e reduz o tamanho.
  const canvas = document.createElement('canvas')
  canvas.width = portrait.width
  canvas.height = portrait.height
  const ctx = canvas.getContext('2d')
  const scale = Math.max(portrait.width/image.naturalWidth,portrait.height/image.naturalHeight)
  const width = image.naturalWidth*scale, height = image.naturalHeight*scale
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image,(portrait.width-width)/2,(portrait.height-height)/2,width,height)
  return canvas.toDataURL(type === 'image/png' ? 'image/png' : 'image/jpeg',.9)
}

async function decode(url) {
  const image = new Image()
  image.src = url
  try { await image.decode() } catch { throw Error('Esta imagem não pôde ser aberta.') }
  return image
}
