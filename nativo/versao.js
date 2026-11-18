// Versão da edição (nativo/versao.json): mostrada no menu, gravada em salvamentos e replays,
// e comparada com a versão publicada para avisar sobre atualizações.
export async function loadEdition() {
  try {
    const response = await fetch('/versao.json',{cache:'no-store'})
    if (response.ok) return await response.json()
  } catch {}
  return {versao:'?',data:'',edicao:'Battalion Nativo'}
}

// Compara "1.2.3" com "1.10.0": negativo se a for mais antiga que b.
export function compareVersions(a,b) {
  const parts = value => String(value ?? '').split('.').map(part=>Number.parseInt(part,10) || 0)
  const [x,y] = [parts(a),parts(b)]
  for (let index=0; index<Math.max(x.length,y.length); index++) {
    const difference = (x[index] ?? 0) - (y[index] ?? 0)
    if (difference) return difference
  }
  return 0
}
