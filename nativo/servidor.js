import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { networkInterfaces, tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { activeSides, canTakeTurn, createGame, order, scenarioMatch, scenarioSlots, snapshot, teamAttackScale } from './partida.js'
import { defaultAiTime, validAiTime } from './ia.js'
import { aiPlanner } from './planejador.js'
import { profileDirectory, readAiProfile } from './perfil-ia.js'
import { generateMap, mapRecipe, reorderSides } from './procedural.js'
import { combatTimeline } from './combate.js'
import { movementDuration } from './movimento.js'
import { coopCampaign, coopEligible } from './cooperativo.js'
import { openAppWindow } from './janela.js'
import { restoreMatch } from './retomar.js'

const read = path => readFile(new URL(path,import.meta.url))
const data = JSON.parse(await read('./dados.json'))
// Versão da edição (nativo/versao.json), para saber se uma cópia precisa de atualização.
const edition = JSON.parse(await read('./versao.json'))
const ghosts = JSON.parse(await read('./dados-ghosts.json'))
const maps = Object.keys(data.maps)
const colors = Object.keys(data.palettes).filter(color => color !== 'building')
const defaultColors = ['ff00ff00','ff0000ff','ffff0000','ff008080','ffffd800','ffffa500','ff5645a0','fff5f5ff','ff424144']
// Browser clients get the board geometry, without the opposing deployment or unfiltered state.
const withoutUnits = ({units,...board}) => board
const visibleData = JSON.stringify({...data,arena:withoutUnits(data.arena),
  maps:Object.fromEntries(maps.map(id=>[id,withoutUnits(data.maps[id])]))})
// Na campanha Ghosts em dupla, o convidado também precisa das imagens e regras da Ghosts.
const visibleGhosts = JSON.stringify({...ghosts,arena:ghosts.arena && withoutUnits(ghosts.arena),
  maps:Object.fromEntries(Object.entries(ghosts.maps).map(([id,board])=>[id,withoutUnits(board)]))})
const campaignLists = new Set(['campanha','bootcamp','bonus'])
const localMaps = JSON.stringify({...data.maps,arena:data.arena})
const localFiles = new Set(['dados-ghosts','campanha','campanha-ghosts','bootcamp','bootcamp-ghosts','bonus','bonus-ghosts']
  .map(name=>'/' + name + '.json'))
const mime = {
  js:'text/javascript; charset=utf-8', css:'text/css; charset=utf-8', html:'text/html; charset=utf-8',
  json:'application/json; charset=utf-8', png:'image/png', jpg:'image/jpeg', woff:'font/woff', mp3:'audio/mpeg', wav:'audio/wav',
}
const files = new Map([
  ['/','./index.html'], ['/index.html','./index.html'], ['/nativo.css','./nativo.css'],
  ['/partida.js','./partida.js'], ['/pagina.js','./pagina.js'], ['/inicio.js','./inicio.js'], ['/tabuleiro.js','./tabuleiro.js'],
  ['/movimento.js','./movimento.js'], ['/audio.js','./audio.js'],
  ['/visao.js','./visao.js'],
  ['/campanha.js','./campanha.js'], ['/ia.js','./ia.js'], ['/editor.js','./editor.js'], ['/cooperativo.js','./cooperativo.js'],
  ['/versao.json','./versao.json'], ['/versao.js','./versao.js'],
  ['/perfil-jogador.js','./perfil-jogador.js'], ['/salvamento.js','./salvamento.js'], ['/retomar.js','./retomar.js'],
  ['/estatisticas.js','./estatisticas.js'], ['/replay.js','./replay.js'], ['/graficos.js','./graficos.js'],
  ['/chat.js','./chat.js'], ['/atalhos.js','./atalhos.js'],
  ['/ia-worker.js','./ia-worker.js'], ['/planejador.js','./planejador.js'], ['/procedural.js','./procedural.js'],
  ['/rede-ia.js','./rede-ia.js'], ['/ia-tatica.js','./ia-tatica.js'],
  ['/idioma.js','./idioma.js'], ['/traducao-en.json','./traducao-en.json'], ['/traducao-pt.json','./traducao-pt.json'],
  ['/combate.js','./combate.js'], ['/construcao.js','./construcao.js'],
  ['/camera.js','../camera.js'], ['/lan.js','../lan.js'], ['/launcher.css','../launcher.css'],
  ...[...Object.values(data.assets),...Object.values(ghosts.assets)].map(file => ['/recursos/' + file,'./recursos/' + file]),
])

const hostAddress = '127.0.0.1'
const port = Number(process.env.BATTALION_NATIVE_PORT ?? 8770)
const internetEnabled = process.argv.includes('--internet')
let publicOrigin
const networks = new Map()
if (process.argv.includes('--lan')) {
  for (const [name, interfaces] of Object.entries(networkInterfaces())) {
    for (const { address, family, internal } of interfaces) {
      if (family !== 'IPv4' || internal) continue
      if (/radmin/i.test(name) && address.startsWith('26.')) networks.set(address,'Radmin VPN')
      else if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)) networks.set(address,'Mesma rede')
    }
  }
}

