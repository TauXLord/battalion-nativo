import { availableParallelism } from 'node:os'
import { isMainThread, parentPort, Worker } from 'node:worker_threads'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parseArgs } from 'node:util'
import { chooseAction, sideValue } from '../nativo/ia.js'
import { createGame, order } from '../nativo/partida.js'
import { generateMap } from '../nativo/procedural.js'
import { genomeSize, validProfile } from '../nativo/rede-ia.js'
import { profileDirectory, profilePath } from '../nativo/perfil-ia.js'
import { explorationRate, rewardVersion, scoreMatch } from './pontuacao-ia.mjs'

const data = JSON.parse(await readFile(new URL('../nativo/dados.json',import.meta.url)))
const fixedMaps = Object.values(data.maps)
const coastalMaps = fixedMaps.filter(map=>map.tiles.some(([terrain])=>terrain === 'Shore'))
const colors = ['ff00ff00','ff0000ff','ffff0000','ff008080']
const profile = weights => weights ? {format:1,weights} : undefined
const landTiles = new Map(fixedMaps.flatMap(map=>map.tiles).filter(([name])=>
  ['Plains','Forest','Hill','Ore Deposit'].includes(name)).map(tile=>[tile[0],tile]))
function rng(seed) {
  return () => {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0
    return seed / 0x100000000
  }
}

function trainingValue(game,side) {
  let value = sideValue(data.rules,game,side)
  const copies = new Map()
  for (const unit of game.units) {
    if (unit.side !== side) continue
    const name = unit.transported ?? unit.name
    const spec = data.rules.units[name]
    value += .35*Math.min(850,Math.max(0,unit.credits ?? 0))
    if (!spec.damage || spec.mods.includes('Unbuildable')) continue
    const copiesOfType = copies.get(name) ?? 0
    copies.set(name,copiesOfType+1)
    const strain = Math.min(.45,Math.max(0,copiesOfType-1)*.15)
    value -= strain*spec.cost*unit.hp/data.rules.units[unit.name].health
  }
  return value
}

function defendersAtStart(game,side) {
  const units = game.units.filter(unit=>unit.side === side)
  const linchpins = units.filter(unit=>data.rules.units[unit.name].mods.includes('Linchpin'))
  return (linchpins.length ? linchpins : units).map(unit=>unit.id)
}

function defenderHealth(units,ids) {
  if (!ids.length) return 0
  return ids.reduce((health,id)=>{
    const unit = units.get(id)
    return health + (unit ? unit.hp/data.rules.units[unit.name].health : 0)
  },0)/ids.length
}

function compactBoard(random) {
  const width = 12, height = 8
  const left = Array.from({length:height},()=>Array.from({length:width/2},()=>{
    const value = random()
    return landTiles.get(value < .17 ? 'Forest' : value < .30 ? 'Hill' : 'Plains')
  }))
  left[5][2] = landTiles.get('Ore Deposit')
  const tiles = left.flatMap(row=>[...row,...row.slice().reverse()])
  const selected = random() < .5 ? 'Mortar Truck' : 'Flak Tank'
  const deployment = [[2,4,'Warmachine'],[3,3,'Scorpion Tank'],[4,4,'Lancer Tank'],
    [3,5,selected],[3,4,'Heavy Commando']]
  const units = [1,2].flatMap(side=>deployment.map(([x,y,name])=>({
    name,side,cell:y*width+(side === 1 ? x : width-1-x),
  })))
  return {width,height,tiles,units,structures:[],slots:2}
}

function runMatch({seed,standard,coastal,compact,rotation,weights,rival,validation,exploration = 0}) {
  const random = rng(seed)
  const procedural = {
    seed, size:[24,32,40][seed%3], teams:2+(seed>>>6)%3, islands:(seed>>>9)%3===0,
    weights:{Sea:5+Math.floor(random()*55),Forest:3+Math.floor(random()*55),
      Plains:10+Math.floor(random()*45),Mountain:Math.floor(random()*24),Volcano:Math.floor(random()*10)},
  }
  const scenarios = coastal && coastalMaps.length ? coastalMaps : fixedMaps
  const board = compact ? compactBoard(random) :
    standard ? scenarios[Math.floor(random()*scenarios.length)] : generateMap(data,procedural)
  const game = createGame(data.rules,board,colors.slice(0,board.slots ?? 2))
  const side = 1+rotation%game.colors.length
  const other = 1+(side%game.colors.length)
  const policy = profile(weights), rivalPolicy = profile(rival)
  const baseline = game.colors.map((_,i)=>trainingValue(game,i+1))
  const defenders = game.colors.map((_,i)=>defendersAtStart(game,i+1))
  let decisions = 0
  const limit = validation ? 450 : coastal ? 340 : 250
  const roundLimit = validation ? 16 : coastal ? 14 : 10
  while (!game.winner && game.round <= roundLimit && decisions < limit) {
    const action = chooseAction(data.rules,board,game,{
      difficulty:2, profile:game.turn === side ? policy : game.turn === other ? rivalPolicy : undefined,
      random:validation ? undefined : random,
      exploration:!validation && game.turn === side ? exploration : 0,
    })
    try { order(data.rules,board,game,game.turn,{...action,version:game.version}) }
    catch { order(data.rules,board,game,game.turn,{type:'end',version:game.version}) }
    decisions++
  }
  const growth = game.colors.map((_,i)=>trainingValue(game,i+1)/(baseline[i] || 1))
  const advantage = growth[side-1]-Math.max(...growth.filter((_,i)=>i+1 !== side))
  const survivingUnits = new Map(game.units.map(unit=>[unit.id,unit]))
  const preserved = defenders.map(ids=>defenderHealth(survivingUnits,ids))
  const defense = preserved[side-1]-Math.max(...preserved.filter((_,i)=>i+1 !== side))
  const result = game.winner === side ? 1 : game.winner ? -1 : 0
  return {result,round:game.round,score:scoreMatch({result,round:game.round,roundLimit,advantage,defense})}
}

