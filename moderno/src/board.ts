import Phaser from 'phaser'
import { type Battle, type Unit, reachable, canFire, inRange } from './battle'
import { type Scenario, type Terrain, terrains, unitSpecs } from './data'

const SIZE = 96
const colors: Record<Terrain, [string, string]> = {
  Plains: ['#829066', '#536644'], Road: ['#87916e', '#596344'], Forest: ['#667e55', '#445b43'],
  Hill: ['#899567', '#526c48'], Mountain: ['#889680', '#52654f'], Sea: ['#3a8d89', '#22565f'],
  Shore: ['#69a296', '#387e7a'], Reef: ['#4a9691', '#286871'], Bridge: ['#478d89', '#255c64'],
  'High Bridge': ['#478d89', '#255c64'], Archipelago: ['#58a097', '#327673'],
  'Rock Formation': ['#48958c', '#2a666c'], 'Depleted Ore Deposit': ['#7a8165', '#59624c'],
}
const roads: readonly Terrain[] = ['Road', 'Bridge', 'High Bridge']
const waters: readonly Terrain[] = ['Sea', 'Shore', 'Reef', 'Bridge', 'High Bridge', 'Archipelago', 'Rock Formation']

function shape(ctx: CanvasRenderingContext2D, points: number[][], color: string) {
  ctx.beginPath()
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function line(ctx: CanvasRenderingContext2D, points: number[][], color: string, width: number) {
  ctx.beginPath()
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function sprite(ctx: CanvasRenderingContext2D, unit: Unit) {
  const trim = unit.side === 1 ? '#b3f1bd' : '#ffd0ad'
  const hull = unit.side === 1 ? '#418665' : '#ae6248'
  ctx.save()
  ctx.translate(48, 47)
  ctx.fillStyle = '#111a17a0'
  ctx.beginPath(); ctx.ellipse(5, 12, 33, 24, 0, 0, Math.PI * 2); ctx.fill()
  if (unit.type === 'Turret') {
    shape(ctx, [[-25,-14],[-10,-24],[13,-24],[26,-13],[26,17],[13,25],[-15,25],[-26,13]], '#233129')
    shape(ctx, [[-24,-15],[-10,-24],[13,-24],[25,-13],[14,13],[-13,13]], '#9a9f86')
  } else {
    for (const x of [-25, 14]) {
      ctx.fillStyle = '#1c2723'; ctx.fillRect(x, -20, 12, 45)
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = '#4e5b50'; ctx.fillRect(x + 1, -18 + 7 * i, 10, 3)
      }
    }
    shape(ctx, [[-18,-18],[13,-18],[22,-10],[22,13],[13,21],[-16,21],[-22,12],[-22,-9]], '#233529')
    shape(ctx, [[-18,-18],[13,-18],[20,-11],[16,15],[-15,15],[-21,8],[-21,-10]], hull)
    line(ctx, [[-18,11],[-16,-12],[12,-15],[17,-11]], trim, 2)
  }
  if (unit.side === 1) ctx.scale(-1, 1)
  ctx.fillStyle = '#202b23'; ctx.fillRect(4, -6, 30, 10)
  ctx.fillStyle = trim; ctx.fillRect(8, -6, 24, 3)
  if (unit.type === 'Flak Tank') {
    ctx.fillStyle = '#25342c'; ctx.fillRect(2, 6, 33, 5)
    ctx.fillStyle = trim; ctx.fillRect(8, 6, 26, 2)
  }
  shape(ctx, [[-11,-9],[3,-13],[12,-6],[12,7],[1,12],[-12,5]], '#253930')
  shape(ctx, [[-11,-10],[3,-13],[10,-7],[7,4],[-3,7],[-11,3]], hull)
  ctx.fillStyle = trim; ctx.fillRect(-7, -7, 9, 3)
  ctx.restore()
  ctx.fillStyle = '#152321'; ctx.fillRect(17, 77, 62, 8)
  ctx.fillStyle = trim; ctx.fillRect(19, 79, 58 * unit.hp / unitSpecs[unit.type].health, 4)
}

export class Board extends Phaser.Scene {
  private surface!: Phaser.Textures.CanvasTexture
  private picture!: Phaser.GameObjects.Image
  private map?: Scenario
  private selected?: Unit
  private hover = -1
  private offsetX = 0
  private offsetY = 0
  private displayCell = 0
  private ground?: HTMLCanvasElement
  private units?: HTMLCanvasElement
  private paths = new Map<number, { cost: number; route: number[] }>()
  private targets = new Set<number>()
  private range = new Set<number>()
  onCell: (cell: number) => void = () => {}
  onHover: (cell: number) => void = () => {}
  onReady: () => void = () => {}

  create() {
    this.surface = this.textures.createCanvas('battlefield', 1, 1)!
    this.picture = this.add.image(0, 0, 'battlefield').setOrigin(0)
    this.scale.on('resize', () => this.fit())
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const cell = this.cellAt(pointer.x, pointer.y)
      if (pointer.button === 0 && cell >= 0) this.onCell(cell)
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.highlight(this.cellAt(pointer.x, pointer.y)))
    this.input.on('gameout', () => this.highlight(-1))
    this.onReady()
  }

  show(map: Scenario, state?: Battle, selected?: Unit) {
    this.map = map
    this.selected = selected
    this.paths = state && selected ? reachable(state, selected) : new Map()
    this.range = new Set()
    this.targets = new Set()
    if (state && selected && canFire(selected)) {
      for (let cell = 0; cell < map.tiles.length; cell++) {
        if (inRange(state, selected, cell)) this.range.add(cell)
      }
      for (const unit of state.units) {
        if (unit.side !== selected.side && this.range.has(unit.cell)) this.targets.add(unit.cell)
      }
    }
    this.surface.setSize(map.width * SIZE, map.height * SIZE)
    this.ground = this.layer()
    this.units = this.layer()
    this.paintTerrain(this.ground.getContext('2d')!, map)
    for (const unit of state?.units ?? map.deployments.map((u, id) => ({ ...u, id, hp: unitSpecs[u.type].health, moved: false, fired: false }))) {
      const ctx = this.units.getContext('2d')!
      ctx.save()
      ctx.translate(unit.cell % map.width * SIZE, Math.floor(unit.cell / map.width) * SIZE)
      if (unit.fired) ctx.globalAlpha = .68
      sprite(ctx, unit)
      ctx.restore()
    }
    this.fit()
    this.draw()
  }

  private layer() {
    const canvas = document.createElement('canvas')
    canvas.width = this.surface.width
    canvas.height = this.surface.height
    return canvas
  }

  private fit() {
    if (!this.map) return
    const available = this.scale.gameSize
    this.displayCell = Math.min((available.width - 28) / this.map.width, (available.height - 28) / this.map.height)
    const w = this.displayCell * this.map.width
    const h = this.displayCell * this.map.height
    this.offsetX = (available.width - w) / 2
    this.offsetY = (available.height - h) / 2
    this.picture.setPosition(this.offsetX, this.offsetY).setDisplaySize(w, h)
  }

  private cellAt(x: number, y: number) {
    if (!this.map || this.displayCell <= 0) return -1
    const column = Math.floor((x - this.offsetX) / this.displayCell)
    const row = Math.floor((y - this.offsetY) / this.displayCell)
    return column >= 0 && column < this.map.width && row >= 0 && row < this.map.height ? row * this.map.width + column : -1
  }

  private highlight(cell: number) {
    if (this.hover === cell) return
    this.hover = cell
    this.onHover(cell)
    this.draw()
  }

  private paintTerrain(ctx: CanvasRenderingContext2D, map: Scenario) {
    for (const [cell, tile] of map.tiles.entries()) {
      ctx.save()
      ctx.translate(cell % map.width * SIZE, Math.floor(cell / map.width) * SIZE)
      const gradient = ctx.createLinearGradient(0, 0, SIZE, SIZE)
      gradient.addColorStop(0, colors[tile][0]); gradient.addColorStop(1, colors[tile][1])
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, SIZE, SIZE)
      const water = waters.includes(tile)
      for (let i = 0; i < 39; i++) {
        const x = (i * 41 + cell * 19) % 94, y = (i * 23 + cell * 37) % 94
        ctx.fillStyle = water ? '#c6f1d51a' : i % 2 ? '#dee4af26' : '#2638282e'
        ctx.fillRect(x, y, water ? 3 + i % 11 : 2 + i % 3, 1 + i % 2)
      }
      if (tile === 'Sea' || tile === 'Shore' || tile === 'Reef') {
        for (let y = 13; y < 96; y += 23) {
          const x = (cell * 31 + y) % 42
          line(ctx, [[x,y],[x+12,y-3],[x+30,y-3],[x+40,y-7]], '#aff0d436', 2)
        }
      }
      if (tile === 'Shore') {
        const adjacent = [
          { edge: 'top', ok: cell >= map.width, test: cell - map.width },
          { edge: 'bottom', ok: cell < map.tiles.length - map.width, test: cell + map.width },
          { edge: 'left', ok: cell % map.width > 0, test: cell - 1 },
          { edge: 'right', ok: cell % map.width < map.width - 1, test: cell + 1 },
        ]
        for (const edge of adjacent.filter(item => item.ok && !waters.includes(map.tiles[item.test]))) {
          ctx.save(); ctx.translate(48,48)
          ctx.rotate(({ top: 0, right: 1, bottom: 2, left: 3 }[edge.edge] ?? 0) * Math.PI / 2)
          ctx.translate(-48,-48)
          shape(ctx, [[0,0],[96,0],[96,13],[77,18],[52,16],[33,25],[0,20]], '#759466')
          line(ctx, [[0,20],[33,25],[52,16],[77,18],[96,13]], '#d2d9a6', 3)
          ctx.restore()
        }
      }
      if (roads.includes(tile)) {
        const linked = (n: number) => roads.includes(map.tiles[n])
        const bridge = tile !== 'Road'
        const points = [
          ...(cell >= map.width && linked(cell - map.width) ? [[48,0]] : []),
          ...(cell < map.tiles.length - map.width && linked(cell + map.width) ? [[48,96]] : []),
          ...(cell % map.width > 0 && linked(cell - 1) ? [[0,48]] : []),
          ...(cell % map.width < map.width - 1 && linked(cell + 1) ? [[96,48]] : []),
        ]
        for (const end of points.length ? points : [[0,48],[96,48]]) {
          line(ctx, [[48,48],end], '#363f36', bridge ? 43 : 37)
          line(ctx, [[48,48],end], bridge ? '#9c9680' : '#777c70', bridge ? 36 : 31)
          ctx.setLineDash([7, 7]); line(ctx, [[48,48],end], '#c6c19b82', 1.5); ctx.setLineDash([])
        }
      }
      if (tile === 'Mountain' || tile === 'Reef' || tile === 'Rock Formation' || tile === 'Archipelago') {
        for (const [x,y,s] of [[14,75,1],[44,71,.9],[58,85,.8]]) {
          const h = (tile === 'Mountain' ? 51 : tile === 'Rock Formation' ? 32 : 17) * s
          shape(ctx, [[x-6,y],[x+18,y-h],[x+43,y],[x+27,y+5]], water ? '#335e59' : '#485c4d')
          shape(ctx, [[x-6,y],[x+18,y-h],[x+25,y-11],[x+12,y]], water ? '#7cb5a1' : '#a5ae95')
          shape(ctx, [[x+12,y-h*.64],[x+18,y-h],[x+25,y-h*.66],[x+21,y-h*.73]], '#d1d2ac')
        }
      }
      if (tile === 'Forest' || tile === 'Hill') {
        for (let i = 0; i < (tile === 'Hill' ? 5 : 10); i++) {
          const x = 11 + ((i * 33 + cell * 4) % 72), y = 23 + ((i * 21 + cell * 5) % 62)
          shape(ctx, [[x-10,y+5],[x,y-16],[x+14,y+5],[x+5,y+9]], '#344d39')
          shape(ctx, [[x-10,y+5],[x,y-16],[x+2,y+5]], '#6c9260')
        }
      }
      ctx.strokeStyle = '#203c363a'; ctx.strokeRect(.5,.5,95,95)
      ctx.restore()
    }
  }

  private draw() {
    if (!this.ground || !this.units || !this.map) return
    const ctx = this.surface.context
    ctx.clearRect(0, 0, this.surface.width, this.surface.height)
    ctx.drawImage(this.ground, 0, 0)
    const at = (i: number) => [i % this.map!.width * SIZE, Math.floor(i / this.map!.width) * SIZE]
    for (const cell of this.range) {
      if (this.paths.has(cell)) continue
      const [x,y] = at(cell)
      ctx.fillStyle = '#ffd2a023'; ctx.fillRect(x+2,y+2,92,92)
      ctx.strokeStyle = '#ffe6a985'; ctx.setLineDash([4, 7]); ctx.strokeRect(x+4,y+4,88,88); ctx.setLineDash([])
    }
    for (const cell of this.paths.keys()) {
      const [x,y] = at(cell)
      ctx.fillStyle = '#affde22e'; ctx.fillRect(x+3,y+3,90,90)
      ctx.strokeStyle = '#b3f9d099'; ctx.strokeRect(x+4,y+4,88,88)
    }
    const path = this.paths.get(this.hover)
    if (path) line(ctx, path.route.map(i => at(i).map(v => v+48)), '#d4ffe1', 5)
    ctx.drawImage(this.units, 0, 0)
    for (const cell of this.targets) {
      const [x,y] = at(cell)
      ctx.strokeStyle = '#ffd1a0'; ctx.lineWidth = 4
      ctx.beginPath(); ctx.arc(x+48,y+47,36,0,Math.PI*2); ctx.stroke()
    }
    if (this.selected) {
      const [x,y] = at(this.selected.cell)
      ctx.lineWidth = 4; ctx.strokeStyle = '#d7ffd9'; ctx.strokeRect(x+4,y+4,88,88)
    }
    if (this.hover >= 0 && this.hover < this.map.tiles.length) {
      const [x,y] = at(this.hover)
      ctx.lineWidth = 2; ctx.strokeStyle = '#f9f0ce'; ctx.strokeRect(x+2,y+2,92,92)
    }
    ctx.lineWidth = 1
    this.surface.refresh()
  }
}
