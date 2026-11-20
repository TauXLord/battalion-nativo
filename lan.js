import { bindCamera, stagePoint, stageRect } from './camera.js'

// Convite aberto pelo launcher: a sala fica em outro computador (o do anfitrião) e o servidor local deste
// computador repassa os pedidos (/remoto/<endereço>/lan/...). Assim a página continua em 127.0.0.1, com o perfil,
// a foto, as estatísticas e os emblemas deste jogador.
let lanBase = '/lan/'
export const validRemote = origin => typeof origin === 'string' && /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(origin)
export function useRemote(origin) {
  if (!validRemote(origin)) throw Error('Convite inválido.')
  lanBase = '/remoto/' + encodeURIComponent(origin) + '/lan/'
}
export const lanUrl = path => lanBase + path
export async function request(path, options) {
  const response = await fetch(lanBase + path, { cache:'no-store', ...options })
  if (!response.ok) throw Error(response.status === 404 ? 'Sala indisponível. Use Battalion.exe e gere um novo convite.' : await response.text())
  return response
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function loadWithCapture(player, load) {
  const proto = HTMLCanvasElement.prototype
  const getContext = proto.getContext
  // Ruffle can create its canvas before attaching it to the player.
  proto.getContext = function (type, options) {
    const belongsToPlayer = !this.isConnected || this.getRootNode() === player.shadowRoot
    if (belongsToPlayer && /^(experimental-)?webgl2?$/.test(type)) {
      return getContext.call(this, type, {...options, preserveDrawingBuffer:true})
    }
    return getContext.call(this, type, options)
  }
  try { await load() }
  finally { proto.getContext = getContext }
}

// `t` traduz os textos (a edição nativa passa o tradutor de idioma.js; a edição Flash usa o português).
export function lobby({room,slot,invites=[],maps,palette,t = (text,values) => values ? text.replace(/\{(\w+)\}/g,(m,k)=>values[k]) : text}) {
  const $ = id => document.getElementById(id)
  const panel = $('lobby-view'), color = $('lobby-color'), vote = $('lobby-vote')
  const ready = $('lobby-ready'), start = $('lobby-start'), status = $('lobby-status')
  const suffix = room + (slot ? '/' + slot : '')
  const colorNames = new Map(palette.map(([name,value]) => [value,t(name)]))
  color.replaceChildren(...palette.map(([name,value]) => new Option(t(name),value)))
  vote.replaceChildren(...maps.map(([,name],i) => new Option(name,i)))
  // Convites: código curto em destaque e botões de copiar (o link fica discreto, só para conferência).
  const codeBox = document.createElement('p')
  codeBox.className = 'lobby-code'
  codeBox.hidden = true
  const copyNote = document.createElement('span')
  copyNote.className = 'lobby-copy-note'
  copyNote.setAttribute('role','status')
  $('lobby-invites').replaceChildren(codeBox,...invites.map(({kind,url}) => {
    const row = document.createElement('div')
    row.className = 'lobby-invite'
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.textContent = t('Copiar convite') + ' · ' + t(kind === 'Internet' ? 'pela internet' : kind === 'Radmin VPN' ? 'Radmin VPN' : 'mesma rede')
    copy.onclick = async () => {
      const code = codeBox.dataset.code
      const message = t('Entre na minha partida de Battalion: {url}',{url}) + (code ? ' · ' + t('código {code}',{code}) : '')
      try { await navigator.clipboard.writeText(message); copyNote.textContent = t('Convite copiado.') }
      catch { copyNote.textContent = url }
    }
    const link = document.createElement('small')
    link.textContent = url
    row.append(copy,link)
    return row
  }),copyNote)
  $('lobby-back').hidden = Boolean(slot)
  start.hidden = Boolean(slot)
  panel.hidden = false
  let state, busy = false, done = false
  let revision = 0
  const members = next => next.seats ?? [next.host,next.guest]
  const self = next => members(next)[(next.you ?? (slot ? 2 : 1))-1]
  const colorsDistinct = next => {
    const activeColors = members(next).filter(seat=>seat.connected).map(seat=>seat.color)
    return new Set(activeColors).size === activeColors.length
  }
  const canStart = next => members(next).every(seat=>seat.connected && seat.ready) && colorsDistinct(next)
  let shownSeats = 2
  return new Promise(resolve => {
    function render(next) {
      state = next
      if (next.started) {
        done = true
        panel.hidden = true
        chatBox.remove()
        resolve(next)
        return
      }
      const players = members(next)
      if (next.spectator) {
        // Espectador: só acompanha a sala e o chat até a partida começar.
        for (const field of [color,vote]) if (field.closest('label')) field.closest('label').hidden = true
        ready.hidden = start.hidden = true
        status.textContent = t('Você está assistindo. A partida aparece quando o anfitrião começar.')
        renderChat(next.chat)
        return
      }
      const own = self(next)
      if (next.code && codeBox.dataset.code !== next.code) {
        codeBox.dataset.code = next.code
        codeBox.textContent = t('Código da sala') + ': ' + next.code.slice(0,3) + '-' + next.code.slice(3)
        codeBox.hidden = false
      }
      // Campanha em dupla: mapa e cores vêm da missão.
      for (const field of [color,vote]) if (field.closest('label')) field.closest('label').hidden = Boolean(next.coop)
      color.value = own.color
      if (next.choices) for (const option of vote.options) {
        option.hidden = option.disabled = !next.choices.includes(Number(option.value))
      }
      vote.value = String(own.vote)
      const seats = $('lobby-seats')
      while (seats && shownSeats < next.slots) {
        const section = document.createElement('section')
        const label = document.createElement('strong')
        label.textContent = t('Equipe {n}',{n:++shownSeats})
        const detail = document.createElement('p')
        detail.id = 'lobby-seat-' + shownSeats
        section.append(label,detail)
        seats.append(section)
      }
      for (let index=0; index<shownSeats; index++) {
        const seat = players[index]
        const id = ['lobby-host','lobby-guest'][index] ?? 'lobby-seat-' + (index+1)
        const computer = t(next.coalitions && next.slots === 4 && players.length === 2 ? 'IA · turno conjunto no leste' : 'IA')
        $(id).textContent = !seat ? computer : seat.connected
          ? `${seat.name ? seat.name + ' · ' : ''}${seat.stats ? t('{v} vitórias em {n} partidas',{v:seat.stats.vitorias,n:seat.stats.partidas}) + ' · ' : ''}${t('Conectado')} · ${t(seat.ready ? 'Pronto' : 'Aguardando')} · ${colorNames.get(seat.color)} · ${maps[seat.vote][1]}`
          : t('Desconectado')
      }
      renderTeams(next)
      renderChat(next.chat)
      start.disabled = busy || !canStart(next)
      ready.disabled = busy
      ready.textContent = t(own.ready ? 'Cancelar pronto' : 'Marcar como pronto')
      const selection = players.some(seat=>seat.connected && seat.vote !== next.map)
        ? t('Votos diferentes. Em empate vale o voto do anfitrião.')
        : t('Mapa da partida') + ' · ' + maps[next.map][1]
      $('lobby-map').textContent = selection + (next.coalitions ? ' · ' + t('Alianças por continente') : '') +
        (next.spectators ? ' · ' + t(next.spectators === 1 ? '1 espectador' : '{n} espectadores',{n:next.spectators}) : '')
      status.textContent = !colorsDistinct(next) ? t('Cada equipe precisa de uma cor diferente.') : ''
    }
    // Chat da sala: lista das últimas mensagens e campo para escrever (texto puro, até 200 caracteres).
    let chatKey = ''
    const chatBox = document.createElement('section')
    chatBox.className = 'lobby-chat'
    const chatLog = document.createElement('ol')
    chatLog.className = 'chat-log'
    const chatForm = document.createElement('form')
    const chatInput = Object.assign(document.createElement('input'),{type:'text',maxLength:200,placeholder:t('Escreva uma mensagem…')})
    chatInput.setAttribute('aria-label',t('Mensagem do chat'))
    const chatSend = Object.assign(document.createElement('button'),{type:'submit',textContent:t('Enviar')})
    chatForm.append(chatInput,chatSend)
    chatBox.append(Object.assign(document.createElement('strong'),{textContent:t('Chat da sala')}),chatLog,chatForm)
    status.after(chatBox)
    const renderChat = messages => {
      // A versão Flash usa este mesmo arquivo, mas o servidor dela não tem chat.
      chatBox.hidden = !messages
      const key = JSON.stringify(messages?.map(message=>message.time) ?? [])
      if (key === chatKey) return
      chatKey = key
      chatLog.replaceChildren(...(messages ?? []).map(message=>{
        const item = document.createElement('li')
        const who = Object.assign(document.createElement('b'),{textContent:message.name + ': '})
        item.append(who,document.createTextNode(message.text))
        return item
      }))
      chatLog.scrollTop = chatLog.scrollHeight
    }
    chatForm.onsubmit = async event => {
      event.preventDefault()
      const text = chatInput.value.trim()
      if (!text) return
      chatInput.value = ''
      try { renderChat((await (await request('chat/' + suffix,{method:'POST',body:text})).json()).chat) }
      catch (error) { status.textContent = t(error.message) }
    }

    // Times: o líder escolhe o time de cada equipe e liga/desliga os pedidos de time entre jogadores.
    let teamsKey = ''
    function renderTeams(next) {
      let box = $('lobby-teams')
      if (!next.teams || next.coop) { if (box) box.hidden = true; return }
      if (!box) {
        box = document.createElement('fieldset')
        box.id = 'lobby-teams'
        box.className = 'lobby-teams'
        $('lobby-seats').after(box)
      }
      box.hidden = false
      const leader = !slot, you = next.you ?? (slot ? 2 : 1)
      const {list,allowRequests,incoming,sent} = next.teams
      const players = members(next)
      const key = JSON.stringify([list,allowRequests,incoming,sent,next.slots,next.coalitions,
        players.map(seat=>[seat?.connected,seat?.name]),leader])
      if (key === teamsKey) return
      teamsKey = key
      const legend = document.createElement('legend')
      legend.textContent = t('Times')
      const rows = []
      if (next.coalitions) {
        const note = document.createElement('p')
        note.textContent = t('Com alianças por continente, os times já vêm do mapa.')
        rows.push(note)
      }
      for (let index=0; index<next.slots; index++) {
        const row = document.createElement('div')
        row.className = 'lobby-team-row'
        const name = document.createElement('span')
        const seat = players[index]
        const who = seat?.name || (index === 0 ? t('Anfitrião') : seat ? t('Jogador {n}',{n:index+1}) : t('IA'))
        name.textContent = t('Equipe {n}',{n:index+1}) + ' · ' + who + (index+1 === you ? ' · ' + t('você') : '')
        const select = document.createElement('select')
        select.setAttribute('aria-label',t('Time da equipe {n}',{n:index+1}))
        select.replaceChildren(...Array.from({length:next.slots},(_,team)=>new Option(t('Time {n}',{n:team+1}),team+1)))
        select.value = String(list[index])
        select.disabled = !leader || Boolean(next.coalitions)
        select.onchange = () => {
          const updated = list.slice()
          updated[index] = Number(select.value)
          change('teams',updated.join(','))
        }
        row.append(name,select)
        // Pedido de time: só entre jogadores conectados, quando o líder permitir.
        if (!leader && allowRequests && seat?.connected && index+1 !== you && list[index] !== list[you-1]) {
          const ask = document.createElement('button')
          ask.type = 'button'
          ask.textContent = sent.includes(index+1) ? t('Pedido enviado') : t('Pedir para formar time')
          ask.disabled = sent.includes(index+1)
          ask.onclick = () => change('ask',String(index+1))
          row.append(ask)
        }
        rows.push(row)
      }
      for (const from of incoming) {
        const row = document.createElement('div')
        row.className = 'lobby-team-request'
        const text = document.createElement('span')
        text.textContent = t('A equipe {n} quer formar time com você.',{n:from})
        const accept = document.createElement('button')
        accept.type = 'button'
        accept.textContent = t('Aceitar')
        accept.onclick = () => change('answer',from+',1')
        const refuse = document.createElement('button')
        refuse.type = 'button'
        refuse.textContent = t('Recusar')
        refuse.onclick = () => change('answer',from+',0')
        row.append(text,accept,refuse)
        rows.push(row)
      }
      const permission = document.createElement('label')
      permission.className = 'lobby-team-permission'
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.checked = allowRequests
      toggle.disabled = !leader || Boolean(next.coalitions)
      toggle.onchange = () => change('allow',toggle.checked ? '1' : '0')
      permission.append(toggle,' ' + t(leader ? 'Permitir que os jogadores peçam para formar time' :
        allowRequests ? 'O líder permite pedidos de time' : 'O líder não permite pedidos de time'))
      box.replaceChildren(legend,...rows,permission)
    }
    async function change(action,body) {
      if (busy || done) return
      busy = true
      revision++
      ready.disabled = start.disabled = color.disabled = vote.disabled = true
      try { state = await (await request(action + '/' + suffix,{method:'POST',body})).json() }
      catch (error) {
        if (state) render(state)
        status.textContent = t(error.message)
        return
      } finally {
        busy = false
        color.disabled = vote.disabled = false
        if (state && !done) {
          ready.disabled = false
          start.disabled = !canStart(state)
        }
      }
      render(state)
    }
    color.onchange = vote.onchange = () => change('prefs',[color.value,vote.value,0].join(','))
    ready.onclick = () => {
      if (state) change('prefs',[color.value,vote.value,Number(!self(state).ready)].join(','))
    }
    start.onclick = () => change('start','')
    if (!slot) $('lobby-back').onclick = () => navigator.sendBeacon(lanBase + 'close/' + room,'')
    async function poll() {
      while (!done) {
        if (!busy) {
          const version = revision
          try {
            const next = await (await request('lobby/' + suffix)).json()
            if (!busy && version === revision) render(next)
          } catch (error) {
            if (!busy && version === revision) {
              status.textContent = t(error.message)
              start.disabled = ready.disabled = true
            }
          }
        }
        await delay(750)
      }
    }
    void poll()
  })
}

async function* readFrames(response) {
  const reader = response.body.getReader()
  let part = new Uint8Array(12)
  let offset = 0, packet = null
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      for (let cursor = 0; cursor < value.length;) {
        const count = Math.min(part.length - offset,value.length - cursor)
        part.set(value.subarray(cursor,cursor+count),offset)
        cursor += count
        offset += count
        if (offset !== part.length) continue
        offset = 0
        if (packet) {
          yield { ...packet, jpeg:part }
          packet = null
          part = new Uint8Array(12)
        } else {
          const header = new DataView(part.buffer)
          const length = header.getUint32(0,true)
          const turn = part[8] === 1
          if (length > 300000) throw Error('Imagem da partida inválida.')
          if (length) {
            packet = { turn }
            part = new Uint8Array(length)
          } else yield { turn }
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function guest(room, slot) {
  const screen = document.querySelector('#guest-screen')
  const status = document.querySelector('#guest-status')
  const panControls = document.querySelector('#guest-pan')
  let turn = false, lastFrame = 0, inputError = '', dx = 0, dy = 0, panTimer = false
  const canPlay = () => turn && Date.now() - lastFrame < 2500
  const send = async body => {
    if (!canPlay()) return
    try {
      await request('input/' + room + '/' + slot, {method:'POST',body})
      inputError = ''
    } catch (error) {
      inputError = error.message
    }
  }
  const click = (x,y) => {
    if (x >= 0 && x < 700 && y >= 0 && y < 600) send(x + ',' + y)
  }
  const pan = (x,y) => {
    dx += x
    dy += y
    if (panTimer) return
    panTimer = true
    setTimeout(() => {
      const limit = n => Math.max(-560,Math.min(560,n))
      send('p,' + limit(dx) + ',' + limit(dy))
      dx = dy = 0
      panTimer = false
    },40)
  }
  bindCamera(screen,document.querySelector('#guest-camera'), {
    pan, click, zoom: step => send('z,' + step), ready:() => Boolean(lastFrame), canControl:canPlay,
  })
  panControls.onclick = event => {
    if (event.target.dataset.pan) pan(...event.target.dataset.pan.split(',').map(Number))
  }
  // Normal clicks reach the image when drag is off or the click is on a game menu.
  // A captured click on the board targets the image too, so let the camera handler own it.
  screen.addEventListener('pointerup', event => click(...stagePoint(screen,event).map(Math.floor)))
  const updateStatus = () => {
    const message = !lastFrame ? 'Conectado. Aguardando a imagem do anfitrião…' :
      Date.now() - lastFrame >= 2500 ? 'Imagem pausada. Aguardando o anfitrião…' :
      canPlay() ? 'Seu turno. Clique no mapa ou nos botões.' : 'Aguardando a sua vez.'
    const next = inputError || message
    if (status.textContent !== next) status.textContent = next
  }
  updateStatus()
  const meter = setInterval(updateStatus,300)
  const connection = new AbortController()
  window.addEventListener('pagehide', () => {
    connection.abort()
    clearInterval(meter)
  }, {once:true})
  while (!connection.signal.aborted) {
    try {
      const response = await request('stream/' + room + '/' + slot,{signal:connection.signal})
      if (response.body) {
        for await (const { turn:nextTurn, jpeg } of readFrames(response)) {
          if (jpeg) {
            const url = URL.createObjectURL(new Blob([jpeg],{type:'image/jpeg'}))
            const image = new Image()
            image.src = url
            try { await image.decode() }
            catch { URL.revokeObjectURL(url); continue }
            const previous = screen.src
            screen.src = url
            screen.hidden = panControls.hidden = false
            lastFrame = Date.now()
            if (previous.startsWith('blob:')) URL.revokeObjectURL(previous)
          }
          turn = nextTurn
          updateStatus()
        }
      }
    } catch (error) {
      if (connection.signal.aborted) return
      turn = false
      status.textContent = error.message
    }
    await delay(700)
  }
}

function paintedVideo(canvas) {
  if (!canvas.captureStream) return null
  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = canvas.captureStream(24)
    video.play().catch(() => {})
    window.addEventListener('pagehide', () => video.srcObject.getTracks().forEach(track => track.stop()), {once:true})
    return video
  } catch { return null }
}

export async function host(player, room, camera) {
  window.addEventListener('pagehide', () => navigator.sendBeacon(lanBase + 'close/' + room, ''), {once:true})
  let canvas
  for (let i = 0; i < 100 && !canvas; i++) {
    canvas = player.shadowRoot.querySelector('canvas')
    if (!canvas) await delay(100)
  }
  if (!canvas) throw Error('O renderizador não forneceu a tela da partida.')
  const snapshot = document.createElement('canvas')
  snapshot.width = 700
  snapshot.height = 600
  const ctx = snapshot.getContext('2d', {alpha:false, willReadFrequently:true})
  const sample = document.createElement('canvas')
  sample.width = sample.height = 12
  const pixels = sample.getContext('2d', {willReadFrequently:true})
  const video = paintedVideo(canvas)
  const status = document.querySelector('#lan-status')
  let lastSent = 0
  function capture(source, width, height, box, scale, left, top) {
    const rx = width / box.width, ry = height / box.height
    ctx.drawImage(source, left*rx, top*ry, 700*scale*rx, 600*scale*ry, 0, 0, 700, 600)
    pixels.clearRect(0, 0, 12, 12)
    pixels.drawImage(snapshot, 0, 0, 12, 12)
    const data = pixels.getImageData(0, 0, 12, 12).data
    // Reject a cleared buffer or a monochrome loading screen.
    let colored = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] > 32 && Math.max(data[i],data[i+1],data[i+2]) - Math.min(data[i],data[i+1],data[i+2]) > 12) colored++
    }
    return colored >= 6
  }
  const { turn, replayed } = camera
  for (const type of ['pointermove','pointerdown','pointerup','keydown']) player.addEventListener(type, event => {
    if (turn() === 1 && !replayed.has(event)) event.stopImmediatePropagation()
  }, true)
  let pendingInput = Promise.resolve()
  let sending = false, uploadError
  async function applyInputs(input) {
    for (const command of input.split('\n')) {
      if (turn() !== 1 || !command) return
      const [kind, ...values] = command.split(',')
      if (kind === 'p') camera.pan(...values.map(Number))
      else if (kind === 'z') camera.zoom(Number(values[0]))
      else await camera.click(Number(kind),Number(values[0]))
    }
  }
  async function sendFrame(controller, frame) {
    sending = true
    try {
      const response = await request('host/' + room + '/' + Number(controller === 1), {method:'POST',body:frame})
      if (!lastSent || Date.now() - lastSent >= 3000) status.textContent = 'Imagem sendo enviada ao convidado.'
      lastSent = Date.now()
      const input = await response.text()
      if (controller === 1 && input) pendingInput = pendingInput.then(() => applyInputs(input))
    } catch (error) {
      if (!(error instanceof TypeError)) uploadError = error
    } finally {
      sending = false
    }
  }
  while (player.isConnected) {
    if (uploadError) throw uploadError
    const started = performance.now()
    const controller = turn()
    const {box,scale,left,top} = stageRect(canvas)
    if (!sending && controller >= 0 && scale > 0 && canvas.width && canvas.height) {
      const painted = (video?.readyState >= 2 &&
        capture(video, video.videoWidth, video.videoHeight, box, scale, left, top)) ||
        capture(canvas, canvas.width, canvas.height, box, scale, left, top)
      if (!painted) {
        if (Date.now() - lastSent > 3000) status.textContent = 'Aguardando uma imagem válida do jogo. Mantenha o Battalion visível.'
        await delay(100)
        continue
      }
      // Chromium can defer canvas.toBlob's idle task while Ruffle is rendering.
      const encoded = snapshot.toDataURL('image/jpeg',.62)
      const bytes = atob(encoded.slice(encoded.indexOf(',') + 1))
      const frame = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i++) frame[i] = bytes.charCodeAt(i)
      void sendFrame(controller, frame)
    }
    await delay(Math.max(0,66 - (performance.now() - started)))
  }
}