const rooms = new Map()
const publicActions = new Set(['join','lobby','prefs','update','command','advance','dados','ask','answer','profile','avatar','chat','watch','tabuleiro'])
const token = length => randomBytes(length).toString('hex')
const newSeat = (color,vote) => ({token:token(18),color,vote,seen:0,ready:false})
const connected = seat => Boolean(seat) && Date.now() - seat.seen < 12000
function publicSeat(seat,index) {
  const online = connected(seat)
  return {connected:online,ready:online && seat.ready,vote:seat?.vote ?? 0,color:seat?.color ?? defaultColors[index],
    name:seat?.profile?.name || undefined,stats:seat?.profile?.stats?.partidas ? seat.profile.stats : undefined}
}
function preferences(room,you) {
  const seats = room.seats.map(publicSeat)
  const coop = room.coop && {title:room.coop.mission.title,chapter:room.coop.chapter,ghosts:room.coop.ghosts,
    board:room.game ? room.coop.mission.board : undefined}
  // Times montados pelo líder (um número por equipe/assento) e pedidos de time entre jogadores.
  const teams = room.teams && {list:room.teams,allowRequests:Boolean(room.allowRequests),
    incoming:(room.requests ?? []).filter(request=>request.to === you).map(request=>request.from),
    sent:(room.requests ?? []).filter(request=>request.from === you).map(request=>request.to)}
  return {host:seats[0],guest:seats[1],seats,you,slots:room.slots,choices:room.choices,coalitions:room.coalitions,
    started:Boolean(room.game),map:room.seats[0].vote,generated:room.generated,coop,teams,code:room.code,
    resumed:room.resumed ? room.resumed.board.title : undefined,sideOrder:room.sideOrder,
    chat:(room.chat ?? []).slice(-30),spectators:room.spectators?.size ?? 0}
}
const unready = room => { for (const member of room.seats) if (member) member.ready = false }
// Aliados de cada equipe a partir dos times: quem tem o mesmo número de time é aliado.
const teamAlliances = teams => teams.map((team,index)=>teams.flatMap((other,j)=>j !== index && other === team ? [j+1] : []))
// Código curto da sala (sem letras que se confundem, como O/0 e I/1), usado no lugar do identificador longo.
const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function roomCode() {
  for (;;) {
    const code = Array.from(randomBytes(6),byte=>codeAlphabet[byte%codeAlphabet.length]).join('')
    if (![...rooms.values()].some(room=>room.code === code)) return code
  }
}
const roomByCode = code => [...rooms.entries()].find(([,room])=>room.code === code)
// Limite de tentativas de código por endereço, para ninguém sair testando códigos.
const attempts = new Map()
function tooManyAttempts(address) {
  const now = Date.now(), entry = attempts.get(address)
  if (!entry || now > entry.reset) { attempts.set(address,{count:1,reset:now+60000}); return false }
  return ++entry.count > 20
}
function inviteList(id,room) {
  const invites = [...networks].map(([ip,kind]) => ({kind,url:`http://${ip}:${port}/?sala=${room.code}`}))
  if (room.internet && publicOrigin) invites.unshift({kind:'Internet',url:publicOrigin+'/?sala='+room.code})
  return invites
}

function touch(seat) {
  if (!connected(seat)) seat.ready = false
  seat.seen = Date.now()
}

function reply(response, status, body = '', type = 'text/plain; charset=utf-8', cache = 'no-store') {
  response.writeHead(status, {'Content-Type':type, 'Cache-Control':cache})
  response.end(body)
}
const json = (res,value) => reply(res,200,JSON.stringify(value),mime.json)
const fail = (res,status,message) => reply(res,status,message)
const body = async (request,limit = 2048) => {
  let text = ''
  for await (const chunk of request) {
    text += chunk
    if (text.length > limit) throw Error('Pedido inválido.')
  }
  return text
}
// Perfil do jogador na sala: nome e foto (data URL PNG/JPG/GIF; GIF de até 20 MB, ~27 MB em base64).
const photoPattern = /^data:image\/(png|jpeg|gif);base64,([A-Za-z0-9+/=]+)$/
const profileLimit = 28_000_000
// Nome e foto de cada equipe para quem está vendo (`viewer`); a foto é servida por /lan/avatar.
function seatTeams(room,viewer,base = [],viewerKey) {
  const key = viewerKey ?? room.seats[viewer-1]?.token
  const teams = Array.from({length:Math.max(room.slots,base.length)},(_,index)=>({...base[index]}))
  room.seats.forEach((seat,index)=>{
    const profile = seat?.profile
    if (!profile) return
    if (profile.name) teams[index].name = profile.name
    if (profile.avatar) teams[index].photo = `/lan/avatar/${room.id}/${key}/${index+1}?v=${profile.version}`
  })
  return teams
}

// Salvamento automático da partida em rede (no computador do anfitrião): o estado completo, com o dinheiro
// das máquinas, a cada jogada. "Partidas em rede salvas" na tela Multiplayer retoma numa sala nova.
const savesDirectory = process.env.BATTALION_SAVES_DIR ?? join(profileDirectory,'partidas-rede')
const savePattern = /^[a-f0-9]{24}$/
const maxSaves = 12
function scheduleSave(room) {
  if (room.coop || !room.game || !room.map) return
  room.saveId ??= room.id
  clearTimeout(room.saveTimer)
  room.saveTimer = setTimeout(() => void saveRoom(room).catch(error=>console.error('Salvamento da partida:',error.message)),1200)
  room.saveTimer.unref?.()
}
async function saveRoom(room) {
  const file = join(savesDirectory,room.saveId + '.json')
  if (room.game.winner) return rm(file,{force:true})
  const names = seatTeams(room,1).map((team,index)=>({name:team.name ?? (index < room.seats.length ? 'Equipe ' + (index+1) : 'IA')}))
  const contents = {formato:'battalion-partida-rede',versao:edition.versao,salvoEm:Date.now(),
    estado:{...room.game,last:null,undo:null,teams:names},mapa:room.map}
  await mkdir(savesDirectory,{recursive:true})
  // Grava num arquivo temporário e troca: um desligamento no meio da gravação não estraga o salvamento anterior.
  await writeFile(file + '.tmp',JSON.stringify(contents))
  await rename(file + '.tmp',file)
  const files = (await readdir(savesDirectory)).filter(name=>savePattern.test(name.replace(/.json$/,'')) && name.endsWith('.json'))
  if (files.length > maxSaves) {
    const dated = await Promise.all(files.map(async name=>[name,(await stat(join(savesDirectory,name))).mtimeMs]))
    for (const [name] of dated.sort((a,b)=>a[1]-b[1]).slice(0,files.length-maxSaves)) await rm(join(savesDirectory,name),{force:true})
  }
}
async function listSaves() {
  let files = []
  try { files = (await readdir(savesDirectory)).filter(name=>name.endsWith('.json') && savePattern.test(name.slice(0,-5))) }
  catch { return [] }
  const list = []
  for (const name of files) {
    try {
      const saved = JSON.parse(await readFile(join(savesDirectory,name),'utf8'))
      list.push({id:name.slice(0,-5),salvoEm:saved.salvoEm,versao:saved.versao,title:saved.mapa?.title || '',
        round:saved.estado?.round,turn:saved.estado?.turn,teams:(saved.estado?.teams ?? []).map(team=>team?.name ?? '')})
    } catch {}
  }
  return list.sort((a,b)=>b.salvoEm-a.salvoEm)
}
async function readSave(id) {
  if (!savePattern.test(id ?? '')) throw Error('Salvamento inexistente.')
  try { return JSON.parse(await readFile(join(savesDirectory,id + '.json'),'utf8')) }
  catch { throw Error('Salvamento inexistente.') }
}

