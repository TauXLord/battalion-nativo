import { allied, buildCells, buildCost, buildTargetScore } from './partida.js'
import { t } from './idioma.js'

const WIDTH = 700
const HEIGHT = 600
const previewWindow = {x:67,y:79}
const spriteCenters = new WeakMap()
const groups = [
  {type:'ground',label:'Terrestres',left:10,columns:3},
  {type:'air',label:'Aéreas',left:350,columns:1},
  {type:'sea',label:'Navais',left:500,columns:2},
]

const equipment = {none:'ausente',light:'leve',medium:'média',heavy:'pesada'}
const armorNotes = {
  none:'Esta unidade não tem blindagem.',
  light:'Resiste a armas pesadas e é vulnerável a armas leves.',
  medium:'Recebe dano normal de armas leves, médias e pesadas.',
  heavy:'Resiste a armas leves e é vulnerável a armas pesadas.',
}
const weaponNotes = {
  light:'Mais eficaz contra blindagem leve.',
  medium:'Tem o mesmo multiplicador contra todos os tipos de blindagem.',
  heavy:'Mais eficaz contra blindagem pesada.',
}
const movementDetails = {
  tracked:['esteiras','Favorecem a travessia terrestre em terrenos irregulares.'],
  wheeled:['rodas','Têm melhor mobilidade em estradas e pontes.'],
  feet:['a pé','Soldados e o Spider Tank atravessam floresta e montanha sem perder movimento; o arame farpado do deserto os bloqueia.'],
  rudder:['navegação','Usa água e terrenos costeiros compatíveis.'],
  wings:['voo','Fica limitado por zonas de bloqueio e alguns terrenos.'],
  none:['fixo','Unidade fixa.'],
}

// Saldo do confronto em créditos: o que a unidade causa ao atacar o alvo menos o que sofre quando o alvo a ataca.
// Assim aparecem também as ameaças que ela nem consegue atingir (ex.: soldados contra aeronaves).
export function matchups(rules,map,state,unit,opponents) {
  const ranked = opponents.map(enemy=>({unit:enemy,
    score:buildTargetScore(rules,map,state,unit,enemy) - buildTargetScore(rules,map,state,enemy,unit)}))
    .sort((a,b)=>b.score-a.score)
  return {best:ranked.filter(({score})=>score >= 70),worst:ranked.filter(({score})=>score <= -25).reverse()}
}

export function unitStatDetails(spec,min,max) {
  const [movement,movementNote] = movementDetails[spec.movementType]
  const armorNote = t(armorNotes[spec.armorType]) + (spec.unitType === 'air' ?
    ' '+t('Aeronaves sofrem muito com armas leves antiaéreas; soldados não conseguem atacá-las.') : '')
  const weaponNote = spec.damage ?
    [t('Dano base {n}.',{n:spec.damage}),weaponNotes[spec.weaponType] ? t(weaponNotes[spec.weaponType]) : '',
      min === max ? t(max === 1 ? 'Alcance de {n} casa.' : 'Alcance de {n} casas.',{n:max}) : t('Alcance de {a} a {b} casas.',{a:min,b:max})]
      .filter(Boolean).join(' ') :
    t('Esta unidade não dispara.')
  return [
    {icon:'armor_'+spec.armorType,name:t('Blindagem {x}',{x:t(equipment[spec.armorType])}),description:armorNote},
    {icon:'weapon_'+spec.weaponType,name:t('Arma {x}',{x:t(equipment[spec.weaponType])}),description:weaponNote},
    {icon:spec.movementType,name:t('Movimento {x}',{x:t(movement)}),description:t(movementNote)},
  ]
}

function visibleSpriteCenter(image,{width,height},frames,frame) {
  if (spriteCenters.has(image)) return spriteCenters.get(image)
  const buffer = document.createElement('canvas')
  buffer.width = width*frames.length
  buffer.height = height
  const ctx = buffer.getContext('2d')
  frames.forEach((index,column)=>frame(ctx,image,index,column*width,0,width,height))
  const {data} = ctx.getImageData(0,0,buffer.width,height)
  let left = width, right = -1, top = height, bottom = -1
  for (let y=0; y<height; y++) {
    for (let column=0; column<buffer.width; column++) {
      // The translucent ground shadow should not pull an aircraft off center.
      if (data[(y*buffer.width+column)*4+3] < 128) continue
      const x = column%width
      left = Math.min(left,x)
      right = Math.max(right,x)
      top = Math.min(top,y)
      bottom = Math.max(bottom,y)
    }
  }
  const center = right < 0 ? [width/2,height/2] : [(left+right+1)/2,(top+bottom+1)/2]
  spriteCenters.set(image,center)
  return center
}

