// Estatísticas do jogador (neste computador): partidas, vitórias, derrotas e unidades destruídas/perdidas.
// Partidas no modo desenvolvedor e como espectador não contam.
const key = 'battalion-nativo-estatisticas'
const empty = () => ({partidas:0,vitorias:0,derrotas:0,destruidas:0,perdidas:0,modos:{}})

export function loadStats() {
  try {
    const stats = JSON.parse(localStorage.getItem(key) ?? 'null')
    return stats && typeof stats === 'object' ? {...empty(),...stats,modos:{...stats.modos}} : empty()
  } catch { return empty() }
}

// mode: 'ia' | 'local' | 'campanha' | 'rede'; result: {victory, killed?, lost?}
export function recordMatch(mode,result) {
  const stats = loadStats()
  const count = Number.isFinite
  stats.partidas++
  if (result.victory) stats.vitorias++
  else stats.derrotas++
  if (count(result.killed)) stats.destruidas += result.killed
  if (count(result.lost)) stats.perdidas += result.lost
  const byMode = stats.modos[mode] ?? {vitorias:0,derrotas:0}
  if (result.victory) byMode.vitorias++
  else byMode.derrotas++
  stats.modos[mode] = byMode
  try { localStorage.setItem(key,JSON.stringify(stats)) } catch {}
  return stats
}

// Resumo curto mandado para a sala multiplayer (os outros veem ao lado do nome).
export const statsSummary = () => {
  const {partidas,vitorias} = loadStats()
  return {partidas,vitorias}
}
