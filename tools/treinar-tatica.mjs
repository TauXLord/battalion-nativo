// Treino da IA tática (etapa C): estratégia evolutiva sobre os pesos nomeados de nativo/ia-tatica.js.
// Correções em relação ao treino antigo:
//  - cada candidato joga muitas partidas pareadas (mesmo mapa, os dois lados);
//  - o campeão só é trocado após uma confirmação em partidas novas (evita "campeão por sorte"),
//    e só se o desafiante não for pior que ele contra a IA padrão (evita andar em círculos);
//  - adversários em liga: IA padrão fixa + campeão atual + campeões anteriores;
//  - um mapa procedural novo por par de partidas (um terço deles de ilhas), além dos mapas fixos;
//  - partidas longas o bastante para terminar (padrão 40 rodadas);
//  - modos de jogo variados pela semente: névoa de guerra, clima (chuva, raios, redemoinho) e os dois juntos.
//    Na névoa, cada IA decide só com o que enxerga (snapshot), como no jogo.
// Sem limite de tempo por padrão: digite p + Enter (ou Ctrl+C) para pausar e abrir o menu
// (assistir a uma partida IA treinada x IA padrão, ativar no jogo, continuar ou sair).
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { availableParallelism } from 'node:os'
import { isMainThread, parentPort, Worker } from 'node:worker_threads'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chooseAction as baselineAction } from '../nativo/ia.js'
import { chooseAction as tacticalAction, defaultParams } from '../nativo/ia-tatica.js'
import { createGame, order, snapshot } from '../nativo/partida.js'
import { generateMap } from '../nativo/procedural.js'
import { profileDirectory, profilePath } from '../nativo/perfil-ia.js'

const data = JSON.parse(await readFile(new URL('../nativo/dados.json',import.meta.url)))
const fixedMaps = Object.values(data.maps).filter(map=>(map.slots ?? 2) === 2 && !map.islands)
const keys = Object.keys(defaultParams)
function rng(seed) {
  return () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/0x100000000 }
}

function board(seed) {
  const random = rng(seed ^ 0x2545f491)
  if (seed % 3 === 0) return fixedMaps[(seed>>>2) % fixedMaps.length]
  // Um terço dos procedurais é de ilhas (frota, aviação e Warmachine na costa).
  const islands = (seed>>>6) % 3 === 0
  return generateMap(data,{seed,size:[24,32,40][(seed>>>4)%3],teams:2,islands,weights:{
    Sea:Math.floor(random()*35),Reef:Math.floor(random()*6),Plains:10+Math.floor(random()*45),Forest:3+Math.floor(random()*45),
    Hill:Math.floor(random()*20),Mountain:Math.floor(random()*20),Wasteland:Math.floor(random()*6),Volcano:Math.floor(random()*6)}})
}

// Uma partida: `params` (lado `side`) contra `rival` (params táticos ou 'padrao').
// Modo pela semente: 0 normal, 1 névoa, 2 clima, 3 névoa + clima (o mesmo nos dois lados do par).
const matchMode = seed => (seed >>> 9) % 4
function play({seed,side,params,rival,rounds}) {
  const map = board(seed)
  const mode = matchMode(seed)
  const fog = mode === 1 || mode === 3, weather = mode >= 2 ? ((seed ^ 0x5bd1e995) >>> 0) || 1 : false
  const game = createGame(data.rules,map,['ff00ff00','ff0000ff'],{fog,weather})
  const view = () => fog ? snapshot(game,game.turn) : game
  const random = rng(seed)
  const profile = {format:2,params}
  const rivalProfile = rival === 'padrao' ? null : {format:2,params:rival}
  let decisions = 0
  const machines = s => game.units.filter(unit=>unit.side === s && unit.name === 'Warmachine').length
  while (!game.winner && game.round <= rounds && decisions < rounds*160) {
    const mine = game.turn === side
    const seen = view()
    const action = mine ? tacticalAction(data.rules,map,seen,{profile,difficulty:2,side:game.turn}) :
      rivalProfile ? tacticalAction(data.rules,map,seen,{profile:rivalProfile,difficulty:2,side:game.turn}) :
      baselineAction(data.rules,map,seen,{difficulty:2,random,side:game.turn})
    try { order(data.rules,map,game,game.turn,{...action,version:game.version}) }
    catch { order(data.rules,map,game,game.turn,{type:'end',version:game.version}) }
    decisions++
  }
  const other = side === 1 ? 2 : 1
  const result = game.winner === side ? 1 : game.winner ? -1 : 0
  // Vitória vale 1; fora isso, a diferença de Warmachines desempata (cada uma vale 0,15).
  const score = result + (result ? 0 : .15*(machines(side)-machines(other)))
  const label = map.title && map.title !== 'Mapa procedural' ? map.title :
    `${map.islands ? 'ilhas' : 'procedural'} ${map.width}×${map.height}`
  const modeLabel = ['',' · névoa',' · clima',' · névoa+clima'][mode]
  return {result,score,round:game.round,label:label + modeLabel,machines:[machines(side),machines(other)]}
}