if (!isMainThread) {
  parentPort.on('message',job=>{
    try { parentPort.postMessage(runMatch(job)) }
    catch (error) { parentPort.postMessage({error:error.stack}) }
  })
} else {
  await train()
}

async function save(path,value) {
  const temporary = path+'.'+process.pid+'.tmp'
  await writeFile(temporary,JSON.stringify(value)+'\n','utf8')
  await rename(temporary,path)
}

function report(games) {
  const played = games.length
  const wins = games.filter(game=>game.result===1)
  return {
    vitorias:wins.length,
    empates:games.filter(game=>game.result===0).length,
    derrotas:games.filter(game=>game.result===-1).length,
    rodadasPorVitoria:wins.length ? Number((wins.reduce((sum,game)=>sum+game.round,0)/wins.length).toFixed(1)) : null,
    nota:Number((games.reduce((sum,game)=>sum+game.score,0)/played).toFixed(4)),
  }
}

async function trainingLock(dir) {
  const path = join(dir,'treino.lock')
  let file
  try { file = await open(path,'wx') }
  catch (error) {
    if (error.code !== 'EEXIST') throw error
    const pid = Number(await readFile(path,'utf8'))
    if (!Number.isInteger(pid) || pid<1) throw Error('Já existe um treino iniciando nesta pasta.')
    try { process.kill(pid,0) }
    catch (probe) {
      if (probe.code !== 'ESRCH') throw probe
      await unlink(path)
      file = await open(path,'wx')
    }
    if (!file) throw Error('Já existe um treino em andamento nesta pasta.')
  }
  await file.writeFile(String(process.pid))
  await file.close()
  return () => unlink(path)
}

