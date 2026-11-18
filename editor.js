import { replaceBinaryTags } from './swf-map.js'

const $ = id => document.getElementById(id)
const grid = $('map-grid')
const status = $('editor-status')
const parser = new DOMParser()
const serializer = new XMLSerializer()
const games = ['ghosts', 'vengeance']
const mapTag = { ghosts: 3362, vengeance: 3362 }
const campaignTag = { ghosts: 3236, vengeance: 3360 }
const draftKey = 'battalion-yimf-draft-v1'
const catalogs = {}
let edition = 'ghosts'
let draft

function xml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('Use um mapa YIMF sem declarações externas.')
  const doc = parser.parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw Error('O XML do arquivo é inválido.')
  return doc
}

async function fetchText(path) {
  const response = await fetch(path)
  if (!response.ok) throw Error('Não foi possível carregar ' + path)
  return response.text()
}

function readMap(text, trusted = false) {
  const root = xml(text).documentElement
  if (root.nodeName !== 'map') throw Error('Selecione um mapa YIMF.')
  const w = Number(root.querySelector('cols')?.textContent)
  const h = Number(root.querySelector('rows')?.textContent)
  if (![w, h].every(n => Number.isInteger(n) && n >= 4 && n <= 24)) throw Error('Use mapas de 4 a 24 casas por lado.')
  const swatches = new Map()
  for (const entry of root.querySelectorAll('palette > entry')) {
    const piece = { name: entry.querySelector('name')?.textContent, image: entry.querySelector('imageCode')?.textContent }
    if (!piece.name || !piece.image || (!trusted && !catalogs[edition].pieces.has(key(piece)))) {
      throw Error('O mapa usa peças que não estão na paleta desta edição.')
    }
    swatches.set(entry.getAttribute('reference'), piece)
  }
  const cells = Array.from({ length: w * h }, () => [])
  for (const tile of root.querySelectorAll('map > tile')) {
    const x = Number(tile.getAttribute('c')), y = Number(tile.getAttribute('r'))
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h || cells[y * w + x].length) {
      throw Error('O mapa tem posições inválidas ou repetidas.')
    }
    for (const layer of tile.querySelectorAll('layer')) {
      const depth = Number(layer.getAttribute('depth'))
      const piece = swatches.get(layer.getAttribute('reference'))
      if (!piece || ![0, 1, 2].includes(depth) || cells[y * w + x][depth]) throw Error('O mapa tem uma camada inválida.')
      cells[y * w + x][depth] = piece
    }
  }
  if (cells.some(cell => !cell[0])) throw Error('Todas as casas precisam ter terreno.')
  return { title: root.querySelector('map > name')?.textContent?.trim().slice(0, 60) || 'Meu mapa', w, h, cells }
}

const key = p => p.name + '\n' + p.image
const side = p => /^P([12]) /.exec(p?.name)?.[1]
const terrainClass = n => /Sea|Reef|Shore|Archipelago/.test(n) ? 'water' :
  /Mountain|Rock/.test(n) ? 'rock' : /Forest|Hill/.test(n) ? 'forest' : /Road|Bridge/.test(n) ? 'road' : ''
const naval = p => /Battlecruiser|Leviathan|U-Boat|Corvette/i.test(p.name)
function canPlace(ground, unit) {
  const water = /Sea|Reef|Archipelago|Rock Formation/.test(ground.name)
  if (naval(unit)) return water || /Shore|High Bridge/.test(ground.name)
  return !water && ground.name !== 'Mountain'
}

function save() {
  try {
    localStorage.setItem(draftKey + '-' + edition, writeMap())
    localStorage.setItem(draftKey, edition)
  } catch {}
}

function savedMap() {
  try {
    const text = localStorage.getItem(draftKey + '-' + edition)
    return text ? readMap(text) : null
  } catch { return null }
}

function setMap(map) {
  draft = map
  $('map-title').value = map.title
  $('map-cols').value = map.w
  $('map-rows').value = map.h
  draw()
  save()
}