function pushMatch(room) {
  scheduleSave(room)
  for (const [response,side] of room.viewers) {
    if (!response.writableNeedDrain) pushMatchTo(response,room,side)
  }
  for (const [response,key] of room.watchers ?? []) {
    if (!response.writableNeedDrain) pushMatchTo(response,room,0,key)
  }
}

const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))
// IA joga pelas equipes sem jogador e pelas de quem caiu e não voltou a tempo (seat.ai).
const computerSide = room => activeSides(room.game).find(side=>
  (side > room.seats.length || room.seats[side-1]?.ai) && canTakeTurn(room.game,side))
// Tempo para um jogador que caiu voltar antes de a IA assumir a equipe dele.
const reconnectGrace = Number(process.env.BATTALION_RECONNECT_MS ?? 120000)
async function playComputer(room) {
  if (room.running || !computerSide(room)) return
  room.running = true
  try {
    await pause(320)
    const {game,map} = room
    let side, retries = 0
    while (room.game === game && !room.closed && (side = computerSide(room))) {
      const version = game.version
      room.planner ??= aiPlanner(data.rules,map,Worker,room.profile)
      const action = await room.planner.choose(game,{side,difficulty:room.sideLevels?.[side-1] ?? room.difficulty,seconds:room.aiTime})
      if (room.closed || !canTakeTurn(game,side)) continue
      try {
        order(data.rules,map,game,side,{...action,version})
      } catch (error) {
        if (version !== game.version && retries++ < 2) continue
        console.error('Jogada da IA:',error.message)
        order(data.rules,map,game,side,{type:'end',version:game.version})
      }
      retries = 0
      pushMatch(room)
      const event = game.last
      const steps = event.type === 'move' ? event.path.length : event.movement?.path.length ?? 0
      const animation = movementDuration(steps) + (event.type === 'attack' ? combatTimeline(data,event).duration :
        event.deployment ? 200 : 0)
      if (computerSide(room)) await pause(animation+120)
    }
  } finally {
    room.running = false
    room.planner?.close()
    room.planner = null
  }
}

