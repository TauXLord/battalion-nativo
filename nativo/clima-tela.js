// Clima na tela, no mesmo ritmo das animações do mapa: chuva fina em cada casa, respingos na terra, ondas (cristas
// curvas com espuma) no mar, o redemoinho girando e uma grande nuvem macia e meio transparente, com sombra no mar,
// que chega por um canto antes do aviso de chuva, escurece quando chove e vai embora pelo canto oposto.
// O ciclo (fase, rodadas, canto) vem do motor (state.weather); aqui é só o desenho.
import { TILE, frame } from './graficos.js'

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

// Sprites gerados uma vez: variações de chuva, respingo e crista (cada casa usa uma, trocando a cada quadro).
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
  return {rain,splash,waves:makeWaves(random)}
}

// Ondas (como a referência): lâmina comprida e fina, quase na vertical, de espuma branca macia que vai ficando
// azul-clara e transparente para um lado, borda irregular e uma sombra azul-escura do outro lado. Mede ~1,5 casa
// de altura; 4 quadros de vida: nasce fraca, abre, desliza um pouco e some.
const WAVE_HEIGHT = Math.round(TILE*1.5), WAVE_WIDTH = Math.round(TILE*.55)
function makeWaves(random) {
  return Array.from({length:VARIANTS},() => {
    const tilt = (random()-.5)*.5, bulge = WAVE_WIDTH*(.18 + random()*.12)
    const bumps = Array.from({length:9},() => random())
    return [[.45,0],[.85,0],[1,2],[.4,4]].map(([alpha,slide]) => {
      const raw = document.createElement('canvas')
      raw.width = WAVE_WIDTH
      raw.height = WAVE_HEIGHT
      const ctx = raw.getContext('2d')
      ctx.translate(WAVE_WIDTH/2 + slide*.5,WAVE_HEIGHT/2)
      ctx.rotate(tilt)
      const half = WAVE_HEIGHT*.42, thick = WAVE_WIDTH*.16
      // Corpo: crescente fino (ponta fina em cima e embaixo), branco no meio indo para azul-claro transparente.
      const body = () => {
        ctx.beginPath()
        ctx.moveTo(0,-half)
        ctx.quadraticCurveTo(-bulge - thick,0,0,half)
        ctx.quadraticCurveTo(-bulge + thick,0,0,-half)
        ctx.closePath()
      }
      const glow = ctx.createLinearGradient(-bulge - thick,0,-bulge + thick*1.6,0)
      glow.addColorStop(0,'rgba(170,215,245,0)')
      glow.addColorStop(.45,'rgba(225,242,255,.85)')
      glow.addColorStop(.75,'rgba(255,255,255,.95)')
      glow.addColorStop(1,'rgba(255,255,255,.4)')
      // Sombra azul-escura do lado de fora (deslocada para a direita).
      ctx.save(); ctx.translate(thick*.9,0); body(); ctx.fillStyle = 'rgba(14,40,92,.45)'; ctx.fill(); ctx.restore()
      body(); ctx.fillStyle = glow; ctx.fill()
      // Borda irregular de espuma: bolinhas brancas ao longo do lado convexo.
      ctx.fillStyle = 'rgba(255,255,255,.9)'
      bumps.forEach((size,index) => {
        const t = (index + .5)/bumps.length, y = -half + t*2*half
        const x = -bulge*4*t*(1-t) + thick*.6
        ctx.beginPath(); ctx.arc(x,y,.8 + size*2.2*Math.sin(t*Math.PI),0,Math.PI*2); ctx.fill()
      })
      // Desfoque leve para ficar macia como espuma.
      const soft = document.createElement('canvas')
      soft.width = WAVE_WIDTH
      soft.height = WAVE_HEIGHT
      const sctx = soft.getContext('2d')
      sctx.filter = 'blur(.7px)'
      sctx.globalAlpha = alpha
      sctx.drawImage(raw,0,0)
      return soft
    })
  })
}

// Redemoinho: braços em espiral azul-claros em volta de um centro escuro (gira no desenho).
function makeWhirlpool() {
  // Ocupa 2×2 casas: diâmetro de 2 casas, com a borda se desfazendo no mar.
  const size = TILE*2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const center = size/2
  const dark = ctx.createRadialGradient(center,center,2,center,center,center)
  dark.addColorStop(0,'rgba(4,10,24,.95)')
  dark.addColorStop(.35,'rgba(12,32,64,.7)')
  dark.addColorStop(.75,'rgba(30,70,120,.25)')
  dark.addColorStop(1,'rgba(30,70,120,0)')
  ctx.fillStyle = dark
  ctx.fillRect(0,0,size,size)
  ctx.lineCap = 'round'
  for (let arm = 0; arm < 5; arm++) {
    const start = arm * Math.PI*2/5
    for (let step = 0; step < 56; step++) {
      const t = step/56, angle = start + t*Math.PI*1.6, radius = center*(.92 - t*.78)
      const x = center + Math.cos(angle)*radius, y = center + Math.sin(angle)*radius
      ctx.fillStyle = `rgba(${Math.round(170 + 60*(1-t))},${Math.round(215 + 30*(1-t))},255,${(.12 + .5*Math.sin(t*Math.PI)).toFixed(2)})`
      ctx.beginPath()
      ctx.arc(x,y,(1 + 2.4*Math.sin(t*Math.PI))*size/95,0,Math.PI*2)
      ctx.fill()
    }
  }
  return canvas
}

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
  const width = Math.ceil(map.width*TILE*span/CLOUD_BLOCK), height = Math.ceil(map.height*TILE*span/CLOUD_BLOCK)
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
  return {cloud:soften(canvas,1.6),shadow:soften(canvas,2.6,'#06101c')}
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

