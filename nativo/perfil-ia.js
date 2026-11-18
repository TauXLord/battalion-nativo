import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { validProfile } from './rede-ia.js'

export const profileDirectory = join(homedir(),'.battalion-nativo')
export const profilePath = join(profileDirectory,'ia.json')

// format 2: pesos nomeados da IA tática (nativo/ia-tatica.js).
const validTactical = profile => profile?.format === 2 && profile.params && typeof profile.params === 'object' &&
  Object.keys(profile.params).length <= 64 && Object.values(profile.params).every(Number.isFinite)

// Usa a IA ativada neste computador (~/.battalion-nativo/ia.json); sem ela, a IA treinada que vem com o jogo.
export async function readAiProfile() {
  for (const path of [profilePath,new URL('./ia-treinada.json',import.meta.url)]) {
    try {
      const data = await readFile(path)
      const profile = data.length <= 32768 ? JSON.parse(data) : null
      if (validProfile(profile) || validTactical(profile)) return profile
    } catch {}
  }
  return null
}
