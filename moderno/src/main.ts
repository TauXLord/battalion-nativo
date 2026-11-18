import Phaser from 'phaser'
import { Board } from './board'
import { advance, apply, canFire, choose, exchange, inRange, start, stepCost, type Difficulty } from './battle'
import { availableUnits, brief, chapter, intro, terrainInfo, terrainNames, terrains, unitNames, unitSpecs, validateScenario, type Scenario, type Terrain } from './data'
import './style.css'

const by = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const button = (id: string) => by<HTMLButtonElement>(id)
const field = (id: string) => by<HTMLInputElement>(id)
const select = (id: string) => by<HTMLSelectElement>(id)
const dialog = by<HTMLDialogElement>('briefing')
const stage = by('app')
const surface = by('board')
const board = new Board()
const key = 'battalion-moderno-editor-v1'
let mode: 'campaign' | 'editor' | 'skirmish' = 'campaign'
let edit = loadDraft()
let battle = start(chapter)
let selected: number | undefined
let hovered = -1
let busy = false
let session = 0
let dialogue = -1
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const note = (message: string) => { by('status').textContent = message }

function loadDraft() {
  try {
    const saved = localStorage.getItem(key)
    if (saved) return validateScenario(JSON.parse(saved))
  } catch { /* Default to a fresh draft if storage is unavailable or invalid. */ }
  return { ...structuredClone(chapter), title: 'Meu mapa' }
}

function saveDraft() {
  try { localStorage.setItem(key, JSON.stringify(validateScenario(edit))) } catch { /* Export remains available. */ }
}

function setDraft(draft: Scenario) {
  edit = draft
  field('map-name').value = draft.title
  field('columns').value = String(draft.width)
  field('rows').value = String(draft.height)
  saveDraft()
  render()
}

function unitName(type: string) { return unitNames[type] ?? type }
function describe() {
  const panel = by('intel')
  panel.replaceChildren()
  const active = battle.units.find(u => u.id === selected)
  const target = battle.units.find(u => u.cell === hovered && u.side !== active?.side)
  const shown = active ?? target
  const title = document.createElement('h3')
  title.textContent = shown ? unitName(shown.type) : 'Selecione uma unidade'
  panel.append(title)
  const add = (text: string) => {
    const row = document.createElement('p')
    row.textContent = text
    panel.append(row)
  }
  if (!shown) {
    add('Clique em qualquer ponto da casa de um tanque aliado para ver onde ele pode se mover e atacar.')
    return
  }
  const spec = unitSpecs[shown.type]
  add(`Vida ${shown.hp}/${spec.health} · Movimento ${spec.move} · Alcance ${spec.min}–${spec.max}`)
  add(`Terreno atual: ${terrainNames[battle.map.tiles[shown.cell]]}`)
  if (active?.fired) add('Ataque realizado neste turno.')
  if (active && target && canFire(active) && inRange(battle, active, target.cell)) {
    const result = exchange(battle, active, target)
    add(`${unitName(target.type)} · Dano previsto ${result.hit} · Contra-ataque ${result.counter}`)
  }
}

function render() {
  const editing = mode === 'editor'
  const map = editing ? edit : battle.map
  by('editor-panel').hidden = !editing
  by('battle-panel').hidden = editing
  button('return').hidden = mode !== 'skirmish'
  button('campaign').setAttribute('aria-pressed', String(mode === 'campaign'))
  button('editor').setAttribute('aria-pressed', String(mode !== 'campaign'))
  by('mission-title').textContent = map.title
  by('episode').textContent = mode === 'campaign' ? 'Campanha' : editing ? 'Cenário personalizado' : 'Partida personalizada'
  by('round').textContent = editing ? `${map.width} × ${map.height}` :
    battle.winner ? (battle.winner === 1 ? 'Vitória' : 'Derrota') :
      `Rodada ${battle.round} · ${battle.side === 1 ? 'Seu turno' : 'Turno da IA'}`
  if (hovered >= map.tiles.length) hovered = -1
  showCoordinates(map)
  button('end').disabled = Boolean(battle.winner || busy)
  select('difficulty').disabled = busy
  by('ally-count').textContent = String(battle.units.filter(u => u.side === 1).length)
  by('enemy-count').textContent = String(battle.units.filter(u => u.side === 2).length)
  describe()
  board.show(map, editing ? undefined : battle, editing ? undefined : battle.units.find(u => u.id === selected))
}

