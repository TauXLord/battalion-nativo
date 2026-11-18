import { colorize, frame, loadImages, terrainArt } from './tabuleiro.js'
import { moveCost, scenarioStructure } from './partida.js'
import { t } from './idioma.js'

const tile = 28
const $ = id => document.getElementById('edit-' + id)
const validSize = n => Number.isInteger(n) && n >= 4 && n <= 40
const colors = ['ff00ff00','ff0000ff','ffff0000','ff008080']

export async function openEditor(data,ghosts,testMap) {
  const suffix = ghosts ? '-ghosts' : ''
  const files = ['campanha'+suffix,'bootcamp'+suffix,'bonus'+suffix,...(ghosts ? [] : ['local-maps'])]
  const [images,...sources] = await Promise.all([loadImages(data.assets),...files.map(async file=>{
    const response = await fetch('/'+file+'.json')
    if (!response.ok) throw Error('Não foi possível carregar os mapas do editor.')
    return response.json()
  })])
  const templates = sources.flatMap(source=>Array.isArray(source) ? source.map(mission=>mission.board) : Object.values(source))
  const variants = new Map(templates.flatMap(board=>board.tiles).map(ground=>[JSON.stringify(ground),ground]))
  const terrain = [...variants.values()].sort(([a],[b])=>a.localeCompare(b))
  const defaultGround = terrain.find(([name])=>name === 'Plains')
  const structures = Object.entries(data.rules.terrain).filter(([,spec])=>spec.sprite).map(([name])=>name)
  const units = Object.keys(data.rules.units)
  const storageKey = 'battalion-native-map' + suffix
  const canvas = $('board'), ctx = canvas.getContext('2d',{alpha:false})
  const status = $('status')
  const teamImages = new Map()
  let board

  function teamImage(name,side,structure = false) {
    if (!side) return images[name]
    const key = name+'|'+side
    if (!teamImages.has(key)) {
      teamImages.set(key,colorize(images[name],data.palettes[structure ? 'building' : 'ffff0000'],data.palettes[colors[side-1]]))
    }
    return teamImages.get(key)
  }

  function verify(map) {
    if (!map || !validSize(map.width) || !validSize(map.height) || typeof map.title !== 'string' ||
        !Array.isArray(map.tiles) || map.tiles.length !== map.width*map.height ||
        !map.tiles.every(ground=>variants.has(JSON.stringify(ground)))) throw Error('Terreno ou dimensões inválidos neste mapa.')
    for (const [list,pieces,min] of [[map.units,units,1],[map.structures,structures,0]]) {
      if (!Array.isArray(list) || !list.every(item=>item && pieces.includes(item.name) && Number.isInteger(item.cell) &&
          item.cell >= 0 && item.cell < map.tiles.length && Number.isInteger(item.side) && item.side >= min && item.side <= 4) ||
          new Set(list.map(item=>item.cell)).size !== list.length) throw Error('Unidades ou construções inválidas neste mapa.')
    }
    const slots = Math.max(2,...map.units.map(unit=>unit.side))
    const coalitions = Array.isArray(map.coalitions) && map.coalitions.length === slots &&
      map.coalitions.every(group=>Number.isInteger(group) && group >= 1 && group <= slots) ? map.coalitions.slice() : undefined
    return {title:map.title.trim().slice(0,60) || 'Meu mapa',width:map.width,height:map.height,
      tiles:map.tiles.map(ground=>variants.get(JSON.stringify(ground))), units:map.units.map(piece),
      structures:map.structures.map(item=>({...piece(item),name:scenarioStructure(item.name)})),coalitions}
  }
  const piece = ({name,cell,side})=>({name,cell,side})

  function save() {
    try { localStorage.setItem(storageKey,JSON.stringify(board)) } catch {}
  }

  function draw() {
    canvas.width = board.width*tile
    canvas.height = board.height*tile
    ctx.imageSmoothingEnabled = false
    const x = cell=>cell%board.width*tile
    const y = cell=>Math.floor(cell/board.width)*tile
    for (const [cell,[,[mode,names]]] of board.tiles.entries()) {
      terrainArt(ctx,images,mode === 'random' ? ['single',[names[cell%names.length]]] : [mode,names],0,x(cell),y(cell),tile,tile)
    }
    for (const item of board.structures) {
      const sprite = teamImage(data.rules.terrain[item.name].sprite,item.side,true)
      ctx.drawImage(sprite,x(item.cell),y(item.cell)+tile-sprite.height/2,sprite.width/2,sprite.height/2)
    }
    for (const item of board.units) {
      const {image,width,height} = data.rules.units[item.name].sprite
      frame(ctx,teamImage(image,item.side),4,x(item.cell),y(item.cell)+tile-height/2,width,height,width/2,height/2)
    }
  }

  function setBoard(map) {
    board = verify(map)
    $('name').value = board.title
    $('width').value = board.width
    $('height').value = board.height
    draw()
    save()
  }

  function chooseLayer() {
    const layer = $('layer').value
    const picks = layer === 'terrain' ? terrain.map(([name],index)=>[t(name)+' · '+(index+1),String(index)]) :
      [[t('Apagar'),''],...(layer === 'unit' ? units : structures.filter(name=>scenarioStructure(name)===name)).map(name=>[t(name),name])]
    $('piece').replaceChildren(...picks.map(([label,value])=>new Option(label,value)))
    $('team-row').hidden = layer === 'terrain'
    $('team').replaceChildren(...(layer === 'structure' ? [0,1,2,3,4] : [1,2,3,4])
      .map(side=>new Option(side ? t('Equipe {n}',{n:side}) : t('Neutra'),String(side))))
  }

  const report = callback => async () => {
    try { status.textContent = ''; await callback() } catch (error) { status.textContent = t(error.message) }
  }
  $('base').replaceChildren(new Option(t('Selecionar mapa…'),''),...templates.map((map,index)=>new Option(t(map.title),String(index))))
  $('base').onchange = report(()=>{if ($('base').value !== '') setBoard(templates[Number($('base').value)])})
  $('name').onchange = () => {board.title = $('name').value.trim() || 'Meu mapa'; save()}
  $('layer').onchange = chooseLayer
  $('new').onclick = report(()=>{
    const width = $('width').valueAsNumber, height = $('height').valueAsNumber
    if (!validSize(width) || !validSize(height)) throw Error('Use de 4 a 40 casas por lado.')
    setBoard({title:$('name').value,width,height,tiles:Array.from({length:width*height},()=>defaultGround),units:[],structures:[]})
    $('base').value = ''
  })
  $('import').onchange = report(async ()=>{
    const file = $('import').files[0]
    if (!file) return
    if (file.size > 1000000) throw Error('Use um arquivo JSON exportado pelo editor.')
    setBoard(JSON.parse(await file.text()))
    $('base').value = ''
    $('import').value = ''
  })
  $('export').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(board)],{type:'application/json'}))
    const link = document.createElement('a')
    link.href = url
    link.download = board.title.replace(/[<>:"/\\|?*]/g,'-') + '.json'
    link.click()
    setTimeout(()=>URL.revokeObjectURL(url),500)
  }
  canvas.onclick = event => {
    status.textContent = ''
    const rect = canvas.getBoundingClientRect()
    const col = Math.floor((event.clientX-rect.x)/rect.width*board.width)
    const row = Math.floor((event.clientY-rect.y)/rect.height*board.height)
    if (col < 0 || col >= board.width || row < 0 || row >= board.height) return
    const cell = row*board.width+col, layer = $('layer').value, choice = $('piece').value
    if (layer === 'terrain') board.tiles[cell] = terrain[Number(choice)]
    else {
      const collection = layer === 'unit' ? 'units' : 'structures'
      board[collection] = board[collection].filter(item=>item.cell !== cell)
      if (choice) board[collection].push({name:choice,cell,side:Number($('team').value)})
    }
    draw()
    save()
  }
  const test = mode => report(()=>{
    const sides = new Set(board.units.map(item=>item.side))
    if (!sides.has(1) || !sides.has(2) || (sides.has(4) && !sides.has(3))) {
      throw Error('Coloque unidades nas equipes em ordem, começando pelas equipes 1 e 2.')
    }
    const position = {ore:{},units:board.units,structures:board.structures}
    for (const unit of board.units) {
      if (!Number.isFinite(moveCost(data.rules,board,position,data.rules.units[unit.name],unit.cell,unit.side))) {
        throw Error(t('{unit} está num terreno que não pode ocupar.',{unit:t(unit.name)}))
      }
    }
    return testMap(structuredClone(board),mode,Number($('difficulty').value))
  })
  $('play').onclick = test('ai')
  $('hotseat').onclick = test('hotseat')
  chooseLayer()
  try { setBoard(JSON.parse(localStorage.getItem(storageKey))) }
  catch { setBoard(templates[0]) }
  document.getElementById('native-editor').hidden = false
}
