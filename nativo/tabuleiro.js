import { bindCamera } from './camera.js'
import { activeSides, allied, attackPath, attackRating, attackThreats, buildCells, buildCost, canCounter, canRepair, canTakeTurn, damageAmount, distance, enemyJammers, factoryAt, firingRange,
  isRanged, jammingZone, legalMovePath, neighbors, reachable, repairPrice, terrainAt, transportOptions, unitFor } from './partida.js'
import { movementDirection, movementDuration, movementPose } from './movimento.js'
import { WIPEOUT_STEP, combatTimeline, destructionFade, wipeoutDuration } from './combate.js'
import { showWarmachineMenu, unitStatDetails } from './construcao.js'
import { matchAudio } from './audio.js'
import { classicBoard, reconHeight, viewport } from './visao.js'
import { t } from './idioma.js'
import { downloadReplay } from './replay.js'
import { showReport } from './relatorio.js'
import { createWeatherPainter, weatherText } from './clima-tela.js'
import { saveLastReplay } from './salvamento.js'
import { TILE, canvasBuffer, colorize, drawTooltip, frame, loadImages, terrainArt, terrainVariant } from './graficos.js'
export { colorize, frame, loadImages, terrainArt, terrainVariant }
import { createMatchChat } from './chat.js'
import { bindShortcuts } from './atalhos.js'

