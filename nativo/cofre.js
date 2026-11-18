// Cofre: cópia em disco (no computador que roda o jogo) do perfil, do progresso e das configurações.
// O navegador guarda os dados separados por endereço; se o jogo abrir em outra porta (8770 ocupada → 8771),
// o armazenamento do navegador começa vazio e o cofre devolve tudo. Só funciona no próprio computador (127.0.0.1).
const available = () => location.hostname === '127.0.0.1' && location.protocol === 'http:'
const headers = {'X-Battalion-Acao':'1'}
// Chaves do localStorage que valem a pena guardar (não as vagas de salas, que são de uma partida só).
const keep = key => key.startsWith('battalion-nativo-') && !/^battalion-nativo-(host-)?[a-f0-9]{24}$/.test(key)

function localSnapshot() {
  const values = {}
  try { for (const key of Object.keys(localStorage)) if (keep(key)) values[key] = localStorage.getItem(key) } catch {}
  return values
}

let lastLocal = ''
async function send(name,value) {
  if (!available()) return
  try { await fetch('/cofre/' + name,{method:'POST',headers,body:JSON.stringify(value)}) } catch {}
}

// Guarda as configurações e o progresso no cofre (só quando algo mudou).
export function backupLocal() {
  const values = localSnapshot()
  const text = JSON.stringify(values)
  if (text === lastLocal) return
  lastLocal = text
  void send('local',values)
}

export const backupProfile = profile => send('perfil',profile ? {name:profile.name ?? '',avatar:profile.avatar ?? ''} : null)

// Na abertura: o que faltar no navegador volta do cofre; depois, o cofre acompanha as mudanças.
// restoreProfile(perfil) grava o perfil no navegador; currentProfile() lê o perfil atual do navegador.
export async function syncVault({currentProfile,restoreProfile}) {
  if (!available()) return
  let vault = {}
  try {
    const response = await fetch('/cofre',{headers,cache:'no-store'})
    if (response.ok) vault = await response.json()
  } catch { return }
  try {
    for (const [key,value] of Object.entries(vault.local ?? {})) {
      if (keep(key) && typeof value === 'string' && localStorage.getItem(key) === null) localStorage.setItem(key,value)
    }
  } catch {}
  const profile = await currentProfile()
  if (!profile && vault.perfil && (vault.perfil.name || vault.perfil.avatar)) {
    try { await restoreProfile(vault.perfil) } catch {}
  } else if (profile && !vault.perfil) void backupProfile(profile)
  backupLocal()
  setInterval(backupLocal,15000)
  addEventListener('pagehide',backupLocal)
  document.addEventListener('visibilitychange',() => { if (document.hidden) backupLocal() })
}
