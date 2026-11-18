// Painel de chat da partida em rede (abaixo do mapa): últimas mensagens e campo para escrever.
// Texto sempre como texto puro (textContent), nunca como HTML.
export function createMatchChat({template,parent,t,send,onError,onMessage}) {
  let panel, shown = ''
  function build() {
    panel = template.content.firstElementChild.cloneNode(true)
    panel.setAttribute('aria-label',t('Chat da partida'))
    const input = panel.querySelector('input')
    input.placeholder = t('Escreva uma mensagem…')
    input.setAttribute('aria-label',t('Mensagem do chat'))
    panel.querySelector('button').textContent = t('Enviar')
    panel.querySelector('form').onsubmit = async event => {
      event.preventDefault()
      const text = input.value.trim()
      if (!text) return
      input.value = ''
      try { await send(text) } catch (failure) { onError?.(failure.message) }
    }
    parent.append(panel)
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
    log.replaceChildren(...messages.slice(-8).map(message=>{
      const item = document.createElement('li')
      item.append(Object.assign(document.createElement('b'),{textContent:message.name + ': '}),document.createTextNode(message.text))
      return item
    }))
    log.scrollTop = log.scrollHeight
    if (fresh) onMessage?.()
  }
}
