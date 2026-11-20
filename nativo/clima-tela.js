// Clima na tela, no mesmo ritmo das animações do mapa: chuva fina em cada casa, respingos na terra, ondas (cristas
// curvas com espuma) no mar, o redemoinho girando e uma grande nuvem macia e meio transparente, com sombra no mar,
// que chega por um canto antes do aviso de chuva, escurece quando chove e vai embora pelo canto oposto.
// O ciclo (fase, rodadas, canto) vem do motor (state.weather); aqui é só o desenho.
import { TILE, frame } from './graficos.js'
import { WHIRLPOOL_SIZE, whirlpoolCells } from './partida.js'

const PX = 4
const VARIANTS = 6

function seeded(seed) {
  let value = seed >>> 0 || 1
  return () => { value ^= value << 13; value >>>= 0; value ^= value >>> 17; value ^= value << 5; value >>>= 0; return value / 4294967296 }
}
const cellHash = cell => (Math.imul(cell + 1,2654435761) >>> 0)
function tile(paint,size = PX) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TILE
  const ctx = canvas.getContext('2d')
  paint((x,y,color) => { ctx.fillStyle = color; ctx.fillRect(x*size,y*size,size,size) })
  return canvas
}
// Chuva e respingos usam pixels menores (gotas bem finas), ainda em blocos para manter o visual pixelado.
const FINE = 2, FINE_GRID = TILE / FINE

// Chuva e respingos são preparados uma vez e trocam no ritmo dos quadros do mapa.
function makeSprites() {
  const random = seeded(20261118)
  const rain = Array.from({length:VARIANTS},() => tile(dot => {
    for (let drop = 0; drop < 11; drop++) {
      const x = Math.floor(random()*FINE_GRID), y = Math.floor(random()*FINE_GRID)
      // Gota fina e inclinada: 5 pixels azul-escuros e transparentes, descendo para a esquerda, a ponta mais forte.
      for (let step = 0; step < 5; step++) {
        const alpha = (.2 + step*.06).toFixed(2)
        dot((x - Math.floor(step/2) + FINE_GRID) % FINE_GRID,(y + step) % FINE_GRID,`rgba(70,105,170,${alpha})`)
      }
    }
  },FINE))
  const splash = Array.from({length:VARIANTS},() => tile(dot => {
    for (let count = 0; count < 3; count++) {
      if (random() < .35) continue
      const x = 2 + Math.floor(random()*(FINE_GRID-5)), y = 3 + Math.floor(random()*(FINE_GRID-5))
      // Coroinha do respingo: centro e dois pingos saltando.
      dot(x,y,'rgba(70,105,165,.5)')
      dot(x-1,y-1,'rgba(60,95,155,.38)')
      dot(x+1,y-1,'rgba(60,95,155,.38)')
      dot(x-2,y-2,'rgba(60,95,155,.25)')
      dot(x+2,y-2,'rgba(60,95,155,.25)')
    }
  },FINE))
  // Texturas de chuva prontas (4 × 4 casas com variações misturadas): a chuva cobre a tela com um único
  // preenchimento em vez de um desenho por casa (num mapa 80 × 80 inteiro seriam milhares por quadro).
  const RAIN_BLOCK = 4
  const rainTiles = Array.from({length:VARIANTS},(_,variant) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TILE*RAIN_BLOCK
    const ctx = canvas.getContext('2d')
    for (let y = 0; y < RAIN_BLOCK; y++) for (let x = 0; x < RAIN_BLOCK; x++) {
      ctx.drawImage(rain[(variant + cellHash(y*RAIN_BLOCK + x)) % VARIANTS],x*TILE,y*TILE)
    }
    return canvas
  })
  return {rain,splash,rainTiles}
}

// As ondas e o redemoinho usam os PNGs transparentes originais, carregados com os recursos do jogo.
const WAVE_HEIGHT = TILE*1.5