async function api(req,res,parts,local,throughInternet) {
  const [action,id,key,after] = parts
  const post = req.method === 'POST'
  if (!post && action === 'code') {
    // Convite curto: troca o código da sala pelo identificador interno.
    if (tooManyAttempts(req.socket.remoteAddress)) return fail(res,429,'Muitas tentativas. Aguarde um minuto.')
    const found = roomByCode(String(id ?? '').toUpperCase())
    if (!found || throughInternet && !found[1].internet) return fail(res,404,'Código de sala não encontrado.')
    return json(res,{room:found[0]})
  }
  if (throughInternet && (!publicActions.has(action) || !rooms.get(id)?.internet)) {
    return fail(res,404,'Abra o convite do anfitrião.')
  }
  if (post && action === 'create' && local) {
    if (rooms.size >= 12) return fail(res,409,'Feche uma sala antes de criar outra.')
    // Pedido local do anfitrião; maior por causa da partida retomada de arquivo (mapa de até 100 × 100).
    const payload = (await body(req,8_000_000)).trim()
    const settings = payload.startsWith('{') ? JSON.parse(payload) : {map:Number(payload),humans:2,difficulty:1}
    if (settings.resume) {
      // Partida retomada de um arquivo salvo: o estado e o mapa vêm do arquivo, sem escolha de mapa na sala.
      const {humans,difficulty = 1,aiTime = defaultAiTime} = settings
      let restored
      // saved: salvamento automático deste computador (continua gravando no mesmo arquivo); file: arquivo aberto.
      const saved = typeof settings.resume.saved === 'string' ? settings.resume.saved : null
      try { restored = restoreMatch(data.rules,saved ? await readSave(saved) : settings.resume.file,settings.resume) }
      catch (error) { return fail(res,400,error.message) }
      const slots = restored.state.colors.length
      if (!Number.isInteger(humans) || humans < 2 || humans > slots || !validAiTime(aiTime)) {
        return fail(res,400,'Escolha a quantidade de jogadores.')
      }
      const id = token(12)
      const host = newSeat(defaultColors[0],maps.length)
      touch(host)
      const seats = Array(humans).fill(null)
      seats[0] = host
      const room = {id,code:roomCode(),seats,slots,choices:[maps.length],difficulty,aiTime,
        resumed:{state:restored.state,board:{...restored.board,title:restored.board.title || 'Partida retomada'}},
        coalitions:false,internet:Boolean(publicOrigin),viewers:new Map(),updated:Date.now(),saveId:saved ?? undefined}
      rooms.set(id,room)
      return json(res,{room:id,slot:host.token,invites:inviteList(id,room)})
    }
    if (settings.coop) {
      // Campanha em dupla: a missão (com falas e eventos) roda aqui no servidor.
      const {list,ghosts:isGhosts,chapter} = settings.coop
      const {difficulty,aiTime = defaultAiTime} = settings
      if (!campaignLists.has(list) || !Number.isInteger(chapter) || ![0,1,2].includes(difficulty) || !validAiTime(aiTime)) {
        return fail(res,400,'Missão inválida.')
      }
      const chapters = JSON.parse(await read('./'+list+(isGhosts ? '-ghosts' : '')+'.json'))
      const mission = chapters.find(entry=>entry.number === chapter)
      if (!coopEligible(mission)) return fail(res,400,'Esta missão precisa de pelo menos duas Warmachines para jogar em dupla.')
      const id = token(12)
      const host = newSeat(defaultColors[0],0)
      touch(host)
      const group = (isGhosts ? 'ghosts' : 'vengeance') + (list === 'campanha' ? '' : '-'+list)
      const room = {id,code:roomCode(),seats:[host,null],slots:2,choices:[0],difficulty,aiTime,coalitions:false,
        coop:{mission,ghosts:Boolean(isGhosts),chapter,group},
        internet:Boolean(publicOrigin),viewers:new Map(),updated:Date.now()}
      rooms.set(id,room)
      return json(res,{room:id,slot:host.token,invites:inviteList(id,room)})
    }
    const {map:vote,humans,difficulty,aiTime = defaultAiTime} = settings
    const generated = vote === maps.length && settings.generated && mapRecipe(settings.generated)
    let board = generated ? generateMap(data,generated) : Number.isInteger(vote) && data.maps[maps[vote]]
    if (!board) return fail(res,400,'Escolha um mapa.')
    // Equipes definidas no gerador: humanos primeiro (sideOrder), nível da IA de cada equipe e times (alianças).
    let sideOrder, sideLevels, groups
    if (generated && settings.sideOrder) {
      try { board = reorderSides(board,settings.sideOrder) } catch (error) { return fail(res,400,error.message) }
      sideOrder = settings.sideOrder
      sideLevels = Array.isArray(settings.sideLevels) && settings.sideLevels.length === board.slots &&
        settings.sideLevels.every(level=>[0,1,2].includes(level)) ? settings.sideLevels : undefined
      if (Array.isArray(settings.groups) && settings.groups.length === board.slots && settings.groups.every(Number.isInteger)) {
        // Renumera os times como 1, 2, 3… na ordem em que aparecem.
        const seen = [...new Set(settings.groups)]
        groups = settings.groups.map(group=>seen.indexOf(group)+1)
      }
    }
    const slots = scenarioSlots(board)
    if (!Number.isInteger(humans) || humans < 2 || humans > slots || ![0,1,2].includes(difficulty) || !validAiTime(aiTime)) {
      return fail(res,400,'Escolha a quantidade de jogadores e a dificuldade.')
    }
    const id = token(12)
    const host = newSeat(defaultColors[0],vote)
    touch(host)
    const seats = Array(humans).fill(null)
    seats[0] = host
    const choices = generated ? [vote] : maps.flatMap((key,index)=>
      scenarioSlots(data.maps[key]) === slots && Boolean(data.maps[key].coalitions) === Boolean(board.coalitions) ? [index] : [])
    const room = {id,code:roomCode(),seats,slots,choices,difficulty,aiTime,generated,generatedBoard:generated ? board : undefined,
      sideOrder,sideLevels,
      coalitions:Boolean(settings.coalitions && board.coalitions),
      teams:groups ?? Array.from({length:slots},(_,index)=>index+1),allowRequests:false,requests:[],fog:settings.fog === true,
      internet:Boolean(publicOrigin),viewers:new Map(),updated:Date.now()}
    rooms.set(id,room)
    return json(res,{room:id,slot:host.token,invites:inviteList(id,room)})
  }
  // Partidas em rede salvas neste computador (só o próprio anfitrião vê, baixa ou apaga).
  if (local && !post && action === 'salvas') return json(res,await listSaves())
  if (local && !post && action === 'salva') {
    try { return json(res,await readSave(id)) } catch (error) { return fail(res,404,error.message) }
  }
  if (local && post && action === 'apagar-salva') {
    if (!savePattern.test(id ?? '')) return fail(res,400,'Salvamento inexistente.')
    await rm(join(savesDirectory,id + '.json'),{force:true})
    return reply(res,204)
  }
  const room = rooms.get(id)
  if (!room) return fail(res,404,'Sala indisponível.')
  if (!post && action === 'host-session' && local) {
    return json(res,{slot:room.seats[0].token,invites:inviteList(id,room)})
  }
  if (post && action === 'join') {
    const index = room.seats.findIndex((seat,index)=>index>0 && !connected(seat))
    if (room.game || index < 0) return fail(res,409,'A sala está cheia.')
    const guest = newSeat(defaultColors[index],room.seats[0].vote)
    room.seats[index] = guest
    for (const seat of room.seats) if (seat) seat.ready = false
    touch(guest)
    return reply(res,200,guest.token)
  }
  if (post && action === 'watch') {
    // Espectador: entra mesmo com a sala cheia ou a partida em andamento; vê tudo e usa o chat, mas não joga.
    if (room.coop) return fail(res,409,'A campanha em dupla não aceita espectadores.')
    room.spectators ??= new Map()
    if (room.spectators.size >= 20) return fail(res,409,'A sala já tem espectadores demais.')
    const watcher = {token:token(18),seen:Date.now(),profile:null}
    room.spectators.set(watcher.token,watcher)
    return reply(res,200,watcher.token)
  }
  const index = !key && local ? 0 : room.seats.findIndex((seat,index)=>seat?.token === key && (index>0 || local))
  const seat = room.seats[index]
  const watcher = !seat && key && room.spectators?.get(key)
  if (watcher) return spectatorAction(req,res,room,watcher,action,after)
  if (!seat) return fail(res,404,'Sala indisponível.')
  room.updated = Date.now()
  const side = index+1
  if (!post && action === 'lobby') {
    touch(seat)
    return json(res,preferences(room,side))
  }
  if (post && action === 'prefs' && !room.game) {
    const [color, voteText, ready] = (await body(req)).split(',')
    const vote = Number(voteText)
    if (!colors.includes(color) || !room.choices.includes(vote) ||
        !['0','1'].includes(ready)) return fail(res,400,'Escolha um mapa e uma cor válidos.')
    touch(seat)
    if (vote !== seat.vote || color !== seat.color) {
      for (const member of room.seats) if (member) member.ready = false
    } else seat.ready = ready === '1'
    seat.vote = vote
    seat.color = color
    return json(res,preferences(room,side))
  }
  if (post && action === 'chat') {
    // Chat da sala e da partida: texto curto, guardado só na memória (últimas 60 mensagens).
    const text = (await body(req,1200)).replace(/\s+/g,' ').trim().slice(0,200)
    if (!text) return fail(res,400,'Mensagem vazia.')
    touch(seat)
    room.chat ??= []
    room.chat.push({side,name:seat.profile?.name || 'Equipe ' + side,text,time:Date.now()})
    if (room.chat.length > 60) room.chat.splice(0,room.chat.length-60)
    if (room.game) pushMatch(room)
    return json(res,{chat:room.chat.slice(-30)})
  }
  if (post && action === 'profile') {
    const profile = JSON.parse(await body(req,profileLimit))
    const name = typeof profile?.name === 'string' ? profile.name.trim().slice(0,24) : ''
    // Guarda a foto já decodificada (bytes), que é o que vai para os outros jogadores.
    const match = typeof profile?.avatar === 'string' ? profile.avatar.match(photoPattern) : null
    const photo = match && {type:'image/'+match[1],bytes:Buffer.from(match[2],'base64')}
    // Resumo das estatísticas (números inteiros) para mostrar ao lado do nome na sala.
    const whole = value => Number.isInteger(value) && value >= 0 && value < 1e7 ? value : 0
    const stats = profile?.stats && {partidas:whole(profile.stats.partidas),vitorias:whole(profile.stats.vitorias)}
    seat.profile = name || photo || stats?.partidas ? {name,avatar:Boolean(photo),photo,stats,version:Date.now()} : null
    touch(seat)
    if (room.game) pushMatch(room)
    return reply(res,204)
  }
  if (!post && action === 'avatar') {
    const photo = room.seats[Number(after)-1]?.profile?.photo
    if (!photo) return fail(res,404,'Sem foto.')
    res.writeHead(200,{'Content-Type':photo.type,'Content-Length':photo.bytes.length,'Cache-Control':'private, max-age=3600'})
    return res.end(photo.bytes)
  }
  if (post && ['teams','allow','ask','answer'].includes(action) && room.teams && !room.game) {
    const text = (await body(req)).trim()
    touch(seat)
    if (room.coalitions) return fail(res,409,'Com alianças por continente, os times já vêm do mapa.')
    if (action === 'teams') {
      // Só o líder monta os times: um número (1 a N) por equipe.
      const list = text.split(',').map(Number)
      if (side !== 1 || list.length !== room.slots || list.some(team=>!Number.isInteger(team) || team < 1 || team > room.slots)) {
        return fail(res,400,'Times inválidos.')
      }
      room.teams = list
      room.requests = []
      unready(room)
    } else if (action === 'allow') {
      if (side !== 1 || !['0','1'].includes(text)) return fail(res,400,'Pedido inválido.')
      room.allowRequests = text === '1'
      if (!room.allowRequests) room.requests = []
    } else if (action === 'ask') {
      const target = Number(text)
      if (!room.allowRequests) return fail(res,409,'O líder desligou os pedidos de time.')
      if (!Number.isInteger(target) || target < 1 || target > room.seats.length || target === side ||
          !connected(room.seats[target-1])) return fail(res,400,'Escolha um jogador conectado.')
      if (room.teams[target-1] === room.teams[side-1]) return fail(res,409,'Vocês já estão no mesmo time.')
      if (!room.requests.some(request=>request.from === side && request.to === target)) room.requests.push({from:side,to:target})
    } else {
      const [fromText,accept] = text.split(',')
      const from = Number(fromText)
      const index = room.requests.findIndex(request=>request.from === from && request.to === side)
      if (index < 0 || !['0','1'].includes(accept)) return fail(res,400,'Pedido inexistente.')
      room.requests.splice(index,1)
      if (accept === '1') {
        // Quem aceita entra no time de quem pediu.
        room.teams[side-1] = room.teams[from-1]
        room.requests = room.requests.filter(request=>room.teams[request.from-1] !== room.teams[request.to-1])
        unready(room)
      }
    }
    return json(res,preferences(room,side))
  }
  if (!post && action === 'tabuleiro') {
    return room.resumed ? json(res,room.resumed.board) : fail(res,404,'Esta sala não é de uma partida retomada.')
  }
  if (!post && action === 'dados') {
    return reply(res,200,room.coop?.ghosts ? visibleGhosts : visibleData,mime.json)
  }
  if (post && action === 'start' && side === 1 && room.coop) {
    if (!room.game) {
      const state = preferences(room,side)
      if (state.seats.some(player=>!player.ready)) return fail(res,409,'Os dois jogadores precisam estar conectados e prontos.')
      const profile = await readAiProfile()
      const {mission,ghosts:isGhosts,chapter,group} = room.coop
      room.game = coopCampaign({data:{...(isGhosts ? ghosts : data),aiProfile:profile},mission,
        difficulty:room.difficulty,aiTime:room.aiTime,Worker,group,chapter})
      room.game.start(() => pushMatch(room))
    }
    return json(res,preferences(room))
  }
  if (post && action === 'start' && side === 1) {
    const profile = room.game ? null : await readAiProfile()
    const state = preferences(room,side)
    const palette = state.seats.map(player=>player.color)
    if (!room.game && (state.seats.some(player=>!player.ready) || new Set(palette).size !== palette.length)) {
      return fail(res,409,'Todos os jogadores precisam estar conectados, prontos e com cores diferentes.')
    }
    if (!room.game && room.resumed) {
      // Retomada: cada jogador volta com a equipe do mesmo número, e as cores e alianças são as da partida salva.
      room.map = room.resumed.board
      room.profile = profile
      room.game = structuredClone(room.resumed.state)
    } else if (!room.game) {
      while (palette.length < room.slots) {
        palette.push([...defaultColors,...colors].find(color=>!palette.includes(color)))
      }
      const setup = scenarioMatch(room.generatedBoard ?? data.maps[maps[state.map]],palette,room.seats.length,room.coalitions)
      // Sem alianças do mapa, valem os times montados na sala (é preciso haver pelo menos dois times).
      const alliances = room.coalitions ? setup.alliances : teamAlliances(room.teams)
      if (!room.coalitions && new Set(room.teams).size < 2) return fail(res,409,'Monte pelo menos dois times diferentes.')
      room.map = setup.board
      room.profile = profile
      room.game = createGame(data.rules,room.map,setup.colors,{
        alliances,simultaneous:room.coalitions,fog:Boolean(room.fog),victory:room.map.victory,
        attackScale:room.sideLevels ? room.sideLevels.map((level,index)=>index < room.seats.length ? 1 : [.7,1,1.4][level]) :
          teamAttackScale(setup.colors.length,room.seats.length,room.difficulty),
      })
    }
    scheduleSave(room)
    void playComputer(room).catch(error=>console.error('Turno da IA:',error.message))
    return json(res,preferences(room))
  }
  if (post && action === 'close' && side === 1 && !room.game) {
    rooms.delete(id)
    return reply(res,204)
  }
  if (!room.game || !key) return fail(res,404,'Partida indisponível.')
  // Qualquer contato na partida mantém o jogador como conectado (reconexão).
  seat.seen = Date.now()
  if (room.coop) {
    const coop = room.game
    if (!post && action === 'update') {
      if (!/^(?:-1|\d+)$/.test(after ?? '')) return fail(res,400,'Versão inválida.')
      const state = coop.stateFor(side)
      return !state || coop.revision === Number(after) ? reply(res,204) : json(res,matchState(room,side))
    }
    if (!post && action === 'state') {
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive'})
      room.viewers.set(res,side)
      pushMatchTo(res,room,side)
      res.on('drain', () => pushMatchTo(res,room,side))
      res.on('close',() => room.viewers.delete(res))
      return
    }
    if (post && action === 'command') {
      const command = JSON.parse(await body(req))
      try {
        await coop.command(side,command,room.seats.filter(connected).length)
      } catch (error) { return fail(res,409,error.message) }
      return reply(res,204)
    }
    if (post && action === 'advance') {
      coop.advance()
      return reply(res,204)
    }
    return fail(res,404,'Operação indisponível.')
  }
  if (!post && action === 'update') {
    if (!/^(?:-1|\d+)$/.test(after ?? '')) return fail(res,400,'Versão inválida.')
    return room.game.version === Number(after) ? reply(res,204) : json(res,matchState(room,side))
  }
  if (!post && action === 'state') {
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive'})
    room.viewers.set(res,side)
    pushMatchTo(res,room,side)
    res.on('drain', () => pushMatchTo(res,room,side))
    res.on('close',() => room.viewers.delete(res))
    return
  }
  if (post && action === 'command') {
    const command = JSON.parse(await body(req))
    order(data.rules,room.map,room.game,side,command)
    pushMatch(room)
    void playComputer(room).catch(error=>console.error('Turno da IA:',error.message))
    return reply(res,204)
  }
  return fail(res,404,'Operação indisponível.')
}

