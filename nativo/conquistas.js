// Conquistas do jogador (neste computador; o cofre em disco também guarda). Conferidas no fim de cada partida.
// Partidas no modo desenvolvedor e como espectador não contam (quem chama já filtra).
const key = 'battalion-nativo-conquistas'

// id, título, descrição e a condição: (modo, resultado da partida, estatísticas acumuladas, progresso) => bool.
export const achievements = [
  ['primeira-vitoria','Primeira vitória','Vença uma partida.',(mode,r) => r.victory],
  ['intocavel','Intocável','Vença sem perder nenhuma unidade.',(mode,r) => r.victory && r.lost === 0],
  ['fortaleza','Fortaleza','Vença sem perder nenhuma Warmachine.',(mode,r) => r.victory && r.machinesLost === 0],
  ['blitz','Blitz','Vença em até 10 rodadas.',(mode,r) => r.victory && r.rounds > 0 && r.rounds <= 10],
  ['maratona','Maratona','Jogue uma partida de pelo menos 1 hora.',(mode,r) => r.elapsed >= 3600000],
  ['elite','Comandante de elite','Vença a IA no Difícil.',(mode,r) => r.victory && r.difficulty >= 2 && ['ia','campanha','desafio'].includes(mode)],
  // Emblema especial (brincadeira com o Exterminador do Futuro): aparece em vermelho tremendo no perfil.
  ['skynet','Skynet desligada','Vença a IA no nível Skynet (IA treinada ao máximo, com 40% a mais de dano).',
    (mode,r) => r.victory && r.difficulty === 3 && ['ia','campanha','desafio','rede'].includes(mode),true],
  ['sombras','Nas sombras','Vença uma partida com neblina de guerra.',(mode,r) => r.victory && r.fog],
  ['caos','Caos total','Vença uma partida com 5 equipes ou mais.',(mode,r) => r.victory && r.teams >= 5],
  ['conectado','Conectado','Vença uma partida em rede.',(mode,r) => r.victory && mode === 'rede'],
  ['ouro','Medalha de ouro','Ganhe a medalha de ouro numa missão da campanha.',(mode,r) => r.victory && r.medal === 3],
  ['destruidor','Destruidor','Destrua 50 unidades inimigas no total.',(mode,r,s) => s.destruidas >= 50],
  ['aniquilador','Aniquilador','Destrua 500 unidades inimigas no total.',(mode,r,s) => s.destruidas >= 500],
  ['veterano','Veterano','Jogue 25 partidas.',(mode,r,s) => s.partidas >= 25],
  ['desafio','Desafio do dia','Vença um desafio diário.',(mode,r) => r.victory && mode === 'desafio'],
  ['semana','Semana perfeita','Vença 7 desafios diários.',(mode,r,s,p) => p.desafios >= 7],
].map(([id,title,description,test,special]) => ({id,title,description,test,special}))

export function unlockedAchievements() {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}')
    return value && typeof value === 'object' ? value : {}
  } catch { return {} }
}

// Confere as conquistas depois de uma partida; devolve as que acabaram de ser desbloqueadas.
export function checkAchievements(mode,result,stats,progress = {}) {
  const unlocked = unlockedAchievements()
  const fresh = achievements.filter(item => !unlocked[item.id] && item.test(mode,result,stats,progress))
  if (!fresh.length) return []
  for (const item of fresh) unlocked[item.id] = Date.now()
  try { localStorage.setItem(key,JSON.stringify(unlocked)) } catch {}
  return fresh
}

// Aviso na tela: "Conquista desbloqueada" (um por vez, alguns segundos cada).
export function announceAchievements(list,t) {
  list.forEach((item,index) => setTimeout(() => {
    const toast = document.createElement('div')
    toast.className = 'achievement-toast'
    toast.setAttribute('role','status')
    toast.append(Object.assign(document.createElement('small'),{textContent:t('Conquista desbloqueada')}),
      Object.assign(document.createElement('strong'),{textContent:'🏆 ' + t(item.title)}),
      Object.assign(document.createElement('span'),{textContent:t(item.description)}))
    ;(document.fullscreenElement ?? document.body).append(toast)
    setTimeout(() => toast.remove(),4500)
  },index * 4700))
}
