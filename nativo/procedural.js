import { moveCost, neighbors } from './partida.js'

export const terrainWeights = [
  ['Sea','Água',24], ['Reef','Recife',4], ['Plains','Planície',35], ['Forest','Floresta',16],
  ['Hill','Colina',9], ['Mountain','Montanha',7], ['Wasteland','Ácido',3], ['Volcano','Vulcão',2],
]
export const generatedTitle = 'Mapa procedural'
const clamp = (value,min,max,fallback) => Number.isFinite(value) ? Math.min(max,Math.max(min,Math.round(value))) : fallback
const water = name => name === 'Sea' || name === 'Reef'
const coastWater = name => water(name) || ['Shore','Archipelago','Rock Formation','High Bridge'].includes(name)
const cardinal = [[0,-1],[1,0],[0,1],[-1,0]]

// Até 9 equipes (uma por paleta de cor do jogo) e mapas de 16 a 100 casas em cada direção.
// Mapa pequeno com muitas equipes é permitido (modo caos); o tamanho sugerido evita bases coladas.
export const maxTeams = 9
export const minSide = 16, maxSide = 100
export const minimumSize = teams => teams > 6 ? 40 : teams > 4 ? 32 : 24
export function mapRecipe(input = {}) {
  const teams = clamp(input.teams,2,maxTeams,2)
  const side = clamp(input.size,minSide,maxSide,32)
  return {
    seed:clamp(input.seed,0,0xffffffff,0),
    width:clamp(input.width,minSide,maxSide,side),
    height:clamp(input.height,minSide,maxSide,side),
    teams,
    islands:input.islands === true,
    // Veios de minério extras por equipe (0 = só as jazidas básicas de cada base).
    veins:clamp(input.veins,0,3,0),
    // Modo de vitória de teste: 'padrao' (destruir), 'rei' (segurar a refinaria central) ou 'pontos'.
    victory:['rei','pontos'].includes(input.victory) ? input.victory : 'padrao',
    weights:Object.fromEntries(terrainWeights.map(([name,,weight])=>[name,clamp(input.weights?.[name],0,100,weight)])),
  }
}

function randomAt(seed,x,y,salt) {
  let hash = seed ^ Math.imul(x+1,374761393) ^ Math.imul(y+1,668265263) ^ Math.imul(salt+1,1442695041)
  hash = Math.imul(hash ^ hash >>> 13,1274126177)
  return ((hash ^ hash >>> 16) >>> 0) / 0x100000000
}

function noise(seed,x,y,scale,salt) {
  const i = Math.floor(x/scale), j = Math.floor(y/scale)
  const smooth = n => n*n*(3-2*n)
  const a = smooth(x/scale-i), b = smooth(y/scale-j)
  const interpolate = (u,v,t) => u+(v-u)*t
  return interpolate(interpolate(randomAt(seed,i,j,salt),randomAt(seed,i+1,j,salt),a),
    interpolate(randomAt(seed,i,j+1,salt),randomAt(seed,i+1,j+1,salt),a),b)
}

function distribute(cells,weighted,ground,rank) {
  const enabled = weighted.filter(([,weight])=>weight>0)
  const total = enabled.reduce((sum,[,weight])=>sum+weight,0)
  const sorted = [...cells].sort((a,b)=>rank[a]-rank[b])
  let offset = 0, cumulative = 0
  for (const [name,weight] of enabled) {
    cumulative += weight
    const end = Math.round(sorted.length*cumulative/total)
    for (;offset<end;offset++) ground[sorted[offset]] = name
  }
}

const maskAt = (x,y,groundAt) => cardinal.reduce((mask,[dx,dy],index) =>
  mask | (coastWater(groundAt(x+dx,y+dy)) ? 0 : 1<<index),0)
const mismatches = (a,b) => cardinal.reduce((count,_,index)=>count + ((a^b)>>index&1),0)

