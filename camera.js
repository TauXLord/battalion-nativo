const settings = { drag: true, edge: false }
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('battalion-camera') || '{}'))
} catch {}

export const boardWidth = 560
export const boardHeight = 560

export function stageRect(element) {
  const box = element.getBoundingClientRect()
  const scale = Math.min(box.width / 700, box.height / 600)
  return { box, scale, left: (box.width - 700 * scale) / 2, top: (box.height - 600 * scale) / 2 }
}

export function stagePoint(element, event) {
  const { box, scale, left, top } = stageRect(element)
  return [(event.clientX - box.x - left) / scale, (event.clientY - box.y - top) / scale]
}

// Liga as caixas input[data-camera] de um contêiner (barra da câmera ou tela de configurações) às preferências.
export function bindCameraOptions(container) {
  for (const option of container.querySelectorAll('input[data-camera]')) {
    if (option.dataset.bound) continue
    option.dataset.bound = '1'
    option.checked = settings[option.dataset.camera]
    option.addEventListener('change', () => {
      settings[option.dataset.camera] = option.checked
      try { localStorage.setItem('battalion-camera', JSON.stringify(settings)) } catch {}
    })
  }
}

export function bindCamera(surface, bar, {
  pan, zoom, click, ready, canControl = () => true, canPan = () => true, replayed,
  point = event => stagePoint(surface,event), bounds = () => [boardWidth,boardHeight],
}) {
  const onBoard = ([x,y]) => {
    const [width,height] = bounds()
    return x >= 0 && x < width && y >= 0 && y < height
  }
  const [minus, plus, overview] = bar.querySelectorAll('[data-zoom]')
  const output = bar.querySelector('output')
  bindCameraOptions(bar)
  let gesture, hover, lastScroll = 0
  let state = false
  function refresh() {
    if (!surface.isConnected) return
    const current = ready()
    const active = Boolean(current) && canControl()
    if (state !== active || bar.hidden !== !current) {
      state = active
      bar.hidden = !current
      for (const button of [minus, plus, overview]) button.disabled = !active
    }
    if (output && typeof current === 'number' && current > 0) output.value = Math.round(current * 100) + '%'
    setTimeout(refresh, 300)
  }
  bar.addEventListener('click', event => {
    const step = event.target.dataset.zoom
    if (step && canControl()) {
      const current = zoom(Number(step))
      if (output && typeof current === 'number' && current > 0) output.value = Math.round(current * 100) + '%'
    }
  })
  refresh()

  surface.addEventListener('pointerdown', event => {
    if (replayed?.has(event) || !settings.drag || event.button !== 0 || !canControl() || !ready()) return
    const cursor = point(event)
    if (!onBoard(cursor)) return
    gesture = { id:event.pointerId, start:cursor, last:cursor, dragged:false }
    surface.setPointerCapture(event.pointerId)
    event.stopImmediatePropagation()
  }, true)
  surface.addEventListener('pointermove', event => {
    if (replayed?.has(event)) return
    const cursor = point(event)
    hover = onBoard(cursor) ? cursor : null
    if (!gesture || event.pointerId !== gesture.id) return
    event.stopImmediatePropagation()
    if (!gesture.dragged && Math.hypot(cursor[0]-gesture.start[0],cursor[1]-gesture.start[1]) < 6) return
    gesture.dragged = true
    const dx = Math.round(cursor[0]-gesture.last[0])
    const dy = Math.round(cursor[1]-gesture.last[1])
    if ((dx || dy) && canPan()) pan(dx,dy)
    gesture.last = cursor
  }, true)
  surface.addEventListener('pointerup', event => {
    if (replayed?.has(event) || !gesture || event.pointerId !== gesture.id) return
    const { start, dragged } = gesture
    gesture = null
    event.stopImmediatePropagation()
    if (!dragged && canControl()) click(Math.floor(start[0]),Math.floor(start[1]))
  }, true)
  surface.addEventListener('pointercancel', () => { gesture = hover = null })
  surface.addEventListener('lostpointercapture', () => { gesture = null })
  surface.addEventListener('pointerleave', () => { hover = null })
  const scroll = now => {
    if (!surface.isConnected) return
    if (settings.edge && hover && !gesture && canControl() && canPan() && now - lastScroll >= 80) {
      const [x,y] = hover
      const [width,height] = bounds()
      const step = (value, size) => value < 16 ? 18 : value > size - 16 ? -18 : 0
      const dx = step(x,width), dy = step(y,height)
      if (dx || dy) pan(dx,dy)
      lastScroll = now
    }
    requestAnimationFrame(scroll)
  }
  requestAnimationFrame(scroll)
}

export function playerCamera(player, bar, canControl) {
  const replayed = new WeakSet()
  const call = (...args) => player.ruffle().callExternalInterface(...args)
  async function click(x,y) {
    const canvas = player.shadowRoot.querySelector('canvas')
    if (!canvas || !player.isConnected) return
    const { box, scale, left, top } = stageRect(canvas)
    const clientX = box.x + left + x * scale, clientY = box.y + top + y * scale
    for (const type of ['pointermove','pointerdown','pointerup']) {
      if (type === 'pointerup') await new Promise(resolve => setTimeout(resolve,48))
      const event = new PointerEvent(type, {
        bubbles:true, composed:true, cancelable:true, clientX, clientY,
        isPrimary:true, pointerType:'mouse', pointerId:1, button:0, buttons:type === 'pointerdown' ? 1 : 0,
      })
      replayed.add(event)
      canvas.dispatchEvent(event)
    }
  }
  const pan = (dx,dy) => call('localCameraPan',dx,dy)
  const zoom = step => call('localZoom',step)
  bindCamera(player,bar,{ pan, zoom, click, ready:() => zoom(0), canControl, replayed })
  return { pan, zoom, click, replayed, turn:() => Number(call('localTurn') ?? -1) }
}
