// Testes do servidor da rede (sala, código curto, times, perfil e proteção das ações de sistema).
// Sobe um servidor temporário numa porta própria. Rodar: node --test testes
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const port = 8799
const origin = `http://127.0.0.1:${port}`
let server
const call = async (path,options = {}) => {
  const response = await fetch(origin + path,{cache:'no-store',...options})
  const text = await response.text()
  return {status:response.status,text,json:() => JSON.parse(text)}
}
const post = (path,body = '') => call(path,{method:'POST',body})

before(async () => {
  server = spawn(process.execPath,['nativo/servidor.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),
    env:{...process.env,BATTALION_NATIVE_PORT:String(port)},stdio:'ignore'})
  for (let i=0; i<50; i++) {
    try { if ((await fetch(origin + '/launcher-status')).ok) return } catch {}
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  throw Error('servidor não subiu')
})
after(() => server?.kill())

const newRoom = async (humans = 2,teams = 2) => (await post('/lan/create',JSON.stringify({map:7,humans,difficulty:0,aiTime:1,
  generated:{seed:3,width:24,height:24,teams}}))).json()

test('convite por código curto leva à sala',async () => {
  const {room} = await newRoom()
  const {code} = (await call('/lan/lobby/' + room)).json()
  assert.match(code,/^[A-Z2-9]{6}$/)
  assert.equal((await call('/lan/code/' + code.toLowerCase())).json().room,room)
  assert.equal((await call('/lan/code/AAAAAA')).status,404)
})

test('líder monta os times e pedidos de time respeitam a permissão',async () => {
  const {room,slot:host} = await newRoom(3,4)
  const guest = (await post('/lan/join/' + room)).text
  const third = (await post('/lan/join/' + room)).text
  assert.equal((await post(`/lan/teams/${room}/${guest}`,'1,1,2,2')).status,400,'convidado não monta times')
  assert.match((await post(`/lan/ask/${room}/${guest}`,'3')).text,/desligou/)
  await post(`/lan/teams/${room}/${host}`,'1,2,3,4')
  await post(`/lan/allow/${room}/${host}`,'1')
  await post(`/lan/ask/${room}/${third}`,'2')
  const answered = (await post(`/lan/answer/${room}/${guest}`,'3,1')).json()
  assert.equal(answered.teams.list[1],answered.teams.list[2],'quem aceita entra no time de quem pediu')
})

test('perfil: nome aparece na sala e foto é servida',async () => {
  const {room,slot:host} = await newRoom()
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACwAAAAAAQABAAACAkQBADs='
  assert.equal((await post(`/lan/profile/${room}/${host}`,JSON.stringify({name:'Comandante',avatar:gif}))).status,204)
  const lobby = (await call('/lan/lobby/' + room)).json()
  assert.equal(lobby.seats[0].name,'Comandante')
  const photo = await fetch(`${origin}/lan/avatar/${room}/${host}/1`)
  assert.equal(photo.headers.get('content-type'),'image/gif')
})

test('ações de sistema exigem o cabeçalho e a desinstalação só roda pelo executável',async () => {
  assert.equal((await post('/sistema/desinstalar')).status,403)
  assert.equal((await call('/sistema/fechar')).status,403)
  const refused = await call('/sistema/desinstalar',{method:'POST',headers:{'X-Battalion-Acao':'1'}})
  assert.equal(refused.status,409)
})