if (!isMainThread) {
  parentPort.on('message',job=>{
    try { parentPort.postMessage(play(job)) }
    catch (error) { parentPort.postMessage({error:error.stack}) }
  })
} else await main()

async function save(path,value) {
  const temporary = path+'.'+process.pid+'.tmp'
  await writeFile(temporary,JSON.stringify(value,null,1)+'\n','utf8')
  await rename(temporary,path)
}

function mutate(params,random,sigma) {
  const result = {}
  for (const key of keys) {
    // Perturbação multiplicativa (log-normal): mantém o sinal e a escala de cada peso.
    const gauss = Math.sqrt(-2*Math.log(random()||1e-9))*Math.cos(2*Math.PI*random())
    result[key] = Number((params[key]*Math.exp(sigma*gauss)).toPrecision(5))
  }
  return result
}

async function main() {
  const {values} = parseArgs({options:{
    // Por padrão usa todos os núcleos lógicos (a thread principal só coordena).
    horas:{type:'string',default:''}, workers:{type:'string',default:String(Math.max(1,availableParallelism()))},
    importar:{type:'string'}, silencioso:{type:'boolean'},
    populacao:{type:'string',default:'6'}, pares:{type:'string',default:'6'}, rodadas:{type:'string',default:'40'},
    sigma:{type:'string',default:'0.25'}, validar:{type:'boolean'}, ativar:{type:'boolean'}, exportar:{type:'string'},
    pasta:{type:'string'}, porta:{type:'string',default:'8779'}, ajuda:{type:'boolean'},
  }})
  if (values.ajuda) {
    console.log('node tools/treinar-tatica.mjs [--horas N] [--workers 3] [--populacao 6] [--pares 6] [--rodadas 40] [--sigma 0.25]')
    console.log('Sem --horas o treino não tem limite: digite p + Enter (ou Ctrl+C) para pausar e abrir o menu.')
    console.log('--horas 0 --validar compara o campeão com a IA padrão em 40 partidas novas.')
    console.log('--horas 0 --ativar valida e instala o campeão para as dificuldades Normal e Difícil.')
    console.log('--exportar arquivo.json salva o campeão para levar a outro computador.')
    console.log('--importar caminho/treino.json substitui o checkpoint local pelo de outra máquina (guarda um backup).')
    console.log('--silencioso mostra só uma linha por geração (sem o resultado de cada partida).')
    return
  }
  const number = (name,min,max) => {
    const value = Number(values[name])
    if (!Number.isFinite(value) || value<min || value>max) throw Error('Valor inválido: --'+name)
    return value
  }
  const hours = values.horas === '' ? Infinity : number('horas',0,10000)
  const workers = Math.round(number('workers',1,64))
  const population = Math.round(number('populacao',2,32)), pairs = Math.round(number('pares',2,64))
  const rounds = Math.round(number('rodadas',10,80)), sigma = number('sigma',.01,1)
  const viewerPort = Math.round(number('porta',1024,65535))
  const dir = values.pasta ? resolve(values.pasta) : join(profileDirectory,'treino-tatica')
  await mkdir(dir,{recursive:true})
  const checkpoint = join(dir,'treino.json')
  if (values.importar) {
    const incoming = JSON.parse(await readFile(resolve(values.importar),'utf8'))
    if (!Number.isInteger(incoming.generation) || !incoming.champion || !Object.values(incoming.champion).every(Number.isFinite)) {
      throw Error('O arquivo importado não é um checkpoint do treino tático.')
    }
    try {
      await writeFile(checkpoint+'.backup-'+Date.now(),await readFile(checkpoint))
      console.log('Backup do checkpoint anterior salvo ao lado de',checkpoint)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    await save(checkpoint,incoming)
    console.log(`Checkpoint importado: geração ${incoming.generation}, ${incoming.matches ?? 0} partidas.`)
  }
  let state ={generation:0,seed:Date.now()>>>0,champion:{...defaultParams},hall:[],matches:0,history:[]}
  try {
    const saved = JSON.parse(await readFile(checkpoint,'utf8'))
    if (saved.champion && Object.values(saved.champion).every(Number.isFinite)) {
      state = {...state,...saved,champion:{...defaultParams,...saved.champion}}
      console.log('Retomando a geração',state.generation+1)
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error }

  // Entrada do usuário: "p" + Enter ou Ctrl+C pausam o treino; no menu, as respostas vêm daqui.
  const interactive = Boolean(process.stdin.isTTY)
  const input = interactive ? createInterface({input:process.stdin,output:process.stdout}) : null
  let stopRequested = false, onStop = null
  const requestStop = () => {
    if (stopRequested) return
    stopRequested = true
    console.log('\nPausando o treino... (a geração em andamento é descartada; o último checkpoint fica salvo)')
    onStop?.()
  }
  input?.on('SIGINT',()=>{ if (onStop) requestStop(); else { console.log('\nSaindo.'); process.exit(0) } })
  process.on('SIGINT',requestStop)
  const ask = question => new Promise(ok=>input.question(question,answer=>ok(answer.trim().toLowerCase())))

  // Escalonador: os workers nunca ficam esperando. Antes, cada etapa (candidatos, duelo, âncora) era um lote
  // fechado: as partidas rápidas acabavam e os núcleos ficavam parados até a mais longa terminar (os vales de CPU
  // no Gerenciador de Tarefas). Agora:
  //  - a fila da etapa atual roda primeiro, das partidas mais longas para as mais curtas (não sobra uma partida
  //    grande sozinha no fim);
  //  - quando a fila esvazia, os workers livres adiantam as partidas da próxima geração (especulação). Elas valem
  //    se o campeão não mudar (o caso comum); se ele mudar, os resultados são descartados.
  // Os resultados são guardados por índice, então a ordem de execução não muda o treino.
  let pool = []
  const queue = [], idle = new Set()
  let filler = null
  class Aborted extends Error {}
  function dispatch(worker) {
    const task = stopRequested ? null : queue.shift() ?? filler?.()
    if (!task) { idle.add(worker); return }
    idle.delete(worker)
    worker.task = task
    worker.postMessage(task.job)
  }
  const wake = () => { for (const worker of [...idle]) dispatch(worker) }
  const startPool = () => {
    pool = Array.from({length:workers},()=>{
      const worker = new Worker(new URL(import.meta.url))
      worker.on('message',message => {
        const task = worker.task
        worker.task = null
        if (message.error) task?.fail(Error(message.error))
        else task?.ok(message)
        dispatch(worker)
      })
      worker.on('exit',() => { worker.task?.fail(new Aborted()); worker.task = null; idle.delete(worker) })
      idle.add(worker)
      return worker
    })
  }
  const stopPool = async () => {
    filler = null
    for (const task of queue.splice(0)) task.fail(new Aborted())
    const closing = pool
    pool = []
    idle.clear()
    await Promise.all(closing.map(worker=>worker.terminate()))
  }
  // Custo estimado de uma partida (só para a ordem da fila): área do mapa, um pouco mais com névoa ou clima.
  const cost = job => {
    const side = job.seed % 3 === 0 ? 34 : [24,32,40][(job.seed>>>4)%3]
    return side*side*(matchMode(job.seed) ? 1.2 : 1)
  }
  const enqueue = job => new Promise((ok,fail)=>queue.push({job,ok,fail}))
  // ready[i]: partida já adiantada pela especulação (promessa), reaproveitada em vez de jogar de novo.
  async function run(jobs,report,ready = []) {
    if (stopRequested) throw new Aborted()
    const games = jobs.map((job,index)=>(ready[index] ?? enqueue(job)).then(game=>{ report?.(game,job); return game }))
    queue.sort((a,b)=>cost(b.job)-cost(a.job))
    wake()
    return Promise.all(games)
  }
  const summary = games => {
    const wins = games.filter(game=>game.result === 1).length, losses = games.filter(game=>game.result === -1).length
    return {vitorias:wins,empates:games.length-wins-losses,derrotas:losses,
      nota:Number((games.reduce((sum,game)=>sum+game.score,0)/games.length).toFixed(3))}
  }
  // Partidas pareadas: cada semente é jogada dos dois lados.
  const fixtures = (random,count,rival) => Array.from({length:count},()=>Math.floor(random()*0x100000000))
    .flatMap(seed=>[1,2].map(side=>({seed,side,rival,rounds})))

  async function train(deadline) {
    stopRequested = false
    startPool()
    onStop = () => { stopPool() }
    console.log('\nTreino tático ·',workers,'partidas em paralelo ·',population,'candidatos ·',pairs*2,'partidas por candidato')
    console.log('Checkpoint:',checkpoint)
    if (!values.silencioso) console.log('Cada linha [n/total] é uma partida de um candidato da IA tática (vitória = o candidato venceu).')
    if (interactive) console.log(Number.isFinite(deadline) ? 'Digite p + Enter para pausar antes do prazo.' :
      'Sem limite de tempo. Digite p + Enter (ou Ctrl+C) para pausar e abrir o menu.')
    const typed = line => { if (['p','parar','pausar'].includes(line.trim().toLowerCase())) requestStop() }
    input?.on('line',typed)
    // Plano de uma geração: só depende do número da geração, do campeão e da liga (por isso dá para adiantar).
    const plan = (generation,champion,hall) => {
      const random = rng((state.seed+generation*7919)>>>0)
      const rivals = ['padrao',champion,...hall.slice(-3)]
      const candidates = Array.from({length:population},()=>mutate(champion,random,sigma))
      // Mesmas partidas para todos (comparação justa): metade contra a IA padrão, metade contra a liga.
      const half = Math.ceil(pairs/2)
      const rivalFor = index => rivals[1+index%(rivals.length-1)]
      const shared = [...fixtures(random,half,'padrao'),
        ...Array.from({length:pairs-half},(_,i)=>fixtures(random,1,rivalFor(i))).flat()]
      return {champion,hall,random,candidates,shared,jobs:candidates.flatMap(params=>shared.map(job=>({...job,params}))),started:[]}
    }
    // Especulação: entrega aos workers livres a próxima partida ainda não iniciada da próxima geração.
    const speculate = upcoming => () => {
      const index = upcoming.started.length
      if (index >= upcoming.jobs.length) return null
      let task
      const game = new Promise((ok,fail)=>{ task = {job:upcoming.jobs[index],ok,fail} })
      game.catch(()=>{})
      upcoming.started.push(game)
      return task
    }
    let current = plan(state.generation,state.champion,state.hall)
    try {
      while (Date.now() < deadline && !stopRequested) {
        const start = performance.now()
        const upcoming = plan(state.generation+1,state.champion,state.hall)
        filler = speculate(upcoming)
        const {random,candidates,shared,jobs} = current
        let total = jobs.length + pairs*2
        let finished = 0
        const words = {1:'vitória',0:'empate ',[-1]:'derrota'}
        const report = values.silencioso ? undefined : (game,job) => {
          const rival = job.rival === 'padrao' ? 'IA padrão' : job.rival === state.champion ? 'campeão' : 'ex-campeão'
          console.log(`  [${String(++finished).padStart(String(total).length)}/${total}] ${words[game.result]} na rodada ${game.round}`+
            ` · contra ${rival} · ${game.label} · Warmachines ${game.machines[0]}x${game.machines[1]}`)
        }
        const games = await run(jobs,report,current.started)
        const ranked = candidates.map((params,i)=>({params,...summary(games.slice(i*shared.length,(i+1)*shared.length))}))
          .sort((a,b)=>b.nota-a.nota)
        const best = ranked[0]
        // Confirmação: desafiante x campeão diretamente, em sementes novas.
        const duel = fixtures(random,pairs,state.champion).map(job=>({...job,params:best.params}))
        const confirmation = summary(await run(duel,report))
        // Âncora: desafiante e campeão contra a IA padrão nas mesmas sementes novas. Sem isso o treino
        // anda em círculos (ganha das próprias versões antigas e piora contra estilos diferentes).
        let anchor = null
        if (confirmation.nota > .05) {
          const anchorFixtures = fixtures(random,pairs,'padrao')
          total += anchorFixtures.length*2
          const anchorGames = await run([...anchorFixtures.map(job=>({...job,params:best.params})),
            ...anchorFixtures.map(job=>({...job,params:state.champion}))],report)
          anchor = {desafiante:summary(anchorGames.slice(0,anchorFixtures.length)),campeao:summary(anchorGames.slice(anchorFixtures.length))}
          state.matches += anchorGames.length
        }
        const promoted = Boolean(anchor) && anchor.desafiante.nota >= anchor.campeao.nota
        state.generation++
        state.matches += jobs.length + duel.length
        if (promoted) {
          state.hall = [...state.hall,state.champion].slice(-6)
          state.champion = best.params
          state.championGeneration = state.generation
        }
        state.history = [...(state.history ?? []),{generation:state.generation,best:best.nota,confirmation:confirmation.nota,
          ...(anchor && {padrao:[anchor.desafiante.nota,anchor.campeao.nota]}),promoted}].slice(-200)
        // Sem troca de campeão, as partidas já adiantadas da próxima geração continuam valendo.
        current = upcoming.champion === state.champion && upcoming.hall === state.hall ? upcoming :
          plan(state.generation,state.champion,state.hall)
        await save(checkpoint,state)
        console.log('Geração',state.generation,'·',state.matches,'partidas · melhor',best.nota.toFixed(3),
          `V/E/D ${best.vitorias}/${best.empates}/${best.derrotas}`,'· duelo com o campeão',confirmation.nota.toFixed(3),
          anchor ? `· contra a IA padrão ${anchor.desafiante.nota.toFixed(3)} x campeão ${anchor.campeao.nota.toFixed(3)}` : '',
          promoted ? '· NOVO CAMPEÃO' : '· campeão mantido','·',Math.round((performance.now()-start)/1000)+' s')
      }
    } catch (error) { if (!(error instanceof Aborted)) throw error }
    finally {
      filler = null
      input?.off('line',typed)
      onStop = null
      await stopPool()
    }
  }

  async function validate() {
    stopRequested = false
    startPool()
    try {
      console.log('Validando contra a IA padrão em 40 partidas novas...')
      const random = rng(0x9e3779b9)
      const result = summary(await run(fixtures(random,20,'padrao').map(job=>({...job,params:state.champion}))))
      console.log('Validação contra a IA padrão:',result)
      await save(join(dir,'validacao.json'),{generation:state.generation,result})
      return result
    } finally { await stopPool() }
  }

  async function activate() {
    const result = await validate()
    await save(profilePath,{format:2,params:state.champion,generation:state.generation,validacao:result})
    console.log('IA tática treinada ativada para Normal e Difícil:',profilePath)
    console.log('Recarregue a página do jogo para aplicar.')
  }

  // Abre o jogo no navegador numa partida IA treinada (equipe 1) x IA padrão (equipe 2).
  async function watch() {
    const maps = ['floresta','rios','acido','delta','procedural']
    const answer = interactive ? await ask(`Mapa (${maps.join(', ')}; Enter = sorteado): `) : ''
    const map = maps.includes(answer) ? answer : ''
    const profileFile = join(dir,'avaliacao.json')
    await save(profileFile,{format:2,params:state.champion,generation:state.championGeneration ?? state.generation})
    const server = spawn(process.execPath,[fileURLToPath(new URL('../nativo/servidor.js',import.meta.url)),'--open'],{
      env:{...process.env,BATTALION_EVAL_PROFILE:profileFile,BATTALION_NATIVE_PORT:String(viewerPort),
        BATTALION_OPEN_PATH:'/?avaliacao'+(map ? '='+map : '')},
      stdio:['ignore','inherit','inherit'],
    })
    console.log(`Partida aberta no navegador (http://127.0.0.1:${viewerPort}/?avaliacao${map ? '='+map : ''}).`)
    console.log('Verde = IA treinada · Azul = IA padrão · ninguém recebe bônus de dano.')
    console.log('Recarregue a página para sortear outra partida.')
    if (interactive) await ask('Pressione Enter para fechar a partida e voltar ao menu. ')
    else await new Promise(ok=>setTimeout(ok,30000))
    server.kill()
  }

  try {
    if (hours > 0) await train(Date.now()+hours*3600000)
    if (values.validar && !values.ativar) await validate()
    if (values.ativar) await activate()
    if (values.exportar) {
      await save(resolve(values.exportar),{format:2,params:state.champion,generation:state.generation})
      console.log('Perfil exportado:',resolve(values.exportar))
    }
    // Menu ao pausar (somente em janela interativa e quando houve treino).
    while (interactive && hours > 0) {
      const promotions = (state.history ?? []).filter(item=>item.promoted).length
      console.log(`\nTreino pausado na geração ${state.generation} · ${state.matches} partidas · ${promotions} promoções de campeão.`)
      console.log(`Progresso salvo em ${checkpoint} (é este arquivo que se leva para outra máquina).`)
      console.log('  1  Assistir a uma partida: IA treinada x IA padrão')
      console.log('  2  Validar (40 partidas) e ativar a IA treinada no jogo')
      console.log('  3  Continuar treinando')
      console.log('  0  Sair')
      const choice = await ask('Escolha: ')
      if (choice === '1') await watch()
      else if (choice === '2') await activate()
      else if (choice === '3') await train(Infinity)
      else if (choice === '0' || choice === 'sair') break
    }
  } finally {
    input?.close()
    await stopPool()
  }
}