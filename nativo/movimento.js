const EDGE_TIME = 400
const CRUISE_TIME = 200

export const movementDuration = steps => steps <= 1 ? steps * EDGE_TIME : 2 * EDGE_TIME + (steps - 2) * CRUISE_TIME

export function movementPose(steps, elapsed) {
  if (elapsed >= movementDuration(steps)) return null
  const t = Math.max(0,elapsed)
  if (steps === 1) {
    const p = t / EDGE_TIME
    return {index:0,progress:p < .5 ? 2 * p * p : 1 - 2 * (1 - p) ** 2}
  }
  if (t < EDGE_TIME) return {index:0,progress:(t / EDGE_TIME) ** 2}
  const cruise = (steps - 2) * CRUISE_TIME
  const middle = t - EDGE_TIME
  if (middle < cruise) {
    return {index:1 + Math.floor(middle / CRUISE_TIME),progress:(middle % CRUISE_TIME) / CRUISE_TIME}
  }
  return {index:steps - 1,progress:1 - (1 - (middle - cruise) / EDGE_TIME) ** 2}
}

export function movementDirection(width, from, to) {
  if (Math.floor(to / width) < Math.floor(from / width)) return 'up'
  if (Math.floor(to / width) > Math.floor(from / width)) return 'down'
  return to < from ? 'left' : 'right'
}