// O que um espectador pode fazer: ver a sala e a partida (como a equipe 0, que enxerga todos) e usar o chat.
async function spectatorAction(req,res,room,watcher,action,after) {
  const post = req.method === 'POST'
  watcher.seen = Date.now()
  room.updated = Date.now()
  if (!post && action === 'lobby') return json(res,{...preferences(room,0),spectator:true})
  if (post && action === 'profile') {
    const profile = JSON.parse(await body(req,profileLimit))
    watcher.profile = {name:typeof profile?.name === 'string' ? profile.name.trim().slice(0,24) : ''}
    return reply(res,204)
  }
  if (post && action === 'chat') {
    const text = (await body(req,1200)).replace(/\s+/g,' ').trim().slice(0,200)
    if (!text) return fail(res,400,'Mensagem vazia.')
    room.chat ??= []
    room.chat.push({side:0,name:(watcher.profile?.name || 'Espectador') + ' 👁',text,time:Date.now()})
    if (room.chat.length > 60) room.chat.splice(0,room.chat.length-60)
    if (room.game) pushMatch(room)
    return json(res,{chat:room.chat.slice(-30)})
  }
  if (!post && action === 'tabuleiro' && room.resumed) return json(res,room.resumed.board)
  if (post || !['update','state','avatar'].includes(action)) return fail(res,403,'Espectadores só assistem.')
  if (!room.game) return fail(res,404,'A partida ainda não começou.')
  if (!post && action === 'update') {
    if (!/^(?:-1|\d+)$/.test(after ?? '')) return fail(res,400,'Versão inválida.')
    return room.game.version === Number(after) ? reply(res,204) : json(res,matchState(room,0,watcher.token))
  }
  if (!post && action === 'state') {
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive'})
    room.watchers ??= new Map()
    room.watchers.set(res,watcher.token)
    pushMatchTo(res,room,0,watcher.token)
    res.on('drain', () => pushMatchTo(res,room,0,watcher.token))
    res.on('close',() => room.watchers.delete(res))
    return
  }
  if (!post && action === 'avatar') {
    const photo = room.seats[Number(after)-1]?.profile?.photo
    if (!photo) return fail(res,404,'Sem foto.')
    res.writeHead(200,{'Content-Type':photo.type,'Content-Length':photo.bytes.length,'Cache-Control':'private, max-age=3600'})
    return res.end(photo.bytes)
  }
  return fail(res,403,'Espectadores só assistem.')
}