const angles = {right:0,down:90,left:180,up:270}
const deployment = {
  up:[0,-1,'wm_build_up'], right:[1,0,'wm_build_side'], down:[0,1,'wm_build_down'],
  left:[-1,0,'wm_build_side'], cancel:[0,0,'wm_build_cancel'],
}
const threatColor = lethal => lethal ? '#ff6154' : '#ffdf46'
const oreImages = {'Ore Deposit':'ore_deposit_v1','Depleted Ore Deposit':'depleted_ore_deposit_v1'}
const buttons = {
  undo:['undo_move_button',580,170,28,40], next:['nextUnitButton',618,170,33,40],
  options:['optionsButton',653,170,28,40], end:['endturnbutton',570,515,126,71],
}
// Ícones do menu da unidade (quadros: 0 desabilitado, 1 normal, 2 mouse em cima, 3 pressionado).
const actions = {
  extract:['unitExtract',36,29], repair:['unitRepair',36,29], build:['unitBuild',36,29], unload:['unitUnload',36,29],
  capture:['marker',56,56], cancel:['unitCancel',18,15],
  'Leviathan Barge':['unitLeviathan',36,29], 'Albatross Transport':['unitAlbatross',36,29],
}
const $ = id => document.getElementById(id)
export async function play(data, base, side, transport) {
  const { rules, palettes } = data
  const tiles = base.tiles.map(([name,art],cell) => [name,terrainVariant(art,cell)])
  const map = {...base,tiles}
  const canvas = $('game'), ctx = canvas.getContext('2d',{alpha:false}), status = $('lan-status')
  const stage = $('stage'), player = $('player-view')
  ctx.imageSmoothingEnabled = false
  const images = await loadImages(data.assets)
  const teamImages = new Map(), spentImages = new WeakMap()
  const terrainLayer = canvasBuffer(1,1), terrainCtx = terrainLayer.getContext('2d',{alpha:false})
  let terrainView, oreSignature
  const cellX = cell => cell % map.width * TILE
  const cellY = cell => Math.floor(cell / map.width) * TILE
  const mini = canvasBuffer(map.width * 4,map.height * 4)
  const miniCtx = mini.getContext('2d')
  for (const [i,[,art]] of tiles.entries()) {
    terrainArt(miniCtx,images,art,0,i % map.width * 4,Math.floor(i / map.width) * 4,4,4)
  }
  const miniScale = Math.min(121 / mini.width,120 / mini.height,transport.advance ? 2 : Infinity)
  const miniWidth = mini.width * miniScale, miniHeight = mini.height * miniScale
  const miniY = 66 - miniHeight / 2
  const worldWidth = map.width * TILE, worldHeight = map.height * TILE
  let view = viewport(worldWidth,worldHeight,700,600)
  let pointer
  const miniLeft = () => view.width - classicBoard + 627 - miniWidth / 2
  const point = ({clientX,clientY}) => {
    const rect = canvas.getBoundingClientRect()
    return [(clientX-rect.left)*view.screenWidth/rect.width,(clientY-rect.top)*view.screenHeight/rect.height]
  }
  // terrainUnder: casa da unidade clicada duas vezes; a barra de baixo mostra o terreno embaixo dela.
  let terrainUnder = -1
  // Clima (chuva, respingos, cristas no mar e nuvens), desenhado em pixel art no ritmo do mapa.
  const weatherPainter = createWeatherPainter()
  let weatherMoving = false, lightningVersion = -1
  let replayOffered = false
  // Barra da partida (cronômetro e tropas): declarada no começo porque updateStatus pode rodar cedo.
  const hud = $('match-hud')
  const openedAt = performance.now()
  let clock = null
  let state, selected = null, hover = -1, pinnedTerrain = -1, commands = [], openActions = false, building = null
  let panX = 0, panY = 0, zoom = 1, previous = null, requested = false
  let pending = false, pendingTarget, connected = false, motion, strike, error = ''
  const resourceEffects = new Map()
  let shownResourceVersion = -1
  let turnBannerTimer, resultTimer
  // Animação de início de turno do Flash (StartTurnAnimation): faixa na cor da equipe, nome e rodada deslizando.
  let turnAnimation = null, weatherAnimation = null
  // Fotos de perfil dos jogadores (data URL local ou endereço da sala na rede), carregadas uma vez.
  // GIF: os quadros são decodificados um a um (ImageDecoder), porque o navegador não anima um GIF desenhado no canvas.
  const photoCache = new Map()
  let animatedPhoto = false, photoTimer
  async function loadPhoto(url,entry) {
    // Foto local vem como data URL (o fetch dela seria bloqueado pela política de segurança da página).
    const inline = url.match(/^data:(image\/[a-z]+);base64,(.*)$/)
    const blob = inline ? new Blob([Uint8Array.from(atob(inline[2]),char=>char.charCodeAt(0))],{type:inline[1]}) :
      await (await fetch(url)).blob()
    if (blob.type === 'image/gif' && 'ImageDecoder' in globalThis) {
      try {
        const decoder = new ImageDecoder({data:await blob.arrayBuffer(),type:'image/gif'})
        await decoder.tracks.ready
        await decoder.completed
        const frames = []
        // GIF grande (até 20 MB): cada quadro é reduzido ao tamanho do retrato e há um teto de quadros,
        // para não ocupar memória demais.
        const count = Math.min(decoder.tracks.selectedTrack.frameCount,600)
        for (let index=0; index<count; index++) {
          const {image} = await decoder.decode({frameIndex:index})
          const scale = Math.min(1,Math.max(260/image.displayWidth,300/image.displayHeight))
          frames.push({bitmap:await createImageBitmap(image,{resizeWidth:Math.max(1,Math.round(image.displayWidth*scale)),
            resizeHeight:Math.max(1,Math.round(image.displayHeight*scale)),resizeQuality:'medium'}),
          duration:Math.max(20,(image.duration ?? 100000)/1000)})
          image.close()
        }
        decoder.close()
        entry.frames = frames
        entry.total = frames.reduce((sum,frame)=>sum+frame.duration,0)
        return
      } catch {}
    }
    entry.frames = [{bitmap:await createImageBitmap(blob),duration:Infinity}]
  }
  // Devolve o quadro atual da foto (ou nada enquanto carrega).
  function profilePhoto(url,now = performance.now()) {
    let entry = photoCache.get(url)
    if (!entry) {
      entry = {frames:null,total:0}
      photoCache.set(url,entry)
      loadPhoto(url,entry).then(schedule,()=>{entry.failed = true})
    }
    if (!entry.frames?.length) return null
    if (entry.frames.length === 1) return entry.frames[0].bitmap
    animatedPhoto = true
    let time = now % entry.total
    for (const frame of entry.frames) {
      if (time < frame.duration) return frame.bitmap
      time -= frame.duration
    }
    return entry.frames.at(-1).bitmap
  }
  let chatStart = 0, wholeLine = false
  const music = matchAudio(data.assets)
  const makeSound = music.effect
  const canAct = () => connected && state && canTakeTurn(state,side) && !state.blocked && !state.dialog &&
    !pending && !motion && !strike
  const modifierBar = $('terrain-modifiers'), tooltip = $('terrain-tooltip')
  const directionBar = $('wm-directions')
  const directionButtons = [...directionBar.querySelectorAll('button')]
  let directionLayout
  let lastModifiers = ''
  const chosen = () => state?.units.find(unit => unit.id === selected)
  let traced
  let movementPreview, targetPreview, dangerPreview
  const emptyMap = new Map()
  const trackedPath = unit => traced?.version === state.version && traced.unit === unit.id ? traced.path : undefined
  const color = team => '#' + state.colors[team - 1].slice(2)
  const victoryText = winner => {
    const teams = state.colors.map((_,index)=>index+1).filter(team=>allied(state,team,winner))
    return teams.length > 1 ? t('Equipes {teams} venceram',{teams:teams.join(t(' e '))}) :
      t('{name} venceu',{name:t(state.teams?.[winner-1]?.name) ?? t('Equipe {n}',{n:winner})})
  }
  const cssButton = key => document.querySelector('.game-button.' + key)
  const normalize = () => {
    panX = Math.max(0,Math.min(worldWidth - view.width / zoom,panX))
    panY = Math.max(0,Math.min(worldHeight - view.height / zoom,panY))
  }
  const center = (x,y) => {
    panX = x - view.width / zoom / 2
    panY = y - view.height / zoom / 2
    normalize()
  }
  function setZoom(step) {
    if (!step) return state ? zoom : 0
    if (step === 2 && previous) {
      const [oldZoom,oldX,oldY] = previous
      previous = null
      zoom = oldZoom
      resizeView()
      panX = oldX
      panY = oldY
    } else if (step === 2) {
      previous = [zoom,panX,panY]
      resizeView()
    } else {
      const centerX = panX + view.width / zoom / 2, centerY = panY + view.height / zoom / 2
      const wasOverview = Boolean(previous)
      previous = null
      zoom = Math.max(view.fit,Math.min(2,zoom * 1.25 ** step))
      center(centerX,centerY)
      if (wasOverview) resizeView()
    }
    normalize()
    schedule()
    return zoom
  }

  function place(element,x,y,width,height) {
    Object.assign(element.style,{
      left:x/view.screenWidth*100+'%',top:y/view.screenHeight*100+'%',
      width:width/view.screenWidth*100+'%',height:height/view.screenHeight*100+'%',
    })
  }

  function resizeView() {
    const full = document.fullscreenElement === player
    const margin = full ? 0 : 32
    const chromeHeight = stage.getBoundingClientRect().top - player.getBoundingClientRect().top
    const target = viewport(worldWidth,worldHeight,Math.max(1,window.innerWidth-margin),
      Math.max(1,window.innerHeight-margin-chromeHeight),Boolean(previous))
    const oldX = panX + view.width/zoom/2, oldY = panY + view.height/zoom/2
    view = target
    if (!full) player.style.width = view.displayWidth + 'px'
    else player.style.removeProperty('width')
    stage.style.width = view.displayWidth + 'px'
    stage.style.aspectRatio = view.screenWidth + '/' + view.screenHeight
    if (canvas.width !== view.screenWidth || canvas.height !== view.screenHeight) {
      canvas.width = view.screenWidth
      canvas.height = view.screenHeight
      ctx.imageSmoothingEnabled = false
    }
    if (previous) zoom = view.fit
    else zoom = Math.max(view.fit,zoom)
    center(oldX,oldY)
    const dx = view.width-classicBoard, dy = view.height-classicBoard
    for (const [id,[,x,y,w,h]] of Object.entries(buttons)) place(cssButton(id),x+dx,y+(id === 'end' ? dy : 0),w,h)
    place(modifierBar,0,578+dy,view.width,20)
    tooltip.style.right = (1-view.width/view.screenWidth)*100 + '%'
    tooltip.style.bottom = reconHeight/view.screenHeight*100 + '%'
    schedule()
  }

  function schedule() {
    if (requested) return
    requested = true
    requestAnimationFrame(now => {
      requested = false
      if (state) paint(now)
    })
  }

  function teamImage(name,team,structure = false) {
    if (!team) return images[name]
    const to = state.colors[team - 1]
    const key = name + '|' + to
    if (!teamImages.has(key)) {
      teamImages.set(key,colorize(images[name],palettes[structure ? 'building' : 'ffff0000'],palettes[to]))
    }
    return teamImages.get(key)
  }

  function spentImage(image) {
    if (!spentImages.has(image)) {
      const sprite = canvasBuffer(image.width,image.height)
      const pixels = sprite.getContext('2d')
      pixels.drawImage(image,0,0)
      pixels.globalCompositeOperation = 'source-atop'
      pixels.fillStyle = 'rgba(0,0,0,.4)'
      pixels.fillRect(0,0,image.width,image.height)
      spentImages.set(image,sprite)
    }
    return spentImages.get(image)
  }

  function paintTerrain(idle) {
    if (terrainView?.view !== view || terrainView.idle !== idle || terrainView.ore !== oreSignature ||
        terrainView.zoom !== zoom || terrainView.x !== panX || terrainView.y !== panY) {
      if (terrainLayer.width !== view.width || terrainLayer.height !== view.height) {
        terrainLayer.width = view.width
        terrainLayer.height = view.height
      }
      terrainCtx.setTransform(1,0,0,1,0,0)
      terrainCtx.imageSmoothingEnabled = false
      terrainCtx.fillStyle = '#000'
      terrainCtx.fillRect(0,0,view.width,view.height)
      terrainCtx.setTransform(zoom,0,0,zoom,-panX*zoom,-panY*zoom)
      const x0 = Math.floor(panX/TILE), x1 = Math.min(map.width,Math.ceil((panX+view.width/zoom)/TILE))
      const y0 = Math.floor(panY/TILE), y1 = Math.min(map.height,Math.ceil((panY+view.height/zoom)/TILE)+1)
      for (let y=y0; y<y1; y++) for (let x=x0; x<x1; x++) {
        const cell = y * map.width + x
        const ore = state.ore[cell]
        terrainArt(terrainCtx,images,ore ? ['single',[oreImages[ore]]] : tiles[cell][1],idle,x*TILE,y*TILE)
        if (y === 0) terrainCtx.drawImage(images.border_top,x*TILE,y*TILE)
        else if (y === map.height-1) terrainCtx.drawImage(images.border_bottom,x*TILE,y*TILE-2)
        if (x === 0) terrainCtx.drawImage(images.border_left,x*TILE,y*TILE)
        else if (x === map.width-1) terrainCtx.drawImage(images.border_right,x*TILE,y*TILE)
      }
      terrainView = {view,idle,ore:oreSignature,zoom,x:panX,y:panY}
    }
    ctx.drawImage(terrainLayer,0,0)
  }

  function movesFor(unit,inspect = false) {
    if (movementPreview?.state !== state || movementPreview.unit !== unit || movementPreview.inspect !== inspect) {
      const mover = inspect ? {...unit,moved:false,fired:false,disabled:false} : unit
      movementPreview = {state,unit,inspect,moves:reachable(rules,map,state,mover)}
    }
    return movementPreview.moves
  }

  function targetsFor(unit,moves,trace) {
    if (targetPreview?.state !== state || targetPreview.unit !== unit || targetPreview.trace !== trace) {
      const targets = new Map()
      for (const target of state.units) {
        if (target.side === side) continue
        const route = attackPath(rules,map,state,unit,target,moves,trace)
        if (route) targets.set(target.cell,route)
      }
      targetPreview = {state,unit,trace,targets}
    }
    return targetPreview.targets
  }

  function threatsAt(unit,cell) {
    if (dangerPreview?.state !== state || dangerPreview.unit !== unit || dangerPreview.cell !== cell) {
      dangerPreview = {state,unit,cell,threats:attackThreats(rules,map,state,unit,cell)}
    }
    return dangerPreview.threats
  }

  // Faixa animada (estilo do Flash): troca de turno e, depois dela, os avisos de clima com a mesma animação.
  function paintTurnAnimation(now) {
    if (turnAnimation) {
      if (!paintBanner(turnAnimation,now)) turnAnimation = null
      return
    }
    if (weatherAnimation && now >= weatherAnimation.start) {
      if (!paintBanner(weatherAnimation,now)) weatherAnimation = null
    } else if (weatherAnimation) schedule()
  }
  function paintBanner(turnAnimation,now) {
    const elapsed = (now - turnAnimation.start)/1000
    if (elapsed >= 4.6 || state.dialog || state.result) return false
    // Tweener usa easeOutExpo por padrão.
    const ease = t => t >= 1 ? 1 : 1 - Math.pow(2,-10*t)
    const tween = (from,to,start,duration) => elapsed <= start ? from : from + (to-from)*ease((elapsed-start)/duration)
    const dx = (view.screenWidth - 700)/2, dy = (view.screenHeight - 600)/2
    const scaleY = elapsed < 3 ? tween(.1,1,0,1.5) : tween(1,0,3,.5)
    ctx.save()
    if (scaleY > 0) {
      const height = 85*scaleY
      ctx.fillStyle = 'rgba(0,0,0,.15)'
      ctx.strokeStyle = turnAnimation.color
      ctx.lineWidth = Math.max(.5,4*scaleY)
      ctx.fillRect(-20,dy+285-height/2,view.screenWidth+40,height)
      ctx.strokeRect(-20,dy+285-height/2,view.screenWidth+40,height)
    }
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#fff'
    ctx.shadowColor = '#000'
    ctx.shadowOffsetX = ctx.shadowOffsetY = 3
    ctx.shadowBlur = 4
    const nameX = elapsed < 2 ? tween(3700,30,0,1) : tween(30,-700,2,2)
    const roundX = elapsed < 2.5 ? tween(3700,30,.5,1) : tween(30,-700,2.5,2)
    ctx.font = '44px Battalion, Georgia, serif'
    ctx.fillText(turnAnimation.name,dx+nameX,dy+247)
    ctx.font = '20px Battalion, Georgia, serif'
    ctx.fillText(turnAnimation.round,dx+roundX,dy+302)
    ctx.restore()
    schedule()
    return true
  }

  function text(value,x,y,font = '10px Tahoma',color = '#000',align = 'left') {
    ctx.font = font
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.fillText(value,x,y)
  }

  function paintResourceGains(now,right,bottom) {
    let visible = false
    for (const [cell,{amount,start}] of resourceEffects) {
      const elapsed = Math.max(0,now-start)
      if (elapsed >= 1000) {resourceEffects.delete(cell); continue}
      const x = cellX(cell)+TILE/2, y = cellY(cell)+TILE/2
      if (x+30 < panX || x-30 > right || y+14 < panY || y-14 > bottom) continue
      const progress = Math.max(0,Math.min(1,(elapsed-100)/500))
      ctx.save()
      ctx.globalAlpha = Math.min(1,(1000-elapsed)/200)
      ctx.font = `bold ${18*(.6+.4*progress)}px Battalion, Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#008000'
      ctx.lineWidth = 3
      ctx.fillStyle = '#fff'
      ctx.strokeText('$'+amount,x,y-5*progress)
      ctx.fillText('$'+amount,x,y-5*progress)
      ctx.restore()
      visible = true
    }
    return visible
  }

  function wrap(text, width, font) {
    ctx.font = font
    const lines = []
    for (const paragraph of text.split(/\n|\\n/)) {
      let current = ''
      for (const word of paragraph.split(/\s+/)) {
        if (current && ctx.measureText(current + ' ' + word).width > width) {
          lines.push(current)
          current = ''
        }
        current = current ? current + ' ' + word : word
      }
      lines.push(current)
    }
    return lines
  }

  function campaignLayer(now) {
    const continueButton = $('campaign-continue')
    continueButton.hidden = !state.dialog && !state.result
    if (state.dialog) {
      const chat = state.dialog
      const y = view.height-154
      place(continueButton,0,y,view.width,154)
      if (chat.handoff) {
        ctx.fillStyle = '#161b17'
        ctx.fillRect(0,0,view.screenWidth,view.screenHeight)
      }
      ctx.save()
      ctx.translate(0,y)
      ctx.save()
      ctx.globalAlpha = .65
      ctx.fillStyle = ctx.createPattern(images.wood_texture,'repeat')
      ctx.fillRect(0,0,view.width,154)
      ctx.restore()
      frame(ctx,images.avatars,data.avatars[chat.avatar] ?? 11,2,2,130,150)
      const color = '#' + chat.color.slice(-6)
      ctx.fillStyle = color
      ctx.fillRect(134,2,5,150)
      ctx.strokeStyle = '#d8b97d'
      ctx.strokeRect(.5,.5,view.width-1,153)
      ctx.save()
      ctx.shadowColor = '#12130d'
      ctx.shadowOffsetX = 1.5
      ctx.shadowOffsetY = 1.5
      const font = '17px Battalion, Georgia, serif'
      const lines = [t(chat.sender) + ':', ...wrap(t(chat.message),view.width-154,font)]
      let budget = wholeLine ? Infinity : Math.floor((now-chatStart)/24)
      for (const [index,line] of lines.entries()) {
        if (budget <= 0) break
        text(line.slice(0,budget),144,20+index*20,font,'#fff')
        budget -= line.length + 1
      }
      ctx.restore()
      frame(ctx,images.continueButton,1,view.width-160,109,152,41)
      ctx.restore()
      if (budget <= 0 && !wholeLine) schedule()
    }
    if (state.result) {
      const dx = (view.screenWidth - 700)/2, dy = (view.screenHeight - 600)/2
      place(continueButton,dx+274,dy+391,152,41)
      ctx.fillStyle = 'rgba(0,0,0,.66)'
      ctx.fillRect(0,0,view.screenWidth,view.screenHeight)
      ctx.save()
      ctx.translate(dx,dy)
      if (state.result.campaign) {
        ctx.drawImage(images[state.result.victory ? 'banner_victory' : 'banner_defeat'],0,169)
        text(t('Score:') + ' ' + state.result.score,350,314,'28px Battalion, Georgia, serif','#fff','center')
      } else {
        if (side !== 0 && !transport.hotseat) {
          ctx.drawImage(images[state.result.victory ? 'banner_victory' : 'banner_defeat'],0,169)
          text(t(state.result.victory ? 'Vitória' : 'Derrota'),350,285,'32px Battalion, Georgia, serif','#fff','center')
        }
        text(victoryText(state.result.winner),350,314,'28px Battalion, Georgia, serif','#fff','center')
      }
      if (state.result.medal) frame(ctx,images.medal,state.result.medal,330,328,30,30,40,40)
      frame(ctx,images.continueButton,1,274,391,152,41)
      ctx.restore()
    }
  }

  function unitFrame(unit,x,y,now,animation,alpha,spent = false) {
    const shape = rules.units[unit.name].sprite
    const image = teamImage(shape.image,unit.side)
    const {wait,frames} = data.movement[animation]
    const index = frames[Math.floor(now / wait) % frames.length]
    ctx.globalAlpha = alpha
    frame(ctx,spent ? spentImage(image) : image,index,x,y + TILE - shape.height,shape.width,shape.height)
    ctx.globalAlpha = 1
  }

  function healthBar(x,y,width,height,ratio) {
    const segment = (width-5)/4
    ctx.fillStyle = '#191b18'
    ctx.fillRect(x,y,width,height)
    for (let index=0; index<4; index++) {
      const left = x+1+index*(segment+1)
      ctx.fillStyle = '#493b2b'
      ctx.fillRect(left,y+1,segment,height-2)
      ctx.fillStyle = `hsl(${Math.round(120*ratio)}, 72%, 55%)`
      ctx.fillRect(left,y+1,segment*Math.max(0,Math.min(1,ratio*4-index)),height-2)
    }
  }

  function spriteUnit(unit,x,y,now,moveDirection) {
    const direction = unit.facing ?? (unit.left ? 'left' : 'right')
    const alpha = unit.cloaked ? .5 : 1
    unitFrame(unit,x,y,now,moveDirection ?? direction + '_idle',alpha*(unit.fade ?? 1),
      !moveDirection && (unit.moved || unit.fired))
  }

  function paintPath(unit,path,now) {
    const cells = [unit.cell,...path]
    let incoming
    for (const [index,cell] of cells.entries()) {
      const outgoing = index+1 < cells.length ? angles[movementDirection(map.width,cell,cells[index+1])] : incoming
      const kind = index === 0 ? 'start' : index === cells.length-1 ? 'end' : incoming === outgoing ? 'straight' : 'turn'
      const rotation = kind === 'turn' && outgoing === (incoming+270)%360 ? incoming+90 : incoming ?? outgoing
      ctx.save()
      ctx.globalAlpha = .55
      ctx.translate(cellX(cell)+TILE/2,cellY(cell)+TILE/2)
      ctx.rotate(rotation*Math.PI/180)
      ctx.drawImage(images['movement_'+kind],-TILE/2,-TILE/2)
      ctx.restore()
      incoming = outgoing
    }
    const destination = cells.at(-1)
    const facing = movementDirection(map.width,cells.at(-2),destination)
    unitFrame(unit,cellX(destination),cellY(destination),now,facing+'_idle',.36)
  }

  function traceBorder(cells) {
    ctx.beginPath()
    for (const cell of cells) {
      const x = cellX(cell), y = cellY(cell), endX = x+TILE, endY = y+TILE
      if (x === 0 || !cells.has(cell-1)) {ctx.moveTo(x,y); ctx.lineTo(x,endY)}
      if (endX === worldWidth || !cells.has(cell+1)) {ctx.moveTo(endX,y); ctx.lineTo(endX,endY)}
      if (!cells.has(cell-map.width)) {ctx.moveTo(x,y); ctx.lineTo(endX,y)}
      if (!cells.has(cell+map.width)) {ctx.moveTo(x,endY); ctx.lineTo(endX,endY)}
    }
    ctx.stroke()
  }

  function rangedCells(unit,from) {
    const cells = new Set()
    if (terrainAt(rules,map,state,from)[1].mods.includes('Canopy')) return cells
    const [min,max] = firingRange(rules,map,state,unit,from)
    const col = from % map.width, row = Math.floor(from / map.width)
    for (let y=Math.max(0,row-max); y<=Math.min(map.height-1,row+max); y++) {
      for (let x=Math.max(0,col-max); x<=Math.min(map.width-1,col+max); x++) {
        const range = Math.abs(x-col)+Math.abs(y-row)
        if (range >= min && range <= max) cells.add(y*map.width+x)
      }
    }
    return cells
  }

  function paintSelection(unit,moves,targets,preview,inspect = false) {
    const spec = rules.units[unit.name]
    const ranged = isRanged(spec)
    const range = ranged && (inspect || !unit.moved) ? rangedCells(unit,unit.cell) : new Set()
    if (!ranged && spec.damage) {
      for (const origin of [unit.cell,...moves.keys()]) {
        for (const cell of neighbors(map,origin)) {
          if (cell !== unit.cell && !moves.has(cell)) range.add(cell)
        }
      }
    }
    for (const cell of moves.keys()) {
      ctx.drawImage(images[range.has(cell) ? 'selectMixed' : 'select'],cellX(cell),cellY(cell))
      range.delete(cell)
    }
    if (!inspect) for (const enemy of state.units) range.delete(enemy.cell)
    for (const cell of range) ctx.drawImage(images.selectOrange,cellX(cell),cellY(cell))
    for (const cell of targets.keys()) ctx.drawImage(images.selectRed,cellX(cell),cellY(cell))

    if (ranged && preview?.length) {
      const cells = rangedCells(unit,preview.at(-1))
      ctx.fillStyle = ctx.strokeStyle = 'rgba(255,0,0,.1)'
      ctx.lineWidth = 1
      for (const cell of cells) ctx.fillRect(cellX(cell),cellY(cell),TILE,TILE)
      traceBorder(cells)
    }
  }

  function badge(symbol,x,y,color) {
    ctx.fillStyle = '#211e19'
    ctx.beginPath()
    ctx.arc(x,y,7,0,2*Math.PI)
    ctx.fill()
    text(symbol,x,y+4,'bold 13px Tahoma',color,'center')
  }

  function rememberRoute(cell) {
    const unit = chosen()
    if (!unit || !mine(unit) || !canAct() || building || openActions) return
    if (cell === unit.cell) {
      traced = undefined
      return
    }
    // Keep the player's last route while crossing an invalid cell or hovering a target.
    if (cell < 0 || state.units.some(item => item.cell === cell)) return
    const prior = trackedPath(unit)
    if (prior?.at(-1) === cell) return
    const previous = prior?.indexOf(cell) ?? -1
    const candidate = previous >= 0 ? prior.slice(0,previous+1) : [...(prior ?? []),cell]
    const path = legalMovePath(rules,map,state,unit,candidate) ? candidate : movesFor(unit).get(cell)
    if (path) traced = {unit:unit.id,version:state.version,path}
  }

  function direction(a,b) {
    const x = cellX(b) - cellX(a), y = cellY(b) - cellY(a)
    return Math.abs(x) >= Math.abs(y) ? x >= 0 ? 'right' : 'left' : y >= 0 ? 'down' : 'up'
  }

  function paintJamming(unit, destination = unit?.cell) {
    if (!unit) return
    const spec = rules.units[unit.name]
    const jammers = spec.mods.includes('Jamming') ? [destination] :
      spec.movementType === 'wings' ? enemyJammers(rules,state,unit.side).map(item=>item.cell) : []
    if (!jammers.length) return
    const cells = new Set(jammers.flatMap(cell => jammingZone(map,cell)))
    ctx.fillStyle = 'rgba(255,255,255,.1)'
    ctx.strokeStyle = 'rgba(255,255,255,.5)'
    ctx.lineWidth = 2
    for (const cell of cells) ctx.fillRect(cellX(cell),cellY(cell),TILE,TILE)
    traceBorder(cells)
  }

  function paintReconIcons(ground,unit) {
    const atlas = data.terrainInfo
    const spec = unit && rules.units[unit.name]
    if (state.dialog || state.result) {modifierBar.hidden = tooltip.hidden = true; return}
    const dx = view.width-classicBoard
    const entries = []
    if (spec) {
      const [min,max] = firingRange(rules,map,state,unit,unit.cell)
      for (const [index,{icon,name,description}] of unitStatDetails(spec,min,max).entries()) {
        entries.push({x:272+dx+index*78,index:atlas.frames[icon] ?? atlas.frames.none,name,description})
      }
    }
    const modifiers = spec ? atlas.unitModifiers : atlas.modifiers
    const names = (spec?.mods ?? ground?.[1].mods ?? []).filter(name=>Object.hasOwn(modifiers,name))
    const spacing = Math.min(21,(view.width-(476+dx)) / Math.max(1,names.length))
    for (const [index,name] of names.entries()) {
      entries.push({x:476+dx+index*spacing,name,width:spacing-1,...modifiers[name]})
    }
    const key = JSON.stringify(entries)
    if (key !== lastModifiers) {
      lastModifiers = key
      tooltip.hidden = true
      modifierBar.replaceChildren(...entries.map(({name,description,x,width}) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.setAttribute('aria-label',t(name))
        button.setAttribute('aria-describedby','terrain-tooltip')
        button.style.left = x/view.width*100+'%'
        button.style.width = (width ?? atlas.width)/view.width*100+'%'
        const show = () => {
          tooltip.querySelector('strong').textContent = t(name)
          tooltip.querySelector('p').textContent = t(description)
          tooltip.hidden = false
        }
        const hide = () => {tooltip.hidden = true}
        button.onpointerenter = button.onfocus = button.onclick = show
        button.onpointerleave = button.onblur = hide
        return button
      }))
    }
    modifierBar.hidden = !entries.length
    if (ground || unit) text(t('Modifiers:'),476+dx,570,'10px Tahoma','#1c1a13')
    for (const {index,x,width=atlas.width} of entries) {
      frame(ctx,images[atlas.image],index,x,578,atlas.width,atlas.height,width,width)
    }
  }

  // Equipe derrotada: as unidades que sobraram explodem uma por uma (WIPEOUT_STEP ms entre cada).
  let wipeout = null
  const wipeoutBlast = 330, wipeoutGone = 490
  function startWipeout(action,next,delay) {
    const origin = action.cell ?? action.eliminated[0].cell
    const units = action.eliminated.slice().sort((a,b)=>distance(map.width,origin,a.cell) - distance(map.width,origin,b.cell))
    wipeout = {units,start:performance.now() + delay,sounded:-1}
  }
  function advanceWipeout(now) {
    if (!wipeout) return
    const elapsed = now - wipeout.start
    const index = Math.floor(elapsed / WIPEOUT_STEP)
    if (elapsed >= 0 && index > wipeout.sounded && index < wipeout.units.length) {
      wipeout.sounded = index
      makeSound('ExplosionSound')
    }
    const effect = data.explosions.Explosion
    if (elapsed > (wipeout.units.length - 1) * WIPEOUT_STEP + Math.max(wipeoutGone,effect.wait*effect.frames.length)) {
      wipeout = null
      updateStatus()
    }
  }
  // Unidades da equipe derrotada que ainda não explodiram (somem com o mesmo esmaecer do combate).
  function wipeoutUnits(now,units) {
    if (!wipeout) return units
    const present = new Set(units.map(unit=>unit.id))
    const extra = wipeout.units.flatMap((unit,index)=>{
      const blast = wipeout.start + index * WIPEOUT_STEP
      if (present.has(unit.id) || now >= blast + wipeoutGone) return []
      const fade = now < blast + wipeoutBlast ? 1 : Math.min(1,(blast + wipeoutGone - now) / destructionFade)
      return [{...unit,moved:false,fired:false,repairing:false,fade}]
    })
    return extra.length ? [...units,...extra] : units
  }
  function paintWipeout(now) {
    if (!wipeout) return
    const effect = data.explosions.Explosion
    wipeout.units.forEach((unit,index)=>{
      const frameIndex = effect.frames[Math.floor((now - wipeout.start - index * WIPEOUT_STEP) / effect.wait)]
      if (now >= wipeout.start + index * WIPEOUT_STEP && frameIndex !== undefined) {
        frame(ctx,images[effect.image],frameIndex,cellX(unit.cell),cellY(unit.cell) + TILE - effect.height,effect.width,effect.height)
      }
    })
  }

  function advanceStrike(now) {
    if (!strike) return
    const elapsed = Math.max(0,now - strike.start)
    if (elapsed >= strike.duration) {
      strike = null
      updateStatus()
      return
    }
    const hit = strike.hits.findLast(shot=>!shot.piercing && shot.start <= elapsed)
    if (strike.active !== hit) {
      strike.active = hit
      makeSound(hit.sound)
    }
    if (elapsed >= hit.impact && strike.soundedImpact !== hit &&
        (!hit.sound || strike.hits.some(other=>other.start === hit.start && other.hp === 0))) {
      strike.soundedImpact = hit
      makeSound('ExplosionSound')
    }
  }

  function battleUnits(now) {
    if (motion?.before) return motion.before
    if (!strike) return state.units
    const elapsed = now - strike.start
    const units = state.units.filter(unit=>!strike.participants.has(unit.id))
    for (const [id,unit] of strike.participants) {
      const hit = strike.hits.find(shot=>shot.target === id)
      if (hit && elapsed >= hit.disappears) continue
      const current = state.units.find(item=>item.id === id)
      const impacted = hit && elapsed >= hit.impact
      const hp = impacted ? hit.hp : unit.hp
      const fade = hit ? Math.min(1,(hit.disappears - elapsed) / destructionFade) : 1
      units.push({...current,...unit,hp,fade,repairing:!impacted && unit.repairing})
    }
    return units
  }

  function firing(now) {
    if (!strike?.active) return
    const { shooter, cell, start } = strike.active
    const sheet = rules.units[shooter.name].firing
    const sequence = sheet?.animations[direction(shooter.cell,cell) + '_firing']
    const elapsed = now - strike.start
    if (sequence) {
      const index = sequence.frames[Math.floor((elapsed-start)/sequence.wait)]
      if (index !== undefined) {
        const image = teamImage(sheet.image,shooter.side)
        frame(ctx,image,index,cellX(shooter.cell) + (TILE-sheet.width)/2,cellY(shooter.cell) + 100-sheet.height,
          sheet.width,sheet.height)
      }
    }
    for (const hit of strike.hits) {
      if (hit.start !== start) continue
      const {effect,cell,impact} = hit
      const index = effect.frames[Math.floor((elapsed-impact)/effect.wait)]
      if (index !== undefined) {
        frame(ctx,images[effect.image],index,cellX(cell),cellY(cell) + TILE - effect.height,effect.width,effect.height)
      }
    }
  }

  // Campanha em dupla: só as unidades deste jogador obedecem; as do parceiro aparecem como as de um aliado.
  function mine(unit) {
    if (!unit || unit.side !== side) return false
    const coop = state?.coop
    return !coop || (coop.owners[unit.id] ?? coop.you) === coop.you
  }

  // Telas de toque: menu da unidade e botão "!" 50% maiores, para o dedo acertar.
  const touchScale = globalThis.matchMedia?.('(pointer: coarse)').matches ? 1.5 : 1

  // Botão "!" que o Flash põe sobre a unidade selecionada; clicar nele abre o menu da unidade.
  function optionsButton(unit) {
    if (!unit || !mine(unit) || !canAct() || unit.fired || unit.disabled || openActions || building ||
        motion || strike || pending) return null
    const size = 24*touchScale
    return {x:cellX(unit.cell)+(TILE-size)/2,y:cellY(unit.cell)-5*touchScale,size}
  }

  function overOptions(button,[x,y]) {
    const wx = x/zoom + panX, wy = y/zoom + panY
    return wx >= button.x && wy >= button.y && wx < button.x+button.size && wy < button.y+button.size
  }

  // Menu da unidade como no Flash: os ícones aparecem mesmo indisponíveis (apagados), com a explicação na dica.
  function updateActions(unit) {
    if (!unit || !mine(unit) || !canAct() || unit.fired || unit.disabled || !openActions) return []
    const result = []
    const add = (type,enabled,title,text) => result.push({type,enabled,title:t(title),text})
    const spec = rules.units[unit.name]
    const [ground,terrain] = terrainAt(rules,map,state,unit.cell)
    const transport = transportOptions(rules,map,state,unit)
    const moved = t('Esta unidade já se moveu neste turno.')
    if (!unit.transported && spec.unitType === 'ground') {
      if (unit.name.includes('Commando')) {
        const ok = transport.includes('Albatross Transport')
        add('Albatross Transport',ok,ok ? 'Pedir Albatross' : 'Albatross indisponível',
          ok ? t('O Albatross busca esta unidade pelo ar.') : unit.moved ? moved :
            t('Capture um Air Control para pedir o Albatross.'))
      }
      if (spec.range > 0) {
        const ok = transport.includes('Leviathan Barge')
        add('Leviathan Barge',ok,ok ? 'Pedir Leviathan' : 'Leviathan indisponível',
          ok ? t('O Leviathan busca esta unidade pelo mar.') : unit.moved ? moved :
            !terrain.mods.includes('Shore') ? t('Fique numa casa de praia (Shore) para pedir o Leviathan.') :
              t('É preciso ter mar livre ao lado para pedir o Leviathan.'))
      }
    }
    if (unit.transported) {
      const ok = transport.includes('unload')
      add('unload',ok,ok ? 'Desembarcar' : 'Desembarque indisponível',
        ok ? t('Desembarca e posiciona a unidade {x}.',{x:t(unit.transported)}) :
          t('A unidade {x} não pode desembarcar nesta casa.',{x:t(unit.transported)}))
    }
    if (spec.mods.includes('Constructor')) {
      const options = Object.values(rules.units)
      const ok = !unit.moved && unit.credits >= 0 && options.some(other=>buildCells(rules,map,state,unit,other).length)
      const free = neighbors(map,unit.cell).some(cell=>!state.units.some(other=>other.cell === cell))
      add('build',ok,ok ? 'Construir' : 'Construção indisponível',
        ok ? t('Usa o minério da Warmachine para construir uma nova unidade.') : unit.moved ? moved :
          !free ? t('Construir exige ao menos 1 casa vizinha livre.') : t('Sem recursos.'))
    }
    if (spec.mods.includes('Extractor')) {
      const ore = ['Ore Deposit','Enriched Ore Deposit'].includes(ground)
      const ok = ore && !unit.moved && unit.credits >= 0
      add('extract',ok,ok ? 'Extrair recursos' : 'Extração indisponível',
        ok ? t('Extrai recursos desta casa.') : ore && unit.moved ? moved : t('Não há recursos para extrair nesta casa.'))
    }
    if (!unit.transported) {
      const ok = canRepair(rules,map,state,unit)
      const price = Math.round(repairPrice(rules,map,state,unit))
      add('repair',ok,ok ? 'Reparar' : 'Reparo indisponível',
        spec.mods.includes('Irreparable') ? t('Esta unidade nunca pode ser reparada.') :
          unit.hp >= spec.health ? t('A unidade está com a vida cheia.') : unit.moved ? moved :
          !ok ? t('Você precisa de ${n} para reparar esta unidade.',{n:price}) :
          price ? t('Inicia o reparo por ${n}.',{n:price}) : t('Repara até um quarto da vida da unidade.'))
    }
    if (!state.campaign && spec.mods.includes('Capture') &&
        state.structures.some(tile=>tile.cell === unit.cell && !allied(state,side,tile.side))) {
      add('capture',true,'Capturar',t('Começa a capturar esta propriedade.'))
    }
    const buttons = result.length, s = touchScale
    const width = buttons * 36 * s
    const x = Math.max(4,Math.min(view.width - width - 14,(cellX(unit.cell) - panX + TILE / 2) * zoom - width / 2))
    const y = Math.max(10*s,Math.min(view.height - 33*s,(cellY(unit.cell) - panY) * zoom - 14*s))
    const placed = result.map((item,index) => ({...item,x:x+index*36*s,y,w:36*s,h:29*s}))
    placed.push({type:'cancel',enabled:true,title:t('Cancelar'),text:t('Cancela a seleção da unidade.'),
      x:x+width-9*s,y:y-7*s,w:18*s,h:15*s,width,menuX:x})
    return placed
  }

  function paintActions(unit,cursor) {
    commands = updateActions(unit)
    if (!commands.length) return
    const close = commands.at(-1)
    ctx.save()
    if (close.width) {
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(close.menuX-3*touchScale,close.y+4*touchScale,close.width+6*touchScale,35*touchScale,6)
      ctx.fill()
      ctx.stroke()
    }
    let hovered
    for (const command of commands) {
      const {type,x,y,w,h,enabled} = command
      const over = cursor && cursor[0] >= x && cursor[1] >= y && cursor[0] < x+w && cursor[1] < y+h
      if (over) hovered = command
      const [asset,width,height] = actions[type]
      ctx.globalAlpha = enabled ? 1 : .7
      const index = !enabled ? 0 : over ? (pointer?.buttons ? 3 : 2) : 1
      if (type === 'capture') {
        frame(ctx,images[asset],0,x+4,y+1,width,height,28,27)
        if (over) {ctx.strokeStyle = '#4fd34a'; ctx.strokeRect(x+3,y+1,30,27)}
      } else frame(ctx,images[asset],index,x,y,width,height,w,h)
    }
    ctx.globalAlpha = 1
    if (hovered) tooltipBox(hovered.title,hovered.text,hovered.x+hovered.w/2,hovered.y+hovered.h+6)
    ctx.restore()
  }

  // Neblina de guerra: escurece as casas fora da visão da sua equipe (o estado já vem sem os inimigos de lá).
  // A borda é suave: uma máscara pequena (FOG_SCALE pixels por casa) desfocada e esticada sobre o mapa,
  // refeita só quando a visão muda. A margem de 1 casa repete a borda do mapa para o desfoque não clarear as beiradas.
  const FOG_SCALE = 8, FOG_BLUR = 4
  let fogCache = {key:'',image:null}
  function fogImage() {
    const key = state.fog.join(',')
    if (fogCache.key === key) return fogCache.image
    const seen = new Set(state.fog), w = map.width + 2, h = map.height + 2
    const mask = document.createElement('canvas')
    mask.width = w*FOG_SCALE
    mask.height = h*FOG_SCALE
    const mctx = mask.getContext('2d')
    mctx.fillStyle = '#080c0a'
    for (let row=0; row<h; row++) for (let col=0; col<w; col++) {
      const x = Math.min(map.width-1,Math.max(0,col-1)), y = Math.min(map.height-1,Math.max(0,row-1))
      if (!seen.has(y*map.width+x)) mctx.fillRect(col*FOG_SCALE,row*FOG_SCALE,FOG_SCALE,FOG_SCALE)
    }
    const soft = document.createElement('canvas')
    soft.width = mask.width
    soft.height = mask.height
    const sctx = soft.getContext('2d')
    sctx.filter = 'blur(' + FOG_BLUR + 'px)'
    sctx.drawImage(mask,0,0)
    fogCache = {key,image:soft}
    return soft
  }
  function paintFog() {
    if (!state.fog) return
    const image = fogImage()
    ctx.save()
    ctx.globalAlpha = .5
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(image,FOG_SCALE,FOG_SCALE,map.width*FOG_SCALE,map.height*FOG_SCALE,0,0,map.width*TILE,map.height*TILE)
    ctx.restore()
  }
  // Modos de vitória de teste: progresso na linha de status.
  function victoryProgress() {
    const victory = state?.victory
    if (!victory || state.winner) return ''
    const name = team => t(state.teams?.[team-1]?.name) ?? t('Equipe {n}',{n:team})
    if (victory.mode === 'rei') return victory.holder ?
      t('Refinaria central: {name} há {n} de {total} rodadas',{name:name(victory.holder),n:victory.count,total:victory.rounds}) :
      t('Segure a refinaria central por {total} rodadas para vencer',{total:victory.rounds})
    return t('Rodada {n} de {total}: vence quem tiver mais pontos',{n:state.round,total:victory.limit})
  }

  // Modo desenvolvedor (só partidas locais): aviso fixo e, ao mirar um inimigo, o dano previsto e o revide.
  function paintDamagePreview(unit,targets,cursorCell,cursor) {
    ctx.save()
    ctx.font = 'bold 10px Tahoma'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(28,26,19,.8)'
    ctx.fillRect(6,6,150,16)
    ctx.fillStyle = '#ffcf6a'
    ctx.fillText(t('MODO DESENVOLVEDOR'),12,18)
    ctx.restore()
    if (!unit || !cursor || !targets.has(cursorCell)) return
    const target = state.units.find(item=>item.cell === cursorCell)
    if (!target) return
    const route = targets.get(cursorCell)
    const attacker = {...unit,cell:route?.length ? route.at(-1) : unit.cell}
    const dealt = Math.min(target.hp,damageAmount(rules,map,state,attacker,target))
    const survivor = {...target,hp:target.hp-dealt}
    const returned = survivor.hp > 0 && canCounter(rules,map,state,attacker,survivor) ?
      Math.min(attacker.hp,damageAmount(rules,map,state,survivor,attacker,true)) : 0
    const lines = [t('Dano previsto: {n}',{n:dealt}) + (survivor.hp <= 0 ? ' · ' + t('destrói') : ''),
      returned ? t('Revide: {n}',{n:returned}) + (returned >= attacker.hp ? ' · ' + t('sua unidade cai') : '') : t('Sem revide')]
    const [x,y] = cursor
    const left = Math.min(view.width-170,x+18), top = Math.max(4,y-40)
    ctx.save()
    ctx.fillStyle = 'rgba(28,26,19,.92)'
    ctx.strokeStyle = '#ffcf6a'
    ctx.fillRect(left,top,164,36)
    ctx.strokeRect(left+.5,top+.5,163,35)
    ctx.font = '11px Tahoma'
    ctx.fillStyle = '#fff1c8'
    ctx.fillText(lines[0],left+7,top+15)
    ctx.fillStyle = returned ? '#ffb4a4' : '#cfe8c4'
    ctx.fillText(lines[1],left+7,top+29)
    ctx.restore()
  }

  const tooltipBox = (title,body,centerX,top) => drawTooltip(ctx,view,title,body,centerX,top)

  function drawSidebar(extraHeight) {
    const image = images.mainframe
    if (!extraHeight) {
      ctx.drawImage(image,546,0)
      return
    }
    const split = 506
    ctx.drawImage(image,0,0,image.width,split,546,0,image.width,split)
    const textureHeight = 60
    for (let y=0; y<extraHeight; y+=textureHeight) {
      const rows = Math.min(textureHeight,extraHeight-y)
      ctx.drawImage(image,0,520,image.width,rows,546,split+y,image.width,rows)
    }
    const rest = image.height-split
    ctx.drawImage(image,0,split,image.width,rest,546,split+extraHeight,image.width,rest)
  }

  function drawRecon(image,extraWidth) {
    if (!extraWidth) {
      ctx.drawImage(image,0,558)
      return
    }
    const split = 240
    ctx.drawImage(image,0,0,split,image.height,0,558,split,image.height)
    ctx.drawImage(image,split-1,0,1,image.height,split,558,extraWidth,image.height)
    const rest = image.width-split
    ctx.drawImage(image,split,0,rest,image.height,split+extraWidth,558,rest,image.height)
  }

  function paintDeployment(builder,moves) {
    const layout = []
    for (const button of directionButtons) {
      const direction = button.dataset.direction
      const [dx,dy,asset] = deployment[direction]
      const column = builder.cell%map.width + dx, row = Math.floor(builder.cell/map.width) + dy
      const cell = row*map.width+column
      const x = column*TILE, y = row*TILE
      const available = direction === 'cancel' ||
        column >= 0 && column < map.width && row >= 0 && row < map.height && moves.has(cell)
      if (!available) {
        layout.push(null)
        continue
      }
      const index = button.matches(':active') ? 3 : building.hover === cell || button.matches(':hover') ? 2 : 1
      const size = 40, inset = (TILE-size)/2
      const arrowX = x+(1-dx)*inset, arrowY = y+(1-dy)*inset
      ctx.save()
      if (direction === 'right') {
        ctx.translate(arrowX+size,arrowY)
        ctx.scale(-1,1)
        frame(ctx,images[asset],index,0,0,TILE,TILE,size,size)
      } else {
        frame(ctx,images[asset],index,arrowX,arrowY,TILE,TILE,size,size)
      }
      ctx.restore()
      const left = (x-panX)*zoom, top = (y-panY)*zoom
      const a = Math.max(0,left), b = Math.max(0,top)
      const width = Math.min(view.width,left+TILE*zoom)-a, height = Math.min(view.height,top+TILE*zoom)-b
      layout.push(width>0 && height>0 ? [cell,a,b,width,height] : null)
    }
    const key = JSON.stringify([view.screenWidth,view.screenHeight,layout])
    if (key !== directionLayout) {
      directionLayout = key
      for (const [index,button] of directionButtons.entries()) {
        const box = layout[index]
        button.hidden = !box
        if (box) {
          const [cell,x,y,width,height] = box
          button.dataset.cell = cell
          place(button,x,y,width,height)
        }
      }
    }
    directionBar.hidden = false
  }

  function paint(now) {
    const idle = Math.floor(now / 500)
    let pose, position
    if (motion) {
      const elapsed = Math.max(0,now-motion.start)
      const steps = motion.path.length-1
      const camera = motion.camera
      pose = motion.deployment ?
        elapsed < (camera ? 500 : 200) && {index:0,progress:Math.min(1,elapsed/200)} :
        movementPose(steps,elapsed)
      const {index,progress} = pose || {index:steps-1,progress:1}
      const from = motion.path[index], to = motion.path[index+1]
      position = {
        x:cellX(from)+(cellX(to)-cellX(from))*progress,
        y:cellY(from)+(cellY(to)-cellY(from))*progress,
        direction:movementDirection(map.width,from,to),
      }
      if (camera) {
        const ease = 1-(1-Math.min(1,elapsed/camera.duration))**3
        center(position.x+TILE/2,position.y+TILE/2)
        panX = camera.x+(panX-camera.x)*ease
        panY = camera.y+(panY-camera.y)*ease
        normalize()
      }
      if (!pose) {
        const follow = motion.attack
        motion = null
        if (follow) startStrike(follow,now)
        updateStatus()
      }
    }
    advanceStrike(now)
    advanceWipeout(now)
    const visibleUnits = wipeoutUnits(now,battleUnits(now))
    const unit = chosen()
    const cursorPosition = pointer && point(pointer)
    const cursorCell = cursorPosition ? cellAt(...cursorPosition) : -1
    if (cursorCell >= 0) hover = cursorCell
    const active = mine(unit) && !unit.disabled && canAct()
    const inspecting = unit && !mine(unit) && !state.dialog && !state.result && !motion && !strike && !pending
    const builder = building?.factory != null ? factoryAt(state,side,building.factory) : unit
    const warmachine = building?.unit != null && builder?.id === building.unit && canAct()
    const moves = building && builder && canAct()
      ? new Map(buildCells(rules,map,state,builder,rules.units[building.name]).map(cell=>[cell,[]]))
      : active || inspecting ? movesFor(unit,Boolean(inspecting)) : emptyMap
    const attacking = active && !building && !openActions
    const tracedPath = attacking ? trackedPath(unit) : undefined
    const targets = attacking ? targetsFor(unit,moves,tracedPath) : emptyMap
    const path = attacking ? targets.get(cursorCell) ??
      (tracedPath?.at(-1) === cursorCell ? tracedPath : moves.get(cursorCell)) : undefined
    const preview = warmachine && moves.has(building.hover) ? building.preview : null
    const threats = attacking ? threatsAt(unit,path?.at(-1) ?? unit.cell) :
      preview ? threatsAt(preview,building.hover) : emptyMap
    ctx.fillStyle = '#000'
    ctx.fillRect(0,0,view.screenWidth,view.screenHeight)
    paintTerrain(idle)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0,0,view.width,view.height)
    ctx.clip()
    ctx.scale(zoom,zoom)
    ctx.translate(-panX,-panY)
    const right = panX + view.width/zoom, bottom = panY + view.height/zoom
    const groundMoving = weatherPainter.paintGround(ctx,{weather:state.weather,map,tiles,idle,now,left:panX,top:panY,right,bottom})
    const visible = (x,y,width,height) => x < right && x + width > panX &&
      y + TILE - height < bottom && y + TILE > panY
    for (const tile of state.structures) {
      const sprite = rules.terrain[tile.name].sprite
      const x = cellX(tile.cell), y = cellY(tile.cell)
      if (!visible(x,y,images[sprite].width,images[sprite].height)) continue
      const image = teamImage(sprite,tile.side,true)
      ctx.drawImage(image,x,y + TILE - image.height)
    }
    if (inspecting || attacking && !unit.fired) paintSelection(unit,moves,targets,path,Boolean(inspecting))
    else if (!warmachine) for (const cell of moves.keys()) ctx.drawImage(images.select,cellX(cell),cellY(cell))
    for (const cell of state.highlights ?? []) ctx.drawImage(images.marker,cellX(cell),cellY(cell))
    if (!motion) paintJamming(unit ?? state.units.find(item => item.cell === hover),path?.at(-1))
    if (path?.length) paintPath(unit,path,now)
    const drawOrder = item => motion?.deployment && pose.progress < 1 && motion.unit === item.id ?
      motion.path[0]-.1 : item.cell
    for (const item of visibleUnits.slice().sort((a,b) => drawOrder(a)-drawOrder(b))) {
      let x = cellX(item.cell), y = cellY(item.cell)
      let moveDirection, spriteTime = now
      const deploying = motion?.deployment && motion.unit === item.id && pose.progress < 1
      if (motion?.unit === item.id && (!motion.deployment || deploying)) {
        moveDirection = position.direction
        spriteTime = Math.max(0,now - motion.start)
        x = position.x
        y = position.y
      }
      const spec = rules.units[item.name]
      if (!visible(x,y,spec.sprite.width,Math.max(TILE,spec.sprite.height))) continue
      if (unit?.id === item.id) ctx.drawImage(images[unit.side === side ? 'marker' : 'marker2'],x,y)
      const shot = strike?.active
      const animation = shot?.unit === item.id && spec.firing?.animations[direction(shot.shooter.cell,shot.cell) + '_firing']
      if (!animation || now - strike.start - shot.start >= animation.wait*animation.frames.length) {
        if (deploying) unitFrame(item,x,y,spriteTime,moveDirection+'_idle',item.cloaked ? .5 : 1)
        else spriteUnit(item,x,y,spriteTime,moveDirection)
      }
      if (item.repairing) ctx.drawImage(images.repairIcon,x-6,y+TILE-images.repairIcon.height-14)
      if (item.transported) {
        const cargo = rules.units[item.transported].sprite
        frame(ctx,teamImage(cargo.image,item.side),4,x+2,y+26,cargo.width,cargo.height,20,20)
      }
      if (!moveDirection && item.hp > 0 && spec.unitType === 'ground' &&
          terrainAt(rules,map,state,item.cell)[1].mods.includes('Shielded')) {
        ctx.drawImage(images.coverIcon,x,y+TILE-images.coverIcon.height)
      }
      if (item.hp > 0 && !deploying) healthBar(x+10,y+48,36,7,item.hp/spec.health)
      if (state.coop && item.side === side && !mine(item)) {
        badge(String(state.coop.owners[item.id] ?? ''),x+8,y+10,'#9fd3ff')
      }
      if (unit?.id === item.id && item.credits >= 0) {
        ctx.drawImage(images.wm_resources,x,y + 36)
        text(String(item.credits),x + 50,y + 50,'11px Tahoma','#fff','right')
      }
    }
    const movingAttack = motion?.attack
    const marked = pendingTarget ?? (movingAttack?.side === side ? movingAttack.cell : undefined) ??
      (strike?.side === side && now - strike.start < strike.hits[0].impact ? strike.hits[0].cell : undefined)
    if (marked !== undefined) ctx.drawImage(images.selectRed,cellX(marked),cellY(marked))
    if (threats.size) for (const enemy of visibleUnits) {
      if (!threats.has(enemy.id)) continue
      const x = cellX(enemy.cell), y = cellY(enemy.cell)
      if (!visible(x,y,TILE,TILE)) continue
      const rating = attackRating(rules,preview ?? unit,enemy)
      frame(ctx,images.attackTargets,[0,2,1][rating+1],x,y,TILE,TILE)
    }
    if (path?.length && threats.size) {
      const destination = path.at(-1)
      badge('!',cellX(destination)+TILE-9,cellY(destination)+8,threatColor(Array.from(threats.values()).includes(true)))
    }
    if (preview) {
      const cell = building.hover
      const facing = movementDirection(map.width,builder.cell,cell)
      unitFrame(preview,cellX(cell),cellY(cell),now,facing+'_idle',.5)
    }
    weatherMoving = weatherPainter.paintSky(ctx,{weather:state.weather,map,idle,now,left:panX,top:panY,right,bottom}) || groundMoving
    paintFog(right,bottom)
    // Raio por cima da neblina (o clarão é visto por todos).
    if (weatherPainter.paintLightning(ctx,{map,now,top:panY,left:panX,right,bottom,explosions:data.explosions,images})) weatherMoving = true
    if (warmachine) paintDeployment(builder,moves)
    else directionBar.hidden = true
    const options = optionsButton(unit)
    if (options && images.unitOptionsButton) {
      const over = cursorPosition && overOptions(options,cursorPosition)
      frame(ctx,images.unitOptionsButton,over ? (pointer?.buttons ? 3 : 2) : 1,options.x,options.y,24,24,options.size,options.size)
    }
    firing(now)
    paintWipeout(now)
    const showResources = !state.dialog && !state.result && paintResourceGains(now,right,bottom)
    ctx.restore()

    const extraWidth = view.width-classicBoard, extraHeight = view.height-classicBoard
    const miniX = miniLeft()-extraWidth
    ctx.save()
    ctx.translate(extraWidth,0)
    const turnTeam = state.teams?.[state.turn - 1]
    const photo = turnTeam?.photo && profilePhoto(turnTeam.photo,now)
    if (photo) {
      // Foto do perfil no lugar do retrato do comandante, recortada no centro (GIF continua animado).
      const scale = Math.max(130/photo.width,150/photo.height)
      const width = 130/scale, height = 150/scale
      ctx.fillStyle = '#1d261f'
      ctx.fillRect(566,239,130,150)
      ctx.drawImage(photo,(photo.width-width)/2,(photo.height-height)/2,width,height,566,239,130,150)
      ctx.strokeStyle = '#c9a75a'
      ctx.lineWidth = 2
      ctx.strokeRect(567,240,128,148)
    } else {
      frame(ctx,images.avatars,data.avatars[turnTeam?.avatar ??
        (state.turn === 1 ? 'yurik' : 'evil_durand')],566,239,130,150)
    }
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(627,66,64,65,0,0,2*Math.PI)
    ctx.clip()
    ctx.drawImage(mini,miniX,miniY,miniWidth,miniHeight)
    for (const item of [...state.structures,...visibleUnits]) {
      ctx.fillStyle = item.side ? color(item.side) : '#d4c180'
      ctx.fillRect(miniX + item.cell % map.width * 4*miniScale,miniY + Math.floor(item.cell/map.width) * 4*miniScale,2,2)
    }
    ctx.strokeStyle = '#f6e35a'
    ctx.strokeRect(miniX+panX/TILE*4*miniScale,miniY+panY/TILE*4*miniScale,
      Math.min(view.width/zoom/TILE*4*miniScale,miniWidth),Math.min(view.height/zoom/TILE*4*miniScale,miniHeight))
    ctx.restore()
    drawSidebar(extraHeight)
    text(t(map.title),630,150,'9px Tahoma','#1c1a13','center')
    const teamOrder = [state.turn,...state.colors.map((_,index)=>index+1).filter(team=>team !== state.turn)]
    // Até 4 equipes usam a placa original; com mais, as linhas encolhem para caber acima do botão de fim de turno.
    const rowHeight = Math.min(30,Math.floor((120+extraHeight)/teamOrder.length))
    for (const [index,team] of teamOrder.entries()) {
      const y = 390 + index*rowHeight
      const name = t(state.teams?.[team - 1]?.name) ?? t('Equipe {n}',{n:team})
      const label = team !== side && allied(state,team,side) ? name+' · '+t('Aliada') : name
      const ink = ['ff00ff00','fff5f5ff','ffd8ff00','ffffd800','ffffa500'].includes(state.colors[team - 1]) ? '#121812' : '#fff'
      ctx.fillStyle = color(team)
      if (rowHeight >= 30) {
        ctx.fillRect(560,y+2,140,24)
        ctx.drawImage(images.nameplate,549,y)
        text(label,577,y+17,'10px Tahoma',ink)
      } else {
        ctx.fillRect(556,y+1,140,rowHeight-2)
        ctx.strokeStyle = '#1c1a13'
        ctx.strokeRect(556.5,y+1.5,139,rowHeight-3)
        text(label,562,y+rowHeight/2+3.5,(rowHeight >= 16 ? 10 : 9)+'px Tahoma',ink)
      }
    }
    for (const [type,[asset,x,y,w,h]] of Object.entries(buttons)) {
      const button = cssButton(type)
      const index = button.disabled ? 0 : button.matches(':active') ? 3 : button.matches(':hover') ? 2 : 1
      frame(ctx,images[asset],index,x,y+(type === 'end' ? extraHeight : 0),w,h)
    }
    ctx.restore()

    ctx.save()
    ctx.translate(0,extraHeight)
    const inspectedCell = pinnedTerrain >= 0 ? pinnedTerrain : hover >= 0 ? hover : unit?.cell
    const showGround = terrainUnder >= 0 && inspectedCell === terrainUnder
    const inspected = showGround ? null :
      visibleUnits.find(item => item.id === unit?.id) ?? visibleUnits.find(item => item.cell === inspectedCell)
    const ground = inspectedCell !== undefined ? terrainAt(rules,map,state,inspectedCell) : null
    const info = inspected ? rules.units[inspected.name] : ground?.[1]
    const label = inspected?.name ?? ground?.[0]
    const structure = !inspected && state.structures.find(tile=>tile.cell === inspectedCell)
    drawRecon(images[inspected ? 'recon_unit' : info ? 'recon_terrain' : 'recon_none'],extraWidth)
    if (info) {
      const name = t(label === 'Factory' ? 'Warfactory' : label)
      const details = structure?.capturer ? ' · '+t('Captura')+' '+(8-structure.strength)+'/8' : ''
      const reserve = structure?.oilReserve != null ? ' · '+t('Reserva')+' $'+structure.oilReserve : ''
      text(name+reserve+details,40,570)
      ctx.save()
      ctx.beginPath()
      ctx.rect(4,565,31,30)
      ctx.clip()
      if (inspected) {
        const shape = info.sprite
        frame(ctx,teamImage(shape.image,inspected.side),4,4,565-shape.height/2+28,
          shape.width,shape.height,shape.width/2,shape.height/2)
      } else {
        if (structure) ctx.drawImage(teamImage(info.sprite,structure.side,true),4,565,31,30)
        else {
          const ore = state.ore[inspectedCell]
          terrainArt(ctx,images,ore ? ['single',[oreImages[ore]]] : tiles[inspectedCell][1],idle,4,565,31,30)
        }
      }
      ctx.restore()
      const words = t(info.description).split(' ')
      let line = '', row = 0
      ctx.font = '10px Tahoma'
      const limit = (inspected ? 205 : 382) + extraWidth
      for (const word of words) {
        if (ctx.measureText(line + word).width > limit) {
          text(line,40,583 + row++ * 11,'10px Tahoma','#f4ebcd')
          line = ''
          if (row === 2) break
        }
        line += word + ' '
      }
      if (row < 2) text(line,40,583 + row * 11,'10px Tahoma','#f4ebcd')
      if (inspected) {
        ctx.save()
        ctx.translate(extraWidth,0)
        const [min,max] = firingRange(rules,map,state,inspected,inspected.cell)
        const weapon = info.damage ? info.damage+(isRanged(info) ? ' ['+min+'–'+max+']' : '') : 'N/A'
        text(t('Health:'),272,570,'10px Tahoma','#1c1a13')
        text(t('Damage:'),350,570,'10px Tahoma','#1c1a13')
        text(t('Move:'),428,570,'10px Tahoma','#1c1a13')
        text(Math.floor(inspected.hp)+'/'+info.health,294,596,'10px Tahoma','#f4ebcd')
        text(weapon,372,596,'10px Tahoma','#f4ebcd')
        text(String(info.range),450,596,'10px Tahoma','#f4ebcd')
        healthBar(294,578,43,7,inspected.hp/info.health)
        ctx.restore()
      }
    }
    paintReconIcons(ground,inspected)
    ctx.restore()
    paintActions(unit,cursorPosition)
    paintTurnAnimation(now)
    if (transport.advance) campaignLayer(now)
    if (transport.practice) paintDamagePreview(unit,targets,cursorCell,cursorPosition)
    if (targets.has(cursorCell) && pointer.buttons === 0 && pointer.pointerType !== 'touch') {
      const {image,frame:index,width,height} = data.attackCursor
      const [x,y] = cursorPosition
      frame(ctx,images[image],index,Math.round(x),Math.round(y),width,height)
    }
    if (motion || strike || wipeout || showResources || weatherMoving) schedule()
    // GIF de perfil: redesenha em ritmo leve para a animação aparecer.
    if (animatedPhoto) { animatedPhoto = false; clearTimeout(photoTimer); photoTimer = setTimeout(schedule,90) }
  }

  function cellAt(x,y) {
    const col = Math.floor((x/zoom + panX)/TILE), row = Math.floor((y/zoom + panY)/TILE)
    if (x < 0 || y < 0 || x >= view.width || y >= view.height || col < 0 || row < 0 || col >= map.width || row >= map.height) return -1
    return row * map.width + col
  }

  // Multiplayer: avisa quem caiu (com a contagem até a IA assumir) e quais equipes estão com a IA.
  const connectionNotices = () => (state?.notices ?? []).map(notice => notice.kind === 'ai' ?
    t('{name} saiu da partida; a IA assumiu essa equipe até ele voltar.',{name:t(notice.name)}) :
    t('{name} caiu. Aguardando a volta ({n} s); depois a IA assume.',{name:t(notice.name),n:notice.seconds})).join(' ')
  // Barra da partida: cronômetro (00:00:00), rodada e quantidade de tropas aliadas e inimigas (as visíveis, na neblina).
  function clockText(ms) {
    const seconds = Math.max(0,Math.floor(ms/1000))
    const two = value => String(value).padStart(2,'0')
    return two(Math.floor(seconds/3600)) + ':' + two(Math.floor(seconds/60)%60) + ':' + two(seconds%60)
  }
  function updateHud() {
    if (!state || !hud.isConnected) return
    const now = performance.now()
    const running = !state.winner && !state.result
    const ms = clock ? clock.elapsed + (clock.running ? now - clock.at : 0) : now - openedAt
    const item = (label,value,kind = '') => {
      const span = document.createElement('span')
      if (kind) span.className = kind
      span.append(label + ' ',Object.assign(document.createElement('b'),{textContent:value}))
      return span
    }
    const parts = [item('⏱',clockText(ms)),item(t('Rodada'),String(state.round ?? 1))]
    const weather = weatherText(state.weather,t)
    if (weather) parts.push(Object.assign(document.createElement('span'),{className:'hud-weather',textContent:weather}))
    if (side === 0) {
      state.colors.forEach((_,index)=>{
        const team = index+1
        if (state.defeated?.includes(team)) return
        parts.push(item(t(state.teams?.[index]?.name) || t('Equipe {n}',{n:team}),String(state.units.filter(unit=>unit.side === team).length)))
      })
    } else {
      const allies = state.units.filter(unit=>allied(state,unit.side,side)).length
      const enemies = state.units.length - allies
      parts.push(item(t('Tropas aliadas'),String(allies),'hud-ally'),
        item(t(state.fog ? 'Tropas inimigas à vista' : 'Tropas inimigas'),String(enemies),'hud-enemy'))
    }
    hud.replaceChildren(...parts)
    hud.hidden = false
    if (!running && clock?.running) clock = {...clock,elapsed:ms,running:false,at:now}
  }
  const hudTimer = setInterval(updateHud,1000)

  function updateStatus() {
    updateHud()
    const notices = connectionNotices()
    statusText()
    const progress = victoryProgress()
    if (progress) status.textContent += ' · ' + progress
    if (notices) status.textContent = notices + ' · ' + status.textContent
  }
  function statusText() {
    status.textContent = t(error) || (!connected ? t('Carregando partida…') : t(state.objective) ??
      (strike || motion?.attack ? t('Combate em andamento…') :
      state.winner ? victoryText(state.winner) :
      side === 0 ? t('Turno da equipe {n}',{n:state.turn}) :
      canTakeTurn(state,side) && state.coop?.waiting.includes(state.coop.you) ? t('Você encerrou. Aguardando o parceiro.') :
      canTakeTurn(state,side) && state.coop?.waiting.length ? t('Seu parceiro já encerrou. Seu turno.') :
      canTakeTurn(state,side) ? t('Seu turno.') :
      state.turnEnded?.includes(side) && activeSides(state).includes(side) ? t('Você encerrou. Aguardando o fim do turno aliado.') :
      t('Aguardando a sua vez.')))
    cssButton('end').disabled = !canAct()
    cssButton('undo').disabled = !canAct() || !state?.canUndo || Boolean(state?.coop)
    cssButton('next').disabled = !state || side === 0 || Boolean(state.dialog || state.result || motion || strike)
    cssButton('options').disabled = Boolean(state?.dialog || state?.result)
  }

  async function send(command,markedCell) {
    if (!canAct()) return
    pending = true
    pendingTarget = markedCell
    error = ''
    updateStatus()
    schedule()
    try {
      await transport.send({...command,version:state.version})
    } catch (failure) { error = failure.message }
    finally {
      pending = false
      pendingTarget = undefined
      updateStatus()
      schedule()
    }
  }

  const cancelAction = () => {
    building = null
    directionBar.hidden = true
    openActions = false
    traced = undefined
    schedule()
  }
  // Executa um botão do menu da unidade (clique ou atalho de teclado).
  function performCommand(unit,menu) {
    if (!menu.enabled) {
      // Sem mouse (toque), a dica não aparece: o motivo vai para a linha de status.
      error = menu.text
      updateStatus()
      setTimeout(()=>{ if (error === menu.text) { error = ''; updateStatus() } },2500)
      cancelAction()
      return
    }
    else if (menu.type === 'build') chooseConstruction(unit)
    else if (transportOptions(rules,map,state,unit).includes(menu.type)) {
      void send({type:'transport',unit:unit.id,name:menu.type})
    }
    else if (menu.type !== 'cancel') void send({type:menu.type,unit:unit.id})
    cancelAction()
  }
  // Atalho de teclado para um botão do menu da unidade selecionada (R reparar, B construir, E extrair…).
  function shortcutCommand(types) {
    const unit = chosen()
    if (!unit || !mine(unit) || !canAct()) return false
    const wasOpen = openActions
    openActions = true
    const menu = updateActions(unit).find(command=>types.includes(command.type))
    openActions = wasOpen
    if (!menu) return false
    if (!menu.enabled) { error = menu.text; updateStatus(); setTimeout(()=>{ if (error === menu.text) { error = ''; updateStatus() } },2500); return true }
    performCommand(unit,menu)
    return true
  }

  function chooseConstruction(unit) {
    // Fábrica e Warmachine usam o mesmo catálogo com atributos, alvos bons e ruins (BuildMenu do Flash).
    return showWarmachineMenu({dialog:$('wm-construct'),data,images,map,state,builder:unit,teamImage,frame,choose:name=>{
      if (!canAct()) return
      if (unit.factory) building = {name,factory:unit.cell}
      else {
        if (chosen()?.id !== unit.id) return
        building = {name,unit:unit.id,preview:unitFor(rules,{name,side,cell:unit.cell},-1)}
      }
      openActions = false
      schedule()
    }})
  }

  function deploy(cell) {
    if (!building || !canAct()) return false
    const builder = building.factory != null ? factoryAt(state,side,building.factory) : chosen()
    if (!builder || !builder.factory && builder.id !== building.unit ||
        !buildCells(rules,map,state,builder,rules.units[building.name]).includes(cell)) return false
    const origin = builder.factory ? {type:'factoryBuild',factory:builder.cell} : {type:'build',unit:builder.id}
    void send({...origin,cell,name:building.name})
    cancelAction()
    return true
  }

  for (const button of directionButtons) {
    const cancel = button.dataset.direction === 'cancel'
    button.onpointerenter = button.onfocus = () => {
      if (building && !cancel) building.hover = Number(button.dataset.cell)
      schedule()
    }
    button.onpointerleave = button.onblur = () => {
      if (building) building.hover = undefined
      schedule()
    }
    button.onclick = () => {
      if (!cancel) return void deploy(Number(button.dataset.cell))
      const builder = chosen()
      cancelAction()
      if (builder && canAct()) chooseConstruction(builder)
    }
  }

  // Minimapa: a posição clicada (ou arrastada) vira o centro da câmera.
  const overMini = (x,y) => { const miniX = miniLeft(); return x >= miniX && y >= miniY && x < miniX+miniWidth && y < miniY+miniHeight }
  function centerOnMini(x,y) {
    const miniX = miniLeft()
    const fx = Math.min(1,Math.max(0,(x-miniX)/miniWidth)), fy = Math.min(1,Math.max(0,(y-miniY)/miniHeight))
    center(fx * map.width*TILE,fy * map.height*TILE)
    schedule()
  }
  function click(x,y) {
    if (!state || state.dialog || state.result) return
    if (overMini(x,y)) { centerOnMini(x,y); return }
    const cell = cellAt(x,y)
    if (cell < 0 || motion || strike || pending) return
    const unit = chosen()
    const options = optionsButton(unit)
    if (options && overOptions(options,[x,y])) {
      openActions = true
      traced = undefined
      schedule()
      return
    }
    pinnedTerrain = hover = cell
    const menu = commands.find(button => x >= button.x && y >= button.y && x < button.x+button.w && y < button.y+button.h)
    if (unit && menu) {
      performCommand(unit,menu)
      return
    }
    const target = state.units.find(item => item.cell === cell)
    if (building) {
      if (building.factory != null && deploy(cell)) return
      if (building.unit != null) return
    }
    if (canAct() && mine(unit) && !unit.disabled) {
      const moves = movesFor(unit)
      const trace = trackedPath(unit)
      const attack = target && attackPath(rules,map,state,unit,target,moves,trace)
      if (attack) {
        void send({type:'attack',unit:unit.id,target:target.id,...(attack.length ? {path:attack} : {})},target.cell)
        cancelAction()
        return
      }
      if (!target && moves.has(cell)) {
        const path = trace?.at(-1) === cell ? trace : moves.get(cell)
        void send({type:'move',unit:unit.id,cell,path})
        cancelAction()
        return
      }
    }
    const factory = !target && !building && canAct() && factoryAt(state,side,cell)
    if (factory && chooseConstruction(factory)) {
      selected = null
      cancelAction()
      return
    }
    building = null
    traced = undefined
    const sameUnit = target?.id === selected
    // Segundo clique na mesma unidade: além do menu, a barra de baixo mostra o terreno embaixo dela.
    terrainUnder = target && sameUnit ? cell : -1
    openActions = Boolean(sameUnit && mine(target))
    selected = sameUnit && target?.side !== side ? null : target?.id ?? null
    schedule()
  }

  const chromeObserver = new ResizeObserver(resizeView)
  for (const element of [player.querySelector('header'),status,$('player-camera')]) chromeObserver.observe(element)
  window.addEventListener('resize',resizeView)
  document.addEventListener('fullscreenchange',resizeView)
  resizeView()
  canvas.addEventListener('pointermove',event => {
    const {clientX,clientY,buttons,pointerType} = event
    pointer = {clientX,clientY,buttons,pointerType}
    if (!event.buttons && state) rememberRoute(cellAt(...point(pointer)))
    schedule()
  },true)
  for (const event of ['pointerleave','pointercancel']) canvas.addEventListener(event,() => {pointer = null; schedule()})
  // Clicar e arrastar no minimapa move a câmera junto (registrado antes da câmera para ter prioridade).
  let miniDrag = null
  canvas.addEventListener('pointerdown',event => {
    if (event.button !== 0 || !state || state.dialog || state.result || motion?.camera) return
    const [x,y] = point(event)
    if (!overMini(x,y)) return
    event.stopImmediatePropagation()
    event.preventDefault()
    miniDrag = event.pointerId
    canvas.setPointerCapture(event.pointerId)
    centerOnMini(x,y)
  },true)
  canvas.addEventListener('pointermove',event => {
    if (miniDrag !== event.pointerId) return
    event.stopImmediatePropagation()
    centerOnMini(...point(event))
  },true)
  for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,event => {
    if (miniDrag !== event.pointerId) return
    miniDrag = null
    event.stopImmediatePropagation()
  },true)
  bindCamera(canvas,$('player-camera'),{
    ready:() => state ? zoom : 0, zoom:setZoom, click,
    canControl:() => !state?.dialog && !state?.result && !motion?.camera,
    point, bounds:() => [view.width,view.height],
    canPan:() => worldWidth*zoom-view.width > 1 || worldHeight*zoom-view.height > 1,
    pan:(x,y) => {panX -= x/zoom; panY -= y/zoom; normalize(); schedule()},
  })
  canvas.addEventListener('pointerup',event => { if (event.button === 0) click(...point(event)) })
  canvas.addEventListener('contextmenu',event => {
    if (!state || state.dialog || state.result || pending || motion || strike || building) return
    const cell = cellAt(...point(event))
    const target = state.units.find(item=>item.cell === cell && item.side !== side)
    if (!target) return
    event.preventDefault()
    cancelAction()
    selected = target.id
    pinnedTerrain = hover = cell
    canvas.focus({preventScroll:true})
  })
  // Atalhos de teclado (lista em Configurações → Atalhos de teclado).
  let endArmed = 0
  const nextUnit = (step = 1) => {
    // Só as tropas que ainda podem andar neste turno (não se moveram, não atiraram e não são fixas).
    const units = state?.units.filter(item => mine(item) && !item.moved && !item.fired && !item.disabled &&
      rules.units[item.name].range > 0 && !rules.units[item.name].mods.includes('Fixed'))
    if (!units?.length) return
    const index = units.findIndex(item => item.id === selected)
    const unit = units[((index < 0 ? (step > 0 ? -1 : 0) : index) + step + units.length) % units.length]
    selected = unit.id
    cancelAction()
    center(cellX(unit.cell) + TILE/2,cellY(unit.cell) + TILE/2)
    schedule()
  }
  // Espaço/Enter encerra o turno; se ainda há unidades suas para agir, pede para apertar de novo.
  function endTurnKey() {
    if (!canAct()) return
    const idle = state.units.some(item => mine(item) && !item.fired && !item.disabled)
    if (idle && performance.now() - endArmed > 1800) {
      endArmed = performance.now()
      error = t('Ainda há unidades para agir. Aperte de novo para encerrar o turno.')
      updateStatus()
      setTimeout(()=>{ if (error.startsWith(t('Ainda há'))) { error = ''; updateStatus() } },1800)
      return
    }
    endArmed = 0
    error = ''
    void send({type:'end'})
  }
  bindShortcuts({
    ready:() => !player.hidden && Boolean(state),
    busy:() => Boolean(state.dialog || state.result),
    on:{
      pan:(dx,dy) => {
        if (motion?.camera) return
        panX += dx/zoom
        panY += dy/zoom
        normalize()
        schedule()
      },
      cancel:() => { cancelAction(); selected = null; pinnedTerrain = terrainUnder = -1; schedule() },
      endTurn:endTurnKey,
      next:nextUnit,
      command:shortcutCommand,
      undo:() => { if (!cssButton('undo').disabled) void send({type:'undo'}) },
      zoom:step => {
        // Usa os botões da barra de zoom para a porcentagem mostrada acompanhar.
        const label = step > 0 ? '+' : '−'
        const button = [...$('player-camera').querySelectorAll('button')].find(item=>item.textContent.trim() === label)
        if (button) button.click(); else setZoom(step)
      },
      fullscreen:() => $('fullscreen')?.click(),
      help:() => { $('options').showModal(); $('settings-shortcuts')?.scrollIntoView({block:'start'}) },
    },
  })
  music.bind($('audio'),$('music'),$('game-volume'),$('game-volume-value'))
  $('game-settings').onclick = () => $('options').showModal()
  cssButton('options').onclick = () => $('options').showModal()
  cssButton('end').onclick = () => void send({type:'end'})
  cssButton('undo').onclick = () => void send({type:'undo'})
  cssButton('next').onclick = () => nextUnit(1)
  for (const type of Object.keys(buttons)) for (const event of ['pointerenter','pointerleave','pointerdown','pointerup']) {
    cssButton(type).addEventListener(event,schedule)
  }
  $('campaign-continue').onclick = () => {
    if (state?.result) {location.href = transport.back ?? '/?campanha'; return}
    if (!state?.dialog) return
    if (!wholeLine && performance.now()-chatStart < (t(state.dialog.sender).length+t(state.dialog.message).length+4)*24) {
      wholeLine = true
      schedule()
    } else transport.advance()
  }
  function startStrike(action,now = performance.now()) {
    strike = {...combatTimeline(data,action),side:action.side,start:now}
  }

  function startMotion(action, next, follow) {
    const mover = next.units.find(unit => unit.id === action.unit) ?? state.units.find(unit => unit.id === action.unit)
    const watch = side !== 0 && !allied(next,side,action.side) && action.public &&
      mover && !mover.cloaked
    motion = {unit:action.unit,path:[action.from,...action.path],start:performance.now(),
      before:follow ? state.units : undefined,attack:follow,
      camera:watch ? {x:panX,y:panY,duration:320} : undefined}
    const sounds = rules.units[mover?.name]?.sounds.move ?? ['VehicleMove']
    makeSound(sounds[Math.floor(Math.random()*sounds.length)])
    if (action.jammed) makeSound('Jammed')
  }

  // Chat da partida (só em rede): painel abaixo do mapa (chat.js).
  const chatUpdate = transport.chat && createMatchChat({template:$('match-chat-template'),parent:player,t,
    send:text => transport.chat(text),onError:message => { error = message; updateStatus() },onMessage:() => makeSound('Capture')})
  const updateMatchChat = messages => chatUpdate?.(messages,side)

  // Mesmo dispositivo (todas as equipes de jogadores): botão para avançar uma rodada inteira de uma vez.
  const skipButton = $('match-skip-round')
  skipButton.hidden = !transport.skipRound
  if (transport.skipRound) skipButton.onclick = async () => {
    if (pending || !state || state.dialog || state.result) return
    pending = true
    skipButton.disabled = true
    cancelAction()
    selected = null
    try { await transport.skipRound() } catch (failure) { error = failure.message }
    finally { pending = false; skipButton.disabled = false; updateStatus(); schedule() }
  }

  // Replay: linha do tempo para voltar/avançar turnos, pular para qualquer jogada e mudar a velocidade.
  const timeline = transport.timeline
  const timelineBar = $('replay-timeline')
  timelineBar.hidden = !timeline
  if (timeline) {
    const range = timelineBar.querySelector('input[type=range]')
    const play = timelineBar.querySelector('[data-replay=play]')
    const where = timelineBar.querySelector('.replay-where')
    range.max = String(timeline.total)
    let dragging = false
    const refresh = () => {
      if (!dragging) range.value = String(timeline.index())
      play.textContent = timeline.playing() ? '⏸' : '▶'
      where.value = t('Rodada {n}',{n:timeline.round()}) + ' · ' + t('Equipe {n}',{n:timeline.turn()}) +
        ' · ' + timeline.index() + '/' + timeline.total
    }
    const actions = {start:() => timeline.seek(0),back:() => timeline.back(),play:() => timeline.toggle(),
      forward:() => timeline.forward(),end:() => timeline.seek(timeline.total)}
    for (const button of timelineBar.querySelectorAll('[data-replay]')) button.onclick = () => actions[button.dataset.replay]()
    range.oninput = () => { dragging = true; where.value = range.value + '/' + timeline.total }
    range.onchange = () => { dragging = false; timeline.seek(Number(range.value)) }
    timelineBar.querySelector('select').onchange = event => timeline.setRate(event.target.value)
    const stopListening = timeline.onChange(refresh)
    window.addEventListener('pagehide',stopListening,{once:true})
    refresh()
  }

  function receive(next) {
    connected = true
    // Cronômetro: o tempo vem do jogo (local ou anfitrião); sem ele (replay), conta desde que a tela abriu.
    if (Number.isFinite(next.elapsed)) clock = {elapsed:next.elapsed,at:performance.now(),running:!next.winner && !next.result}
    updateMatchChat(next.chat)
    // Fim de partida: relatório (gráficos e abates), ver o replay com linha do tempo e baixar o replay.
    if (next.result && !next.result.replay && transport.replay && !replayOffered) {
      replayOffered = true
      void Promise.resolve(transport.replay()).then(replay => {
        if (!replay) return
        replay.elapsed ??= clock ? clock.elapsed : undefined
        $('match-replay').hidden = $('match-report-open').hidden = $('match-watch').hidden = false
        $('match-replay').onclick = () => downloadReplay(replay)
        const watch = async () => { await saveLastReplay(replay); location.href = '/?replay' }
        $('match-watch').onclick = watch
        $('match-report-open').onclick = () => showReport({data,replay,t,onReplay:watch})
      }).catch(()=>{})
    }
    // Replay: pular na linha do tempo pode voltar a versão (next.seek); aí o estado é trocado sem animação.
    if (state && next.version < state.version && !next.seek) return
    if (next.viewer != null && next.viewer !== side) {
      side = next.viewer
      selected = null
      pinnedTerrain = -1
      cancelAction()
    }
    oreSignature = JSON.stringify(next.ore)
    if (!state) {
      const first = next.units.find(unit => unit.side === side && unit.credits >= 0) ?? next.units.find(unit => unit.side === side)
      if (first) center(cellX(first.cell),cellY(first.cell))
    } else if (next.version > state.version) {
      const action = next.last
      // Allies can keep using their own map while one of them moves.
      const partnerActs = next.activeSides && action?.side && action.side !== side &&
        allied(next,side,action.side) && canTakeTurn(next,side)
      // "Acelerar turnos da IA": jogadas dos outros aparecem direto, sem animação.
      const quick = next.seek || action?.side && action.side !== side && transport.fastAI?.()
      if (quick) { pendingTarget = undefined; motion = strike = null }
      if (!partnerActs && !quick) {
        pendingTarget = undefined
        motion = strike = null
        if (action?.type === 'move' && action.path.length) startMotion(action,next)
        else if (action?.deployment && next.units.some(unit=>unit.id === action.deployment.unit)) {
          const {unit,from,to} = action.deployment
          motion = {unit,path:[from,to],start:performance.now(),deployment:true,
            camera:action.side === side ? {x:panX,y:panY,duration:500} : undefined}
          makeSound('ConstructUnit')
        } else if (action?.type === 'attack' && action.movement) startMotion(action.movement,next,action)
        else if (action?.type === 'attack') startStrike(action)
        else if (action?.type === 'extract') makeSound('ExtractResources')
        else if (action?.type === 'capture') makeSound('Capture')
      }
      // Equipe derrotada: depois da jogada, as unidades restantes explodem em sequência.
      wipeout = null
      if (action?.eliminated?.length) {
        const delay = quick || partnerActs ? 0 : action.type === 'attack' ?
          combatTimeline(data,action).duration + movementDuration(action.movement?.path.length ?? 0) :
          action.type === 'move' ? movementDuration(action.path.length) : 0
        startWipeout(action,next,delay)
      }
    }
    if ((!state || next.turn !== state.turn || next.round !== state.round) && !next.winner && !next.dialog) {
      const teams = activeSides(next)
      const banner = $('turn-banner')
      banner.textContent = canTakeTurn(next,side) ? t(teams.length > 1 ? 'Turno da sua aliança' : 'Seu turno') :
        t(teams.length > 1 ? 'Turno das equipes {n}' : 'Turno da equipe {n}',{n:teams.join(t(' e '))})
      // O texto continua no banner (leitores de tela), mas o que aparece é a animação do Flash.
      banner.hidden = true
      clearTimeout(turnBannerTimer)
      const teamName = team => t(next.teams?.[team-1]?.name) ?? t('Equipe {n}',{n:team})
      turnAnimation = {start:performance.now(),color:'#'+next.colors[teams[0]-1].slice(2),
        name:teams.map(teamName).join(' & '),round:t('Rodada {n}',{n:next.round})}
      schedule()
      if (state && canTakeTurn(next,side)) makeSound('StartTurn')
    }
    // Raio (a cada 5 jogadas na chuva): cai depois da animação da jogada que o provocou, com trovão.
    if (next.lightning && next.lightning.version > lightningVersion) {
      // Ao abrir a partida (sem estado anterior) não repete um raio antigo.
      const fresh = Boolean(state)
      lightningVersion = next.lightning.version
      if (fresh && !next.seek) {
        const action = next.last
        const delay = transport.fastAI?.() && action?.side !== side ? 0 :
          action?.type === 'attack' ? combatTimeline(data,action).duration + movementDuration(action.movement?.path.length ?? 0) :
          action?.type === 'move' ? movementDuration(action.path.length) : 0
        const hit = state.units.some(unit => unit.cell === next.lightning.cell)
        const start = weatherPainter.strike(next.lightning.cell,{delay,hit,seed:next.lightning.version})
        setTimeout(() => music.thunder?.(),Math.max(0,start - performance.now()) + 120)
        schedule()
      }
    }
    // Clima: aviso de chuva e começo da chuva com a animação da troca de turno (logo depois dela).
    const phase = next.weather?.phase
    if (state && phase !== state.weather?.phase && (phase === 'aviso' || phase === 'chuva') && !next.winner && !next.dialog) {
      const start = turnAnimation ? turnAnimation.start + 4700 : performance.now()
      weatherAnimation = phase === 'aviso' ?
        {start,color:'#7d9cc0',name:'⚠ ' + t('Chuva chegando'),round:t('Na próxima rodada: -1 de visão e de alcance da artilharia')} :
        {start,color:'#4f6f96',name:'🌧 ' + t('Começou a chover'),round:t('Por {n} rodadas: -1 de visão e de alcance da artilharia',{n:next.weather.left})}
      schedule()
    }
    const resourceGains = next.last?.resourceGains
    if ((!next.dialog && !next.result) && resourceGains?.length && next.version > shownResourceVersion &&
        (state || next.last.type === 'start')) {
      const start = performance.now()
      for (const {cell,amount} of resourceGains) resourceEffects.set(cell,{amount,start})
      if (next.last.type !== 'extract') makeSound('ExtractResources')
      shownResourceVersion = next.version
    }
    if (next.dialog?.id !== state?.dialog?.id) {
      chatStart = performance.now()
      wholeLine = false
      $('campaign-line').textContent = next.dialog ? t(next.dialog.sender) + ': ' + t(next.dialog.message) : ''
    }
    if (next.focus && next.focus.id !== state?.focus?.id) {
      center(cellX(next.focus.cell)+TILE/2,cellY(next.focus.cell)+TILE/2)
    }
    if (next.result && !state?.result) {
      makeSound(next.result.victory ? 'VictoryWAV' : 'DefeatWAV')
      $('campaign-line').textContent = next.result.campaign ?
        t(next.result.victory ? 'Victory' : 'Defeat') + '. ' + t('Score:') + ' ' + next.result.score :
        victoryText(next.result.winner)
    }
    state = next
    if (!transport.advance && state.winner && !state.result && resultTimer === undefined) {
      const event = state.last
      const duration = (event?.type === 'attack' ? combatTimeline(data,event).duration +
        movementDuration(event.movement?.path.length ?? 0) : 0) + wipeoutDuration(event)
      resultTimer = setTimeout(() => receive({...state,result:{
        winner:state.winner,victory:side === 0 || allied(state,state.winner,side),campaign:false,
      }}),duration+100)
    }
    music.track(state.result ? '' : data.music[canTakeTurn(state,side) ? 0 : 1])
    if (!chosen()) cancelAction()
    if (!canTakeTurn(state,side)) cancelAction()
    if (!canAct() && $('wm-construct').open) $('wm-construct').close()
    updateStatus()
    schedule()
  }
  const disconnect = () => {connected = false; updateStatus(); schedule()}
  window.addEventListener('pagehide',() => clearInterval(hudTimer),{once:true})
  const stop = transport.listen(receive,disconnect)
  const timer = setInterval(schedule,500)
  window.addEventListener('pagehide',() => {
    stop()
    clearInterval(timer)
    clearTimeout(turnBannerTimer)
    clearTimeout(resultTimer)
    chromeObserver.disconnect()
    window.removeEventListener('resize',resizeView)
    document.removeEventListener('fullscreenchange',resizeView)
  },{once:true})
  updateStatus()
}

