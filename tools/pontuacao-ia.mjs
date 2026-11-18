export const rewardVersion = 2

export function explorationRate(generations) {
  return Math.max(.03,.55 * 2 ** (-generations/20))
}

export function scoreMatch({result,round,roundLimit,advantage,defense}) {
  const elapsed = Math.min(1,Math.max(0,(round-1)/Math.max(1,roundLimit-1)))
  const outcome = result > 0 ? .36 + .10*(1-elapsed) : result < 0 ? -.42 : 0
  return .50 + outcome + .02*Math.tanh(advantage*2.5) + .02*defense
}
