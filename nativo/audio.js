function option(name) {
  const key = 'battalion-nativo-' + name
  let enabled = true
  try { enabled = localStorage.getItem(key) !== 'off' } catch {}
  return {
    get enabled() { return enabled },
    set enabled(value) {
      enabled = value
      try { localStorage.setItem(key,value ? 'on' : 'off') } catch {}
    },
  }
}

export function matchAudio(assets) {
  const effects = option('sound'), music = option('music')
  const player = new Audio()
  player.loop = true
  const volumeKey = 'battalion-nativo-volume'
  let volume = 1
  try { volume = Number(localStorage.getItem(volumeKey) ?? 1) } catch {}
  volume = Number.isFinite(volume) ? Math.max(0,Math.min(1,volume)) : 1
  player.volume = .5 * volume
  let current = ''
  function resume() {
    if (current && music.enabled && player.paused) player.play().catch(() => {})
  }
  document.addEventListener('pointerdown',resume,true)
  document.addEventListener('keydown',resume,true)
  window.addEventListener('pagehide',() => {
    player.pause()
    document.removeEventListener('pointerdown',resume,true)
    document.removeEventListener('keydown',resume,true)
  },{once:true})
  return {
    track(name) {
      if (name === current) return
      player.pause()
      current = name
      if (name) {
        player.src = '/recursos/' + assets[name]
        resume()
      }
    },
    effect(name) {
      if (!effects.enabled || !assets[name]) return
      const sound = new Audio('/recursos/' + assets[name])
      sound.volume = .38 * volume
      sound.play().catch(() => {})
    },
    bind(soundInput,musicInput,volumeInput,volumeValue) {
      soundInput.checked = effects.enabled
      musicInput.checked = music.enabled
      const updateVolume = () => {
        volumeValue.textContent = Math.round(volume*100)+'%'
        player.volume = .5 * volume
      }
      volumeInput.value = Math.round(volume*100)
      updateVolume()
      volumeInput.oninput = () => {
        volume = volumeInput.valueAsNumber/100
        updateVolume()
        try { localStorage.setItem(volumeKey,String(volume)) } catch {}
      }
      soundInput.onchange = () => {effects.enabled = soundInput.checked}
      musicInput.onchange = () => {
        music.enabled = musicInput.checked
        if (music.enabled) resume()
        else player.pause()
      }
    },
  }
}
