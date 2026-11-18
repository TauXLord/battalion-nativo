import { blockedGround, unitSpecs, type Scenario, type Side, type Terrain } from './data'

export type Unit = Scenario['deployments'][number] & { id: number; hp: number; moved: boolean; fired: boolean }
export type Battle = { map: Scenario; units: Unit[]; side: Side; round: number; winner: Side | null }
export type Order = { id: number; cell?: number; target?: number }
export type Difficulty = 'normal' | 'hard' | 'extreme'
export const other = (side: Side): Side => side === 1 ? 2 : 1
export const distance = (map: Scenario, a: number, b: number) =>
  Math.abs(a % map.width - b % map.width) + Math.abs(Math.floor(a / map.width) - Math.floor(b / map.width))

export function start(map: Scenario): Battle {
  return {
    map, units: map.deployments.map((u, id) => ({ ...u, id, hp: unitSpecs[u.type].health, moved: false, fired: false })),
    side: 1, round: 1, winner: null,
  }
}

export function stepCost(terrain: Terrain, movement: string) {
  if (blockedGround.includes(terrain)) return Infinity
  if (terrain === 'Forest' || terrain === 'Hill') return movement === 'wheeled' ? 2.5 : 2
  if (terrain === 'Plains' && movement === 'wheeled') return 1.5
  return 1
}

function neighbors(cell: number, map: Scenario) {
  const x = cell % map.width
  const y = Math.floor(cell / map.width)
  return [
    ...(x > 0 ? [cell - 1] : []), ...(x < map.width - 1 ? [cell + 1] : []),
    ...(y > 0 ? [cell - map.width] : []), ...(y < map.height - 1 ? [cell + map.width] : []),
  ]
}

export function reachable(state: Battle, unit: Unit) {
  const paths = new Map<number, { cost: number; route: number[] }>()
  const spec = unitSpecs[unit.type]
  if (unit.moved || unit.fired || !spec.move) return paths
  const occupied = new Map(state.units.map(u => [u.cell, u.side]))
  const frontier = [{ cell: unit.cell, cost: 0, route: [unit.cell] }]
  const costs = new Map([[unit.cell, 0]])
  while (frontier.length) {
    frontier.sort((a, b) => b.cost - a.cost)
    const current = frontier.pop()!
    if (current.cost !== costs.get(current.cell)) continue
    for (const cell of neighbors(current.cell, state.map)) {
      if (occupied.get(cell) === other(unit.side)) continue
      const cost = current.cost + stepCost(state.map.tiles[cell], spec.movement)
      if (cost > spec.move || cost >= (costs.get(cell) ?? Infinity)) continue
      const route = [...current.route, cell]
      costs.set(cell, cost)
      if (!occupied.has(cell)) paths.set(cell, { cost, route })
      frontier.push({ cell, cost, route })
    }
  }
  return paths
}

export function inRange(state: Battle, unit: Unit, cell: number) {
  const spec = unitSpecs[unit.type]
  const max = spec.max + Number(spec.max > 1 && state.map.tiles[unit.cell] === 'Hill')
  const range = distance(state.map, unit.cell, cell)
  return spec.damage > 0 && range >= spec.min && range <= max
}

export function canFire(unit: Unit) {
  const spec = unitSpecs[unit.type]
  return !unit.fired && spec.damage > 0 && (!unit.moved || spec.max <= 1)
}

export function damage(state: Battle, attacker: Unit, defender: Unit, initiates: boolean) {
  const a = unitSpecs[attacker.type]
  const d = unitSpecs[defender.type]
  const multiplier = a.weapon === 'medium' || d.armor === 'medium' ? 1 : a.weapon === d.armor ? 1.5 : .5
  const cover = ({ Plains: .9, Forest: .8, Hill: .8, Mountain: .7, Reef: .9 } as Partial<Record<Terrain, number>>)[state.map.tiles[defender.cell]] ?? 1
  const bonus = initiates && a.modifiers.includes('Blitz') ? 1.2 : 1
  return Math.max(1, Math.round(a.damage * Math.ceil(attacker.hp / a.health * 4) / 4 * multiplier * cover * bonus))
}

export function exchange(state: Battle, attacker: Unit, defender: Unit) {
  const hit = Math.min(defender.hp, damage(state, attacker, defender, true))
  const remaining = defender.hp - hit
  const spec = unitSpecs[defender.type]
  const canCounter = (spec.max <= 1 || spec.modifiers.includes('Counter Battery')) &&
    !spec.modifiers.includes('Blind Spot') && !unitSpecs[attacker.type].modifiers.includes('Stun')
  const counter = remaining > 0 && canCounter && inRange(state, defender, attacker.cell) ?
    Math.min(attacker.hp, damage(state, { ...defender, hp: remaining }, attacker, false)) : 0
  return { hit, counter }
}

