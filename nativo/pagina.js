import { lobby, request } from './lan.js'
import { bindCameraOptions } from './camera.js'
import { colorize, frame, loadImages, play, terrainArt, terrainVariant } from './tabuleiro.js'
import { campaignProgress, campaignTransport, saveVictory } from './campanha.js'
import { coopEligible } from './cooperativo.js'
import { deleteProfileStorage, loadProfile, maxNameLength, profilePhoto, saveProfile } from './perfil-jogador.js'
import { clearSavedMatch, deleteSavesStorage, loadSavedMatch, saveMatch } from './salvamento.js'
import { loadStats, recordMatch, statsSummary } from './estatisticas.js'
import { replayTransport, validReplay } from './replay.js'
import { matchAudio } from './audio.js'
import { scenarioMatch, scenarioSlots } from './partida.js'
import { defaultAiTime, validAiTime } from './ia.js'
import { generateMap, generatedTitle, mapRecipe, maxSide, minSide, minimumSize, terrainWeights } from './procedural.js'
import { language, loadLanguage, setLanguage, t, translatePage } from './idioma.js'

const $ = id => document.getElementById(id)
const query = new URLSearchParams(location.search)
const palette = [
  ['Verde','ff00ff00'],['Azul','ff0000ff'],['Vermelho','ffff0000'],['Amarelo','ffffd800'],
  ['Laranja','ffffa500'],['Roxo','ff5645a0'],['Branco','fff5f5ff'],['Turquesa','ff008080'],['Cinza','ff424144'],
]
// Cores iniciais de cada equipe (até 9, uma por paleta do jogo).
const teamColors = ['ff00ff00','ff0000ff','ffff0000','ff008080','ffffd800','ffffa500','ff5645a0','fff5f5ff','ff424144']
const avatarsFor = index => ['yurik','evil_durand','tucker','hayne'][index%4]
const aiTimeKey = 'battalion-nativo-ai-time'
const difficultyKey = 'battalion-nativo-difficulty'
const stored = key => { try { return localStorage.getItem(key) } catch { return null } }
const store = (key,value) => { try { localStorage.setItem(key,value) } catch {} }
// Modo desenvolvedor: prévia de dano nas partidas locais, sem contar progresso.
const developerKey = 'battalion-nativo-dev'
const developerMode = () => stored(developerKey) === '1'
// Ritmo da IA: pular animações das jogadas dela e tempo máximo por turno (útil em mapas gigantes).
const fastAI = () => stored('battalion-nativo-ia-rapida') === '1'
const aiTurnLimit = () => { const value = Number(stored('battalion-nativo-ia-limite') ?? 0); return Number.isFinite(value) ? Math.max(0,Math.min(600,value)) : 0 }
const aiTime = value => validAiTime(Number(value)) ? Number(value) : defaultAiTime
const storedAiTime = () => aiTime(stored(aiTimeKey) ?? defaultAiTime)
const storedDifficulty = () => {
  const value = Number(stored(difficultyKey) ?? 1)
  return [0,1,2].includes(value) ? value : 1
}
function configureAiTime(field) {
  field.value = storedAiTime()
  field.onchange = () => {
    field.value = aiTime(field.value || defaultAiTime)
    store(aiTimeKey,field.value)
  }
}

// Tela de configurações (diálogo único, usado no menu, na campanha e dentro da partida).
let fullscreenTarget = () => document.documentElement
function setupSettings(data,{inGame = false} = {}) {
  const dialog = $('options')
  bindCameraOptions(dialog)
  const languageSelect = $('settings-language')
  languageSelect.value = language()
  languageSelect.onchange = () => {
    setLanguage(languageSelect.value)
    // Fora da partida a página recarrega no novo idioma; dentro dela, a troca vale na próxima tela.
    if (inGame) $('settings-language-note').hidden = languageSelect.value === language()
    else location.reload()
  }
  const difficulty = $('settings-difficulty')
  difficulty.value = storedDifficulty()
  difficulty.onchange = () => store(difficultyKey,difficulty.value)
  configureAiTime($('settings-ai-time'))
  $('settings-fullscreen').onclick = () => (document.fullscreenElement ? document.exitFullscreen() :
    fullscreenTarget().requestFullscreen()).catch(showError)
  const generation = data.aiProfile?.generation
  $('settings-ai-info').textContent = t('Fácil usa a IA clássica do jogo, com dano e renda reduzidos na campanha.') + ' ' +
    (data.aiProfile?.params ? generation != null ? t('Normal e Difícil usam a IA treinada (geração {n}).',{n:generation}) :
      t('Normal e Difícil usam a IA treinada.') : t('Normal e Difícil usam a IA tática com os pesos padrão.'))
  const developer = $('settings-dev')
  developer.checked = developerMode()
  developer.onchange = () => store(developerKey,developer.checked ? '1' : '0')
  const quick = $('settings-ai-fast'), limit = $('settings-ai-limit')
  quick.checked = fastAI()
  quick.onchange = () => store('battalion-nativo-ia-rapida',quick.checked ? '1' : '0')
  limit.value = String(aiTurnLimit())
  limit.onchange = () => { store('battalion-nativo-ia-limite',String(Math.max(0,Math.min(600,Number(limit.value) || 0)))); limit.value = String(aiTurnLimit()) }
  setupProfile(dialog).catch(()=>{})
  setupSystem(dialog)
  for (const button of document.querySelectorAll('[data-settings]')) button.onclick = () => {
    difficulty.value = storedDifficulty()
    dialog.showModal()
  }
}

// Fechar o jogo, excluir dados e desinstalar: só no computador que roda o jogo (endereço local).
function setupSystem(settings) {
  const local = location.hostname === '127.0.0.1' && location.protocol === 'http:'
  $('settings-system').hidden = !local
  if (!local) return
  const confirm = $('system-confirm'), go = $('system-confirm-go'), status = $('system-confirm-status')
  const typed = $('system-confirm-type')
  const system = async (action,payload) => {
    const response = await fetch('/sistema/' + action,{method:'POST',headers:{'X-Battalion-Acao':'1'},
      body:payload ? JSON.stringify(payload) : ''})
    if (!response.ok) throw Error(await response.text())
  }
  // Apaga tudo o que o jogo guarda neste navegador (perfil, progresso, vitórias, mapas, configurações).
  const clearBrowser = () => {
    for (const storage of [localStorage,sessionStorage]) {
      try { Object.keys(storage).filter(key=>key.startsWith('battalion')).forEach(key=>storage.removeItem(key)) } catch {}
    }
  }
  const closed = () => {
    document.querySelectorAll('main,dialog').forEach(element=>{ element.hidden = true; element.open && element.close() })
    $('game-closed').hidden = false
    setTimeout(()=>window.close(),600)
  }
  function ask({title,text,items,button,ai = false,word,run}) {
    $('system-confirm-title').textContent = t(title)
    $('system-confirm-text').textContent = t(text)
    $('system-confirm-list').replaceChildren(...items.map(item=>Object.assign(document.createElement('li'),{textContent:t(item)})))
    $('system-confirm-ai-row').hidden = !ai
    $('system-confirm-ai').checked = false
    $('system-confirm-type-row').hidden = !word
    $('system-confirm-type-label').textContent = word ? t('Digite {word} para confirmar',{word}) : ''
    typed.value = ''
    status.textContent = ''
    go.textContent = t(button)
    go.disabled = Boolean(word)
    typed.oninput = () => { go.disabled = typed.value.trim().toUpperCase() !== word }
    go.onclick = async () => {
      go.disabled = true
      try { await run($('system-confirm-ai').checked) }
      catch (error) { status.textContent = t(error.message); go.disabled = false }
    }
    settings.close()
    confirm.showModal()
  }
  $('system-close').onclick = async () => {
    try { await system('fechar'); closed() } catch (error) { showError(error) }
  }
  $('system-delete').onclick = () => ask({
    title:'Excluir meus dados',
    text:'Isto apaga deste computador:',
    items:['Perfil (nome e foto)','Progresso das campanhas e vitórias nos mapas','Mapas importados e rascunho do editor',
      'Configurações do jogo'],
    button:'Excluir dados', ai:true, word:'EXCLUIR',
    run:async ai => {
      await system('excluir',{ia:ai})
      await deleteProfileStorage()
      await deleteSavesStorage()
      clearBrowser()
      location.href = '/'
    },
  })
  $('system-uninstall').onclick = () => ask({
    title:'Desinstalar o Battalion',
    text:'Isto apaga do computador os itens abaixo e fecha o jogo. Não dá para desfazer.',
    items:['Perfil, progresso, vitórias, mapas e configurações','IA treinada e treinos (pasta .battalion-nativo)',
      'Arquivos do jogo (pasta BattalionNativo em AppData)','O arquivo Battalion-Nativo.exe que abriu o jogo'],
    button:'Desinstalar', word:'DESINSTALAR',
    run:async () => {
      await system('desinstalar')
      await deleteProfileStorage()
      await deleteSavesStorage()
      clearBrowser()
      closed()
    },
  })
}

