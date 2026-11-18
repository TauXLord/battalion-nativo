// Campanha em dupla pela rede: a missão roda no servidor com o mesmo motor da campanha (falas, eventos, IA)
// e dois jogadores comandam juntos o time 1. Cada um fica com parte das Warmachines e com as unidades mais
// próximas delas; o que cada um constrói é dele. O turno do time só termina quando os dois encerram.
import { campaignTransport } from './campanha.js'

const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))
export const coopPlayers = 2
export const coopEligible = mission => Boolean(mission?.board) &&
  mission.board.units.filter(unit=>unit.side === 1 && unit.name === 'Warmachine').length >= coopPlayers

export function coopCampaign({data,mission,difficulty,aiTime,Worker,group,chapter}) {
  const transport = campaignTransport(data,mission,difficulty,{mode:'campaign',group,humans:1,aiTime,WorkerType:Worker})
  const width = mission.board.width
  const owners = new Map(), ended = new Set()
  let latest = null, revision = 0, notify = () => {}, stop, lastBuilder = null
  const x = cell => cell%width, y = cell => Math.floor(cell/width)
  const gap = (a,b) => Math.abs(x(a)-x(b)) + Math.abs(y(a)-y(b))

  function assign(units) {
    const team = units.filter(unit=>unit.side === 1)
    if (!owners.size) {
      // Divide as Warmachines da esquerda para a direita, alternando os jogadores.
      team.filter(unit=>unit.name === 'Warmachine').sort((a,b)=>x(a.cell)-x(b.cell) || y(a.cell)-y(b.cell))
        .forEach((unit,index)=>owners.set(unit.id,index%coopPlayers+1))
    }
    const machines = team.filter(unit=>unit.name === 'Warmachine' && owners.has(unit.id))
    for (const unit of team) {
      if (owners.has(unit.id)) continue
      const near = machines.slice().sort((a,b)=>gap(a.cell,unit.cell)-gap(b.cell,unit.cell))[0]
      owners.set(unit.id,lastBuilder ?? (near ? owners.get(near.id) : 1))
    }
    lastBuilder = null
  }

  return {
    mission,
    start(onChange) {
      notify = onChange
      stop = transport.listen(state => {
        latest = state
        assign(state.units)
        revision++
        notify()
      })
    },
    stateFor(player) {
      if (!latest) return null
      return {...latest,revision,coop:{you:player,owners:Object.fromEntries(owners),waiting:[...ended],chapter,group}}
    },
    get revision() { return revision },
    // `active`: quantos jogadores estão conectados; se o parceiro caiu, um só pode encerrar o turno.
    async command(player,command,active = coopPlayers) {
      if (!latest) throw Error('A missão ainda está começando.')
      if (command.type === 'undo') throw Error('Desfazer não está disponível na campanha em dupla.')
      if (command.unit !== undefined && (owners.get(command.unit) ?? player) !== player) {
        throw Error('Esta unidade é do seu parceiro.')
      }
      if (command.type === 'end') {
        ended.add(player)
        if (ended.size < Math.max(1,active)) { revision++; notify(); return }
        ended.clear()
        command = {type:'end',version:latest.version}
      } else {
        // Voltou a jogar depois de encerrar: o encerramento dele deixa de valer.
        if (ended.delete(player)) revision++
        if (['build','factoryBuild','transport'].includes(command.type)) lastBuilder = player
      }
      const running = transport.send(command)
      running.catch(()=>{})
      // Uma jogada inválida falha na hora; o resto (animações e turno da IA) continua em segundo plano.
      await Promise.race([running,pause(40)])
    },
    advance() { transport.advance() },
    close() { stop?.() },
  }
}
