import { activeSides, allied, canTakeTurn, checkWinner, createGame, order, snapshot, teamAttackScale, unitFor } from './partida.js'
import { defaultAiTime } from './ia.js'
import { aiPlanner } from './planejador.js'
import { movementDuration } from './movimento.js'
import { combatTimeline } from './combate.js'

const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))
const progressKey = group => 'battalion-nativo-' + group
export function campaignProgress(group = 'vengeance') {
  try { return JSON.parse(localStorage.getItem(progressKey(group))) ?? {} }
  catch { return {} }
}

export function saveVictory(number, result, group) {
  const progress = campaignProgress(group)
  if (!(number in progress) || progress[number].score < result.score) {
    progress[number] = {score:result.score,medal:result.medal}
    try { localStorage.setItem(progressKey(group),JSON.stringify(progress)) } catch {}
  }
}

export function campaignTransport(data, mission, difficulty, {
  group = 'vengeance', mode = 'campaign', back = '/?campanha', humans = mode === 'hotseat' ? 2 : Number(mode !== 'spectator'),
  aiTime = defaultAiTime, sideDifficulty, onFinish, WorkerType = globalThis.Worker,
  // resume: partida salva para continuar; onSave(dados | null): chamado a cada turno do jogador (null no fim).
  resume, onSave,
  // practice: modo desenvolvedor (prévia de dano); a vitória não conta progresso nem medalha.
  practice = false,
  // fastAI(): pula as pausas de animação das jogadas da IA; turnLimit: segundos máximos por turno de cada IA (0 = sem limite).
  fastAI = () => false, turnLimit = 0,
  // fog: neblina de guerra (partidas avulsas).
  fog = false,
} = {}) {
  // sideDifficulty: dificuldade de cada equipe da IA (ex.: assistir IA x IA com níveis diferentes).
  const levelOf = side => sideDifficulty?.[side-1] ?? difficulty
  const {rules} = data
  const map = mission.board
  const planner = aiPlanner(rules,map,WorkerType,data.aiProfile)
  const campaign = mode === 'campaign'
  const spectator = mode === 'spectator'
  const hotseat = mode === 'hotseat'
  const state = resume ? structuredClone(resume.state) : createGame(rules,map,mission.teams.map(team=>team.color),{
    campaign, attackScale:sideDifficulty ?
      mission.teams.map((_,index)=>index < humans ? 1 : [.7,1,1.4][levelOf(index+1)] ?? 1) :
      teamAttackScale(mission.teams.length,humans,spectator ? 1 : difficulty),
    incomeScale:campaign ? mission.teams.map((_,i)=>i === 0 ? 1 : [.7,1,1.4][difficulty]) : undefined,
    alliances:mission.teams.map(team=>team.allies ? team.allies.split(',').map(index=>Number(index)+1) : []),
    simultaneous:mode === 'ai',fog,victory:map.victory,
  })
  let receive, cancelled = false, disabled = false, morale = true, dialog = null, nextLine, result, focus
  let killed = 0, lost = 0, dialogId = 0, focusId = 0, playing = false
  let computerRunning = false, finishing = false
  const highlights = new Set()
  const completed = new Set()
  const cellAt = node => Number(node.y)*map.width + Number(node.x)
  const teamOf = node => node.player != null ? Number(node.player) : Number(node.controller)+1
  let viewing = spectator ? 0 : 1
  if (resume) {
    ({disabled,morale,killed,lost} = resume)
    for (const cell of resume.highlights ?? []) highlights.add(cell)
    for (const index of resume.completed ?? []) if (mission.events[index]) completed.add(mission.events[index])
    viewing = resume.viewing ?? viewing
  }
  // Replay (só partidas avulsas: a campanha tem eventos que mudam o jogo fora das jogadas).
  // Grava o estado inicial e cada jogada; como o motor é determinístico, reaplicar reproduz a partida.
  const replayStart = mission.events?.length ? null : resume?.replay?.initial ?? structuredClone(state)
  const replayLog = resume?.replay?.actions?.slice() ?? []
  const viewer = () => viewing
  const computerSide = () => activeSides(state).find(side=>side>humans && canTakeTurn(state,side))
  // Salvamento automático: só quando é a vez de um jogador humano e nada está acontecendo (falas, IA, fim).
  let saveTimer
  function autosave() {
    if (!onSave || spectator || !playing || dialog || result || computerRunning || cancelled || state.winner) return
    if (!activeSides(state).some(side=>side <= humans && canTakeTurn(state,side))) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => onSave({state:structuredClone(state),killed,lost,disabled,morale,viewing,
      highlights:[...highlights],completed:[...completed].map(event=>mission.events.indexOf(event)),
      replay:replayStart ? {initial:replayStart,actions:replayLog.slice()} : undefined}),250)
  }
  const publish = () => {
    if (!cancelled && receive) receive({...snapshot(state,viewer()),teams:mission.teams,dialog,result,focus,
      blocked:disabled,morale,objective:mission.objective,highlights:[...highlights],viewer:viewer()})
    autosave()
  }

  function showDialog(contents) {
    return new Promise(resolve => {
      nextLine = resolve
      dialog = {...contents,id:++dialogId}
      publish()
    })
  }

  async function runEvents(type, deaths = []) {
    for (const event of mission.events) {
      const {when} = event
      if (when.type !== type || completed.has(event)) continue
      if (type === 'killUnit' && !deaths.some(unit=>unit.cell === cellAt(when))) continue
      if (type === 'endGame' && ((when.victory !== 'false') !== allied(state,state.winner,Number(when.player)))) continue
      completed.add(event)
      for (const response of event.do) {
        if (cancelled) return
        const side = teamOf(response)
        const unit = state.units.find(item=>item.cell === cellAt(response))
        switch (response.type) {
          case 'disableControllers':
            disabled = response.disable === 'true'
            break
          case 'disableMorale':
            morale = response.disable !== 'true'
            break
          case 'chat':
            await showDialog(response)
            dialog = null
            break
          case 'highlight':
            if (response.show === 'true') highlights.add(cellAt(response))
            else highlights.delete(cellAt(response))
            break
          case 'scroll':
            focus = {cell:cellAt(response),id:++focusId}
            break
          case 'disableAllUnits':
            for (const index of side === 0 ? state.buildable.keys() : [side-1]) {
              if (index in state.buildable) state.buildable[index] = response.disable === 'false' ? null : []
            }
            break
          case 'disableUnit':
          case 'enableUnit': {
            const roster = state.buildable[side-1]
            if (!(side-1 in state.buildable)) break
            if (response.type === 'enableUnit' && response.enable !== 'false') {
              if (roster && !roster.includes(response.unit)) state.buildable[side-1] = [...roster,response.unit]
            } else {
              state.buildable[side-1] = (roster ?? Object.keys(rules.units)).filter(name=>name !== response.unit)
            }
            break
          }
          case 'unitDisable':
            if (unit) unit.disabled = response.disable !== 'false'
            break
          case 'resources':
            for (const index of side === 0 ? state.teamCredits.keys() : [side-1]) {
              if (index in state.teamCredits) state.teamCredits[index] += Number(response.amount)
            }
            break
          case 'damageUnit':
            if (unit) unit.hp -= Number(response.amount)
            state.units = state.units.filter(item=>item.hp > 0)
            break
          case 'removeUnit':
            if (unit) state.units = state.units.filter(item=>item.id !== unit.id)
            break
          case 'createTransportedUnit':
            if (!unit) state.units.push(unitFor(rules,{name:response.transporterType, transported:response.transportType,
              side,cell:cellAt(response)},state.nextId++))
            break
          case 'surrenderPlayer':
            state.units = state.units.filter(item=>item.side !== side)
            break
          default:
            throw Error('Evento de campanha não reconhecido: ' + response.type)
        }
      }
    }
    publish()
  }

  function apply(action, announce = true, side = state.turn) {
    const previous = state.units.slice()
    const version = state.version
    order(rules,map,state,side,{version,...action})
    if (replayStart) replayLog.push({side,action:{...action,version}})
    const deaths = previous.filter(unit=>!state.units.includes(unit))
    for (const unit of deaths) {
      if (unit.side === 1) lost++
      else if (!allied(state,1,unit.side) && state.last.hits?.some(hit=>hit.target === unit.id && hit.hp === 0 &&
          previous.some(shooter=>shooter.id === hit.unit && shooter.side === 1))) killed++
    }
    if (announce) publish()
    return deaths
  }

  function animationDuration() {
    const event = state.last
    if (event?.type === 'attack') return combatTimeline(data,event).duration + movementDuration(event.movement?.path.length ?? 0)
    if (event?.type === 'move') return movementDuration(event.path.length)
    return 0
  }

  async function finish() {
    if (finishing) return
    finishing = true
    await pause(animationDuration() + 100)
    if (cancelled) return
    if (campaign) await runEvents('endGame')
    if (cancelled) return
    const victory = allied(state,state.winner,1)
    const score = campaign ? Math.max(0,Math.trunc((killed*1000-lost*100+(victory ? 5000 : 0)) / state.round)) : null
    const medal = !campaign || !victory ? 0 : score >= mission.medals[1] ? 3 : score >= mission.medals[0] ? 2 : 1
    result = {winner:state.winner,score,medal,victory,campaign,killed,lost}
    if (campaign && victory && !practice) saveVictory(mission.number,result,group)
    if (practice) result.practice = true
    clearTimeout(saveTimer)
    onSave?.(null)
    onFinish?.(result)
    publish()
  }

  async function resolveDeaths(deaths) {
    if (!deaths.length || !mission.events.some(event=>event.when.type === 'killUnit' && !completed.has(event) &&
        deaths.some(unit=>unit.cell === cellAt(event.when)))) return false
    await pause(animationDuration() + 100)
    if (!cancelled) {
      await runEvents('killUnit',deaths)
      checkWinner(rules,map,state)
    }
    return true
  }

  async function enemyTurn() {
    if (computerRunning) return
    computerRunning = true
    try {
      await pause(320)
      let side, retries = 0
      const turnStart = new Map()
      while (!cancelled && (side = computerSide())) {
        const version = state.version
        // Tempo máximo do turno desta IA: passado o limite, ela encerra o turno.
        const key = side + ':' + state.round
        if (!turnStart.has(key)) turnStart.set(key,Date.now())
        if (turnLimit > 0 && Date.now() - turnStart.get(key) > turnLimit*1000) {
          try { apply({type:'end',version},true,side) } catch {}
          continue
        }
        // Partida de avaliação: cada equipe pode ter sua própria IA (dificuldade e perfil).
        const custom = data.aiSides?.[side]
        const action = await planner.choose(state,custom ?
          {side,difficulty:custom.difficulty,engine:custom.engine,profile:custom.profile ?? null,seconds:aiTime} :
          {side,difficulty:levelOf(side),seconds:aiTime})
        if (cancelled || !canTakeTurn(state,side)) continue
        let deaths
        try { deaths = apply({...action,version},true,side) }
        catch {
          if (version !== state.version && retries++ < 2) continue
          deaths = apply({type:'end'},true,side)
        }
        retries = 0
        const animated = await resolveDeaths(deaths)
        if (!animated && !state.winner) await pause(fastAI() ? 60 : animationDuration() + 120)
      }
      if (!cancelled && state.winner) await finish()
    } finally {
      computerRunning = false
    }
    if (!cancelled && state.winner) await finish()
    else autosave()
  }

  async function passControl() {
    if (!hotseat || cancelled || state.winner || state.turn > humans || state.turn === viewing) return
    viewing = state.turn
    const team = mission.teams[viewing-1]
    await showDialog({sender:team.name,color:team.color,avatar:team.avatar,message:'Passe o controle ao próximo jogador.',handoff:true})
    dialog = null
    publish()
  }

  return {
    back,hotseat,practice,fastAI,
    // Arquivo de replay da partida (null na campanha).
    replay:() => replayStart && {format:'battalion-replay',version:1,title:map.title,board:map,
      teams:mission.teams.map(({name,color,avatar,allies})=>({name,color,avatar,allies})),
      initial:replayStart,actions:replayLog.slice(),savedAt:Date.now()},
    listen(onState) {
      receive = onState
      if (resume) {
        // Partida continuada: os eventos de início já aconteceram.
        playing = true
        publish()
        if (computerSide()) void enemyTurn()
        return () => {cancelled = true; planner.close(); nextLine?.()}
      }
      void runEvents('startGame').then(()=>{
        playing = true
        if (computerSide()) return enemyTurn()
      })
      return () => {cancelled = true; planner.close(); nextLine?.()}
    },
    async send(action) {
      if (!playing || spectator || !canTakeTurn(state,viewer()) || disabled || dialog) throw Error('Ação indisponível.')
      const deaths = apply(action,!hotseat || action.type !== 'end',viewer())
      if (hotseat && action.type === 'end') {
        if (state.turn <= humans && state.turn !== viewing && !state.winner) return passControl()
        publish()
      }
      await resolveDeaths(deaths)
      if (state.winner) await finish()
      else if (state.activeSides && computerSide()) void enemyTurn()
      else if (computerSide()) {
        await enemyTurn()
        await passControl()
      }
    },
    advance() {
      const resume = nextLine
      nextLine = null
      resume?.()
    },
  }
}