export function showWarmachineMenu({dialog,data,images,map,state,builder,teamImage,frame,choose}) {
  const {rules,terrainInfo} = data
  const canvas = dialog.querySelector('canvas'), ctx = canvas.getContext('2d')
  const buttons = dialog.querySelector('.wm-catalog-buttons')
  const infoButtons = dialog.querySelector('.wm-catalog-info')
  const tooltip = dialog.querySelector('.wm-catalog-tooltip')
  const close = dialog.querySelector('.wm-catalog-close')
  const atlas = images[terrainInfo.image]
  const roster = state.buildable?.[builder.side-1]
  const options = Object.entries(rules.units)
    .filter(([name,spec])=>!spec.mods.includes('Unbuildable') && (!roster || roster.includes(name)))
    .map(([name,spec])=>{
      const cost = buildCost(rules,state,builder,spec)
      // Na fábrica, o tipo fica bloqueado até a equipe capturar o controle (terrestre, aéreo ou naval) correspondente.
      const locked = !Number.isFinite(cost)
      return {name,spec,locked,cost:locked ? spec.cost : cost,
        available:!locked && buildCells(rules,map,state,{...builder,credits:Infinity},spec).length > 0}
    }).sort((a,b)=>a.cost-b.cost)
  const cards = groups.flatMap(group=>options.filter(({spec})=>spec.unitType===group.type)
    .map((entry,index)=>({...entry,x:group.left+(index%group.columns)*98,y:196+Math.floor(index/group.columns)*102,
      group:group.label})))
  if (!cards.length) return false

  // Pontos fortes e fracos: além das unidades inimigas no mapa, entram todos os tipos que o inimigo pode construir.
  const enemySide = state.units.find(unit=>!allied(state,builder.side,unit.side))?.side ??
    (state.colors ?? [0,0]).map((_,index)=>index+1).find(team=>!allied(state,builder.side,team)) ?? (builder.side === 1 ? 2 : 1)
  const onMap = state.units.filter(unit=>!allied(state,builder.side,unit.side) && !unit.cloaked)
  const enemyRoster = state.buildable?.[enemySide-1]
  const opponents = [...new Map([
    ...Object.entries(rules.units)
      .filter(([name,spec])=>!spec.mods.includes('Unbuildable') && (!enemyRoster || enemyRoster.includes(name)))
      .map(([name,spec])=>[name,{name,side:enemySide,hp:spec.health}]),
    ...onMap.map(unit=>[unit.name,{name:unit.name,side:unit.side,hp:rules.units[unit.name].health}]),
  ]).values()].filter(unit=>!rules.units[unit.name].mods.includes('Not Selectable'))
  let preview = cards.find(card=>card.available) ?? cards[0]
  let spinning, portraitStart = performance.now(), spinStart = portraitStart
  let portraitIndex = 0, cardIndex = 4, animationFrame, portraitX, portraitY, backgroundOffset = 0
  let targetGroups
  ctx.imageSmoothingEnabled = false

  function label(value,x,y,{font = '12px Tahoma',color = '#fff1c8',align = 'left'} = {}) {
    ctx.font = font
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.fillText(value,x,y)
  }

  function portrait(name,side,x,y,index = 4) {
    const sprite = rules.units[name].sprite
    frame(ctx,teamImage(sprite.image,side),index,x,y,sprite.width,sprite.height)
  }

  function icon(name,x,y) {
    const index = terrainInfo.frames[name]
    if (index !== undefined) frame(ctx,atlas,index,x,y,terrainInfo.width,terrainInfo.height)
  }

  function render() {
    ctx.drawImage(images.build_background,0,0)
    ctx.save()
    ctx.beginPath()
    const {x,y} = previewWindow
    ctx.ellipse(x,y,54,60,0,0,Math.PI*2)
    ctx.clip()
    // Como no Flash: duas cópias do fundo lado a lado rolando 1 px por quadro (~30 px/s) para a esquerda.
    const background = images['bg_'+preview.spec.unitType]
    const left = x-54-backgroundOffset
    ctx.drawImage(background,left,y-background.height/2)
    ctx.drawImage(background,left+background.width,y-background.height/2)
    portrait(preview.name,builder.side,portraitX,portraitY,portraitIndex)
    ctx.restore()
    ctx.drawImage(images.build_portrait_frame,5,9)
    label(t(preview.name),x,142,{font:'11px Tahoma',color:'#21190e',align:'center'})
    const info = preview.spec
    icon('armor_'+info.armorType,142,21)
    icon('weapon_'+info.weaponType,222,21)
    icon(info.movementType,302,21)
    for (const [x,title,value] of [
      [165,'Health:',info.health+'/'+info.health],
      [245,'Damage:',info.damage+(info.weaponRangeMax>1 ? ' ['+info.weaponRangeMin+'–'+info.weaponRangeMax+']' : '')],
      [325,'Move:',String(info.range)],
    ]) {
      label(t(title),x,30,{font:'10px Tahoma'})
      label(String(value),x,41,{font:'11px Tahoma'})
    }
    info.mods.filter(name=>Object.hasOwn(terrainInfo.unitModifiers,name)).forEach((name,index)=>{
      frame(ctx,atlas,terrainInfo.unitModifiers[name].index,384+index*21,21,terrainInfo.width,terrainInfo.height)
    })
    ctx.font = '11px Tahoma'
    let line = '', lineY = 53
    for (const word of t(info.description).split(' ')) {
      if (ctx.measureText(line+word).width>414) {
        label(line,142,lineY,{font:'11px Tahoma'})
        line = ''
        lineY += 11
      }
      line += word+' '
    }
    label(line,142,lineY,{font:'11px Tahoma'})
    for (const [targets,x,flag] of targetGroups) {
      for (const [index,{unit}] of targets.entries()) {
        const left = x+index*56
        portrait(unit.name,unit.side,left,130-rules.units[unit.name].sprite.height)
        frame(ctx,images.attackTargets,flag,left,74,56,56)
      }
    }
    frame(ctx,images.build_button_cancel,close.matches(':focus-visible') || close.matches(':hover') ? 2 : 1,574,0,126,71)
    label('$ '+builder.credits.toLocaleString('en-US'),635,122,{font:'bold 15px Tahoma',align:'center'})
    for (const card of cards) {
      const {x,y,name,spec,cost,available} = card
      ctx.drawImage(images.build_unitFrame_underlay,x,y)
      if (available) {
        ctx.globalAlpha = cost <= builder.credits ? 1 : .4
        const sprite = spec.sprite
        const bottom = y+(spec.unitType === 'air' ? 83 : 75)
        portrait(name,builder.side,x+(92-sprite.width)/2,bottom-sprite.height,card === spinning ? cardIndex : 4)
        ctx.globalAlpha = 1
      }
      ctx.drawImage(images['build_unitFrame_'+(available ? cost <= builder.credits ? 'overlay' : 'unaffordable' : 'unavailable')],x,y)
      if (available) {
        label('$'+cost,x+46,y+90,{font:'14px Battalion, Georgia, serif',
          color:cost > builder.credits ? '#941b14' : '#21190e',align:'center'})
      }
    }
  }

  function locate(button,x,y,width,height) {
    button.style.left = x/WIDTH*100+'%'
    button.style.top = y/HEIGHT*100+'%'
    button.style.width = width/WIDTH*100+'%'
    button.style.height = height/HEIGHT*100+'%'
  }

  function updatePreview(card) {
    preview = card
    portraitStart = performance.now()
    portraitIndex = data.movement.right.frames[0]
    const {spec,name} = card
    const [cx,cy] = visibleSpriteCenter(images[spec.sprite.image],spec.sprite,data.movement.right.frames,frame)
    portraitX = Math.round(previewWindow.x-cx)
    portraitY = Math.round(previewWindow.y-cy)
    const {best,worst} = matchups(rules,map,state,{name,side:builder.side,hp:spec.health},opponents)
    targetGroups = [[best.slice(0,3),161,1],[worst.slice(0,3),364,0]]
    const names = list => list.slice(0,5).map(({unit})=>t(unit.name)).join(', ')
    const entries = unitStatDetails(spec,spec.weaponRangeMin,spec.weaponRangeMax)
      .map((info,index)=>({...info,x:142+index*80,width:76}))
    if (worst.length) entries[0].description += '\n\n'+t('Fraco contra: {x}.',{x:names(worst)})
    if (best.length) entries[1].description += '\n\n'+t('Forte contra: {x}.',{x:names(best)})
    const mods = spec.mods.filter(name=>Object.hasOwn(terrainInfo.unitModifiers,name))
    for (const [index,name] of mods.entries()) {
      entries.push({name:t(name),description:t(terrainInfo.unitModifiers[name].description),x:384+index*21,width:20})
    }
    tooltip.hidden = true
    infoButtons.replaceChildren(...entries.map(({name,description,x,width})=>{
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('aria-label',name)
      button.setAttribute('aria-describedby',tooltip.id)
      locate(button,x,19,width,24)
      const show = () => {
        tooltip.querySelector('strong').textContent = name
        tooltip.querySelector('p').textContent = description
        tooltip.style.left = Math.max(4,Math.min(x+width/2-110,476))/WIDTH*100+'%'
        tooltip.hidden = false
      }
      const hide = () => {tooltip.hidden = true}
      button.onpointerenter = button.onfocus = button.onclick = show
      button.onpointerleave = button.onblur = hide
      return button
    }))
  }

  function tick(now) {
    if (!dialog.open) return
    const {right,spin} = data.movement
    const nextPortrait = right.frames[Math.floor(Math.max(0,now-portraitStart)/right.wait)%right.frames.length]
    const nextCard = spinning ? spin.frames[(1+Math.floor(Math.max(0,now-spinStart)/spin.wait))%spin.frames.length] : 4
    const width = images['bg_'+preview.spec.unitType].width
    const nextOffset = Math.floor(Math.max(0,now-portraitStart)*30/1000)%width
    if (nextPortrait !== portraitIndex || nextCard !== cardIndex || nextOffset !== backgroundOffset) {
      portraitIndex = nextPortrait
      cardIndex = nextCard
      backgroundOffset = nextOffset
      render()
    }
    animationFrame = requestAnimationFrame(tick)
  }

  buttons.replaceChildren(...cards.map(card=>{
    const button = document.createElement('button')
    button.type = 'button'
    const allowed = card.available && card.cost <= builder.credits
    const control = {ground:'Ground Control',air:'Air Control',sea:'Sea Control'}[card.spec.unitType]
    const reason = card.locked ? ' · '+t('capture um {x} para liberar',{x:t(control)}) :
      !card.available ? ' · '+t('sem saída livre para esta unidade') :
      !allowed ? ' · '+t('saldo insuficiente') : ''
    button.setAttribute('aria-label',t(card.name)+' · '+t(card.group)+' · $'+card.cost+reason)
    button.setAttribute('aria-disabled',String(!allowed))
    button.title = t(card.name)+reason
    locate(button,card.x,card.y,92,97)
    const show = () => {
      // Mesmo bloqueada, a unidade mostra atributos, pontos fortes e fracos.
      if (preview !== card) updatePreview(card)
      if (allowed && spinning !== card) {
        spinning = card
        spinStart = performance.now()
        cardIndex = data.movement.spin.frames[1]
      }
      render()
    }
    const stopSpin = () => {
      if (spinning !== card) return
      spinning = undefined
      cardIndex = 4
      render()
    }
    button.onpointerenter = button.onfocus = show
    button.onpointerleave = button.onblur = stopSpin
    button.onclick = () => {
      if (!allowed) return
      dialog.close()
      choose(card.name)
    }
    return button
  }))
  close.onpointerenter = close.onpointerleave = close.onfocus = close.onblur = render
  updatePreview(preview)
  dialog.addEventListener('close',()=>{
    cancelAnimationFrame(animationFrame)
    tooltip.hidden = true
  },{once:true})
  dialog.showModal()
  render()
  animationFrame = requestAnimationFrame(tick)
  return true
}