// Massa de nuvens: uma nuvem só, grande e pixelada (1 pixel da imagem = 1 bloco de CLOUD_BLOCK na tela), maior que
// o mapa: o miolo é fechado (cobre o mapa inteiro) e a borda é irregular, com manchas de dois tons.
const CLOUD_BLOCK = PX*3, CLOUD_MARGIN = .35
function valueNoise(random,width,height,spacing) {
  const columns = Math.ceil(width/spacing) + 2, rows = Math.ceil(height/spacing) + 2
  const grid = Array.from({length:columns*rows},() => random())
  const at = (x,y) => grid[y*columns + x]
  return (x,y) => {
    const gx = x/spacing, gy = y/spacing, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx-x0, fy = gy-y0
    const sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy)
    const top = at(x0,y0) + (at(x0+1,y0)-at(x0,y0))*sx, bottom = at(x0,y0+1) + (at(x0+1,y0+1)-at(x0,y0+1))*sx
    return top + (bottom-top)*sy
  }
}
function makeCloudMass(seed,map,dark) {
  const random = seeded(seed)
  const span = 1 + 2*CLOUD_MARGIN
  const block = Math.max(CLOUD_BLOCK,Math.ceil(Math.max(map.width,map.height)*TILE*span/384))
  const width = Math.ceil(map.width*TILE*span/block), height = Math.ceil(map.height*TILE*span/block)
  const shape = valueNoise(random,width,height,9), detail = valueNoise(random,width,height,3), tone = valueNoise(random,width,height,6)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width,height)
  const colors = (dark ? ['#5d666f','#737d87','#8c96a0'] : ['#c4ccd4','#e6ebef','#ffffff'])
    .map(hex=>[1,3,5].map(index=>Number.parseInt(hex.slice(index,index+2),16)))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // Distância até a borda do mapa (em frações do mapa): positiva dentro, negativa fora.
    const mx = x/width*span - CLOUD_MARGIN, my = y/height*span - CLOUD_MARGIN
    const edge = Math.min(mx,1-mx,my,1-my)
    const limit = -.22 + (shape(x,y)-.5)*.3 + (detail(x,y)-.5)*.12
    if (edge < limit) continue
    const level = tone(x,y) + (detail(x,y)-.5)*.25
    const [r,g,b] = colors[level < .42 ? 0 : level < .68 ? 1 : 2]
    const index = (y*width + x)*4
    image.data[index] = r; image.data[index+1] = g; image.data[index+2] = b; image.data[index+3] = 255
  }
  ctx.putImageData(image,0,0)
  // Versão macia (desfocada) e a sombra: o mesmo formato, escuro e mais desfocado, desenhado no mar mais abaixo.
  const soften = (source,blur,tint) => {
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const octx = out.getContext('2d')
    octx.filter = `blur(${blur}px)`
    octx.drawImage(source,0,0)
    if (tint) { octx.filter = 'none'; octx.globalCompositeOperation = 'source-in'; octx.fillStyle = tint; octx.fillRect(0,0,width,height) }
    return out
  }
  return {cloud:soften(canvas,1.6),shadow:soften(canvas,2.6,'#06101c'),block}
}

// Raio em pixel art: zigue-zague do alto da tela até a casa atingida, com galhos curtos.
// Desenha blocos de PX*2 (núcleo branco, borda amarela clara).
function makeBolt(seed,height) {
  const random = seeded(seed)
  const block = PX*2, rows = Math.ceil(height/block)
  const points = []
  let x = 0
  for (let row = 0; row <= rows; row++) {
    points.push([x,row])
    x += Math.round((random()-.5)*2.6)
    x = Math.max(-6,Math.min(6,x))
  }
  points.at(-1)[0] = 0
  const branches = []
  for (let count = 0; count < 3; count++) {
    const from = points[2 + Math.floor(random()*(points.length-6))]
    const direction = random() < .5 ? -1 : 1
    const length = 3 + Math.floor(random()*4)
    branches.push(Array.from({length},(_,step)=>[from[0] + direction*(step+1),from[1] + step]))
  }
  return {block,points,branches}
}

