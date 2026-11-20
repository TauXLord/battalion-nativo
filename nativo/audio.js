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
  let audioContext = null
  function resume() {
    if (current && music.enabled && player.paused) player.play().catch(() => {})
  }
  document.addEventListener('pointerdown',resume,true)
  document.addEventListener('keydown',resume,true)
  window.addEventListener('pagehide',() => {
    player.pause()
    clearTimeout(rumbleTimer)
    try { audioContext?.close() } catch {}
    document.removeEventListener('pointerdown',resume,true)
    document.removeEventListener('keydown',resume,true)
  },{once:true})
  // Ambiente do clima, sintetizado (sem arquivos): chuva contínua com trovões distantes e o rodopio do redemoinho.
  // Os dois tocam em laço; só o volume muda (rampas suaves), conforme a chuva e a distância da câmera ao redemoinho.
  let ambience = null, rumbleTimer = 0
  function noiseBuffer(ctx,seconds,kind) {
    const buffer = ctx.createBuffer(1,Math.floor(ctx.sampleRate*seconds),ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let brown = 0
    for (let index = 0; index < data.length; index++) {
      const white = Math.random()*2 - 1
      brown = (brown + .02*white) / 1.02
      data[index] = kind === 'white' ? white : brown*3.5
    }
    // Emenda do laço sem estalo: as pontas somem e voltam rápido.
    const fade = Math.floor(ctx.sampleRate*.05)
    for (let index = 0; index < fade; index++) { data[index] *= index/fade; data[data.length-1-index] *= index/fade }
    return buffer
  }
  function startAmbience() {
    audioContext ??= new AudioContext()
    const ctx = audioContext
    const loop = (buffer) => { const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true; source.start(); return source }
    // Chuva: ruído branco filtrado (chiado das gotas) + ruído grave (chuva pesada ao longe).
    const rain = ctx.createGain(); rain.gain.value = 0; rain.connect(ctx.destination)
    const hiss = ctx.createBiquadFilter(); hiss.type = 'bandpass'; hiss.frequency.value = 2600; hiss.Q.value = .5
    loop(noiseBuffer(ctx,3,'white')).connect(hiss).connect(rain)
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 500
    const lowGain = ctx.createGain(); lowGain.gain.value = .6
    loop(noiseBuffer(ctx,4,'brown')).connect(low).connect(lowGain).connect(rain)
    // Redemoinho: ruído grave num filtro que sobe e desce devagar (o giro da água).
    const whirl = ctx.createGain(); whirl.gain.value = 0; whirl.connect(ctx.destination)
    const swirl = ctx.createBiquadFilter(); swirl.type = 'bandpass'; swirl.frequency.value = 320; swirl.Q.value = 2.2
    const lfo = ctx.createOscillator(); lfo.frequency.value = .45
    const depth = ctx.createGain(); depth.gain.value = 180
    lfo.connect(depth).connect(swirl.frequency); lfo.start()
    loop(noiseBuffer(ctx,4,'brown')).connect(swirl).connect(whirl)
    ambience = {rain,whirl,raining:false}
  }
  function scheduleRumble() {
    clearTimeout(rumbleTimer)
    if (!ambience?.raining) return
    rumbleTimer = setTimeout(() => { if (ambience?.raining) { thunder(.45); scheduleRumble() } },7000 + Math.random()*13000)
  }
  // Trovão sintetizado (o jogo original não tem esse som): estalo seco e um ronco grave que vai sumindo.
  function thunder(strength = 1) {
    if (!effects.enabled || !volume) return
    try {
      audioContext ??= new AudioContext()
      const ctx = audioContext, now = ctx.currentTime, seconds = 2.8
      const source = ctx.createBufferSource()
      source.buffer = noiseBuffer(ctx,seconds,'brown')
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(strength < 1 ? 600 : 1600,now)
      filter.frequency.exponentialRampToValueAtTime(120,now + 1.2)
      const gain = ctx.createGain()
      const level = .9 * volume * strength
      gain.gain.setValueAtTime(0,now)
      gain.gain.linearRampToValueAtTime(level,now + (strength < 1 ? .3 : .03))
      gain.gain.exponentialRampToValueAtTime(level*.35,now + .5)
      gain.gain.linearRampToValueAtTime(level*.5,now + .9)
      gain.gain.exponentialRampToValueAtTime(.001,now + seconds)
      source.connect(filter).connect(gain).connect(ctx.destination)
      source.start(now)
    } catch {}
  }
  return {
    thunder:() => thunder(1),
    // rain: true/false; whirlpool: 0 (longe ou fora da tela) a 1 (no centro da tela, com zoom próximo).
    weather({rain = false,whirlpool = 0}) {
      const on = effects.enabled && volume > 0
      if (!ambience && (!on || !rain && !whirlpool)) return
      try {
        if (!ambience) startAmbience()
        if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})
        const now = audioContext.currentTime
        ambience.rain.gain.setTargetAtTime(on && rain ? .16*volume : 0,now,.8)
        ambience.whirl.gain.setTargetAtTime(on ? .5*volume*whirlpool : 0,now,.25)
        if (ambience.raining !== (on && rain)) { ambience.raining = on && rain; scheduleRumble() }
      } catch {}
    },
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