export function createWeatherPainter() {
  let lightning = null, whirlpoolImage = null
  let sprites = null
  let clouds = null, cloudsKey = ''
  let progress = 0, lastTime = 0

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
    whirlpoolImage ??= makeWhirlpool()
    cloudsKey = key
    return clouds
  }

  // Onde está a massa de nuvens agora (posição em pixels do mundo e o par nuvem/sombra), ou null se não há nuvem.
  function cloudPlacement(weather,map,now) {
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
  function stretch(ctx,image,x,y,alpha) {
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = alpha
    ctx.drawImage(image,Math.round(x),Math.round(y),image.width*CLOUD_BLOCK,image.height*CLOUD_BLOCK)
    ctx.restore()
  }

  // Chão (embaixo das unidades): sombra das nuvens no mar, ondas, respingos na terra e o redemoinho.
  // Devolve true enquanto algo estiver animando de forma contínua (o redemoinho girando).
  function paintGround(ctx,{weather,map,tiles,idle,now,left,top,right,bottom}) {
    const place = cloudPlacement(weather,map,now)
    // Sombra deslocada para baixo e para a direita: dá a sensação de que a nuvem está alta.
    if (place) stretch(ctx,place.shadow,place.x + TILE*1.1,place.y + TILE*1.7,place.rain ? .16 : place.dark ? .15 : .14)
    const rain = weather?.phase === 'chuva', windy = rain || weather?.phase === 'aviso'
    const corner = rain && Number.isInteger(weather.whirlpool) ? weather.whirlpool : -1
    const whirlpoolArea = new Set(corner < 0 ? [] : [corner,corner+1,corner+map.width,corner+map.width+1])
    if (windy) {
      sprites ??= makeSprites()
      const firstX = Math.max(0,Math.floor(left/TILE)), lastX = Math.min(map.width-1,Math.ceil(right/TILE))
      const firstY = Math.max(0,Math.floor(top/TILE)), lastY = Math.min(map.height-1,Math.ceil(bottom/TILE))
      // Na chuva há mais ondas; no aviso, poucas. Cada onda vive 4 quadros e descansa 2 (ritmo do mapa).
      const every = rain ? 2 : 4
      for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
        const cell = y*map.width + x, hash = cellHash(cell)
        const name = tiles[cell][0]
        if (name === 'Sea' || name === 'Reef') {
          // A onda passa da casa (1,5 de altura): só onde há mar em cima e embaixo, para não invadir a terra.
          if (hash % every || y === 0 || y === map.height-1) continue
          const up = tiles[cell - map.width][0], down = tiles[cell + map.width][0]
          if (!['Sea','Reef'].includes(up) || !['Sea','Reef'].includes(down)) continue
          if (whirlpoolArea.has(cell) || whirlpoolArea.has(cell - map.width) || whirlpoolArea.has(cell + map.width)) continue
          const life = (idle + (hash >>> 3)) % 6
          if (life < 4) ctx.drawImage(sprites.waves[(hash >>> 5) % VARIANTS][life],
            x*TILE + (TILE - WAVE_WIDTH)/2,y*TILE + (TILE - WAVE_HEIGHT)/2)
        } else if (rain) ctx.drawImage(sprites.splash[(hash + idle) % VARIANTS],x*TILE,y*TILE)
      }
    }
    if (corner >= 0) {
      whirlpoolImage ??= makeWhirlpool()
      // Centro no encontro das 4 casas; gira em passos, no mesmo ritmo das animações do mapa.
      const cx = (corner % map.width + 1) * TILE, cy = (Math.floor(corner / map.width) + 1) * TILE
      ctx.save()
      ctx.translate(cx,cy)
      ctx.rotate(-(idle % 12) * Math.PI*2/12)
      ctx.drawImage(whirlpoolImage,-whirlpoolImage.width/2,-whirlpoolImage.height/2)
      ctx.restore()
    }
    return false
  }

  // Céu: chuva por cima de tudo e a massa de nuvens macia e meio transparente (não esconde as unidades).
  function paintSky(ctx,{weather,map,idle,now,left,top,right,bottom}) {
    const elapsed = lastTime ? Math.min(200,now - lastTime) : 0
    lastTime = now
    const goal = target(weather)
    progress += (goal - progress) * Math.min(1,elapsed/1400)
    if (Math.abs(goal - progress) < .002) progress = goal
    if (progress >= 2.19 && goal >= 2.2) progress = 0
    const rain = weather?.phase === 'chuva'
    if (rain) {
      sprites ??= makeSprites()
      ctx.fillStyle = 'rgba(18,28,48,.08)'
      ctx.fillRect(left,top,right-left,bottom-top)
      const firstX = Math.max(0,Math.floor(left/TILE)), lastX = Math.min(map.width-1,Math.ceil(right/TILE))
      const firstY = Math.max(0,Math.floor(top/TILE)), lastY = Math.min(map.height-1,Math.ceil(bottom/TILE))
      for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
        const cell = y*map.width + x
        ctx.drawImage(sprites.rain[(cellHash(cell) + idle*5) % VARIANTS],x*TILE,y*TILE)
      }
    }
    const place = cloudPlacement(weather,map,now)
    if (place) stretch(ctx,place.cloud,place.x,place.y,place.rain ? .3 : place.dark ? .3 : .34)
    return Math.abs(goal - progress) > .002
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
  return {paintGround,paintSky,strike,paintLightning}
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
