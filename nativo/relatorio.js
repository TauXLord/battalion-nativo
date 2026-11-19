// Relatório de fim de partida: gráficos por rodada (tropas e valor do exército) e tabela de abates/perdas.
// Feito a partir do replay (analise.js). Tudo desenhado com SVG e texto puro (textContent).
import { analyzeReplay } from './analise.js'

const svgNS = 'http://www.w3.org/2000/svg'
const el = (name,attributes = {}) => {
  const node = document.createElementNS(svgNS,name)
  for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value)
  return node
}
const color = argb => '#' + String(argb).slice(2)

// Gráfico de linhas simples: uma linha por equipe, eixo X = rodada.
function lineChart(title,samples,pick,colors,names,t) {
  const width = 520, height = 200, left = 46, right = 12, top = 26, bottom = 28
  const svg = el('svg',{viewBox:`0 0 ${width} ${height}`,class:'report-chart',role:'img','aria-label':title})
  const label = el('text',{x:left,y:16,class:'report-chart-title'})
  label.textContent = title
  svg.append(label)
  const max = Math.max(1,...samples.flatMap(item=>item.teams.map(pick)))
  const x = index => left + (samples.length < 2 ? 0 : index/(samples.length-1)) * (width-left-right)
  const y = value => top + (1 - value/max) * (height-top-bottom)
  for (const fraction of [0,.5,1]) {
    const value = Math.round(max*fraction)
    svg.append(el('line',{x1:left,x2:width-right,y1:y(value),y2:y(value),class:'report-grid'}))
    const tick = el('text',{x:left-6,y:y(value)+4,class:'report-axis','text-anchor':'end'})
    tick.textContent = value >= 10000 ? Math.round(value/1000) + 'k' : String(value)
    svg.append(tick)
  }
  const first = el('text',{x:left,y:height-8,class:'report-axis'})
  first.textContent = t('Rodada {n}',{n:samples[0].round})
  const lastLabel = el('text',{x:width-right,y:height-8,class:'report-axis','text-anchor':'end'})
  lastLabel.textContent = t('Rodada {n}',{n:samples.at(-1).round})
  svg.append(first,lastLabel)
  colors.forEach((teamColor,team) => {
    const points = samples.map((item,index)=>`${x(index).toFixed(1)},${y(pick(item.teams[team])).toFixed(1)}`).join(' ')
    // Halo claro por baixo: cores escuras (cinza, roxo) continuam visíveis no fundo escuro.
    svg.append(el('polyline',{points,fill:'none',stroke:'#e9efe4','stroke-opacity':.45,'stroke-width':5,'stroke-linejoin':'round'}))
    const line = el('polyline',{points,fill:'none',stroke:color(teamColor),'stroke-width':2.5,'stroke-linejoin':'round'})
    const name = el('title')
    name.textContent = names[team]
    line.append(name)
    svg.append(line)
  })
  return svg
}

export function showReport({data,replay,t,onReplay}) {
  const dialog = document.getElementById('match-report')
  const body = dialog.querySelector('.report-body')
  const analysis = analyzeReplay(data.rules,replay)
  const colors = replay.initial.colors
  const names = colors.map((_,index)=>t(replay.teams?.[index]?.name) || t('Equipe {n}',{n:index+1}))
  const summary = document.createElement('p')
  const clock = Number.isFinite(replay.elapsed) ? new Date(replay.elapsed).toISOString().slice(11,19) : null
  summary.textContent = [analysis.winner ? t('Vencedor: {name}',{name:names[analysis.winner-1]}) : t('Partida sem vencedor'),
    t('{n} rodadas',{n:analysis.rounds}),clock && t('Duração {time}',{time:clock}),
    t('{n} jogadas',{n:analysis.total})].filter(Boolean).join(' · ')
  const legend = document.createElement('div')
  legend.className = 'report-legend'
  legend.append(...names.map((name,index)=>{
    const item = document.createElement('span')
    const swatch = document.createElement('i')
    swatch.style.background = color(colors[index])
    item.append(swatch,name)
    return item
  }))
  const table = document.createElement('table')
  table.className = 'report-table'
  const head = table.createTHead().insertRow()
  for (const title of ['Equipe','Abates','Perdas','Construídas','Tropas no fim']) {
    head.append(Object.assign(document.createElement('th'),{textContent:t(title)}))
  }
  const final = analysis.samples.at(-1)
  names.forEach((name,index)=>{
    const row = table.insertRow()
    for (const value of [name,analysis.kills[index],analysis.losses[index],analysis.built[index],final.teams[index].units]) {
      row.insertCell().textContent = String(value)
    }
  })
  const parts = [summary,legend,
    lineChart(t('Tropas por rodada'),analysis.samples,team=>team.units,colors,names,t),
    lineChart(t('Valor do exército por rodada'),analysis.samples,team=>team.value,colors,names,t),
    lineChart(t('Dinheiro por rodada'),analysis.samples,team=>team.credits,colors,names,t),
    table]
  if (analysis.error) parts.push(Object.assign(document.createElement('p'),{className:'muted',
    textContent:t('O replay parou numa jogada que não bate com esta versão: {error}',{error:analysis.error})}))
  body.replaceChildren(...parts)
  const watch = dialog.querySelector('[data-report-replay]')
  watch.hidden = !onReplay
  watch.onclick = () => { dialog.close(); onReplay?.() }
  dialog.showModal()
}
