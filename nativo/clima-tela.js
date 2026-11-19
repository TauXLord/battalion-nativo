// Clima na tela, em pixel art (blocos de PX pixels, como a arte do jogo) e no mesmo ritmo das animações do mapa:
// chuva caindo em cada casa, respingos na terra, cristas brancas no mar e nuvens meio transparentes que chegam
// por um canto do mapa antes do aviso de chuva, ficam escuras quando chove e vão embora pelo canto oposto.
// O ciclo (fase, rodadas, canto) vem do motor (state.weather); aqui é só o desenho.
import { TILE, frame } from './graficos.js'

const PX = 4
const GRID = TILE / PX
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
        const alpha = (.18 + step*.06).toFixed(2)
        dot((x - Math.floor(step/2) + FINE_GRID) % FINE_GRID,(y + step) % FINE_GRID,`rgba(40,72,135,${alpha})`)
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
  const crest = Array.from({length:VARIANTS},() => tile(dot => {
    for (let count = 0; count < 2; count++) {
      const x = Math.floor(random()*(GRID-4)), y = 1 + Math.floor(random()*(GRID-2))
      const length = 2 + Math.floor(random()*3)
      for (let step = 0; step < length; step++) dot(x+step,y,'rgba(255,255,255,.75)')
      dot(x+1,y-1,'rgba(255,255,255,.9)')
    }
  }))
  return {rain,splash,crest}
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
  const colors = (dark ? ['#3b4249','#4f5861','#656f79'] : ['#c4ccd4','#e6ebef','#ffffff'])
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
  return canvas
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
  let lightning = null
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
    cloudsKey = key
    return clouds
  }

  // Chão: respingos na terra e cristas no mar (desenhado embaixo das unidades).
  function paintGround(ctx,{weather,map,tiles,idle,left,top,right,bottom}) {
    const rain = weather?.phase === 'chuva', windy = rain || weather?.phase === 'aviso'
    if (!windy) return
    sprites ??= makeSprites()
    const firstX = Math.max(0,Math.floor(left/TILE)), lastX = Math.min(map.width-1,Math.ceil(right/TILE))
    const firstY = Math.max(0,Math.floor(top/TILE)), lastY = Math.min(map.height-1,Math.ceil(bottom/TILE))
    for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
      const cell = y*map.width + x
      const variant = (cellHash(cell) + idle) % VARIANTS
      const name = tiles[cell][0]
      if (name === 'Sea' || name === 'Reef') ctx.drawImage(sprites.crest[variant],x*TILE,y*TILE)
      else if (rain) ctx.drawImage(sprites.splash[variant],x*TILE,y*TILE)
    }
  }

  // Céu: chuva por cima de tudo e as nuvens meio transparentes (não escondem as unidades).
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
      ctx.fillStyle = 'rgba(18,28,48,.16)'
      ctx.fillRect(left,top,right-left,bottom-top)
      const firstX = Math.max(0,Math.floor(left/TILE)), lastX = Math.min(map.width-1,Math.ceil(right/TILE))
      const firstY = Math.max(0,Math.floor(top/TILE)), lastY = Math.min(map.height-1,Math.ceil(bottom/TILE))
      for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
        const cell = y*map.width + x
        ctx.drawImage(sprites.rain[(cellHash(cell) + idle*5) % VARIANTS],x*TILE,y*TILE)
      }
    }
    if (!weather || progress <= 0) return Math.abs(goal - progress) > .002
    // Direção: do canto de origem para o canto oposto.
    const [dx,dy] = [[1,1],[-1,1],[-1,-1],[1,-1]][weather.from ?? 0]
    const span = 1 + 2*CLOUD_MARGIN
    const offsetX = (progress - 1) * dx * span * map.width*TILE, offsetY = (progress - 1) * dy * span * map.height*TILE
    const dark = rain || weather.phase === 'aviso'
    const {light,dark:shadow} = cloudField(weather,map)
    const image = dark ? shadow : light
    // Deriva lenta de um lado para o outro, em passos de bloco (continua pixelado).
    const sway = Math.round(Math.sin(now/5000) * 2) * CLOUD_BLOCK
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = rain ? .42 : dark ? .36 : .3
    ctx.drawImage(image,Math.round(offsetX + sway - CLOUD_MARGIN*map.width*TILE),Math.round(offsetY - CLOUD_MARGIN*map.height*TILE),
      image.width*CLOUD_BLOCK,image.height*CLOUD_BLOCK)
    ctx.restore()
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
