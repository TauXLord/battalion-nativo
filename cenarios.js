import { replaceBinaryTags } from './swf-map.js'
import { guest, host, request, lobby } from './lan.js'

const maps = [
  ['arquipelago', 'Arquipélago de Coral', '36 × 34 · Frotas, recifes e ilhas mineiras'],
  ['floresta', 'Cordilheira das Aranhas', '34 × 34 · Aranhas e commandos nos passos da serra'],
  ['rios', 'Três Travessias', '36 × 32 · Um rio sinuoso com três passagens'],
  ['acido', 'Caldeira Ácida', '34 × 34 · Solo corrosivo, vulcões e cânions'],
  ['delta', 'Delta dos Comboios', '36 × 36 · Pontes, estradas e corredores de minério'],
  ['arena', 'Cerco dos Quatro Cantos', '40 × 40 · Quatro IAs, uma em cada canto'],
]
const palette = [
  ['Verde','ff00ff00'], ['Azul','ff0000ff'], ['Vermelho','ffff0000'], ['Amarelo','ffffd800'],
  ['Laranja','ffffa500'], ['Roxo','ff5645a0'], ['Branco','fff5f5ff'], ['Turquesa','ff008080'],
]
const $ = id => document.getElementById(id)
const params = new URLSearchParams(location.search)
const resource = async path => {
  const response = await fetch(path)
  if (!response.ok) throw Error('Não foi possível carregar ' + path)
  return response
}

async function play([slug, name], colors, mode = 'ai', room = null) {
  const [map, template, swf] = await Promise.all([
    resource('/cenarios/' + slug + '.yimf').then(r => r.text()),
    resource('/mapas/vengeance.xml').then(r => r.text()),
    resource('/jogo/battalion-vengeance.swf').then(r => r.arrayBuffer()),
  ])
  const doc = new DOMParser().parseFromString(template, 'application/xml')
  const root = doc.documentElement
  const [level, ...remaining] = root.querySelectorAll('level')
  remaining.forEach(item => item.remove())
  root.setAttribute('levels', '1')
  level.setAttribute('name', name)
  level.querySelector('brief').setAttribute('value', 'Capture fábricas com soldados. Cada fábrica rende 150 por máquina de guerra no início e no fim do seu turno.')
  level.querySelector('objective').setAttribute('value', 'Elimine as equipes adversárias.')
  level.querySelector('mapsettings').setAttribute('resources', '650')
  const teams = level.querySelector('teams')
  const originals = [...teams.children]
  teams.replaceChildren()
  colors.forEach((color, index) => {
    const team = originals[index % 2].cloneNode(true)
    const type = mode !== 'ai' || (index === 0 && slug !== 'arena') ? 'Human' : 'AI'
    for (const [field, value] of Object.entries({name:'Equipe ' + (index+1), color, controllertype:type})) {
      team.querySelector(field).setAttribute('value', value)
    }
    teams.append(team)
  })
  const data = await replaceBinaryTags(swf, new Map([[3362,map],[3360,new XMLSerializer().serializeToString(doc)]]))
  $('scenario-view').hidden = true
  $('player-view').hidden = false
  $('player-title').textContent = name
  const back = $('player-view').querySelector('header a')
  back.href = '/?cenarios'
  back.textContent = '← Cenários'
  const { player, camera } = await window.loadBattalion('vengeance', data, mode, `${slug}-${mode}-v2`)
  if (room) {
    $('lan-status').hidden = false
    $('lan-status').textContent = 'Sala iniciada. Mantenha esta aba aberta.'
    host(player, room, camera).catch(error => { $('lan-status').textContent = error.message })
  }
}

if (params.has('guest')) {
  const room = params.get('guest')
  if (!/^[a-f0-9]{24}$/.test(room ?? '')) throw Error('Abra o link de convite do anfitrião.')
  $('guest-status').textContent = 'Conectando à sala…'
  const key = 'battalion-guest-' + room
  let slot = sessionStorage.getItem(key)
  if (slot) {
    try { await request('lobby/' + room + '/' + slot) }
    catch { slot = null }
  }
  if (!slot) {
    slot = await (await request('join/' + room, {method:'POST'})).text()
    sessionStorage.setItem(key,slot)
  }
  $('guest-view').hidden = true
  await lobby({room,slot,maps:maps.slice(0,5),palette})
  $('guest-view').hidden = false
  await guest(room,slot)
}
else {
  let index = 0
  const list = $('scenario-list'), mode = $('scenario-mode'), colors = $('team-colors'), status = $('scenario-status')
  function refresh() {
    const arena = maps[index][0] === 'arena'
    mode.disabled = arena
    if (arena) mode.value = 'ai'
    colors.hidden = mode.value === 'lan'
    $('scenario-play').textContent = mode.value === 'lan' ? 'Abrir sala multiplayer' : 'Jogar cenário'
    const previous = [...colors.querySelectorAll('select')].map(item => item.value)
    colors.replaceChildren(...Array.from({length:arena ? 4 : 2}, (_, i) => {
      const label = document.createElement('label')
      label.textContent = (arena ? 'Cor da IA ' : mode.value === 'hotseat' ? 'Cor do jogador ' : 'Cor da equipe ') + (i+1)
      const select = document.createElement('select')
      select.append(...palette.map(([name,color]) => new Option(name,color)))
      select.value = previous[i] ?? palette[i][1]
      label.append(select)
      return label
    }))
    for (const [i, button] of [...list.children].entries()) button.setAttribute('aria-pressed', String(i === index))
    status.textContent = arena ? 'Modo espectador. As quatro equipes jogam sozinhas.' : {
      ai: 'Escolha Fácil, Normal ou Difícil na tela da missão.',
      hotseat: 'Dividam o mouse. Clique em End Turn e passe o controle ao outro jogador.',
      lan: 'Cada jogador escolhe uma cor e vota no mapa dentro da sala.',
    }[mode.value]
  }
  list.replaceChildren(...maps.map(([,name,description], i) => {
    const button = document.createElement('button')
    const title = document.createElement('strong'), detail = document.createElement('span')
    title.textContent = name
    detail.textContent = description
    button.append(title,detail)
    button.onclick = () => { index = i; refresh() }
    return button
  }))
  mode.onchange = refresh
  refresh()
  $('scenario-play').onclick = async () => {
    const picks = [...colors.querySelectorAll('select')].map(item => item.value)
    if (mode.value !== 'lan' && new Set(picks).size !== picks.length) { status.textContent = 'Use cores diferentes.'; return }
    $('scenario-play').disabled = true
    try {
      if (mode.value === 'lan') {
        const {room,invites} = await (await request('create',{method:'POST',body:String(index)})).json()
        $('scenario-view').hidden = true
        const state = await lobby({room,invites,maps:maps.slice(0,5),palette})
        await play(maps[state.map],[state.host.color,state.guest.color],'lan',room)
      } else await play(maps[index], picks, mode.value)
    }
    catch (error) {
      $('player-view').hidden = true
      $('scenario-view').hidden = false
      status.textContent = error.message
    } finally { $('scenario-play').disabled = false }
  }
}