// Avisos de conexão: quem caiu, quanto falta para a IA assumir e quem já está com a IA.
function seatNotices(room) {
  if (!room.game || room.coop) return []
  return room.seats.flatMap((seat,index)=>{
    if (!seat || connected(seat)) return []
    const name = seat.profile?.name || 'Equipe ' + (index+1)
    if (seat.ai) return [{kind:'ai',team:index+1,name}]
    return [{kind:'waiting',team:index+1,name,seconds:Math.max(0,Math.ceil((seat.seen+reconnectGrace-Date.now())/1000))}]
  })
}
// Estado da partida para um jogador, com nome e foto dos perfis.
function matchState(room,side,key) {
  if (!room.coop) return {...snapshot(room.game,side),teams:seatTeams(room,side,[],key),notices:seatNotices(room),
    chat:(room.chat ?? []).slice(-30)}
  const state = room.game.stateFor(side)
  if (!state) return null
  // Na dupla, o time 1 mostra os dois nomes e a foto de quem está vendo.
  const people = seatTeams(room,side)
  const names = people.slice(0,2).map((team,index)=>team.name ?? (index ? 'Jogador 2' : 'Jogador 1'))
  const teams = state.teams.map((team,index)=>index ? team :
    {...team,name:room.seats.some(seat=>seat?.profile?.name) ? names.join(' & ') : team.name,photo:people[side-1]?.photo})
  return {...state,teams,chat:(room.chat ?? []).slice(-30)}
}
function pushMatchTo(res,room,side,key) {
  const state = matchState(room,side,key)
  if (state) res.write('data: ' + JSON.stringify(state) + '\n\n')
}