// Perfil do jogador: nome e foto (PNG/JPG/GIF) ficam neste computador e aparecem nas partidas.
async function setupProfile(dialog) {
  const name = $('profile-name'), file = $('profile-file'), status = $('profile-status')
  let saved = await loadProfile()
  let draft = saved ?? {name:'',avatar:''}
  const show = () => {
    $('profile-photo').hidden = !draft.avatar
    if (draft.avatar) $('profile-photo').src = draft.avatar
    $('profile-placeholder').hidden = Boolean(draft.avatar)
    $('profile-remove-photo').disabled = !draft.avatar
    $('home-profile-name').textContent = saved?.name || t(saved ? 'Meu perfil' : 'Criar perfil')
    $('home-profile-photo').hidden = !saved?.avatar
    if (saved?.avatar) $('home-profile-photo').src = saved.avatar
  }
  name.value = draft.name
  show()
  // Estatísticas deste computador (partidas no modo desenvolvedor e como espectador não contam).
  const stats = loadStats()
  const chapters = ['vengeance','ghosts'].reduce((sum,group)=>sum+Object.keys(campaignProgress(group)).length,0)
  const modeNames = {ia:'Contra a IA',local:'Mesmo dispositivo',campanha:'Campanha',rede:'Multiplayer'}
  const rows = [['Partidas',stats.partidas],['Vitórias',stats.vitorias],['Derrotas',stats.derrotas],
    ['Unidades inimigas destruídas',stats.destruidas],['Unidades perdidas',stats.perdidas],['Capítulos de campanha concluídos',chapters],
    ...Object.entries(stats.modos).map(([mode,{vitorias,derrotas}])=>[modeNames[mode] ?? mode,
      t('{v} vitórias, {d} derrotas',{v:vitorias,d:derrotas})])]
  $('profile-stats').replaceChildren(...rows.flatMap(([label,value])=>[
    Object.assign(document.createElement('dt'),{textContent:t(label)}),
    Object.assign(document.createElement('dd'),{textContent:String(value)})]))
  file.onchange = async () => {
    const chosen = file.files[0]
    file.value = ''
    if (!chosen) return
    try {
      draft = {...draft,avatar:await profilePhoto(chosen)}
      status.textContent = t('Foto carregada. Clique em Salvar perfil.')
      show()
    } catch (error) { status.textContent = t(error.message) }
  }
  $('profile-remove-photo').onclick = () => { draft = {...draft,avatar:''}; show() }
  $('profile-save').onclick = async () => {
    draft = {...draft,name:name.value.trim().slice(0,maxNameLength)}
    try {
      await saveProfile(draft.name || draft.avatar ? draft : null)
      saved = await loadProfile()
      status.textContent = t('Perfil salvo. Ele aparece a partir da próxima partida.')
      show()
    } catch (error) { status.textContent = t(error.message) }
  }
  $('home-profile').onclick = () => {
    dialog.showModal()
    name.focus()
  }
}
// Música do menu: é desligada quando uma partida começa na mesma página (a partida tem a própria trilha).
let menuMusic
function menuAudio(data) {
  menuMusic?.track('')
  const audio = menuMusic = matchAudio(data.assets)
  audio.bind($('audio'),$('music'),$('game-volume'),$('game-volume-value'))
  audio.track('UIWAV')
  return audio
}

// Sprite de unidade recortado (primeiro quadro) e pintado com a cor de uma equipe.
function unitSprite(data,image,color) {
  const sheet = colorize(image,data.palettes.ffff0000,data.palettes[color] ?? data.palettes.ffff0000)
  const w = sheet.width/6, h = sheet.height/4
  const cell = Object.assign(document.createElement('canvas'),{width:w,height:h})
  const ctx = cell.getContext('2d',{willReadFrequently:true})
  ctx.drawImage(sheet,0,0,w,h,0,0,w,h)
  const pixels = ctx.getImageData(0,0,w,h).data
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (pixels[(y*w+x)*4+3]) {
    minX = Math.min(minX,x); maxX = Math.max(maxX,x); minY = Math.min(minY,y); maxY = Math.max(maxY,y)
  }
  if (maxX < 0) return cell
  const trimmed = Object.assign(document.createElement('canvas'),{width:maxX-minX+1,height:maxY-minY+1})
  trimmed.getContext('2d').drawImage(cell,minX,minY,trimmed.width,trimmed.height,0,0,trimmed.width,trimmed.height)
  return trimmed
}
function drawSprites(canvas,sprites) {
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0,0,canvas.width,canvas.height)
  const gap = 6, slot = (canvas.width - gap*(sprites.length-1))/sprites.length
  sprites.forEach((sprite,index)=>{
    const scale = Math.max(1,Math.floor(Math.min(slot/sprite.width,canvas.height/sprite.height)))
    const w = sprite.width*scale, h = sprite.height*scale
    ctx.save()
    const x = index*(slot+gap) + (slot-w)/2
    // O segundo sprite olha para o primeiro.
    if (index % 2) { ctx.translate(x+w,0); ctx.scale(-1,1) } else ctx.translate(x,0)
    ctx.drawImage(sprite,0,canvas.height-h,w,h)
    ctx.restore()
  })
}

