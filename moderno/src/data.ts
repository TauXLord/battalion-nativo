import missionXml from '../../mods/campanha/Mission_1.yimf?raw'
import campaignXml from '../../mods/dados/campaign.xml?raw'
import unitsXml from '../../mods/dados/units.xml?raw'
import terrainXml from '../../mods/dados/terrain.xml?raw'

export type Side = 1 | 2
export const terrains = ['Plains', 'Road', 'Forest', 'Hill', 'Mountain', 'Sea', 'Shore', 'Reef', 'Bridge',
  'High Bridge', 'Archipelago', 'Rock Formation', 'Depleted Ore Deposit'] as const
export type Terrain = typeof terrains[number]
export const blockedGround: readonly Terrain[] = ['Sea', 'Reef', 'Mountain', 'Archipelago', 'Rock Formation']
export type Scenario = {
  title: string
  width: number
  height: number
  tiles: Terrain[]
  deployments: { type: string; side: Side; cell: number }[]
}
export type UnitSpec = {
  name: string; description: string; move: number; health: number; damage: number
  min: number; max: number; weapon: string; armor: string; movement: string; modifiers: string[]
}

const parser = new DOMParser()
const read = (xml: string) => parser.parseFromString(xml, 'application/xml')
const units = read(unitsXml)
export const unitSpecs = Object.fromEntries([...units.querySelectorAll('unit')].map(unit => {
  const v = (key: string) => unit.querySelector(key)?.getAttribute('value') ?? ''
  const name = unit.getAttribute('name')!
  return [name, {
    name, description: v('description'), move: Number(v('range')), health: Number(v('health')),
    damage: Number(v('damage')), min: Number(v('weaponRangeMin')), max: Number(v('weaponRangeMax')),
    weapon: v('weaponType'), armor: v('armorType'), movement: v('movementType'),
    modifiers: [...unit.querySelectorAll('modifier')].map(item => item.getAttribute('type') ?? ''),
  } satisfies UnitSpec]
}))

export const availableUnits = ['Scorpion Tank', 'Flak Tank', 'Turret', 'Mortar Truck']
export const terrainInfo = Object.fromEntries([...read(terrainXml).querySelectorAll('terrain[name]')].map(tile =>
  [tile.getAttribute('name'), tile.querySelector('description')?.getAttribute('value') ?? '']))
export const terrainNames: Record<Terrain, string> = {
  Plains: 'Planície', Road: 'Estrada', Forest: 'Floresta', Hill: 'Colina', Mountain: 'Montanha',
  Sea: 'Mar', Shore: 'Costa', Reef: 'Recife', Bridge: 'Ponte',
  'High Bridge': 'Ponte elevada', Archipelago: 'Arquipélago', 'Rock Formation': 'Formação rochosa',
  'Depleted Ore Deposit': 'Depósito esgotado',
}
export const unitNames: Record<string, string> = {
  'Scorpion Tank': 'Tanque Scorpion', 'Flak Tank': 'Tanque Flak', Turret: 'Torreta', 'Mortar Truck': 'Caminhão morteiro',
}

const map = read(missionXml)
const width = Number(map.querySelector('cols')?.textContent)
const height = Number(map.querySelector('rows')?.textContent)
const palette = new Map([...map.querySelectorAll('palette entry')].map(e => [
  e.getAttribute('reference'), e.querySelector('name')?.textContent ?? '',
]))
export const chapter: Scenario = {
  title: 'Capítulo 1 · Honra', width, height,
  tiles: Array<Terrain>(width * height).fill('Plains'), deployments: [],
}
for (const tile of map.querySelectorAll('map > tile')) {
  const cell = Number(tile.getAttribute('r')) * width + Number(tile.getAttribute('c'))
  for (const layer of tile.querySelectorAll('layer')) {
    const name = palette.get(layer.getAttribute('reference')) ?? ''
    const unit = /^P([12]) (.+)$/.exec(name)
    if (terrains.includes(name as Terrain)) chapter.tiles[cell] = name as Terrain
    if (unit && unitSpecs[unit[2]]) chapter.deployments.push({ side: Number(unit[1]) as Side, type: unit[2], cell })
  }
}
const campaign = read(campaignXml)
export const brief = campaign.querySelector('level > brief')?.getAttribute('value') ?? ''
export const intro = [...map.querySelectorAll('sender')].slice(0, 8).map(sender => ({
  speaker: sender.getAttribute('value') ?? '',
  text: sender.parentElement?.querySelector('message')?.getAttribute('value') ?? '',
}))

export function validateScenario(value: unknown): Scenario {
  if (!value || typeof value !== 'object') throw Error('Mapa inválido.')
  const map = value as Scenario
  if (typeof map.title !== 'string' || !map.title.trim() || map.title.length > 64) throw Error('Informe um nome de até 64 caracteres.')
  if (![map.width, map.height].every(n => Number.isInteger(n) && n >= 4 && n <= 16)) {
    throw Error('Use dimensões entre 4 e 16 casas.')
  }
  if (!Array.isArray(map.tiles) || map.tiles.length !== map.width * map.height ||
      !map.tiles.every(tile => terrains.includes(tile))) throw Error('A grade contém terreno inválido.')
  if (!Array.isArray(map.deployments) || map.deployments.length > 36) throw Error('Use até 36 unidades.')
  const used = new Set<number>()
  for (const unit of map.deployments) {
    if (!unit || !availableUnits.includes(unit.type) || ![1, 2].includes(unit.side) ||
        !Number.isInteger(unit.cell) || unit.cell < 0 || unit.cell >= map.tiles.length || used.has(unit.cell) ||
        blockedGround.includes(map.tiles[unit.cell])) throw Error('Há uma unidade inválida, sobreposta ou em terreno bloqueado.')
    used.add(unit.cell)
  }
  return map
}
