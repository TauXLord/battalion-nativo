const IMPACT_DELAY = 340
const DESTRUCTION_DELAY = 490
export const destructionFade = 160

export function combatTimeline(data, event) {
  const participants = new Map(event.combatants.map(unit=>[unit.id,unit]))
  let duration = 0, start = 0
  const hits = event.hits.map(hit => {
    const shooter = participants.get(hit.unit), target = participants.get(hit.target)
    const spec = data.rules.units[shooter.name]
    const firing = hit.piercing ? null : spec.firing
    const shotDuration = firing ? Math.max(...Object.values(firing.animations)
      .map(sequence=>sequence.wait*sequence.frames.length)) : 0
    const effect = data.explosions[hit.hp === 0 ? 'Explosion' : 'Small Explosion']
    if (!hit.piercing) start = duration
    const impact = start + IMPACT_DELAY
    const disappears = hit.hp === 0 ? impact + DESTRUCTION_DELAY : Infinity
    duration = Math.max(duration,start + shotDuration,impact + effect.wait*effect.frames.length)
    return {...hit,shooter,start,impact,disappears,effect,cell:target.cell,sound:hit.piercing ? undefined : spec.sounds.fire}
  })
  return {participants,hits,duration}
}

// Equipe derrotada (perdeu todas as Warmachines): as unidades que sobraram explodem uma por uma.
export const WIPEOUT_STEP = 250
export const wipeoutDuration = event => event?.eliminated?.length ? (event.eliminated.length - 1) * WIPEOUT_STEP + 700 : 0