async function openHome(data) {
  $('home-view').hidden = false
  setupSettings(data)
  menuAudio(data)
  // Cartão "Continuar partida" com a última partida salva automaticamente.
  void loadSavedMatch().then(save => {
    if (!save) return
    const card = $('home-continue')
    card.href = '/?continuar' + (save.ghosts ? '=ghosts' : '')
    const when = new Date(save.savedAt).toLocaleString(language() === 'en' ? 'en-US' : 'pt-BR',
      {dateStyle:'short',timeStyle:'short'})
    $('home-continue-info').textContent = t(save.title || 'Partida') + ' · ' +
      t('Rodada {n}',{n:save.engine?.state?.round ?? 1}) + ' · ' + when
    card.hidden = false
  })
  const generation = data.aiProfile?.generation
  $('home-ai').textContent = data.aiProfile?.params ?
    t('IA treinada ativa: geração {n} (Normal e Difícil). Fácil usa a IA clássica do jogo.',{n:generation ?? '?'}) :
    t('Nenhuma IA treinada ativa: Normal e Difícil usam a IA tática com os pesos padrão.')
  const names = ['annihilator','scorpion','raptor','battlecruiser']
  const images = await loadImages(Object.fromEntries(names.map(name=>[name,data.assets[name]])))
  drawSprites($('home-tank'),[unitSprite(data,images.annihilator,'ff00ff00')])
  for (const canvas of document.querySelectorAll('canvas[data-art]')) {
    drawSprites(canvas,canvas.dataset.art.split('|').map(item=>{
      const [name,color] = item.split(':')
      return unitSprite(data,images[name],color)
    }))
  }
  for (const [group,file] of [['vengeance','/campanha.json'],['ghosts','/campanha-ghosts.json']]) {
    try {
      const chapters = await (await fetch(file)).json()
      const progress = campaignProgress(group)
      const done = chapters.filter(chapter=>progress[chapter.number]).length
      document.querySelector(`[data-progress="${group}"]`).textContent =
        done ? t('{done} de {total} capítulos concluídos',{done,total:chapters.length}) : t('{total} capítulos',{total:chapters.length})
    } catch {}
  }
}

function internetUpdates(room,slot,receive,disconnect) {
  const controller = new AbortController()
  let version = -1
  async function poll() {
    while (!controller.signal.aborted) {
      let interval = 180
      try {
        const response = await request('update/'+room+'/'+slot+'/'+version,{signal:controller.signal})
        if (response.status === 200) {
          const state = await response.json()
          version = state.revision ?? state.version
          receive(state)
        }
      } catch {
        if (controller.signal.aborted) return
        disconnect()
        version = -1
        interval = 850
      }
      await new Promise(resolve=>setTimeout(resolve,interval))
    }
  }
  void poll()
  return () => controller.abort()
}

function matchUpdates(room,slot,receive,disconnect) {
  if (location.protocol === 'https:') return internetUpdates(room,slot,receive,disconnect)
  const stream = new EventSource('/lan/state/' + room + '/' + slot)
  stream.onmessage = event => receive(JSON.parse(event.data))
  stream.onerror = disconnect
  return () => stream.close()
}

async function start(data,room,slot,side,invites = []) {
  $('scenario-view').hidden = true
  $('campaign-view').hidden = true
  const {generated,coop} = await (await request('lobby/' + room + '/' + slot)).json()
  // Nome e foto do perfil para os outros jogadores verem na sala e na partida.
  const profile = await loadProfile()
  await request('profile/' + room + '/' + slot,{method:'POST',
    body:JSON.stringify({...profile,stats:statsSummary()})}).catch(()=>{})
  // Campanha Ghosts em dupla: as imagens e regras vêm do anfitrião.
  if (coop?.ghosts) data = await (await request('dados/' + room + '/' + slot)).json()
  const maps = coop ? [['coop',t('Campanha em dupla')+' · '+t(coop.title)]] :
    Object.entries(data.maps).map(([id,map]) => [id,t(map.title)])
  if (generated) maps.push(['procedural',t(generatedTitle)])
  const {map,you,coop:started} = await lobby({room,slot:side === 1 ? undefined : slot,invites,maps,palette,t})
  // Estatísticas: cada partida em rede conta uma vez, como vitória ou derrota (espectador não conta).
  let counted = false
  const count = victory => { if (!counted) { counted = true; recordMatch('rede',{victory}) } }
  if (coop) {
    // Os dois jogadores comandam o time 1; quem é dono de cada unidade vem no estado da partida.
    return showMatch(data,started.board,1,{
      listen:(receive,disconnect) => matchUpdates(room,slot,state => {
        // Vitória na dupla conta como capítulo concluído nos dois computadores.
        if (state.result?.victory && state.coop) saveVictory(state.coop.chapter,state.result,state.coop.group)
        if (state.result) count(Boolean(state.result.victory))
        receive(state)
      },disconnect),
      send:command => request('command/' + room + '/' + slot,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),
      }),
      advance:() => void request('advance/' + room + '/' + slot,{method:'POST'}).catch(()=>{}),
      fastAI,
      chat:text => request('chat/' + room + '/' + slot,{method:'POST',body:text}),
      back:'/',
    })
  }
  const board = generated ? generateMap(data,generated) : data.maps[maps[map][0]]
  const mine = you ?? side
  return showMatch(data,board,mine,{
    listen:(receive,disconnect) => matchUpdates(room,slot,state => {
      if (state.winner && mine > 0) count(state.winner === mine || Boolean(state.alliances?.[mine-1]?.includes(state.winner)))
      receive(state)
    },disconnect),
    fastAI,
    chat:text => request('chat/' + room + '/' + slot,{method:'POST',body:text}),
    send(command) {
      return request('command/' + room + '/' + slot,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),
      })
    },
  })
}

async function showMatch(data,board,side,transport) {
  menuMusic?.track('')
  menuMusic = undefined
  $('player-view').hidden = false
  $('player-title').textContent = t(board.title)
  setupSettings(data,{inGame:true})
  fullscreenTarget = () => $('player-view')
  const exit = $('settings-exit')
  exit.hidden = false
  exit.href = transport.back ?? $('player-view').querySelector('header a').getAttribute('href') ?? '/'
  exit.textContent = t('Sair da partida')
  $('settings-close').textContent = t('Voltar à partida')
  $('fullscreen').onclick = () => (document.fullscreenElement ? document.exitFullscreen() :
    $('player-view').requestFullscreen()).catch(showError)
  await play(data,board,side,transport)
}

function showError(error) {
  $('startup').hidden = true
  $('error').textContent = t(error.message)
  $('error').hidden = false
}

// Missão de campanha (nova ou continuada do salvamento automático).
async function playMission(data,{mission,ghosts,list,difficulty,seconds,resume}) {
  const base = ghosts ? '/?campanha=ghosts' : '/?campanha'
  const back = base + (list === 'campanha' ? '' : '&group='+list)
  const group = (ghosts ? 'ghosts' : 'vengeance') + (list === 'campanha' ? '' : '-'+list)
  $('player-view').querySelector('header a').href = back
  $('player-view').querySelector('header a').textContent = t('← Campanha')
  const profile = await loadProfile()
  const teams = profile ? mission.teams.map((team,index)=>index ? team :
    {...team,name:profile.name || team.name,photo:profile.avatar || undefined}) : mission.teams
  const onSave = engine => engine ?
    saveMatch({kind:'campaign',title:mission.title,ghosts,list,chapter:mission.number,difficulty,seconds,engine}) :
    clearSavedMatch()
  const practice = developerMode()
  const onFinish = practice ? undefined : result => recordMatch('campanha',result)
  return showMatch(data,mission.board,1,campaignTransport(data,{...mission,teams},difficulty,
    {group,back,aiTime:seconds,resume,onSave,practice,fastAI,turnLimit:aiTurnLimit(),onFinish}))
}