// Falésias como nos mapas do Flash: a casa de mar desenha a borda de pedra em cada quarto conforme a terra vizinha
// (os dois lados do quarto e a diagonal). Praia e outras casas de água contam como água.
const cliffPieces = [
  {dy:-1,dx:-1,both:'sea_1_v1',vertical:'sea_5_v1',horizontal:'sea_9_v1',diagonal:'sea_16_v1',open:'sea_0_nw'},
  {dy:-1,dx:1,both:'sea_2_v1',vertical:'sea_6_v1',horizontal:'sea_11_v1',diagonal:'sea_15_v1',open:'sea_0_ne'},
  {dy:1,dx:-1,both:'sea_3_v1',vertical:'sea_7_v1',horizontal:'sea_10_v1',diagonal:'sea_14_v1',open:'sea_0_sw'},
  {dy:1,dx:1,both:'sea_4_v1',vertical:'sea_8_v1',horizontal:'sea_12_v1',diagonal:'sea_13_v1',open:'sea_0_se'},
]
function cliffQuarters(x,y,groundAt) {
  const land = (dx,dy) => !coastWater(groundAt(x+dx,y+dy))
  return cliffPieces.map(({dx,dy,both,vertical,horizontal,diagonal,open}) => {
    const v = land(0,dy), h = land(dx,0)
    return v && h ? both : v ? vertical : h ? horizontal : land(dx,dy) ? diagonal : open
  })
}

const spriteCatalogs = new WeakMap()

function spriteCatalog(data) {
  if (spriteCatalogs.has(data)) return spriteCatalogs.get(data)
  const variants = new Map(), shores = new Map()
  for (const board of Object.values(data.maps)) {
    const at = (x,y) => x<0 || x>=board.width || y<0 || y>=board.height ? 'Sea' : board.tiles[y*board.width+x][0]
    for (const [cell,[name,art]] of board.tiles.entries()) {
      if (!variants.has(name)) variants.set(name,art)
      if (name !== 'Shore') continue
      const mask = maskAt(cell%board.width,Math.floor(cell/board.width),at)
      const key = JSON.stringify(art)
      const options = shores.get(mask) ?? new Map()
      options.set(key,(options.get(key) ?? 0)+1)
      shores.set(mask,options)
    }
  }
  const bestShore = [...shores].map(([mask,options])=>[mask,JSON.parse(
    [...options].sort((a,b)=>b[1]-a[1])[0][0])])
  const result = {variants,bestShore}
  spriteCatalogs.set(data,result)
  return result
}