async function train() {
  const {values} = parseArgs({options:{
    horas:{type:'string',default:'8'}, workers:{type:'string',default:String(Math.max(1,Math.min(8,availableParallelism()-1)))},
    geracoes:{type:'string',default:'1000000'}, populacao:{type:'string',default:'10'},
    rodadas:{type:'string',default:'4'}, validar:{type:'boolean'}, ativar:{type:'boolean'},
    desativar:{type:'boolean'}, pasta:{type:'string'}, 'do-zero':{type:'boolean'}, exportar:{type:'string'}, ajuda:{type:'boolean'},
  }})
  if (values.ajuda) {
    console.log('Treinar-IA-Battalion.cmd [--horas 8] [--workers 4] [--geracoes 10] [--populacao 10] [--rodadas 4]')
    console.log('Use --horas 0 --validar para comparar o campeão salvo, --horas 0 --ativar para testá-lo no jogo e --desativar para voltar à IA padrão.')
    console.log('Use --exportar "caminho/ia.json" para salvar o perfil campeão em um arquivo que possa ser levado a outro computador.')
    console.log('Use --do-zero para iniciar ou retomar o treino na pasta independente treino-do-zero.')
    return
  }
  if (values.desativar) {
    try { await unlink(profilePath) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    console.log('IA padrão selecionada para novas partidas.')
    return
  }
  const number = (name,min,max,integer=true)=>{
    const value = Number(values[name])
    if (!Number.isFinite(value) || integer && !Number.isInteger(value) || value<min || value>max) throw Error('Valor inválido: --'+name)
    return value
  }
  const hours = number('horas',0,168,false), workers = number('workers',1,64)
  const generations = number('geracoes',1,1000000), populationSize = number('populacao',4,48), rounds = number('rodadas',2,24)
  const defaultDir = values['do-zero'] ? join(profileDirectory,'treino-do-zero') : profileDirectory
  const dir = values.pasta ? resolve(values.pasta) : defaultDir
  if (values.exportar && resolve(values.exportar) === join(dir,'treino.json')) {
    throw Error('Escolha outro nome para o perfil exportado. treino.json guarda o progresso do treino.')
  }
  if (values.ativar && values.pasta) throw Error('Para ativar no jogo, use o checkpoint da pasta padrão.')
  await mkdir(dir,{recursive:true})
  const unlock = await trainingLock(dir)
  try { await runTraining(values,{dir,hours,workers,generations,populationSize,rounds}) }
  finally { await unlock() }
}

async function runTraining(values,{dir,hours,workers,generations,populationSize,rounds}) {
  const checkpoint = join(dir,'treino.json')
  let state = {generation:0,seed:(Date.now()>>>0),champion:null,parents:[],matches:0}
  try {
    const saved = JSON.parse(await readFile(checkpoint,'utf8'))
    if (!Number.isInteger(saved.generation) || !Array.isArray(saved.parents) ||
        !saved.parents.every(weights=>validProfile(profile(weights))) ||
        saved.champion && !validProfile(profile(saved.champion))) throw Error('Checkpoint inválido.')
    state = saved
    console.log('Retomando a geração',state.generation+1)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (state.rewardVersion !== rewardVersion || !Number.isInteger(state.explorationStart) ||
      state.explorationStart < 0 || state.explorationStart > state.generation) {
    state = {...state,rewardVersion,explorationStart:state.generation}
  }
  const pool = Array.from({length:workers},()=>new Worker(new URL(import.meta.url)))
  let stopped = false
  process.once('SIGINT',()=>{stopped=true;console.log('Encerrando após a geração em andamento. O checkpoint será preservado.')})
  const deadline = Date.now()+hours*3600000
  async function play(jobs) {
    const results = Array(jobs.length)
    let next = 0
    await Promise.all(pool.map(async worker=>{
      while (next<jobs.length) {
        const index = next++
        results[index] = await new Promise((resolve,reject)=>{
          const cleanup = ()=>{
            worker.off('message',receive)
            worker.off('error',fail)
            worker.off('exit',exit)
          }
          const receive = result=>{cleanup(); if (result.error) reject(Error(result.error)); else resolve(result)}
          const fail = error=>{cleanup(); reject(error)}
          const exit = code=>fail(Error('Processo de treino encerrou com código '+code))
          worker.once('message',receive)
          worker.once('error',fail)
          worker.once('exit',exit)
          worker.postMessage(jobs[index])
        })
      }
    }))
    return results
  }
  console.log('Treino sem renderização ·',workers,'partidas em paralelo · mapas padrão e procedurais')
  console.log('Checkpoint:',checkpoint)
  try {
    for (let iteration=0;iteration<generations && Date.now()<deadline && !stopped;iteration++) {
      const start = performance.now(), random = rng((state.seed+state.generation)>>>0)
      const zero = Array(genomeSize).fill(0)
      const parents = state.parents.length ? state.parents : [zero]
      const incumbent = state.champion ?? zero
      const genomes = [incumbent,...Array.from({length:populationSize-1},(_,index)=>{
        const parent = parents[index%parents.length]
        const scale = index%3===0 ? .48 : .23
        return parent.map(weight=>Math.max(-8,Math.min(8,weight+(random()-.5)*scale*2)))
      })]
      const fixtures = Array.from({length:rounds},(_,index)=>({
        seed:Math.floor(random()*0x100000000),standard:index%2===0,coastal:index===0,
        compact:index===rounds-1,rotation:state.generation+index,
      }))
      const exploration = explorationRate(state.generation-state.explorationStart)
      const jobs = genomes.flatMap(weights=>fixtures.map(fixture=>({...fixture,weights,rival:state.champion,exploration})))
      const games = await play(jobs)
      const ranked = genomes.map((weights,index)=>({weights,...report(games.slice(index*rounds,(index+1)*rounds))}))
        .sort((a,b)=>b.nota-a.nota)
      const top = ranked[0]
      state = {...state,generation:state.generation+1,champion:top.weights,parents:ranked.slice(0,3).map(item=>item.weights),
        matches:state.matches+games.length}
      await save(checkpoint,state)
      console.log('Geração',state.generation,'·',state.matches,'partidas acumuladas ·',top.nota.toFixed(3),
        '· V/E/D',`${top.vitorias}/${top.empates}/${top.derrotas}`,
        '· rodadas/vitória',top.rodadasPorVitoria ?? '–','· exploração',Math.round(exploration*100)+'%',
        '·',Math.round((performance.now()-start)/1000)+' s')
    }
    if ((values.validar || values.ativar) && !stopped) {
      if (!state.champion) throw Error('Ainda não há campeão salvo. Rode ao menos uma geração de treino.')
      const jobs = Array.from({length:16},(_,index)=>({
        seed:(0x9e3779b9^Math.imul(Math.floor(index/2)+1,152486829))>>>0,standard:Math.floor(index/2)%2===0,
        rotation:index%2,weights:state.champion,validation:true,
      }))
      const summary = report(await play(jobs))
      console.log('Validação contra a IA padrão:',summary)
      await save(join(dir,'validacao.json'),{generation:state.generation,rewardVersion,summary})
      if (values.ativar) {
        await save(profilePath,{format:1,weights:state.champion,generation:state.generation,summary})
        console.log('Perfil ativado para novas partidas:',profilePath)
      }
    }
    if (values.exportar) {
      if (!state.champion) throw Error('Ainda não há campeão salvo. Rode ao menos uma geração de treino.')
      const destination = resolve(values.exportar)
      await save(destination,{format:1,weights:state.champion,generation:state.generation})
      console.log('Perfil exportado:',destination)
    }
  } finally { await Promise.all(pool.map(worker=>worker.terminate())) }
}