// "Continuar partida": reabre a última partida local salva automaticamente.
async function openSaved(data) {
  const save = await loadSavedMatch()
  if (!save) return openHome(data)
  if (save.kind === 'campaign') {
    const response = await fetch('/'+save.list+(save.ghosts ? '-ghosts' : '')+'.json')
    if (!response.ok) throw Error('Abra a campanha pelo endereço local do anfitrião.')
    const mission = (await response.json()).find(chapter=>chapter.number === save.chapter)
    if (!mission?.board) throw Error('Esta missão não está mais disponível.')
    return playMission(data,{...save,mission,resume:save.engine})
  }
  return playLocal(data,save.board,save.mode,save.difficulty,save.colors,save.back,save.humans,save.coalitions,
    save.seconds,{sideDifficulty:save.sideDifficulty,mapId:save.mapId,resume:save.engine})
}

async function openCampaign(data) {
  const ghosts = query.get('campanha') === 'ghosts'
  const list = ['bootcamp','bonus'].includes(query.get('group')) ? query.get('group') : 'campanha'
  const suffix = ghosts ? '-ghosts' : ''
  const base = ghosts ? '/?campanha=ghosts' : '/?campanha'
  const back = base + (list === 'campanha' ? '' : '&group='+list)
  const group = (ghosts ? 'ghosts' : 'vengeance') + (list === 'campanha' ? '' : '-'+list)
  const response = await fetch('/'+list+suffix+'.json')
  if (!response.ok) throw Error('Abra a campanha pelo endereço local do anfitrião.')
  const chapters = await response.json(), progress = campaignProgress(group)
  const unlocked = chapter => Boolean(chapter?.board) &&
    (list !== 'campanha' || chapter.number === 1 || Boolean(progress[chapter.number - 1]))
  const difficulty = Number(query.get('difficulty') ?? storedDifficulty())
  const selected = [0,1,2].includes(difficulty) ? difficulty : 1
  if (query.has('chapter')) {
    const mission = chapters.find(chapter => String(chapter.number) === query.get('chapter'))
    if (!mission?.board) throw Error('Este capítulo ainda não está disponível na edição nativa.')
    if (!unlocked(mission)) throw Error('Conclua o capítulo anterior para abrir este mapa.')
    const seconds = aiTime(query.get('aiTime') ?? storedAiTime())
    return playMission(data,{mission,ghosts,list,difficulty:selected,seconds})
  }
  $('campaign-title').textContent = ghosts ? 'Ghosts' : 'Vengeance'
  const screen = document.querySelector('.campaign-screen')
  screen.classList.toggle('ghosts',ghosts)
  screen.setAttribute('aria-label',t('Campanha {name}',{name:ghosts ? 'Ghosts' : 'Vengeance'}))
  for (const [id,key] of [['chapter-link','campanha'],['bootcamp-link','bootcamp'],['bonus-link','bonus']]) {
    $(id).href = base + (key === 'campanha' ? '' : '&group='+key)
    if (key === list) $(id).setAttribute('aria-current','page')
  }
  const images = await loadImages(data.assets)
  let index = chapters.findLastIndex(unlocked)
  const prev = $('chapter-prev'), next = $('chapter-next'), brief = $('mission-brief'), preview = $('mission-preview')
  const ctx = preview.getContext('2d')
  const badges = chapters.map((chapter,i) => {
    const button = document.createElement('button')
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 30
    frame(canvas.getContext('2d'),images.medal,unlocked(chapter) ? progress[chapter.number]?.medal ?? 5 : 4,0,0,30,30)
    button.append(canvas)
    button.setAttribute('aria-label',t(chapter.title))
    button.disabled = !unlocked(chapter)
    button.onclick = () => {index = i; render()}
    return button
  })
  function render() {
    const mission = chapters[index]
    $('chapter-title').textContent = t(mission.title)
    brief.textContent = t(mission.brief)
    prev.disabled = !unlocked(chapters[index-1])
    next.disabled = !unlocked(chapters[index+1])
    badges.forEach((button,i) => button.setAttribute('aria-current',i === index ? 'step' : 'false'))
    // Dupla pela rede: só nas missões em que o time do jogador começa com pelo menos duas Warmachines.
    const coop = coopEligible(mission)
    $('mission-coop').disabled = !coop
    $('mission-coop-note').textContent = t(coop ? 'Cada jogador comanda parte das Warmachines do time.' :
      'Disponível nas missões com pelo menos duas Warmachines do seu lado.')
    const map = mission.board, tile = Math.min(8,Math.floor(preview.width/map.width),Math.floor(preview.height/map.height))
    const x = Math.floor((preview.width-map.width*tile)/2), y = Math.floor((preview.height-map.height*tile)/2)
    ctx.clearRect(0,0,preview.width,preview.height)
    for (const [cell,[,[mode,names]]] of map.tiles.entries()) {
      const art = mode === 'random' ? ['single',[names[cell % names.length]]] : [mode,names]
      terrainArt(ctx,images,art,0,x+(cell%map.width)*tile,y+Math.floor(cell/map.width)*tile,tile,tile)
    }
  }
  $('chapter-badges').replaceChildren(...badges)
  prev.onclick = () => {index--; render()}
  next.onclick = () => {index++; render()}
  document.querySelector(`[name=difficulty][value="${selected}"]`).checked = true
  setupSettings(data)
  $('settings-difficulty').addEventListener('change',()=>{
    document.querySelector(`[name=difficulty][value="${storedDifficulty()}"]`).checked = true
  })
  $('mission-start').onclick = () => {
    const mode = document.querySelector('[name=difficulty]:checked').value
    store(difficultyKey,mode)
    location.href = `${back}&chapter=${chapters[index].number}&difficulty=${mode}&aiTime=${storedAiTime()}`
  }
  $('mission-coop').onclick = async () => {
    const button = $('mission-coop')
    button.disabled = true
    try {
      const mode = Number(document.querySelector('[name=difficulty]:checked').value)
      store(difficultyKey,String(mode))
      const settings = {coop:{list,ghosts,chapter:chapters[index].number},difficulty:mode,aiTime:storedAiTime()}
      const {room,slot,invites} = await (await request('create',{method:'POST',body:JSON.stringify(settings)})).json()
      sessionStorage.setItem('battalion-nativo-host-' + room,JSON.stringify({slot,invites}))
      history.replaceState(null,'','/?host=' + room)
      await start(data,room,slot,1,invites)
    } catch (error) {
      $('mission-coop-note').textContent = t(error.message)
      button.disabled = false
    }
  }
  $('campaign-view').hidden = false
  render()
  menuAudio(data)
}

async function openLocal(data,slug,mode,difficulty,colors,humans,coalitions,seconds) {
  const response = await fetch('/local-maps.json')
  if (!response.ok) throw Error('Abra o cenário pelo endereço local do anfitrião.')
  const maps = await response.json()
  if (!Object.hasOwn(maps,slug)) throw Error('Cenário indisponível.')
  return playLocal(data,maps[slug],mode,difficulty,colors,'/',humans,coalitions,seconds)
}