export function apply(state: Battle, order: Order): Battle {
  const unit = state.units.find(u => u.id === order.id)
  if (!unit || unit.side !== state.side || state.winner || (order.cell === undefined && order.target === undefined)) return state
  if (order.cell !== undefined && !reachable(state, unit).has(order.cell)) return state
  const moved = order.cell === undefined ? unit : { ...unit, cell: order.cell, moved: true }
  const target = order.target === undefined ? undefined : state.units.find(u => u.id === order.target)
  if (order.target !== undefined && (!target || target.side === moved.side || !canFire(moved) || !inRange(state, moved, target.cell))) {
    return state
  }
  const result = target ? exchange(state, moved, target) : { hit: 0, counter: 0 }
  const units = state.units.map(u => {
    if (u === unit) return { ...moved, hp: moved.hp - result.counter, fired: moved.fired || Boolean(target) }
    if (u === target) return { ...u, hp: u.hp - result.hit }
    return u
  }).filter(u => u.hp > 0)
  const winner = units.some(u => u.side === other(state.side)) ?
    (units.some(u => u.side === state.side) ? null : other(state.side)) : state.side
  return { ...state, units, winner }
}

export function advance(state: Battle): Battle {
  if (state.winner) return state
  const side = other(state.side)
  return {
    ...state, side, round: state.round + Number(side === 1),
    units: state.units.map(u => u.side === side ? { ...u, moved: false, fired: false } : u),
  }
}

export function orders(state: Battle): Order[] {
  if (state.winner) return []
  const actions: Order[] = []
  const enemies = state.units.filter(u => u.side !== state.side)
  for (const unit of state.units.filter(u => u.side === state.side && !u.fired)) {
    const moves = reachable(state, unit)
    for (const cell of [undefined, ...moves.keys()]) {
      const position = cell === undefined ? unit : { ...unit, cell, moved: true }
      if (cell !== undefined) actions.push({ id: unit.id, cell })
      if (!canFire(position)) continue
      for (const enemy of enemies) {
        if (inRange(state, position, enemy.cell)) actions.push({ id: unit.id, cell, target: enemy.id })
      }
    }
  }
  return actions
}

function evaluate(state: Battle, side: Side) {
  if (state.winner) return state.winner === side ? 100000 : -100000
  const army = (team: Side) => {
    const enemies = state.units.filter(u => u.side !== team)
    return state.units.filter(u => u.side === team).reduce((score, unit) => {
      const spec = unitSpecs[unit.type]
      const proximity = Math.min(...enemies.map(enemy => distance(state.map, unit.cell, enemy.cell)))
      const defense = ['Forest', 'Hill'].includes(state.map.tiles[unit.cell]) ? 4 : 0
      return score + 35 + unit.hp / spec.health * (65 + spec.damage / 2) + defense -
        (spec.move > 0 ? proximity * 3.5 : 0)
    }, 0)
  }
  return army(side) - army(other(side))
}

function candidates(state: Battle, max: number) {
  return orders(state).map(order => {
    const next = apply(state, order)
    return { order, next, score: evaluate(next, state.side) }
  }).sort((a, b) => b.score - a.score).slice(0, max)
}

export function choose(state: Battle, difficulty: Difficulty): Order | undefined {
  const side = state.side
  const base = evaluate(state, side)
  const best = candidates(state, difficulty === 'extreme' ? 6 : 4)
  if (difficulty === 'normal') return best.find(item => item.score > base)?.order
  if (difficulty === 'hard') return best.find(item => item.score >= base && item.next !== state)?.order
  // Examine a follow-up by the same side and the opponent's strongest reply.
  const afterReply = (position: Battle) => {
    const reply = advance(position)
    const strongest = candidates(reply, 1)[0]
    return strongest ? Math.min(evaluate(position, side), evaluate(strongest.next, side)) : evaluate(position, side)
  }
  let value = afterReply(state)
  let decision: Order | undefined
  for (const item of best) {
    const continuations = candidates(item.next, 2)
    const score = Math.max(afterReply(item.next), ...continuations.map(c => afterReply(c.next)))
    if (score > value || (!decision && score === value && item.score > base)) {
      decision = item.order
      value = score
    }
  }
  return decision
}