const WAVES_ZOOM = .55, SPLASH_ZOOM = .7
export function createWeatherPainter(images) {
  let lightning = null
  let sprites = null
  let clouds = null, cloudsKey = ''
  let progress = 0, lastTime = null
  let rainPatterns = null
  let seaMask = null, waveMask = null, seaTiles = null, seaMap = null
  const waveImages = [1,2,3].map(index => images['weather_wave_' + index])
  const whirlpoolImage = images.weather_whirlpool

  // A margem costeira também protege a parte de terra desenhada dentro dos sprites de falésia.
  function waterMask(map,tiles) {
    if (seaTiles === tiles && seaMap === map) return seaMask
    seaMask = new Path2D()
    waveMask = new Path2D()
    const waterAt = (x,y) => x < 0 || y < 0 || x >= map.width || y >= map.height ||
      ['Sea','Reef'].includes(tiles[y*map.width + x][0])
    for (let cell = 0; cell < tiles.length; cell++) {
      if (!['Sea','Reef'].includes(tiles[cell][0])) continue
      const x = cell % map.width, y = Math.floor(cell/map.width)
      seaMask.rect(x*TILE,y*TILE,TILE,TILE)
      if ([-1,0,1].every(dy => [-1,0,1].every(dx => waterAt(x+dx,y+dy)))) waveMask.rect(x*TILE,y*TILE,TILE,TILE)
    }
    seaTiles = tiles
    seaMap = map
    return seaMask
  }

  // Quanto o campo de nuvens já atravessou o mapa: 0 = fora, no canto de origem; 1 = sobre o mapa; 2 = saiu.
  function target(weather) {
    if (!weather) return 0
    if (weather.phase === 'nuvens') return weather.left >= 2 ? .4 : .75
    if (weather.phase === 'aviso' || weather.phase === 'chuva') return 1
    if (weather.phase === 'dispersando') return 1.55
    return progress > 0 ? 2.2 : 0
  }
  // A mesma massa de nuvens em dois tons (clara chegando, escura na chuva); refeita a cada ciclo de clima.
  function cloudField(weather,map) {
    const key = weather.cycle + ':' + map.width + 'x' + map.height
    if (key === cloudsKey) return clouds
    const seed = weather.cycle * 7919 + 17
    clouds = {light:makeCloudMass(seed,map,false),dark:makeCloudMass(seed,map,true)}
    cloudsKey = key
    return clouds
  }

  // Onde está a massa de nuvens agora (posição em pixels do mundo e o par nuvem/sombra), ou null se não há nuvem.
  function cloudPlacement(weather,map,now) {
    const elapsed = lastTime === null ? 500 : Math.max(0,Math.min(500,now - lastTime))
    lastTime = now
    const goal = target(weather)
    progress += (goal - progress) * Math.min(1,elapsed/1400)
    if (Math.abs(goal - progress) < .002) progress = goal
    if (progress >= 2.19 && goal >= 2.2) progress = 0
    if (!weather || progress <= 0) return null
    const [dx,dy] = [[1,1],[-1,1],[-1,-1],[1,-1]][weather.from ?? 0]
    const span = 1 + 2*CLOUD_MARGIN
    const sway = Math.sin(now/5000) * CLOUD_BLOCK * 2
    const x = (progress - 1) * dx * span * map.width*TILE + sway - CLOUD_MARGIN*map.width*TILE
    const y = (progress - 1) * dy * span * map.height*TILE - CLOUD_MARGIN*map.height*TILE
    const rain = weather.phase === 'chuva', dark = rain || weather.phase === 'aviso'
    const pair = cloudField(weather,map)
    return {x,y,rain,dark,...(dark ? pair.dark : pair.light)}
  }
  function stretch(ctx,image,x,y,alpha,block) {
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = alpha
    ctx.drawImage(image,Math.round(x),Math.round(y),image.width*block,image.height*block)
    ctx.restore()
  }

  // Efeitos no chão usam a mesma máscara de mar, preparada uma vez por mapa.
  // zoom: com o mapa bem afastado, ondas e respingos ficam minúsculos e custam caro (um desenho por casa),
  // então só aparecem a partir de certo zoom; a chuva, a sombra, as nuvens e o redemoinho continuam sempre.
  function paintGround(ctx,{weather,map,tiles,idle,now,left,top,right,bottom,zoom = 1}) {
    const place = cloudPlacement(weather,map,now)
    const rain = weather?.phase === 'chuva'
    if (!place && !rain) return false
    const firstX = Math.max(0,Math.floor(left/TILE)-2), lastX = Math.min(map.width-1,Math.ceil(right/TILE)+2)
    const firstY = Math.max(0,Math.floor(top/TILE)-2), lastY = Math.min(map.height-1,Math.ceil(bottom/TILE)+2)
    const whirlpoolArea = new Set(whirlpoolCells({weather},map))
    const corner = whirlpoolArea.size ? weather.whirlpool : -1
    ctx.save()
    ctx.clip(waterMask(map,tiles))
    if (place) stretch(ctx,place.shadow,place.x + TILE*1.1,place.y + TILE*1.7,place.rain ? .16 : place.dark ? .15 : .14,place.block)
    if (rain && zoom >= WAVES_ZOOM) {
      // Cada crista atravessa quase três casas em nove segundos, aparecendo e desaparecendo aos poucos.
      // O deslocamento e a rotação avançam a cada 500 ms, junto das animações originais do mapa.
      ctx.save()
      ctx.clip(waveMask)
      const direction = [1,-1,-1,1][weather.from ?? 0]
      for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
        const cell = y*map.width + x, hash = cellHash(cell)
        if (!['Sea','Reef'].includes(tiles[cell][0]) || hash % 5 || whirlpoolArea.has(cell)) continue
        const life = ((idle + (hash >>> 8)) % 18)/18
        const travel = (life - .5)*TILE*2.8
        const cx = (x + .5)*TILE + direction*travel
        const cy = (y + .5)*TILE + travel*.2
        const image = waveImages[(hash >>> 5) % waveImages.length]
        const height = WAVE_HEIGHT*(.85 + (hash >>> 16) % 4*.1)
        const width = height*image.width/image.height
        ctx.save()
        ctx.translate(cx,cy)
        ctx.rotate((direction < 0 ? Math.PI : 0) + ((hash >>> 20) % 5 - 2)*.04)
        ctx.imageSmoothingEnabled = true
        ctx.globalAlpha = Math.sin(life*Math.PI)*.7
        ctx.drawImage(image,-width/2,-height/2,width,height)
        ctx.restore()
      }
      ctx.restore()
    }
    if (corner >= 0) {
      const radius = WHIRLPOOL_SIZE*TILE/2
      const cx = (corner % map.width + WHIRLPOOL_SIZE/2)*TILE, cy = (Math.floor(corner/map.width) + WHIRLPOOL_SIZE/2)*TILE
      ctx.save()
      // A espiral preenche as nove casas (3×3): a imagem é desenhada maior que o quadrado, porque a borda dela é
      // transparente, e o recorte de cantos arredondados a mantém dentro das nove casas de mar enquanto gira.
      ctx.beginPath()
      ctx.roundRect(cx-radius,cy-radius,radius*2,radius*2,TILE*.6)
      ctx.clip()
      ctx.translate(cx,cy)
      // No canvas, ângulos positivos giram no sentido horário.
      ctx.rotate((idle % 24)*Math.PI*2/24)
      ctx.imageSmoothingEnabled = true
      const size = radius*1.45
      ctx.drawImage(whirlpoolImage,-size,-size,size*2,size*2)
      ctx.restore()
    }
    ctx.restore()
    if (rain && zoom >= SPLASH_ZOOM) {
      sprites ??= makeSprites()
      for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
        const cell = y*map.width + x
        if (!['Sea','Reef'].includes(tiles[cell][0])) ctx.drawImage(sprites.splash[(cellHash(cell) + idle) % VARIANTS],x*TILE,y*TILE)
      }
    }
    return false
  }

  // Céu: chuva por cima de tudo e a massa de nuvens macia e meio transparente (não esconde as unidades).
  function paintSky(ctx,{weather,map,idle,now,left,top,right,bottom}) {
    const rain = weather?.phase === 'chuva'
    if (rain) {
      sprites ??= makeSprites()
      ctx.fillStyle = 'rgba(18,28,48,.08)'
      ctx.fillRect(left,top,right-left,bottom-top)
      rainPatterns ??= sprites.rainTiles.map(canvas => ctx.createPattern(canvas,'repeat'))
      const width = map.width*TILE, height = map.height*TILE
      const x0 = Math.max(0,left), y0 = Math.max(0,top)
      ctx.fillStyle = rainPatterns[idle % rainPatterns.length]
      ctx.fillRect(x0,y0,Math.min(width,right) - x0,Math.min(height,bottom) - y0)
    }
    const place = cloudPlacement(weather,map,now)
    if (place) stretch(ctx,place.cloud,place.x,place.y,place.rain ? .3 : place.dark ? .3 : .34,place.block)
    return false
  }
  // Raio: começa agora (ou depois de `delay` ms) na casa `cell`; hit = havia unidade lá (explosão grande).
  function strike(cell,{delay = 0,hit = false,seed = cell} = {}) {
    lightning = {cell,start:performance.now() + delay,hit,seed}
    return lightning.start
  }
  // Desenha o raio (0,5 s), o clarão da tela e a explosão no chão. Devolve true enquanto estiver animando.
  function paintLightning(ctx,{map,now,top,left,right,bottom,explosions,images}) {
    if (!lightning) return false
    const elapsed = now - lightning.start
    if (elapsed < 0) return true
    if (elapsed > 1300) { lightning = null; return false }
    const cx = (lightning.cell % map.width) * TILE + TILE/2, cy = Math.floor(lightning.cell / map.width) * TILE + TILE
    // Clarão branco na tela inteira, apagando rápido.
    if (elapsed < 350) {
      ctx.fillStyle = `rgba(235,240,255,${(.38*(1 - elapsed/350)).toFixed(3)})`
      ctx.fillRect(left,top,right-left,bottom-top)
    }
    // O raio pisca: aceso, apaga, acende de novo e some.
    const visible = elapsed < 120 || (elapsed > 170 && elapsed < 420)
    if (visible) {
      const height = Math.max(TILE*2,cy - top)
      const bolt = makeBolt(lightning.seed,height)
      const draw = (list,core,edge) => {
        for (const [x,row] of list) {
          const px = cx + x*bolt.block - bolt.block/2, py = cy - height + row*bolt.block
          ctx.fillStyle = edge
          ctx.fillRect(px - 2,py,bolt.block + 4,bolt.block)
          ctx.fillStyle = core
          ctx.fillRect(px,py,bolt.block,bolt.block)
        }
      }
      draw(bolt.branches.flat(),'rgba(255,255,255,.8)','rgba(255,240,150,.45)')
      draw(bolt.points,'#ffffff','rgba(255,236,120,.85)')
    }
    // Impacto no chão: explosão do jogo (grande se acertou uma unidade) e uma marca queimada que some devagar.
    const effect = explosions?.[lightning.hit ? 'Explosion' : 'Small Explosion']
    const frameIndex = effect?.frames[Math.floor((elapsed - 60)/effect.wait)]
    if (effect && elapsed >= 60 && frameIndex !== undefined && images?.[effect.image]) {
      frame(ctx,images[effect.image],frameIndex,cx - TILE/2,cy - effect.height,effect.width,effect.height)
    }
    if (elapsed > 100) {
      ctx.fillStyle = `rgba(20,16,10,${(.45*(1 - (elapsed-100)/1200)).toFixed(3)})`
      ctx.fillRect(cx - PX*2,cy - PX*3,PX*4,PX*2)
    }
    return true
  }
  // Somente a área visível é armazenada, na resolução da tela. As centenas de sprites e os recortes do mar
  // são refeitos no ritmo do mapa (500 ms), e não em cada quadro do movimento de uma unidade.
  function cachedLayer(paint) {
    const canvas = document.createElement('canvas')
    const buffer = canvas.getContext('2d')
    let previous = null
    return (ctx,options) => {
      const {map,tiles,weather,idle,left,top,right,bottom} = options
      if (!weather && progress === 0) return false
      const matrix = ctx.getTransform()
      const scale = Math.hypot(matrix.a,matrix.b)
      const width = Math.round((right-left)*scale), height = Math.round((bottom-top)*scale)
      if (width <= 0 || height <= 0) return false
      const key = [idle,width,height,scale,weather?.phase,weather?.left,weather?.cycle,weather?.from,weather?.whirlpool].join('|')
      if (!previous || previous.key !== key || previous.map !== map || previous.tiles !== tiles ||
          left < previous.left || top < previous.top || right > previous.right || bottom > previous.bottom) {
        // Duas casas de margem permitem acompanhar o veículo sem refazer a chuva a cada pixel da câmera.
        const padding = TILE*2
        const bounds = {left:left-padding,top:top-padding,right:right+padding,bottom:bottom+padding}
        const layerWidth = Math.ceil((bounds.right-bounds.left)*scale), layerHeight = Math.ceil((bounds.bottom-bounds.top)*scale)
        if (canvas.width !== layerWidth || canvas.height !== layerHeight) { canvas.width = layerWidth; canvas.height = layerHeight }
        buffer.setTransform(1,0,0,1,0,0)
        buffer.clearRect(0,0,layerWidth,layerHeight)
        buffer.setTransform(scale,0,0,scale,-bounds.left*scale,-bounds.top*scale)
        paint(buffer,{...options,...bounds,now:idle*500})
        previous = {key,map,tiles,...bounds}
      }
      ctx.drawImage(canvas,previous.left,previous.top,canvas.width/scale,canvas.height/scale)
      return false
    }
  }
  return {paintGround:cachedLayer(paintGround),paintSky:cachedLayer(paintSky),strike,paintLightning}
}

// Texto do clima para a barra da partida.
export function weatherText(weather,t) {
  if (!weather) return ''
  if (weather.phase === 'nuvens') return '☁ ' + t('Nuvens se aproximando')
  if (weather.phase === 'aviso') return '⚠ ' + t('Chuva na próxima rodada')
  if (weather.phase === 'chuva') return '🌧 ' + t('Chovendo: -1 de visão e de alcance da artilharia ({n} rodadas)',{n:weather.left})
  if (weather.phase === 'dispersando') return '☁ ' + t('A chuva está passando')
  return ''
}