// Vitórias contra a IA por mapa do jogo: {mapa: maior dificuldade vencida}. Liberam multiplayer e "assistir".
const victoriesKey = 'battalion-nativo-vitorias'
function mapVictories() {
  try { return JSON.parse(stored(victoriesKey) ?? '{}') ?? {} } catch { return {} }
}
function recordVictory(id,difficulty) {
  const victories = mapVictories()
  if (!(id in victories) || difficulty > victories[id]) victories[id] = difficulty
  store(victoriesKey,JSON.stringify(victories))
}

async function playLocal(data,board,mode,difficulty,colors,back,
  humans = mode === 'spectator' ? 0 : mode === 'hotseat' ? colors.length : 1, coalitions = Boolean(board.coalitions),
  seconds = storedAiTime(), {sideDifficulty, onFinish, mapId, resume} = {}) {
  // Vitória contra a IA num mapa do jogo libera o multiplayer e o modo assistir nesse mapa.
  const practice = developerMode() && mode !== 'spectator'
  const unlock = mapId && mode === 'ai' && !practice ? result => { if (result.victory) recordVictory(mapId,difficulty) } : undefined
  const counted = !practice && mode !== 'spectator' && !back.startsWith('/?editor')
  const finished = onFinish
  onFinish = result => {
    finished?.(result)
    unlock?.(result)
    if (counted) recordMatch(mode === 'hotseat' ? 'local' : 'ia',result)
  }
  // Salvamento automático a cada turno do jogador (não vale para o modo assistir nem para o teste do editor).
  const onSave = mode === 'spectator' || back.startsWith('/?editor') ? undefined : engine => engine ?
    saveMatch({kind:'local',title:board.title,board,mode,difficulty,colors,back,humans,coalitions,seconds,
      sideDifficulty,mapId,engine}) : clearSavedMatch()
  const setup = scenarioMatch(board,colors,humans,coalitions)
  const profile = humans > 0 ? await loadProfile() : null
  const teams = setup.colors.map((color,index)=>({name:data.aiSides?.[index+1]?.label ?? t('Equipe {n}',{n:index+1}),color,
    allies:setup.alliances[index]?.map(side=>side-1).join(','),
    avatar:avatarsFor(index),
    // A equipe 1 (o jogador deste computador) aparece com o nome e a foto do perfil.
    ...(index === 0 && profile ? {name:profile.name || t('Equipe {n}',{n:1}),photo:profile.avatar || undefined} : {})}))
  const mission = {board:setup.board,teams,events:[]}
  $('scenario-view').hidden = true
  $('native-editor').hidden = true
  const link = $('player-view').querySelector('header a')
  link.href = back
  link.textContent = t(back.startsWith('/?editor') ? '← Editor de mapas' :
    back.startsWith('/?partida') ? '← Partida avulsa' : '← Menu')
  const transport = campaignTransport(data,mission,difficulty,
    {mode,back,humans,aiTime:seconds,sideDifficulty,onFinish,onSave,resume,practice,fastAI,turnLimit:aiTurnLimit()})
  await showMatch(data,setup.board,mode === 'spectator' ? 0 : 1,transport)
}

function setupGenerator(data,choose) {
  const dialog = $('map-generator'), teamCount = $('generator-teams'), computerCount = $('generator-ai')
  const use = $('generator-use'), reroll = $('generator-reroll'), preview = $('generator-preview')
  const islands = $('generator-islands'), veins = $('generator-veins')
  const widthInput = $('generator-width'), heightInput = $('generator-height')
  const weights = terrainWeights.map(([name,title,value])=>{
    const label = document.createElement('label')
    const input = document.createElement('input')
    const output = document.createElement('output')
    input.type = 'range'
    input.min = 0
    input.max = 100
    input.value = output.value = value
    input.oninput = () => {
      output.value = input.value
      use.disabled = true
      $('generator-status').textContent = t('Gere outra prévia para aplicar os pesos.')
    }
    label.append(t(title),input,output)
    $('generator-weights').append(label)
    return [name,input]
  })
  function updateTeams() {
    const previous = Number(computerCount.value || 1)
    computerCount.replaceChildren(...Array.from({length:Number(teamCount.value)+1},(_,i)=>new Option(i,i)))
    computerCount.value = Math.min(previous,Number(teamCount.value))
  }
  let board, recipe, generation = 0
  const images = {}
  async function regenerate() {
    const job = ++generation
    reroll.disabled = use.disabled = true
    const status = $('generator-status')
    status.textContent = t('Gerando prévia…')
    try {
      const settings = mapRecipe({seed:crypto.getRandomValues(new Uint32Array(1))[0],
        width:widthInput.valueAsNumber,height:heightInput.valueAsNumber,teams:Number(teamCount.value),islands:islands.checked,
        veins:Number(veins.value),weights:Object.fromEntries(weights.map(([name,input])=>[name,input.valueAsNumber]))})
      const next = generateMap(data,settings)
      const missing = new Set(next.tiles.flatMap(([,art])=>art[1]).filter(asset=>!images[asset]))
      Object.assign(images,await loadImages(Object.fromEntries([...missing].map(name=>[name,data.assets[name]]))))
      if (job !== generation) return
      const ctx = preview.getContext('2d')
      // Mapas retangulares ficam centralizados na prévia quadrada.
      const tile = Math.min(preview.width/next.width,preview.height/next.height)
      const x0 = (preview.width-next.width*tile)/2, y0 = (preview.height-next.height*tile)/2
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0,0,preview.width,preview.height)
      for (const [cell,[,art]] of next.tiles.entries()) {
        terrainArt(ctx,images,terrainVariant(art,cell),0,x0+cell%next.width*tile,y0+Math.floor(cell/next.width)*tile,tile,tile)
      }
      for (const unit of next.units.filter(unit=>unit.name === 'Warmachine')) {
        const x = x0+(unit.cell%next.width+.5)*tile, y = y0+(Math.floor(unit.cell/next.width)+.5)*tile
        ctx.beginPath()
        ctx.arc(x,y,Math.max(3,tile*.6),0,2*Math.PI)
        ctx.fillStyle = '#'+palette[unit.side-1][1].slice(2)
        ctx.strokeStyle = '#101812'
        ctx.fill()
        ctx.stroke()
      }
      board = next
      recipe = settings
      status.textContent = t('{w} × {h} · {n} bases',{w:board.width,h:board.height,n:board.slots})
      use.disabled = Number(teamCount.value) !== recipe.teams ||
        widthInput.valueAsNumber !== recipe.width || heightInput.valueAsNumber !== recipe.height ||
        islands.checked !== recipe.islands || Number(veins.value) !== recipe.veins ||
        weights.some(([name,input])=>input.valueAsNumber !== recipe.weights[name])
    } catch (error) { if (job === generation) status.textContent = t(error.message) }
    finally { if (job === generation) reroll.disabled = false }
  }
  updateTeams()
  reroll.onclick = regenerate
  // Formato: atalhos de tamanho ou largura/altura livres (16 a 100). Mapa pequeno com muitas equipes é o modo caos.
  const shape = $('generator-size')
  const showChaos = () => {
    const side = Math.sqrt(widthInput.valueAsNumber*heightInput.valueAsNumber)
    $('generator-chaos').hidden = side >= minimumSize(Number(teamCount.value))
  }
  const fixSide = input => {
    const value = Math.round(input.valueAsNumber)
    input.value = String(Number.isFinite(value) ? Math.min(maxSide,Math.max(minSide,value)) : 32)
  }
  teamCount.onchange = () => { updateTeams(); showChaos(); void regenerate() }
  shape.onchange = () => {
    if (shape.value !== 'custom') {
      const [width,height] = shape.value.split('x')
      widthInput.value = width
      heightInput.value = height
    }
    showChaos()
    void regenerate()
  }
  for (const input of [widthInput,heightInput]) input.onchange = () => {
    fixSide(input)
    const preset = widthInput.value+'x'+heightInput.value
    shape.value = [...shape.options].some(option=>option.value === preset) ? preset : 'custom'
    showChaos()
    void regenerate()
  }
  islands.onchange = veins.onchange = regenerate
  $('open-generator').onclick = () => {
    dialog.showModal()
    if (!board) void regenerate()
  }
  use.onclick = () => {
    choose(board,recipe,board.slots-Number(computerCount.value))
    dialog.close()
  }
}

