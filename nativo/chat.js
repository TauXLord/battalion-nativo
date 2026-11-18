// Chat da partida em rede: janela flutuante meio transparente por cima do jogo (não empurra a página para baixo).
// Arraste pelo título para mover; "–" minimiza. Posição e estado ficam guardados neste navegador.
// Texto sempre como texto puro (textContent), nunca como HTML.
const placeKey = 'battalion-nativo-chat'

function readPlace() {
  try { return JSON.parse(localStorage.getItem(placeKey)) ?? {} } catch { return {} }
}
function savePlace(place) {
  try { localStorage.setItem(placeKey,JSON.stringify(place)) } catch {}
}

export function createMatchChat({template,parent,t,send,onError,onMessage}) {
  let panel, shown = '', unread = 0
  const place = readPlace()

  // Mantém a janela inteira dentro da tela (também quando a janela do navegador muda de tamanho).
  function clamp() {
    if (!panel || place.x === undefined) return
    const width = panel.offsetWidth, height = panel.offsetHeight
    const x = Math.min(Math.max(0,place.x),Math.max(0,innerWidth - width))
    const y = Math.min(Math.max(0,place.y),Math.max(0,innerHeight - height))
    Object.assign(panel.style,{left:x + 'px',top:y + 'px',right:'auto',bottom:'auto'})
  }
  function setCollapsed(collapsed) {
    panel.classList.toggle('collapsed',collapsed)
    const toggle = panel.querySelector('.chat-toggle')
    toggle.textContent = collapsed ? '+' : '–'
    toggle.setAttribute('aria-label',t(collapsed ? 'Abrir o chat' : 'Minimizar o chat'))
    if (!collapsed) { unread = 0; showUnread() }
    place.collapsed = collapsed
    savePlace(place)
    requestAnimationFrame(clamp)
  }
  function showUnread() {
    const badge = panel.querySelector('.chat-unread')
    badge.hidden = !unread
    badge.textContent = String(unread)
  }

  function build() {
    panel = template.content.firstElementChild.cloneNode(true)
    panel.setAttribute('aria-label',t('Chat da partida'))
    panel.querySelector('.chat-title').textContent = t('Chat')
    panel.querySelector('.chat-handle').title = t('Arraste para mover')
    const input = panel.querySelector('input')
    input.placeholder = t('Escreva uma mensagem…')
    input.setAttribute('aria-label',t('Mensagem do chat'))
    panel.querySelector('button[type=submit]').textContent = t('Enviar')
    panel.querySelector('form').onsubmit = async event => {
      event.preventDefault()
      const text = input.value.trim()
      if (!text) return
      input.value = ''
      try { await send(text) } catch (failure) { onError?.(failure.message) }
    }
    // As teclas digitadas no chat não viram atalhos do jogo.
    input.addEventListener('keydown',event => event.stopPropagation())
    panel.querySelector('.chat-toggle').onclick = () => setCollapsed(!panel.classList.contains('collapsed'))
    const handle = panel.querySelector('.chat-handle')
    handle.addEventListener('pointerdown',event => {
      if (event.target.closest('button')) return
      event.preventDefault()
      const box = panel.getBoundingClientRect()
      const dx = event.clientX - box.left, dy = event.clientY - box.top
      handle.setPointerCapture(event.pointerId)
      const move = moved => {
        place.x = moved.clientX - dx
        place.y = moved.clientY - dy
        clamp()
      }
      const stop = () => {
        handle.removeEventListener('pointermove',move)
        handle.removeEventListener('pointerup',stop)
        handle.removeEventListener('pointercancel',stop)
        savePlace(place)
      }
      handle.addEventListener('pointermove',move)
      handle.addEventListener('pointerup',stop)
      handle.addEventListener('pointercancel',stop)
    })
    addEventListener('resize',clamp)
    parent.append(panel)
    setCollapsed(Boolean(place.collapsed))
    clamp()
  }
  // messages: [{side,name,text,time}]; viewer: equipe de quem está vendo (som só para mensagens dos outros).
  return function update(messages,viewer) {
    if (!messages) return
    if (!panel) build()
    const key = JSON.stringify(messages.map(message=>message.time))
    if (key === shown) return
    const fresh = messages.length && shown !== '' && messages.at(-1).side !== viewer
    shown = key
    const log = panel.querySelector('.chat-log')
    log.replaceChildren(...messages.slice(-30).map(message=>{
      const item = document.createElement('li')
      item.append(Object.assign(document.createElement('b'),{textContent:message.name + ': '}),document.createTextNode(message.text))
      return item
    }))
    log.scrollTop = log.scrollHeight
    if (fresh) {
      if (panel.classList.contains('collapsed')) { unread++; showUnread() }
      onMessage?.()
    }
  }
}