export function generateMap(data,input) {
  const {seed,width,height,teams,weights,islands,veins,victory} = mapRecipe(input)
  // Em mapas grandes, as manchas de terreno crescem junto para não virar um mosaico miúdo.
  const scale = Math.max(1,Math.sqrt(width*height)/40)
  const cells = Array.from({length:width*height},(_,index)=>index)
  const ground = Array(cells.length).fill('Plains')
  const terrainRank = salt => cells.map(cell => {
    const x = cell%width, y = Math.floor(cell/width)
    return .65*noise(seed,x,y,7*scale,salt)+.25*noise(seed,x,y,3*scale,salt+1)+.10*randomAt(seed,x,y,salt+2)
  })
  const landWeights = Object.entries(weights).filter(([name])=>!water(name))
  const landTotal = landWeights.reduce((sum,[,weight])=>sum+weight,0)
  const wetTotal = weights.Sea+weights.Reef
  distribute(cells,[['Sea',wetTotal],['Plains',landTotal || Number(!wetTotal)]],ground,terrainRank(0))
  distribute(cells.filter(cell=>water(ground[cell])),[['Sea',weights.Sea],['Reef',weights.Reef]],ground,terrainRank(3))
  distribute(cells.filter(cell=>!water(ground[cell])),landTotal ? landWeights : [['Plains',1]],ground,terrainRank(6))

  const geometry = {width,height,tiles:ground}
  const cellAt = (x,y) => y*width+x
  const xOf = cell => cell%width, yOf = cell => Math.floor(cell/width)
  const distance = (a,b) => Math.abs(xOf(a)-xOf(b))+Math.abs(yOf(a)-yOf(b))
  const radiusTo = (a,b) => Math.hypot(xOf(a)-xOf(b),yOf(a)-yOf(b))
  const rank = salt => cell=>randomAt(seed,xOf(cell),yOf(cell),salt)
  const scramble = (list,salt) => [...list].sort((a,b)=>rank(salt)(a)-rank(salt)(b))
  const rotation = randomAt(seed,1,0,17)*2*Math.PI
  const middleX = (width-1)/2, middleY = (height-1)/2
  // Bases numa elipse que acompanha o formato do mapa; no modo caos (mapa pequeno) elas ficam bem próximas.
  const margin = side => Math.min(4,Math.floor((side-1)/2))
  const starts = []
  for (let team=0; team<teams; team++) {
    const angle = rotation+team*2*Math.PI/teams + (randomAt(seed,team,0,18)-.5)*.26
    const spread = .47 + randomAt(seed,team,0,19)*.12
    const coordinate = (n,mid,side) => Math.min(side-1-margin(side),Math.max(margin(side),Math.round(mid+n)))
    let cell = cellAt(coordinate(Math.cos(angle)*Math.max(1,width-10)*spread,middleX,width),
      coordinate(Math.sin(angle)*Math.max(1,height-10)*spread,middleY,height))
    // Duas bases na mesma casa (mapa minúsculo): usa a casa livre mais próxima.
    if (starts.includes(cell)) {
      const near = other => Math.hypot(other%width-cell%width,Math.floor(other/width)-Math.floor(cell/width))
      cell = cells.filter(other=>!starts.includes(other)).sort((a,b)=>near(a)-near(b))[0]
    }
    starts.push(cell)
  }
  const bridge = new Map(), protectedCells = new Set(), used = new Set()
  const state = {ore:{},structures:[],units:[]}
  const engineCost = new Map(Object.keys(data.rules.terrain).map(name=>[name,moveCost(data.rules,
    {width:1,tiles:[[name]]},state,data.rules.units.Warmachine,0,1)]))
  const passable = cell => Number.isFinite(engineCost.get(ground[cell]))
  const reachable = origin => {
    const open = new Set([origin])
    for (const cell of open) for (const next of neighbors(geometry,cell)) {
      if (passable(next)) open.add(next)
    }
    return open
  }

  if (islands) {
    const shapes = starts.map((cell,index)=>({
      cell, radius:Math.max(4.2,Math.min(width,height)/(teams+2)) + rank(23)(cell)*1.3,index,
    }))
    for (const cell of cells) {
      const x = xOf(cell), y = yOf(cell)
      const sorted = shapes.map(shape=>({...shape,d:radiusTo(cell,shape.cell)})).sort((a,b)=>a.d-b.d)
      const [home,other] = sorted
      const shoreRadius = home.radius + (noise(seed,x,y,3,25+home.index)-.5)*3
      if (other.d-home.d < 3.1 || home.d > shoreRadius) ground[cell] = weights.Reef && rank(29)(cell)<.14 ? 'Reef' : 'Sea'
      else if (water(ground[cell])) ground[cell] = landTotal ? landWeights.filter(([,weight])=>weight>0)[0][0] : 'Plains'
    }
  }

  // Keep each deployment usable even when the terrain weights favor impassable ground.
  const registeredGround = new Set()
  const deployments = starts.map((start,index)=>{
    const area = new Set([start])
    const boundary = new Set()
    let crowded = false
    const addNeighbors = cell => {
      for (const next of neighbors(geometry,cell)) {
        if (area.has(next) || registeredGround.has(next) || starts.includes(next)) continue
        if (!islands || crowded ||
            starts.every(other=>other === start || radiusTo(next,other)-radiusTo(next,start)>=2.5)) boundary.add(next)
      }
    }
    addNeighbors(start)
    const areaRank = rank(30+index)
    while (area.size < 17) {
      if (!boundary.size) {
        // Mapa apertado demais para ilhas separadas (modo caos): a área cresce mesmo encostando na vizinha.
        if (crowded || area.size >= 13) break
        crowded = true
        for (const cell of area) addNeighbors(cell)
        if (!boundary.size) break
      }
      const cell = [...boundary].sort((a,b)=>distance(a,start)+3*areaRank(a)-distance(b,start)-3*areaRank(b))[0]
      boundary.delete(cell)
      area.add(cell)
      addNeighbors(cell)
    }
    for (const cell of area) {
      if (!passable(cell)) ground[cell] = 'Plains'
      registeredGround.add(cell)
      protectedCells.add(cell)
    }
    return [...area]
  })

  // Refinaria central, a mesma distância de todas as bases e de acesso difícil.
  // Ilhas: uma ilhota isolada em cruz (duas praias e duas montanhas), só alcançável por mar ou ar.
  // Terra: um "lago de ácido com vulcões": vulcões em volta e quatro corredores de ácido até a refinaria.
  const center = cellAt(Math.round(middleX),Math.round(middleY))
  const centerCells = new Set()
  const shape = (dx,dy,name) => {
    const x = xOf(center)+dx, y = yOf(center)+dy
    if (x<0 || y<0 || x>=width || y>=height) return
    const cell = cellAt(x,y)
    if (protectedCells.has(cell) && cell !== center) return
    ground[cell] = name
    centerCells.add(cell)
  }
  if (islands) {
    for (const cell of cells) {
      if (radiusTo(cell,center) <= 3.2 && !protectedCells.has(cell)) ground[cell] = 'Sea'
    }
    const beachAxis = rank(130)(center) < .5
    shape(0,0,'Plains')
    for (const [dx,dy] of cardinal) shape(dx,dy,(dx !== 0) === beachAxis ? 'Shore' : 'Mountain')
  } else {
    // Margem irregular do lago de ácido (passável, mas causa dano a quem termina o turno nela).
    for (let dy=-3; dy<=3; dy++) for (let dx=-3; dx<=3; dx++) {
      if (Math.max(Math.abs(dx),Math.abs(dy)) === 3 && Math.hypot(dx,dy) < 3.9 &&
          randomAt(seed,dx+3,dy+3,135) < .7) shape(dx,dy,'Wasteland')
    }
    for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
      if (!dx && !dy) continue
      const axis = !dx || !dy, ring = Math.max(Math.abs(dx),Math.abs(dy))
      shape(dx,dy,axis || ring === 2 && Math.abs(dx) === Math.abs(dy) ? 'Wasteland' : 'Volcano')
    }
    shape(0,0,'Plains')
  }
  for (const cell of centerCells) protectedCells.add(cell)
  used.add(center)

  if (!islands) {
    // Liga as bases entre si e a primeira base à refinaria central, abrindo passagem se preciso.
    const links = [...starts.map((start,index)=>[start,starts[(index+1)%starts.length]]),[starts[0],center]]
    for (const [index,[start,target]] of links.entries()) {
      if (reachable(start).has(target)) continue
      const costs = new Map([[start,0]]), parents = new Map()
      const queue = [start]
      const routeRank = rank(44+index)
      for (let i=0;i<queue.length;i++) {
        const cell = queue[i]
        for (const next of neighbors(geometry,cell)) {
          const cost = costs.get(cell) + (passable(next) ? 1 : water(ground[next]) ? 6 : 3) + 2*routeRank(next)
          if (cost >= (costs.get(next) ?? Infinity)) continue
          costs.set(next,cost)
          parents.set(next,cell)
          queue.push(next)
        }
      }
      const path = [target]
      while (path.at(-1) !== start) path.push(parents.get(path.at(-1)))
      for (let i=1;i<path.length-1;i++) {
        const cell = path[i]
        if (!passable(cell)) {
          const straight = path[i-1]+path[i+1] === 2*cell
          if (straight && water(ground[cell])) {
            ground[cell] = 'High Bridge'
            bridge.set(cell,xOf(path[i-1]) === xOf(cell))
          } else ground[cell] = 'Plains'
        }
        protectedCells.add(cell)
      }
    }
  }

  const units = [], structures = []
  const roster = ['Warmachine','Warmachine','Warmachine','Strike Commando','Heavy Commando',
    'Lancer Tank','Spider Tank','Scorpion Tank','Flak Tank','Mortar Truck','Jammer Truck','Turret']
  const coastal = cell => neighbors(geometry,cell).some(next=>water(ground[next]))
  function islandHarbor(deployment,index) {
    const queue = scramble(deployment,61+index)
    const parent = new Map(queue.map(cell=>[cell,null]))
    // Prefere costa reta (água de um lado só), onde a peça de praia encaixa; senão, a primeira costa alcançada.
    const straight = cell => cardinal.filter(([dx,dy])=>{
      const x = xOf(cell)+dx, y = yOf(cell)+dy
      return x<0 || y<0 || x>=width || y>=height || water(ground[cellAt(x,y)])
    }).length === 1
    const harbor = cell => {
      for (let next=cell;next!==null;next=parent.get(next)) {
        if (!passable(next)) ground[next] = 'Plains'
        protectedCells.add(next)
      }
      ground[cell] = 'Shore'
      // Uma casa de praia sozinha numa costa reta não tem peça; o porto vira uma praia de três casas.
      const [wx,wy] = cardinal.find(([dx,dy])=>{
        const x = xOf(cell)+dx, y = yOf(cell)+dy
        return x<0 || y<0 || x>=width || y>=height || water(ground[cellAt(x,y)])
      }) ?? [0,0]
      for (const [dx,dy] of [[wy,wx],[-wy,-wx]]) {
        const x = xOf(cell)+dx, y = yOf(cell)+dy
        if (x<0 || y<0 || x>=width || y>=height || !passable(cellAt(x,y))) continue
        const sx = x+wx, sy = y+wy
        if (sx<0 || sy<0 || sx>=width || sy>=height || water(ground[cellAt(sx,sy)])) {
          ground[cellAt(x,y)] = 'Shore'
          protectedCells.add(cellAt(x,y))
        }
      }
      return cell
    }
    const depth = cell => { let n = 0; for (let next=cell;parent.get(next)!==null;next=parent.get(next)) n++; return n }
    let fallback
    for (const cell of queue) {
      if (fallback !== undefined && depth(cell) > depth(fallback)+3) break
      if (coastal(cell) && straight(cell)) return harbor(cell)
      if (coastal(cell)) fallback ??= cell
      for (const next of neighbors(geometry,cell)) {
        if (parent.has(next) || water(ground[next])) continue
        parent.set(next,cell)
        queue.push(next)
      }
    }
    return fallback === undefined ? undefined : harbor(fallback)
  }
  for (const [index,start] of starts.entries()) {
    const side = index+1
    const harbor = islands ? islandHarbor(deployments[index],index) : undefined
    const deployment = scramble(deployments[index],51+index).filter(cell=>cell !== harbor)
    const positions = deployment.filter(cell=>!coastal(cell))
    positions.push(...deployment.filter(cell=>coastal(cell)))
    // No modo caos pode faltar espaço: as primeiras unidades da lista (Warmachines) têm prioridade.
    for (const [slot,name] of roster.entries()) {
      const cell = positions[slot]
      if (cell === undefined) break
      units.push({cell,side,name})
      used.add(cell)
    }
    const access = [...reachable(start)].filter(cell=>!registeredGround.has(cell) || deployment.includes(cell))
    if (harbor !== undefined) {
      const sea = neighbors(geometry,harbor).find(cell=>water(ground[cell]) && !used.has(cell))
      if (sea !== undefined) {
        units.push({cell:sea,side,name:'Corvette Fighter'})
        used.add(sea)
      }
    }
    const economy = scramble(access.filter(cell=>!used.has(cell) && !coastal(cell) &&
      distance(start,cell)>=2 && distance(start,cell)<=7 && ground[cell]!=='High Bridge'),69+index)
    const sites = [...economy,...deployment.filter(cell=>!used.has(cell) && !economy.includes(cell))]
    for (const name of ['Enriched Ore Deposit','Ore Deposit']) {
      const cell = sites.find(other=>!used.has(other))
      if (cell === undefined) break
      used.add(cell)
      protectedCells.add(cell)
      ground[cell] = name
    }
    // Refinaria da equipe: mais afastada da base (do lado dela do mapa) e cercada de terreno acidentado.
    const rough = new Set(['Mountain','Hill','Forest','Volcano','Wasteland'])
    const roughness = cell => {
      let count = 0
      for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
        const x = xOf(cell)+dx, y = yOf(cell)+dy
        if ((dx || dy) && x>=0 && y>=0 && x<width && y<height && rough.has(ground[cellAt(x,y)])) count++
      }
      return count
    }
    const ownSide = cell => starts.every(other=>other === start || distance(other,cell) >= distance(start,cell)+4)
    const refinerySites = access.filter(cell=>!used.has(cell) && !centerCells.has(cell) && !bridge.has(cell) &&
      ground[cell] !== 'Shore' && distance(start,cell)>=4 && distance(start,cell)<=9 && ownSide(cell))
    const score = cell => 3*roughness(cell) + Math.min(distance(start,cell),8) + rank(140+index)(cell)
    const refinery = refinerySites.sort((a,b)=>score(b)-score(a))[0] ?? sites.find(cell=>!used.has(cell)) ??
      access.find(cell=>!used.has(cell) && !centerCells.has(cell) && ground[cell] !== 'Shore') ??
      // Modo caos (mapa minúsculo): qualquer casa livre, mais perto desta base.
      cells.filter(cell=>!used.has(cell) && !centerCells.has(cell) && passable(cell) && ground[cell] !== 'Shore')
        .sort((a,b)=>distance(a,start)-distance(b,start))[0]
    if (refinery === undefined) continue
    used.add(refinery)
    protectedCells.add(refinery)
    structures.push({cell:refinery,name:'Oil Refinery',side:0})
  }
  structures.push({cell:center,name:'Oil Refinery',side:0})

  // Jazidas disputadas: no meio do caminho, à mesma distância de todas as bases (sem refinarias extras).
  const access = [...new Set(starts.flatMap(start=>[...reachable(start)]))]
  const imbalance = cell => {
    const distances = starts.map(start=>distance(start,cell))
    return Math.max(...distances)-Math.min(...distances)
  }
  const empty = scramble(access.filter(cell=>!used.has(cell) && !coastal(cell) && !bridge.has(cell) &&
    !centerCells.has(cell) && passable(cell) && starts.every(start=>distance(start,cell)>5)),78)
    .sort((a,b)=>imbalance(a)-imbalance(b))
  const contested = []
  for (const cell of empty) {
    if (contested.length >= teams) break
    if (contested.some(other=>distance(other,cell) < 4)) continue
    contested.push(cell)
  }
  for (const cell of contested) {
    used.add(cell)
    protectedCells.add(cell)
    ground[cell] = 'Ore Deposit'
  }
  // Veios: fileiras curtas de jazidas, a mesma quantidade para cada equipe e à mesma faixa de distância da base.
  const directions = [[1,0],[0,1],[1,1],[1,-1]]
  for (const [index,start] of starts.entries()) {
    const home = reachable(start)
    const free = cell => home.has(cell) && !used.has(cell) && !protectedCells.has(cell) && !coastal(cell) &&
      !bridge.has(cell) && passable(cell)
    const seeds = scramble([...home].filter(cell=>free(cell) &&
      distance(start,cell)>=5 && distance(start,cell)<=Math.max(8,Math.min(width,height)/3) &&
      starts.every(other=>other === start || distance(other,cell)>distance(start,cell)+2)),90+index)
    let placed = 0
    for (const origin of seeds) {
      if (placed >= veins) break
      if (neighbors(geometry,origin).some(cell=>/Ore Deposit/.test(ground[cell]))) continue
      const [dx,dy] = directions[Math.floor(rank(95+index)(origin)*directions.length)]
      const length = 3 + Math.floor(rank(97+index)(origin)*3)
      const vein = []
      for (let step=0; step<length; step++) {
        const x = xOf(origin)+dx*step, y = yOf(origin)+dy*step
        if (x<0 || y<0 || x>=width || y>=height || !free(cellAt(x,y))) break
        vein.push(cellAt(x,y))
      }
      if (vein.length < 3) continue
      for (const [step,cell] of vein.entries()) {
        ground[cell] = step === Math.floor(vein.length/2) ? 'Enriched Ore Deposit' : 'Ore Deposit'
        used.add(cell)
        protectedCells.add(cell)
      }
      placed++
    }
  }

  const at = (x,y) => x<0 || x>=width || y<0 || y>=height ? 'Sea' : ground[cellAt(x,y)]
  // O recife não tem arte de falésia; encostado na terra ele vira mar aberto, como nos mapas da campanha.
  for (const cell of cells) {
    if (ground[cell] === 'Reef' && neighbors(geometry,cell).some(next=>!coastWater(ground[next]))) ground[cell] = 'Sea'
  }
  // Nem toda costa é praia: trechos longos de planície viram praia (dá para embarcar e construir navios);
  // o resto, inclusive floresta, colina e montanha, fica como falésia de pedra.
  for (const cell of cells) {
    if (!passable(cell) || protectedCells.has(cell) || !coastal(cell)) continue
    const beachy = .7*noise(seed,xOf(cell),yOf(cell),4,120)+.3*randomAt(seed,xOf(cell),yOf(cell),121)
    if (['Plains','Desert','Wasteland'].includes(ground[cell]) && beachy > .34) ground[cell] = 'Shore'
  }
  // A praia só fica bem em trechos retos (terra de um lado só). Cantos, escadas na diagonal e praias cercadas de
  // água deixariam cortes retos; elas voltam a ser terra, e o mar em volta ganha a falésia, que tem peça para
  // qualquer combinação. Repete porque cada troca muda os vizinhos.
  // A casa de praia é água com areia virada para a terra vizinha (outra praia conta como água).
  // Terra de um lado só: sempre serve. Terra em dois lados vizinhos (canto): só quando a praia continua por
  // um dos lados de água; isolado, como degraus de escada na diagonal, deixaria cortes retos.
  const isShore = (x,y) => x>=0 && y>=0 && x<width && y<height && ground[cellAt(x,y)] === 'Shore'
  const shoreAllowed = cell => {
    const mask = maskAt(xOf(cell),yOf(cell),at)
    if ([1,2,4,8].includes(mask)) return true
    if (![3,6,12,9].includes(mask)) return false
    return cardinal.some(([dx,dy],index)=>!(mask>>index&1) && isShore(xOf(cell)+dx,yOf(cell)+dy))
  }
  for (let changed = true; changed;) {
    changed = false
    for (const cell of cells) {
      if (ground[cell] !== 'Shore' || protectedCells.has(cell) || shoreAllowed(cell)) continue
      ground[cell] = 'Plains'
      changed = true
    }
  }
  const {variants,bestShore} = spriteCatalog(data)
  const shoreByMask = Array.from({length:16},(_,mask)=>bestShore.reduce((best,entry)=>
    mismatches(mask,entry[0]) < mismatches(mask,best[0]) ? entry : best)[1])
  const tiles = ground.map((name,cell)=>{
    let art = variants.get(name)
    if (name === 'Shore') art = shoreByMask[maskAt(cell%width,Math.floor(cell/width),at)]
    if (name === 'High Bridge') art = ['single',[bridge.get(cell) ? 'high_bridge_5_v1' : 'high_bridge_4_v1']]
    if (name === 'Sea') art = ['join',cliffQuarters(cell%width,Math.floor(cell/width),at)]
    return [name,art]
  })
  // As peças de praia do jogo têm pedras nas pontas (praia de uma casa só). Numa costa longa, os quartos que
  // encostam em outra praia trocam para peças sem pedra, formando uma faixa contínua de areia.
  const original = tiles.map(([,art])=>art)
  const beach = quarter => typeof quarter === 'string' && quarter.startsWith('shore_')
  const quarters = (x,y) => x<0 || y<0 || x>=width || y>=height || ground[cellAt(x,y)] !== 'Shore' ||
    original[cellAt(x,y)][0] !== 'join' ? null : original[cellAt(x,y)][1]
  for (const [cell,[name,art]] of tiles.entries()) {
    if (name !== 'Shore' || art[0] !== 'join') continue
    const x = xOf(cell), y = yOf(cell), q = [...art[1]]
    const left = quarters(x-1,y), right = quarters(x+1,y), up = quarters(x,y-1), down = quarters(x,y+1)
    if (q[0] === 'shore_8_v1' && beach(left?.[1])) q[0] = 'shore_13_v1'
    if (q[1] === 'shore_7_v1' && beach(right?.[0])) q[1] = 'shore_13_v1'
    if (q[2] === 'shore_2_v1' && beach(left?.[3])) q[2] = 'shore_14_v1'
    if (q[3] === 'shore_1_v1' && beach(right?.[2])) q[3] = 'shore_14_v1'
    if (q[0] === 'shore_4_v1' && beach(up?.[2])) q[0] = 'shore_15_v1'
    if (q[2] === 'shore_3_v1' && beach(down?.[0])) q[2] = 'shore_15_v1'
    if (q[1] === 'shore_6_v1' && beach(up?.[3])) q[1] = 'shore_16_v1'
    if (q[3] === 'shore_5_v1' && beach(down?.[1])) q[3] = 'shore_16_v1'
    tiles[cell] = [name,['join',q]]
  }
  return { title:generatedTitle,center,
    victory:victory === 'rei' ? {mode:'rei',cell:center,rounds:5} : victory === 'pontos' ? {mode:'pontos',limit:20} : undefined,
    width,height,slots:teams,islands,tiles,units,structures }
}
