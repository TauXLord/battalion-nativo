// Atalhos de teclado da partida (lista em Configurações → Atalhos de teclado).
// Ficam desligados enquanto o jogador digita (chat, campos) ou com uma janela aberta.
// `on`: ações da partida; `ready()`: se a tela da partida está ativa; `busy()`: fala ou fim de partida na tela.
export function bindShortcuts({ready,busy,on}) {
  const listener = event => {
    if (!ready() || document.querySelector('dialog[open]')) return
    if (event.target.closest?.('input,select,textarea,[contenteditable]')) return
    if (event.altKey || event.metaKey) return
    const key = event.key
    const direction = {ArrowLeft:[-64,0],ArrowRight:[64,0],ArrowUp:[0,-64],ArrowDown:[0,64]}[key]
    if (direction) { event.preventDefault(); on.pan(...direction); return }
    if (key === 'Escape') { on.cancel(); return }
    if (busy()) return
    const lower = key.toLowerCase()
    const commands = {r:['repair'],b:['build'],e:['extract'],c:['capture'],t:['unload','Leviathan Barge','Albatross Transport']}
    let handled = true
    if (event.ctrlKey) {
      if (lower === 'z') on.undo()
      else handled = false
    }
    else if (key === ' ' || key === 'Enter') on.endTurn()
    else if (key === 'Tab') on.next(event.shiftKey ? -1 : 1)
    else if (commands[lower]) on.command(commands[lower])
    else if (lower === 'u') on.undo()
    else if (key === '+' || key === '=') on.zoom(1)
    else if (key === '-' || key === '_') on.zoom(-1)
    else if (lower === 'f') on.fullscreen()
    else if (key === '?' || lower === 'h') on.help()
    else handled = false
    if (handled) event.preventDefault()
  }
  document.addEventListener('keydown',listener)
  return () => document.removeEventListener('keydown',listener)
}
