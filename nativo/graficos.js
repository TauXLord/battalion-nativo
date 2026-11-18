// Funções de imagem do tabuleiro: carregar sprites, recolorir por equipe, recortar quadros e desenhar terreno.
// Separadas do tabuleiro.js (que reexporta tudo, para os outros módulos continuarem importando de lá).
export const TILE = 56
export const canvasBuffer = (width,height) => Object.assign(document.createElement('canvas'),{width,height})

export async function loadImages(files) {
  const assets = Object.entries(files).filter(([,file])=>file.endsWith('.png'))
  const entries = []
  const batch = location.protocol === 'https:' ? 16 : Math.max(1,assets.length)
  for (let index=0; index<assets.length; index+=batch) {
    const images = await Promise.all(assets.slice(index,index+batch).map(async ([name,file])=>{
      const image = new Image()
      image.src = '/recursos/' + file
      await image.decode()
      return [name,image]
    }))
    entries.push(...images)
  }
  return Object.fromEntries(entries)
}

export function colorize(image, source, target) {
  const canvas = canvasBuffer(image.width,image.height)
  const ctx = canvas.getContext('2d',{willReadFrequently:true})
  ctx.drawImage(image,0,0)
  const data = ctx.getImageData(0,0,image.width,image.height)
  const pixels = new Uint32Array(data.data.buffer)
  const convert = color => ((color & 0xff00ff00) | (color & 255) << 16 | (color >> 16 & 255)) >>> 0
  const substitutions = new Map(source.map((value,i) => [convert(value),convert(target[i])]))
  for (let i = 0; i < pixels.length; i++) {
    const next = substitutions.get(pixels[i])
    if (next !== undefined) pixels[i] = next
  }
  ctx.putImageData(data,0,0)
  return canvas
}

export function frame(ctx, image, index, x, y, w, h, width = w, height = h) {
  const columns = Math.floor(image.width / w)
  const rows = Math.floor(image.height / h)
  if (!columns || !rows) return
  const id = index % (columns * rows)
  ctx.drawImage(image,id % columns * w,Math.floor(id / columns) * h,w,h,x,y,width,height)
}

export function terrainArt(ctx, images, visual, frameIndex, x, y, width = TILE, height = TILE) {
  const [mode,names] = visual
  if (mode === 'join') {
    for (const [i,name] of names.entries()) {
      const image = images[name]
      frame(ctx,image,frameIndex,x + i % 2 * width / 2,y + (i >> 1) * height / 2,28,image.height,width / 2,height / 2)
    }
    return
  }
  const image = images[names[0]]
  frame(ctx,image,frameIndex,x,y - (image.height - TILE) * height / TILE,TILE,image.height,width,image.height * height / TILE)
}

export function terrainVariant([mode,names],cell) {
  return mode === 'random' ? ['single',[names[((cell+1)*2654435761 >>> 0) % names.length]]] : [mode,names]
}

// Dica no estilo do Flash: título em negrito e texto quebrado em linhas (dentro da área width × height).
export function drawTooltip(ctx,area,title,body,centerX,top) {
  const width = 210
  ctx.font = '10px Tahoma'
  const lines = []
  let line = ''
  for (const word of String(body).split(' ')) {
    if (line && ctx.measureText(line+word).width > width-12) { lines.push(line); line = '' }
    line += word+' '
  }
  if (line) lines.push(line)
  const height = 22 + lines.length*12
  const x = Math.max(2,Math.min(area.width-width-2,centerX-width/2))
  const y = top + height > area.height ? Math.max(2,top - height - 40) : top
  ctx.fillStyle = 'rgba(28,26,19,.94)'
  ctx.strokeStyle = '#e7d5a4'
  ctx.lineWidth = 1
  ctx.fillRect(x,y,width,height)
  ctx.strokeRect(x+.5,y+.5,width-1,height-1)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff1c8'
  ctx.font = 'bold 11px Tahoma'
  ctx.fillText(title,x+6,y+14)
  ctx.font = '10px Tahoma'
  ctx.fillStyle = '#f4ebcd'
  lines.forEach((text,index)=>ctx.fillText(text,x+6,y+28+index*12))
}