function draw() {
  grid.style.gridTemplateColumns = `repeat(${draft.w}, minmax(21px, 1fr))`
  grid.replaceChildren(...draft.cells.map((layers, i) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cell ' + terrainClass(layers[0].name)
    const unit = layers[2]
    if (unit) {
      button.dataset.side = side(unit) ?? ''
      button.textContent = unit.name.replace(/^P\d /, '').split(' ').map(word => word[0]).join('').slice(0, 3)
    }
    const coordinate = String.fromCharCode(65 + i % draft.w) + (Math.floor(i / draft.w) + 1)
    button.title = [coordinate, ...layers.filter(Boolean).map(piece => piece.name)].join(' · ')
    button.setAttribute('aria-label', button.title)
    button.onclick = () => {
      paint(i)
      grid.children[i].focus({ preventScroll: true })
    }
    return button
  }))
}

function refreshBrush() {
  const tool = $('map-tool').value
  $('brush-label').hidden = tool === 'erase'
  const names = new Map()
  const options = []
  for (const piece of catalogs[edition][tool === 'unit' ? 'units' : 'land']) {
    const index = (names.get(piece.name) ?? 0) + 1
    names.set(piece.name, index)
    const label = piece.name.replace(/^P1 /, 'Aliado · ').replace(/^P2 /, 'IA · ')
    options.push(new Option(label + (index > 1 ? ` · ${index}` : ''), key(piece)))
  }
  $('map-brush').replaceChildren(...options)
}

function paint(i) {
  const layers = draft.cells[i]
  const tool = $('map-tool').value
  const brush = catalogs[edition].pieces.get($('map-brush').value)
  if (tool === 'land' && layers[2] && !canPlace(brush, layers[2])) {
    status.textContent = 'Remova a unidade antes de mudar para esse terreno.'
    return
  }
  if (tool === 'unit' && !canPlace(layers[0], brush)) {
    status.textContent = 'Essa unidade não pode ocupar esse terreno.'
    return
  }
  if (tool === 'erase') delete layers[2]
  else layers[tool === 'land' ? 0 : 2] = brush
  status.textContent = ''
  draw()
  save()
}

function writeMap() {
  const doc = xml('<map/>')
  const element = (parent, type, value) => {
    const item = doc.createElement(type)
    if (value !== undefined) item.textContent = String(value)
    return parent.appendChild(item)
  }
  const root = doc.documentElement
  element(root, 'description')
  element(root, 'name', draft.title)
  element(root, 'author', 'Editor local Battalion')
  element(root, 'mode', 'Battalion Map Editor')
  element(root, 'rows', draft.h)
  element(root, 'cols', draft.w)
  element(root, 'layers', 3)
  const palette = element(root, 'palette')
  const references = new Map()
  draft.cells.forEach((pieces, index) => {
    const tile = element(root, 'tile')
    tile.setAttribute('c', index % draft.w)
    tile.setAttribute('r', Math.floor(index / draft.w))
    pieces.forEach((piece, depth) => {
      const id = key(piece)
      if (!references.has(id)) {
        const entry = element(palette, 'entry')
        entry.setAttribute('reference', references.size)
        element(entry, 'name', piece.name)
        element(entry, 'imageCode', piece.image)
        references.set(id, references.size)
      }
      const layer = element(tile, 'layer')
      layer.setAttribute('reference', references.get(id))
      layer.setAttribute('depth', depth)
    })
  })
  element(root, 'script')
  return serializer.serializeToString(doc)
}

function scenarioCampaign() {
  const doc = xml(catalogs[edition].campaign)
  const root = doc.documentElement
  const levels = [...root.querySelectorAll('level')]
  for (const level of levels.slice(1)) level.remove()
  root.setAttribute('levels', '1')
  levels[0].setAttribute('name', draft.title)
  levels[0].querySelector('brief').setAttribute('value', 'Partida personalizada. Elimine as unidades adversárias.')
  return serializer.serializeToString(doc)
}