// Partida de avaliação aberta pelo treinador: IA treinada (equipe 1) x IA padrão (equipe 2), sem bônus de dano.
// ?avaliacao=<slug do mapa> | procedural | (vazio: sorteia entre mapas fixos de 2 equipes e procedural)
async function openEvaluation(data) {
  const response = await fetch('/ia-avaliacao.json')
  const trained = response.ok ? await response.json() : null
  if (!trained?.params) throw Error('Nenhum perfil de avaliação disponível. Abra pelo treinador da IA tática.')
  const maps = await (await fetch('/local-maps.json')).json()
  const duel = Object.entries(maps).filter(([,board])=>scenarioSlots(board) === 2 && !board.islands).map(([slug])=>slug)
  let choice = query.get('avaliacao')
  if (!choice || (choice !== 'procedural' && !duel.includes(choice))) {
    const options = [...duel,'procedural']
    choice = options[crypto.getRandomValues(new Uint32Array(1))[0] % options.length]
  }
  const board = choice === 'procedural' ?
    generateMap(data,mapRecipe({seed:crypto.getRandomValues(new Uint32Array(1))[0],size:32,teams:2})) : maps[choice]
  data.aiSides = {
    1:{difficulty:1,profile:{format:2,params:trained.params},label:t('IA treinada (geração {n})',{n:trained.generation ?? '?'})},
    2:{difficulty:2,engine:'padrao',profile:null,label:t('IA padrão')},
  }
  return playLocal(data,board,'spectator',1,['ff00ff00','ff0000ff'],'/',0,false)
}

// Atalho para jogar contra a IA treinada: ?jogar=procedural (padrão) ou ?jogar=<slug de mapa de 2 equipes>.
async function openQuickMatch(data) {
  if (!data.aiProfile?.params) throw Error('Nenhuma IA treinada ativa.')
  const choice = query.get('jogar') || 'procedural'
  const board = choice === 'procedural' ?
    generateMap(data,mapRecipe({seed:crypto.getRandomValues(new Uint32Array(1))[0],size:32,teams:2})) :
    (await (await fetch('/local-maps.json')).json())[choice]
  if (!board) throw Error('Cenário indisponível.')
  data.aiSides = {2:{difficulty:1,profile:data.aiProfile,
    label:t('IA treinada (geração {n})',{n:data.aiProfile.generation ?? '?'})}}
  return playLocal(data,board,'ai',1,['ff00ff00','ff0000ff'],'/',1,false)
}

async function open() {
  await loadLanguage()
  translatePage()
  const ghosts = query.get('campanha') === 'ghosts' || query.get('editor') === 'ghosts' || query.get('continuar') === 'ghosts'
  const resource = await fetch(ghosts ? '/dados-ghosts.json' : '/dados.json')
  if (!resource.ok) throw Error('Os recursos do Battalion estão indisponíveis.')
  const data = await resource.json()
  // Convite curto (?sala=CÓDIGO): o servidor devolve a sala; o endereço fica só com o código.
  const code = query.get('sala')
  let guestRoom = query.get('guest')
  if (code) {
    if (!/^[A-Z0-9]{6}$/i.test(code)) throw Error('Código de sala inválido.')
    guestRoom = (await (await request('code/' + code.toUpperCase())).json()).room
  } else if (guestRoom) history.replaceState(null,'',location.pathname)
  if (guestRoom) {
    if (!/^[a-f0-9]{24}$/.test(guestRoom)) throw Error('Abra o convite gerado pelo anfitrião.')
    const key = 'battalion-nativo-' + guestRoom
    // A vaga fica guardada mesmo fechando a aba: reabrir o convite volta para a mesma equipe (reconexão).
    let slot = stored(key) ?? sessionStorage.getItem(key)
    if (slot) {
      try { await request('lobby/' + guestRoom + '/' + slot) }
      catch { slot = null }
    }
    if (!slot) {
      // Sala cheia ou partida já começada: entra como espectador (assiste e usa o chat).
      try { slot = await (await request('join/' + guestRoom,{method:'POST'})).text() }
      catch (error) {
        if (!/cheia/.test(error.message)) throw error
        slot = await (await request('watch/' + guestRoom,{method:'POST'})).text()
      }
    }
    store(key,slot)
    return start(data,guestRoom,slot,2)
  }
  try {
    const profile = await fetch('/ia-treinada.json')
    if (profile.ok) data.aiProfile = await profile.json()
  } catch {}
  if (query.has('avaliacao')) return openEvaluation(data)
  if (query.has('jogar')) return openQuickMatch(data)
  if (query.has('continuar')) return openSaved(data)
  if (query.has('campanha')) return openCampaign(data)
  if (query.has('editor')) {
    const {openEditor} = await import('./editor.js')
    const back = ghosts ? '/?editor=ghosts' : '/?editor'
    $('edit-difficulty').value = storedDifficulty()
    return openEditor(data,ghosts,(board,mode,difficulty)=>playLocal(data,board,mode,difficulty,
      ['ff00ff00','ff0000ff','ffff0000','ff008080'].slice(0,Math.max(...board.units.map(unit=>unit.side))),back))
  }
  const hostRoom = query.get('host')
  const previous = hostRoom && sessionStorage.getItem('battalion-nativo-host-' + hostRoom)
  if (hostRoom) {
    try {
      const session = previous ? JSON.parse(previous) :
        await (await request('host-session/' + hostRoom)).json()
      const {slot,invites} = session
      await request('lobby/' + hostRoom)
      sessionStorage.setItem('battalion-nativo-host-' + hostRoom,JSON.stringify(session))
      return start(data,hostRoom,slot,1,invites)
    } catch { sessionStorage.removeItem('battalion-nativo-host-' + hostRoom) }
  }
  if (query.has('partida') || query.has('cenarios')) return openSkirmish(data)
  return openHome(data)
}

// Mapas personalizados: rascunho do editor (Vengeance) e mapas importados de arquivos .json.
const importedKey = 'battalion-nativo-mapas-importados'
const validBoard = board => board && typeof board === 'object' && Number.isInteger(board.width) && Number.isInteger(board.height) &&
  board.width >= 4 && board.width <= 40 && board.height >= 4 && board.height <= 40 &&
  Array.isArray(board.tiles) && board.tiles.length === board.width*board.height && Array.isArray(board.units) &&
  board.units.some(unit=>unit?.name === 'Warmachine')
const boardSlots = board => board.slots ?? Math.max(2,...board.units.map(unit=>Number(unit.side) || 1))
function readImported() {
  try {
    const list = JSON.parse(stored(importedKey) ?? '[]')
    return Array.isArray(list) ? list.filter(validBoard) : []
  } catch { return [] }
}