function begin(map: Scenario, nextMode: typeof mode) {
  session++
  busy = false
  selected = undefined
  hovered = -1
  mode = nextMode
  battle = start(structuredClone(map))
  note('')
  render()
}

function openEditor() {
  session++
  busy = false
  selected = undefined
  mode = 'editor'
  note('Escolha uma ferramenta e clique na casa do mapa.')
  setDraft(edit)
}

function editCell(cell: number) {
  const brush = select('brush').value
  const old = edit.deployments.find(unit => unit.cell === cell)
  if (brush === 'terrain') {
    const tile = select('terrain').value as Terrain
    if (old && !Number.isFinite(stepCost(tile, unitSpecs[old.type].movement))) {
      note('Remova a unidade antes de pintar um terreno bloqueado.')
      return
    }
    edit.tiles[cell] = tile
  } else if (brush === 'erase') {
    edit.deployments = edit.deployments.filter(unit => unit.cell !== cell)
  } else {
    const type = select('unit').value
    if (!Number.isFinite(stepCost(edit.tiles[cell], unitSpecs[type].movement))) {
      note('Essa unidade não pode ocupar esse terreno.')
      return
    }
    if (!old && edit.deployments.length >= 36) {
      note('O mapa aceita até 36 unidades.')
      return
    }
    edit.deployments = edit.deployments.filter(unit => unit.cell !== cell)
    edit.deployments.push({ cell, type, side: brush === 'ally' ? 1 : 2 })
  }
  note('')
  saveDraft()
  render()
}

function battleCell(cell: number) {
  if (busy || battle.winner || dialog.open) return
  const clicked = battle.units.find(unit => unit.cell === cell)
  if (clicked?.side === 1) {
    selected = clicked.id === selected ? undefined : clicked.id
    note('')
    render()
    return
  }
  const active = battle.units.find(unit => unit.id === selected)
  if (!active) return
  const next = apply(battle, clicked ? { id: active.id, target: clicked.id } : { id: active.id, cell })
  if (next === battle) {
    note(clicked ? 'Alvo fora de alcance ou ataque indisponível.' : 'Movimento indisponível para essa casa.')
    return
  }
  battle = next
  note(battle.winner === 1 ? 'Objetivo concluído. Você venceu.' : battle.winner === 2 ? 'Os Akadians venceram.' :
    clicked ? `Ataque contra ${unitName(clicked.type)}.` : `${unitName(active.type)} avançou.`)
  render()
}

async function enemyTurn() {
  if (busy || battle.winner || battle.side !== 1) return
  const current = session
  const difficulty = select('difficulty').value as Difficulty
  busy = true
  selected = undefined
  battle = advance(battle)
  note('A IA está planejando o turno.')
  render()
  await wait(180)
  const limit = battle.units.length * 2
  let actions = 0
  for (let n = 0; current === session && n < limit && !battle.winner; n++) {
    const action = choose(battle, difficulty)
    if (!action) break
    const next = apply(battle, action)
    if (next === battle) break
    battle = next
    actions++
    render()
    await wait(180)
  }
  if (current !== session) return
  battle = advance(battle)
  busy = false
  note(battle.winner === 2 ? 'Os Akadians venceram.' : battle.winner === 1 ? 'Você venceu.' :
    actions === 0 ? 'A IA passou o turno. Sua vez.' : `A IA fez ${actions} ${actions === 1 ? 'jogada' : 'jogadas'}. Sua vez.`)
  render()
}

function briefing() {
  by('dialog-kicker').textContent = dialogue < 0 ? 'Briefing' : 'Diálogo da missão'
  by('dialog-title').textContent = dialogue < 0 ? chapter.title : intro[dialogue].speaker
  by('dialog-text').textContent = dialogue < 0 ? brief : intro[dialogue].text
  button('skip-dialog').textContent = dialogue < 0 ? 'Ir para a batalha' : 'Pular diálogo'
  button('next-dialog').textContent = dialogue < 0 ? 'Ver diálogo' : dialogue === intro.length - 1 ? 'Iniciar batalha' : 'Continuar'
  if (!dialog.open) dialog.showModal()
}