async function runMap() {
  if (!['1', '2'].every(team => draft.cells.some(cell => side(cell[2]) === team))) {
    throw Error('Coloque pelo menos uma unidade aliada e uma unidade da IA.')
  }
  $('test-map').disabled = true
  status.textContent = 'Preparando a batalha…'
  try {
    const game = edition
    const map = writeMap()
    const campaign = scenarioCampaign()
    const response = await fetch(`/jogo/battalion-${game}.swf`)
    if (!response.ok) throw Error('O arquivo do jogo está indisponível.')
    const customData = await replaceBinaryTags(await response.arrayBuffer(), new Map([
      [mapTag[game], map], [campaignTag[game], campaign],
    ]))
    $('editor-view').hidden = true
    $('player-title').textContent = 'Mapa personalizado'
    $('player-view').hidden = false
    $('player-view').querySelector('header a').href = '/?editor'
    $('player-view').querySelector('header a').textContent = '← Voltar ao editor'
    await window.loadBattalion(game, customData)
  } catch (error) {
    $('player-view').hidden = true
    $('editor-view').hidden = false
    throw error
  } finally {
    $('test-map').disabled = false
    status.textContent = ''
  }
}

function useEdition(game, reset = false) {
  edition = game
  $('map-game').value = game
  refreshBrush()
  setMap((reset ? null : savedMap()) ?? structuredClone(catalogs[game].template))
  status.textContent = ''
}

await Promise.all(games.map(async game => {
  const [text, campaign] = await Promise.all([fetchText(`/mapas/${game}.yimf`), fetchText(`/mapas/${game}.xml`)])
  const template = readMap(text, true)
  template.title = 'Capítulo 1 · ' + (game === 'ghosts' ? 'Ghosts' : 'Vengeance')
  const pieces = new Map()
  const land = new Map()
  const units = new Map()
  for (const [terrain, structure, unit] of template.cells) {
    land.set(key(terrain), terrain)
    pieces.set(key(terrain), terrain)
    if (structure) pieces.set(key(structure), structure)
    if (!unit || !side(unit)) continue
    for (const team of ['1', '2']) {
      const piece = { name: unit.name.replace(/^P\d /, `P${team} `), image: unit.image.replace(/^@\(\d+;/, `@(${team};`) }
      pieces.set(key(piece), piece)
      units.set(key(piece), piece)
    }
  }
  catalogs[game] = { template, campaign, pieces, land: [...land.values()], units: [...units.values()] }
}))

const guard = fn => async () => {
  try { await fn() } catch (error) { status.textContent = error.message }
}
$('map-game').onchange = () => useEdition($('map-game').value)
$('map-tool').onchange = refreshBrush
$('map-title').oninput = () => {
  draft.title = $('map-title').value.trim() || 'Meu mapa'
  save()
}
$('template-map').onclick = () => useEdition(edition, true)
$('blank-map').onclick = guard(() => {
  const w = Number($('map-cols').value), h = Number($('map-rows').value)
  if (![w, h].every(n => Number.isInteger(n) && n >= 4 && n <= 24)) throw Error('Use dimensões entre 4 e 24 casas.')
  const plains = catalogs[edition].land.find(piece => piece.name === 'Plains')
  setMap({ title: 'Meu mapa', w, h, cells: Array.from({ length: w * h }, () => [plains]) })
  status.textContent = ''
})
$('export-map').onclick = () => {
  const url = URL.createObjectURL(new Blob([writeMap()], { type: 'application/xml' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'battalion-mapa.yimf'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
$('import-map').onclick = () => $('map-file').click()
$('map-file').onchange = guard(async () => {
  const file = $('map-file').files[0]
  $('map-file').value = ''
  if (!file) return
  if (file.size > 256 * 1024) throw Error('O mapa excede 256 KB.')
  setMap(readMap(await file.text()))
  status.textContent = 'Mapa importado.'
})
$('test-map').onclick = guard(runMap)

let saved
try { saved = localStorage.getItem(draftKey) } catch {}
useEdition(games.includes(saved) ? saved : 'ghosts')