const modeSlugs = {ia:'ai',local:'hotseat',online:'lan',ias:'spectator'}
const modeNames = {ai:'ia',hotseat:'local',lan:'online',spectator:'ias'}
const modeTitles = {ai:'Contra a IA',hotseat:'Mesmo dispositivo',lan:'Multiplayer',spectator:'Assistir às IAs'}
const modeHints = {
  ai:'Você comanda a equipe 1. As outras equipes ficam com a IA.',
  hotseat:'Os jogadores revezam no mesmo computador. Equipes sem jogador ficam com a IA. Mapas do jogo liberam depois de vencê-los contra a IA.',
  lan:'Abre uma sala com convites para a rede local ou para a internet. Mapas do jogo liberam depois de vencê-los contra a IA; mapas personalizados não entram.',
  spectator:'Somente IAs jogam, cada equipe com a dificuldade que você escolher. Mapas do jogo liberam depois de vencê-los contra a IA.',
}

async function openSkirmish(data) {
  setupSettings(data)
  menuAudio(data)
  const mode = $('scenario-mode'), difficulty = $('scenario-difficulty'), colors = $('scenario-colors')
  const humans = $('scenario-humans'), coalitions = $('scenario-coalitions')
  const selectedColors = teamColors.slice()
  mode.value = modeSlugs[query.get('partida')] ?? 'ai'
  difficulty.value = storedDifficulty()
  difficulty.onchange = () => store(difficultyKey,difficulty.value)
  let localMaps = {}
  try { localMaps = await (await fetch('/local-maps.json')).json() } catch {}

  // Cada entrada: {id, board, kind: game | arena | procedural | editor | imported}.
  const gameMaps = [...Object.entries(data.maps).map(([id,board])=>({id,board,kind:'game'})),{id:'arena',board:data.arena,kind:'arena'}]
  let customMaps = [], generated, picked
  function loadCustom() {
    const procedural = customMaps.find(entry=>entry.kind === 'procedural')
    customMaps = []
    if (procedural) customMaps.push(procedural)
    try {
      const draft = JSON.parse(stored('battalion-native-map'))
      if (validBoard(draft)) customMaps.push({id:'editor',board:{...draft,title:draft.title || 'Mapa do editor'},kind:'editor'})
    } catch {}
    readImported().forEach((board,index)=>customMaps.push({id:'imported:'+index,board,kind:'imported',index}))
  }
  loadCustom()
  const entries = () => [...gameMaps,...customMaps]
  const fullBoard = entry => entry.kind === 'game' || entry.kind === 'arena' ? localMaps[entry.id] ?? entry.board : entry.board
  const slotsOf = entry => entry.kind === 'game' || entry.kind === 'arena' ? scenarioSlots(entry.board) : boardSlots(entry.board)
  // Mapas do jogo: multiplayer e "assistir às IAs" liberam depois de vencer o mapa contra a IA (qualquer dificuldade).
  const victories = mapVictories()
  const won = entry => entry.kind === 'game' && entry.id in victories
  const locked = (entry,current = mode.value) => entry.kind === 'game' && current !== 'ai' && !won(entry)
  const allowed = (entry,current = mode.value) => entry.kind === 'arena' ? current === 'spectator' :
    locked(entry,current) ? false :
    current === 'lan' ? ['game','procedural'].includes(entry.kind) : true
  const reason = entry => t(entry.kind === 'arena' ? 'A arena é só para assistir às IAs.' :
    locked(entry) ? 'Vença este mapa contra a IA (em qualquer dificuldade) para liberar.' :
    'Mapas personalizados não entram no multiplayer.')
  const levelNames = ['Fácil','Normal','Difícil']
  const teamLevels = teamColors.map(()=>storedDifficulty())

  const humanCount = () => mode.value === 'ai' ? 1 : mode.value === 'spectator' ? 0 : Number(humans.value)
  // No modo assistir, cada equipe escolhe a própria dificuldade (na lista de cores).
  const showDifficulty = () => {
    $('local-difficulty').hidden = !picked || humanCount() >= slotsOf(picked) || mode.value === 'spectator'
  }

  function mapButton(entry) {
    const row = document.createElement('div')
    row.className = 'map-row'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'map-choice'
    const title = document.createElement('strong')
    const info = document.createElement('span')
    title.textContent = t(entry.board.title || 'Mapa sem nome')
    const kind = {arena:'Arena de IAs',procedural:'Procedural',editor:'Rascunho do editor',imported:'Importado'}[entry.kind]
    const status = won(entry) ? '✓ '+t('Vencido ({x})',{x:t(levelNames[victories[entry.id]])}) :
      locked(entry) ? '🔒 '+t('Vença contra a IA') : ''
    info.textContent = [kind && t(kind),t('{n} equipes',{n:slotsOf(entry)}),entry.board.width+' × '+entry.board.height,status]
      .filter(Boolean).join(' · ')
    button.append(title,info)
    const enabled = allowed(entry)
    button.disabled = !enabled
    if (!enabled) button.title = reason(entry)
    button.setAttribute('aria-pressed',String(picked === entry))
    button.onclick = () => { picked = entry; humans.value = ''; render() }
    row.append(button)
    if (entry.kind === 'imported') {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'map-remove'
      remove.textContent = '✕'
      remove.setAttribute('aria-label',t('Remover {name}',{name:title.textContent}))
      remove.title = t('Remover este mapa importado')
      remove.onclick = () => {
        const list = readImported()
        list.splice(entry.index,1)
        store(importedKey,JSON.stringify(list))
        if (picked === entry) picked = null
        loadCustom()
        render()
      }
      row.append(remove)
    }
    return row
  }

  // Carrega só as texturas de terreno usadas pelo mapa da prévia.
  const images = {}
  let previewJob = 0
  async function drawPreview() {
    const job = ++previewJob
    const canvas = $('scenario-preview'), ctx = canvas.getContext('2d')
    ctx.clearRect(0,0,canvas.width,canvas.height)
    if (!picked) return
    const board = fullBoard(picked)
    $('preview-title').textContent = t(board.title || 'Mapa sem nome')
    $('preview-info').textContent = t('{n} equipes',{n:slotsOf(picked)})+` · ${board.width} × ${board.height}`
    const missing = [...new Set(board.tiles.flatMap(([,art])=>art[1]))].filter(name=>!images[name] && data.assets[name])
    if (missing.length) {
      try { Object.assign(images,await loadImages(Object.fromEntries(missing.map(name=>[name,data.assets[name]])))) }
      catch { return }
      if (job !== previewJob) return
    }
    const tile = Math.min(canvas.width/board.width,canvas.height/board.height)
    const x0 = (canvas.width-board.width*tile)/2, y0 = (canvas.height-board.height*tile)/2
    ctx.imageSmoothingEnabled = false
    for (const [cell,[,art]] of board.tiles.entries()) {
      terrainArt(ctx,images,terrainVariant(art,cell),0,x0+cell%board.width*tile,y0+Math.floor(cell/board.width)*tile,tile,tile)
    }
    for (const unit of (board.units ?? []).filter(unit=>unit.name === 'Warmachine')) {
      ctx.beginPath()
      ctx.arc(x0+(unit.cell%board.width+.5)*tile,y0+(Math.floor(unit.cell/board.width)+.5)*tile,Math.max(4,tile*.75),0,2*Math.PI)
      ctx.fillStyle = '#'+(selectedColors[unit.side-1] ?? 'ffffffff').slice(2)
      ctx.strokeStyle = '#101812'
      ctx.lineWidth = 2
      ctx.fill()
      ctx.stroke()
    }
  }

  function render() {
    if (!picked || !allowed(picked) || !entries().includes(picked)) picked = entries().find(entry=>allowed(entry)) ?? null
    $('skirmish-title').textContent = t(modeTitles[mode.value])
    $('mode-hint').textContent = t(modeHints[mode.value])
    for (const tab of document.querySelectorAll('[data-mode]')) tab.setAttribute('aria-pressed',String(tab.dataset.mode === mode.value))
    history.replaceState(null,'','/?partida='+modeNames[mode.value])
    $('scenario-list').replaceChildren(...gameMaps.map(mapButton))
    $('custom-list').replaceChildren(...customMaps.map(mapButton))
    $('custom-empty').hidden = customMaps.length > 0
    const play = $('scenario-play')
    play.disabled = !picked
    play.textContent = t(mode.value === 'lan' ? 'Abrir sala multiplayer' : mode.value === 'spectator' ? 'Assistir à partida' : 'Jogar')
    if (!picked) { $('local-humans').hidden = $('local-coalitions').hidden = $('coalition-teams').hidden = true; colors.hidden = true; drawPreview(); return }
    const board = picked.board, slots = slotsOf(picked)
    const previous = Number(humans.value)
    humans.replaceChildren(...Array.from({length:slots-1},(_,index)=>new Option(String(index+2),String(index+2))))
    humans.value = String(previous >= 2 && previous <= slots ? previous : slots === 3 ? 3 : 2)
    $('local-humans').hidden = slots <= 2 || ['ai','spectator'].includes(mode.value)
    $('local-coalitions').hidden = !board.coalitions || picked.kind !== 'game'
    $('coalition-teams').hidden = $('local-coalitions').hidden || !coalitions.checked
    showDifficulty()
    colors.hidden = mode.value === 'lan'
    colors.replaceChildren(...selectedColors.slice(0,slots).map((color,index)=>{
      const label = document.createElement('label')
      const swatch = document.createElement('span')
      swatch.className = 'swatch'
      swatch.style.background = '#'+color.slice(2)
      label.append(swatch,t('Equipe {n}',{n:index+1})+' ')
      const select = document.createElement('select')
      select.replaceChildren(...palette.map(([name,value])=>new Option(t(name),value)))
      select.value = color
      select.onchange = () => { selectedColors[index] = select.value; swatch.style.background = '#'+select.value.slice(2); drawPreview() }
      label.append(select)
      if (mode.value === 'spectator') {
        const level = document.createElement('select')
        level.setAttribute('aria-label',t('Dificuldade da IA da equipe {n}',{n:index+1}))
        level.replaceChildren(...levelNames.map((name,value)=>new Option(t(name),value)))
        level.value = teamLevels[index]
        level.onchange = () => { teamLevels[index] = Number(level.value) }
        label.append(level)
      }
      return label
    }))
    drawPreview()
  }

  for (const tab of document.querySelectorAll('[data-mode]')) tab.onclick = () => { mode.value = tab.dataset.mode; render() }
  humans.onchange = showDifficulty
  coalitions.onchange = () => { $('coalition-teams').hidden = !coalitions.checked }
  // Assistir um replay salvo no fim de uma partida avulsa.
  $('open-replay').onchange = async event => {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 60_000_000) throw Error('Arquivo grande demais para um replay.')
      const replay = JSON.parse(await file.text())
      if (!validReplay(replay)) throw Error('Este arquivo não é um replay do Battalion.')
      $('scenario-view').hidden = true
      $('player-view').querySelector('header a').href = '/?partida=ias'
      $('player-view').querySelector('header a').textContent = t('← Partida avulsa')
      await showMatch(data,replay.board,0,replayTransport(data,replay,{speed:() => fastAI() ? 3 : 1}))
    } catch (error) { $('import-status').textContent = t(error.message) }
  }
  $('import-map').onchange = async event => {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 2_000_000) throw Error('Arquivo grande demais para um mapa.')
      const board = JSON.parse(await file.text())
      if (!validBoard(board)) throw Error('Este arquivo não é um mapa do editor do Battalion.')
      board.title = board.title || file.name.replace(/\.json$/i,'')
      const list = readImported()
      list.push(board)
      try { localStorage.setItem(importedKey,JSON.stringify(list)) }
      catch { throw Error('Sem espaço no navegador para guardar mais mapas.') }
      loadCustom()
      picked = customMaps.at(-1)
      $('import-status').textContent = t('Mapa “{name}” importado.',{name:board.title})
      render()
    } catch (error) { $('import-status').textContent = t(error.message) }
  }
  setupGenerator(data,(board,recipe,count)=>{
    generated = recipe
    customMaps = customMaps.filter(entry=>entry.kind !== 'procedural')
    picked = {id:'procedural',board,kind:'procedural'}
    customMaps.unshift(picked)
    mode.value = count === 0 ? 'spectator' : count === 1 ? 'ai' : mode.value === 'lan' ? 'lan' : 'hotseat'
    render()
    if (count >= 2) humans.value = String(count)
    showDifficulty()
  })
  $('scenario-view').hidden = false
  render()
  if (query.has('gerar')) $('open-generator').click()
  if (query.get('mapas') === 'personalizados') $('custom-heading').scrollIntoView({block:'start'})

  $('scenario-play').onclick = async () => {
    $('scenario-play').disabled = true
    try {
      const entry = picked, board = entry.board
      const seconds = storedAiTime()
      const back = '/?partida='+modeNames[mode.value]
      if (mode.value !== 'lan') {
        const teams = selectedColors.slice(0,slotsOf(entry))
        if (new Set(teams).size !== teams.length) throw Error('Escolha cores diferentes para as equipes.')
        const level = Number(difficulty.value)
        const extra = {
          sideDifficulty:mode.value === 'spectator' ? teamLevels.slice(0,teams.length) : undefined,
          mapId:entry.kind === 'game' ? entry.id : undefined,
        }
        if (entry.kind === 'game' || entry.kind === 'arena') {
          if (!localMaps[entry.id]) throw Error('Abra o cenário pelo endereço local do anfitrião.')
          return await playLocal(data,localMaps[entry.id],mode.value,level,teams,back,humanCount(),coalitions.checked,seconds,extra)
        }
        return await playLocal(data,board,mode.value,level,teams,back,humanCount(),false,seconds,extra)
      }
      const procedural = entry.kind === 'procedural'
      const settings = {map:procedural ? Object.keys(data.maps).length : Object.keys(data.maps).indexOf(entry.id),
        humans:humanCount(),coalitions:coalitions.checked,difficulty:Number(difficulty.value),aiTime:seconds,
        generated:procedural ? generated : undefined}
      const {room,slot,invites} = await (await request('create',{method:'POST',body:JSON.stringify(settings)})).json()
      sessionStorage.setItem('battalion-nativo-host-' + room,JSON.stringify({slot,invites}))
      history.replaceState(null,'','/?host=' + room)
      await start(data,room,slot,1,invites)
    } catch (error) { showError(error) }
    finally { $('scenario-play').disabled = false }
  }
}

open().catch(showError)