button('skip-dialog').onclick = () => dialog.close()
button('next-dialog').onclick = () => {
  dialogue++
  if (dialogue >= intro.length) dialog.close()
  else briefing()
}
button('campaign').onclick = () => {
  if (mode === 'campaign') return
  begin(chapter, 'campaign')
  dialogue = -1
  briefing()
}
button('editor').onclick = openEditor
button('return').onclick = openEditor
button('restart').onclick = () => begin(battle.map, mode)
button('end').onclick = () => void enemyTurn()
button('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await stage.requestFullscreen()
  } catch { note('O navegador não conseguiu ativar a tela cheia.') }
}
document.addEventListener('fullscreenchange', () => {
  button('fullscreen').querySelector('span')!.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia'
})
field('map-name').oninput = () => {
  edit.title = field('map-name').value.trim() || 'Meu mapa'
  by('mission-title').textContent = edit.title
  saveDraft()
}
button('new-map').onclick = () => {
  if (!field('columns').reportValidity() || !field('rows').reportValidity()) return
  const width = Number(field('columns').value)
  const height = Number(field('rows').value)
  if (![width, height].every(n => Number.isInteger(n) && n >= 4 && n <= 16)) {
    note('Informe colunas e linhas entre 4 e 16.')
    return
  }
  setDraft({ title: field('map-name').value.trim() || 'Meu mapa', width, height, tiles: Array<Terrain>(width * height).fill('Plains'), deployments: [] })
  note('Mapa criado. Pinte o terreno e distribua as unidades.')
}
button('copy-map').onclick = () => {
  setDraft({ ...structuredClone(chapter), title: 'Capítulo 1 · Meu mapa' })
  note('Cópia do capítulo 1 pronta para editar.')
}
select('terrain').replaceChildren(...terrains.map(tile => new Option(terrainNames[tile], tile)))
select('unit').replaceChildren(...availableUnits.map(type => new Option(unitName(type), type)))
select('brush').onchange = () => {
  const brush = select('brush').value
  by('terrain-control').hidden = brush !== 'terrain'
  by('unit-control').hidden = brush !== 'ally' && brush !== 'enemy'
}
button('play-map').onclick = () => {
  if (![1, 2].every(side => edit.deployments.some(unit => unit.side === side))) {
    note('Coloque pelo menos uma unidade de cada equipe.')
    return
  }
  begin(edit, 'skirmish')
}
button('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(edit, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'battalion-mapa.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
button('import').onclick = () => field('map-file').click()
field('map-file').onchange = async () => {
  const input = field('map-file')
  const file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > 128 * 1024) throw Error('O arquivo excede 128 KB.')
    setDraft(validateScenario(JSON.parse(await file.text())))
    note('Mapa importado.')
  } catch (error) {
    note(error instanceof Error ? error.message : 'Falha ao importar o mapa.')
  } finally { input.value = '' }
}

board.onCell = cell => mode === 'editor' ? editCell(cell) : battleCell(cell)
function showCoordinates(map: Scenario) {
  by('coordinates').textContent = hovered < 0 ? '' :
    `${String.fromCharCode(65 + hovered % map.width)}${Math.floor(hovered / map.width) + 1} · ${terrainNames[map.tiles[hovered]]}`
  by('coordinates').title = hovered < 0 ? '' : terrainInfo[map.tiles[hovered]]
}
board.onHover = cell => {
  hovered = cell
  showCoordinates(mode === 'editor' ? edit : battle.map)
  if (mode !== 'editor') describe()
}
board.onReady = () => {
  render()
  briefing()
  const observer = new ResizeObserver(() => {
    if (surface.clientWidth && surface.clientHeight) board.scale.resize(surface.clientWidth, surface.clientHeight)
  })
  observer.observe(surface)
}
new Phaser.Game({
  parent: surface, type: Phaser.CANVAS, transparent: true, banner: false,
  width: surface.clientWidth, height: surface.clientHeight, scene: board,
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
  render: { antialias: true },
})