// Presença na partida: quem tem a tela aberta (conexão de estado ativa) conta como conectado.
// Quem caiu tem `reconnectGrace` para voltar; depois a IA assume a equipe, até o jogador voltar.
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.game || room.coop) continue
    for (const side of new Set(room.viewers.values())) {
      const seat = room.seats[side-1]
      if (seat) seat.seen = Date.now()
    }
    let changed = false
    for (const seat of room.seats) {
      if (!seat) continue
      const away = !connected(seat)
      if (away && !seat.ai && Date.now() - seat.seen > reconnectGrace) { seat.ai = true; changed = true }
      else if (!away && seat.ai) { seat.ai = false; changed = true }
      else if (away) changed = true
    }
    if (changed) {
      pushMatch(room)
      void playComputer(room).catch(error=>console.error('Turno da IA:',error.message))
    }
  }
},5000).unref()

setInterval(() => {
  for (const [id,room] of rooms) {
    if (room.viewers.size || room.watchers?.size) {
      for (const res of [...room.viewers.keys(),...(room.watchers?.keys() ?? [])]) if (!res.writableNeedDrain) res.write(': keepalive\n\n')
    } else if (Date.now() - room.updated > 20 * 60000) {
      room.closed = true
      room.planner?.close()
      if (room.coop) room.game?.close?.()
      rooms.delete(id)
    }
  }
},10000).unref()

// Atualização: compara com o versao.json publicado no endereço de 'verificar' (se houver), no máximo 1 vez por hora.
let updateCache = null
async function updateInfo() {
  const atual = edition.versao
  if (!/^https:\/\//.test(edition.verificar ?? '')) return {atual,configurado:false}
  if (updateCache && Date.now() - updateCache.time < 3600000) return updateCache.info
  let info
  try {
    const response = await fetch(edition.verificar,{signal:AbortSignal.timeout(5000),headers:{'User-Agent':'Battalion-Nativo'}})
    const published = await response.json()
    const versao = String(published.versao ?? '')
    info = {atual,configurado:true,publicada:versao,data:published.data,nova:newer(versao,atual),
      link:/^https:\/\//.test(published.link ?? '') ? published.link : undefined}
  } catch { info = {atual,configurado:true,erro:true} }
  updateCache = {time:Date.now(),info}
  return info
}
const newer = (a,b) => {
  const parts = value => String(value).split('.').map(part=>Number.parseInt(part,10) || 0)
  const [x,y] = [parts(a),parts(b)]
  for (let index=0; index<Math.max(x.length,y.length); index++) if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) > (y[index] ?? 0)
  return false
}

const shutdown = () => setTimeout(()=>process.exit(0),400)
async function systemAction(req,res,action) {
  if (action === 'fechar') {
    reply(res,204)
    return shutdown()
  }
  if (action === 'excluir') {
    // Os dados do navegador (perfil, progresso, configurações) a própria página apaga; aqui só a IA, se pedido.
    const {ia} = JSON.parse((await body(req)) || '{}')
    if (ia === true) await rm(profileDirectory,{recursive:true,force:true})
    return reply(res,204)
  }
  if (action === 'desinstalar') {
    const local = process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA,'BattalionNativo')
    const root = resolve(fileURLToPath(new URL('..',import.meta.url)))
    const exe = process.env.BATTALION_NATIVE_EXE
    // Só desinstala a cópia extraída pelo executável; nunca uma pasta de projeto ou outra pasta qualquer.
    if (!local || !root.toLowerCase().startsWith(local.toLowerCase() + sep) || !exe || !/\.exe$/i.test(exe) || !existsSync(exe)) {
      return fail(res,409,'A desinstalação só funciona no jogo aberto pelo Battalion-Nativo.exe.')
    }
    await rm(profileDirectory,{recursive:true,force:true})
    const script = join(tmpdir(),'battalion-desinstalar-' + token(4) + '.cmd')
    await writeFile(script,['@echo off','timeout /t 4 /nobreak >nul',`rmdir /s /q "${local}"`,`del /f /q "${exe}"`,
      'del /f /q "%~f0"'].join('\r\n'))
    // Roda fora da pasta do jogo: o Windows não apaga a pasta em uso por um processo.
    spawn('cmd.exe',['/d','/c',script],{detached:true,stdio:'ignore',windowsHide:true,cwd:tmpdir()}).unref()
    reply(res,204)
    return shutdown()
  }
  return fail(res,404,'Ação indisponível.')
}

