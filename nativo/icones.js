// Ícones desenhados no próprio canvas (sem arte de outros jogos), no tamanho dos originais:
// - botão "Capturar" do menu da unidade (4 quadros de 36×29: desabilitado, normal, mouse em cima, pressionado);
// - ícones de 20×20 da barra de modificadores: chuva, para-raios e redemoinho.

function canvas(width,height) {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  return [element,element.getContext('2d')]
}

// Bandeira branca num mastro: o símbolo da captura.
function flag(ctx,x,y,scale,color) {
  ctx.save()
  ctx.translate(x,y)
  ctx.scale(scale,scale)
  ctx.fillStyle = 'rgba(0,0,0,.35)'
  ctx.fillRect(1,1,2,18)
  ctx.fillStyle = color
  ctx.fillRect(0,0,2,18)
  ctx.beginPath()
  ctx.moveTo(2,1)
  ctx.quadraticCurveTo(7,-1,10,2)
  ctx.quadraticCurveTo(13,5,17,3)
  ctx.lineTo(17,11)
  ctx.quadraticCurveTo(13,13,10,10)
  ctx.quadraticCurveTo(7,7,2,9)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(-2,17,6,2)
  ctx.restore()
}

export function captureButton() {
  const [sheet,ctx] = canvas(36*4,29)
  const looks = [
    ['#5d5d5d','#3a3a3a','#9a9a9a'],
    ['#2fc42a','#138a10','#ffffff'],
    ['#55e04f','#1aa316','#ffffff'],
    ['#1f9e1b','#0c6b0a','#e9ffe8'],
  ]
  looks.forEach(([fill,edge,icon],index) => {
    const x = index*36
    const gradient = ctx.createLinearGradient(0,1,0,28)
    gradient.addColorStop(0,fill)
    gradient.addColorStop(1,edge)
    ctx.fillStyle = gradient
    ctx.strokeStyle = '#1b1b1b'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x+1.5,1.5,33,26,5)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,.35)'
    ctx.beginPath()
    ctx.roundRect(x+3,3,30,23,4)
    ctx.stroke()
    flag(ctx,x+11,5 + (index === 3 ? 1 : 0),1,icon)
  })
  return sheet
}

function tile(ctx,top,bottom) {
  const gradient = ctx.createLinearGradient(0,0,0,20)
  gradient.addColorStop(0,top)
  gradient.addColorStop(1,bottom)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.roundRect(.5,.5,19,19,3)
  ctx.fill()
  ctx.strokeStyle = '#26221a'
  ctx.lineWidth = 1
  ctx.stroke()
}

function cloud(ctx,x,y,color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x+4,y+5,3.2,0,Math.PI*2)
  ctx.arc(x+8,y+3.5,4,0,Math.PI*2)
  ctx.arc(x+12,y+5,3.2,0,Math.PI*2)
  ctx.fill()
  ctx.fillRect(x+4,y+5,8,3.2)
}

function bolt(ctx,x,y,scale) {
  ctx.save()
  ctx.translate(x,y)
  ctx.scale(scale,scale)
  ctx.fillStyle = '#ffd52e'
  ctx.strokeStyle = '#8a5a00'
  ctx.lineWidth = .8
  ctx.beginPath()
  ctx.moveTo(4,0); ctx.lineTo(0,6); ctx.lineTo(3,6); ctx.lineTo(1,11); ctx.lineTo(7,4); ctx.lineTo(4,4); ctx.lineTo(6,0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

export function weatherIcons() {
  const icons = {}
  // Chuva: nuvem cinza com gotas azuis.
  {
    const [image,ctx] = canvas(20,20)
    tile(ctx,'#5f7fa8','#2d4466')
    cloud(ctx,2,2,'#e8eef6')
    ctx.fillStyle = '#9fd3ff'
    for (const [x,y] of [[5,13],[9,15],[13,13],[7,17],[11,11]]) ctx.fillRect(x,y,1.5,3)
    icons.rain = image
  }
  // Para-raios: mastro com ponta, raio desviado e um escudo verde de proteção.
  {
    const [image,ctx] = canvas(20,20)
    tile(ctx,'#86a7c8','#40607f')
    bolt(ctx,2,1,1)
    ctx.fillStyle = '#d9dde2'
    ctx.fillRect(12,4,2,13)
    ctx.beginPath()
    ctx.moveTo(13,1); ctx.lineTo(15,5); ctx.lineTo(11,5)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#3b3f45'
    ctx.fillRect(9,16,8,2)
    ctx.fillStyle = '#3ecf55'
    ctx.strokeStyle = '#11531d'
    ctx.lineWidth = .8
    ctx.beginPath()
    ctx.moveTo(3,11); ctx.lineTo(8,10); ctx.lineTo(8,14); ctx.quadraticCurveTo(8,17,5.5,18.5)
    ctx.quadraticCurveTo(3,17,3,14)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(4.3,14); ctx.lineTo(5.3,15.3); ctx.lineTo(7,12.5)
    ctx.stroke()
    icons.lightningRod = image
  }
  // Redemoinho: espiral azul-clara sobre o mar.
  {
    const [image,ctx] = canvas(20,20)
    tile(ctx,'#2f7fc0','#123e6b')
    ctx.strokeStyle = '#d8f1ff'
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let step = 0; step <= 60; step++) {
      const angle = step/60*Math.PI*5, radius = .6 + step/60*7.4
      const x = 10 + Math.cos(angle)*radius, y = 10 + Math.sin(angle)*radius
      if (step) ctx.lineTo(x,y)
      else ctx.moveTo(x,y)
    }
    ctx.stroke()
    ctx.fillStyle = '#081a2e'
    ctx.beginPath()
    ctx.arc(10,10,1.6,0,Math.PI*2)
    ctx.fill()
    icons.whirlpool = image
  }
  // Raio (usado na explicação da chuva sobre unidades): nuvem escura com raio amarelo.
  {
    const [image,ctx] = canvas(20,20)
    tile(ctx,'#4a5666','#1d2430')
    cloud(ctx,2,1,'#aab4c2')
    bolt(ctx,7,8,1)
    icons.lightning = image
  }
  return icons
}
