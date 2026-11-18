export const featureCount = 22
const hiddenCount = 8
export const genomeSize = hiddenCount*(featureCount+2)+1

export function validProfile(profile) {
  return profile?.format === 1 && Array.isArray(profile.weights) && profile.weights.length === genomeSize &&
    profile.weights.every(weight=>Number.isFinite(weight) && Math.abs(weight)<=8)
}

export function neuralScore(weights,features) {
  let result = weights.at(-1), index = 0
  for (let neuron=0; neuron<hiddenCount; neuron++) {
    let signal = weights[index++]
    for (const feature of features) signal += weights[index++]*feature
    result += Math.tanh(signal)*weights[index++]
  }
  return 45*Math.tanh(result)
}