function remoteAllowed(remote, bound) {
  if (bound === hostAddress) return remote === hostAddress
  if (networks.get(bound) === 'Radmin VPN') return /^26\./.test(remote)
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(remote)
}

function handler(address,throughInternet = false) {
  return async (req,res) => {
    const local = !throughInternet && address === hostAddress
    const origin = throughInternet ? publicOrigin : 'http://' + address + ':' + port
    if (!origin || req.headers.host !== new URL(origin).host || !remoteAllowed(req.socket.remoteAddress,address) ||
        req.headers.origin && req.headers.origin !== origin ||
        req.headers['sec-fetch-site'] === 'cross-site' && req.method === 'POST') return fail(res,403,'Acesso indisponível.')
    const path = req.url.split('?')[0]
    try {
      if (local && req.method === 'GET' && path === '/launcher-status') {
        const latest = [...rooms].sort(([,a],[,b])=>b.updated-a.updated)[0]?.[0]
        return reply(res,200,`Battalion-Nativo/2\n${internetEnabled ? 'internet' : 'lan'}\n${latest ? '/?host='+latest : '/'}\n${process.env.BATTALION_NATIVE_BUILD ?? 'workspace'}`)
      }
      if (local && req.method === 'GET' && path === '/atualizacao') return json(res,await updateInfo())
      if (path.startsWith('/sistema/')) {
        // Fechar, excluir dados e desinstalar: só neste computador e só a partir da própria página do jogo.
        if (!local || req.method !== 'POST' || req.headers['x-battalion-acao'] !== '1') return fail(res,403,'Acesso indisponível.')
        return await systemAction(req,res,path.slice(9))
      }
      if (path.startsWith('/lan/') && ['POST','GET'].includes(req.method)) {
        return await api(req,res,path.slice(5).split('/'),local,throughInternet)
      }
      if (req.method !== 'GET') return fail(res,405,'Método indisponível.')
      const params = new URL(req.url,origin).searchParams
      if (throughInternet && (path === '/' || path === '/index.html') &&
          !(rooms.get(params.get('guest')) ?? roomByCode(String(params.get('sala') ?? '').toUpperCase())?.[1])?.internet) {
        return fail(res,404,'Abra o convite do anfitrião.')
      }
      if (path === '/dados.json') return reply(res,200,visibleData,mime.json)
      if (path === '/ia-treinada.json' && local) return json(res,await readAiProfile())
      if (path === '/ia-avaliacao.json' && local) {
        // Perfil indicado pelo treinador da IA tática para a partida de avaliação (IA x IA).
        const file = process.env.BATTALION_EVAL_PROFILE
        if (!file) return fail(res,404,'Sem perfil de avaliação.')
        return reply(res,200,await readFile(file),mime.json)
      }
      if (path === '/local-maps.json' || localFiles.has(path)) {
        if (!local) return fail(res,404,'Conteúdo local.')
        const content = path === '/local-maps.json' ? localMaps : await read('.' + path)
        return reply(res,200,content,mime.json)
      }
      const file = files.get(path)
      if (!file) return fail(res,404,'Arquivo indisponível.')
      res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; frame-ancestors 'none'")
      res.setHeader('Referrer-Policy','no-referrer')
      const cache = throughInternet && path.startsWith('/recursos/') ? 'public, max-age=3600' : 'no-store'
      return reply(res,200,await read(file),mime[file.split('.').at(-1)],cache)
    } catch (error) {
      if (res.headersSent) res.end()
      else fail(res,400,error.message === 'Ação indisponível.' ? error.message : 'Pedido inválido.')
    }
  }
}

function openLocalBrowser() {
  if (!process.argv.includes('--open')) return
  const start = process.env.BATTALION_OPEN_PATH ?? '/'
  // Janela de aplicativo, sem barra de endereço (quando o navegador padrão permite).
  openAppWindow('http://'+hostAddress+':'+port+(start.startsWith('/') ? start : '/'))
}

for (const address of [hostAddress,...networks.keys()]) {
  const server = createServer(handler(address))
  server.on('error',error => {
    console.error(address, error.message)
    if (address === hostAddress) process.exit(1)
  })
  server.listen(port,address,() => {
    const url = `http://${address}:${port}/`
    console.log('Battalion nativo v' + edition.versao + ' · ' + url)
    if (address === hostAddress && !internetEnabled) openLocalBrowser()
  })
}

if (internetEnabled) {
  const gateway = createServer(handler(hostAddress,true))
  gateway.listen(0,hostAddress,()=>{
    const executable = process.env.BATTALION_CLOUDFLARED ?? fileURLToPath(new URL('../runtime/cloudflared.exe', import.meta.url))
    const tunnel = spawn(executable,['tunnel','--no-autoupdate','--protocol','http2','--url',
      'http://127.0.0.1:'+gateway.address().port],{windowsHide:true,stdio:['ignore','ignore','pipe']})
    const lines = createInterface({input:tunnel.stderr})
    lines.on('line',line=>{
      const link = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0]
      if (link && !publicOrigin) {
        publicOrigin = link
        console.log('Convite Internet habilitado · '+publicOrigin)
        openLocalBrowser()
      } else if (/\bERR\b/.test(line)) console.error(line)
    })
    tunnel.on('error',error=>console.error('Falha ao abrir o túnel HTTPS:',error.message))
    tunnel.on('close',()=>{
      publicOrigin = undefined
      gateway.close()
      console.error('O túnel HTTPS foi encerrado.')
    })
    process.once('exit',()=>{if (!tunnel.killed) tunnel.kill()})
    process.once('SIGINT',()=>process.exit(0))
    process.once('SIGTERM',()=>process.exit(0))
  })
}
