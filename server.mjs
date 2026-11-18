import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const host = '127.0.0.1'
const port = Number(process.env.BATTALION_PORT || 8765)
const address = `http://${host}:${port}`
const launchAddress = process.argv.includes('--ghosts') ? `${address}/?game=ghosts` : address
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.swf': 'application/x-shockwave-flash',
  '.css': 'text/css; charset=utf-8',
  '.yimf': 'application/xml; charset=utf-8',
}
const runtime = await readdir(join(root, 'runtime'))
const routes = new Map([
  ['/', 'index.html'],
  ['/editor.js', 'editor.js'],
  ['/cenarios.js', 'cenarios.js'],
  ['/lan.js', 'lan.js'],
  ['/camera.js', 'camera.js'],
  ['/swf-map.js', 'swf-map.js'],
  ['/mapas/ghosts.xml', 'mods-ghosts/dados/campaign.xml'],
  ['/launcher.css', 'launcher.css'],
  ['/mapas/ghosts.yimf', 'mods-ghosts/campanha/Mission_1.yimf'],
  ['/mapas/vengeance.yimf', 'mods/campanha/Mission_1.yimf'],
  ['/mapas/vengeance.xml', 'mods/dados/campaign.xml'],
  ['/original/battalion-vengeance.swf', 'original/battalion-vengeance.swf'],
  ['/jogo/battalion-vengeance.swf', 'jogo/battalion-vengeance.swf'],
  ['/original/battalion-ghosts.swf', 'original/battalion-ghosts.swf'],
  ['/jogo/battalion-ghosts.swf', 'jogo/battalion-ghosts.swf'],
  ['/runtime/API_AS3_Local.swf', 'runtime/API_AS3_Local.swf'],
  ...runtime.filter(name => /\.(js|wasm)$/.test(name))
    .map(name => [`/runtime/${name}`, `runtime/${name}`]),
])
for (const name of await readdir(join(root, 'cenarios'))) {
  if (/^[a-z]+\.yimf$/.test(name)) routes.set('/cenarios/' + name, 'cenarios/' + name)
}

const server = createServer(async (request, response) => {
  const relative = routes.get(request.url?.split('?')[0])
  if (!relative || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end()
    return
  }
  const path = join(root, relative)
  const file = await stat(path).catch(() => null)
  if (!file?.isFile()) {
    response.writeHead(404).end()
    return
  }
  const extension = relative.slice(relative.lastIndexOf('.'))
  response.writeHead(200, {
    'Content-Type': mime[extension],
    'Content-Length': file.size,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'",
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  const stream = createReadStream(path)
  stream.on('error', () => response.destroy())
  response.on('close', () => stream.destroy())
  stream.pipe(response)
})

server.on('error', async error => {
  const running = error.code === 'EADDRINUSE' &&
    await fetch(address).then(response => response.headers.get('X-Battalion-Local') === '1').catch(() => false)
  if (running && process.argv.includes('--open')) {
    openGame()
    return
  }
  console.error(error.message)
  process.exitCode = 1
})

server.prependListener('request', (_request, response) => {
  response.setHeader('X-Battalion-Local', '1')
})

server.listen(port, host, () => {
  console.log(`Battalion — ${launchAddress}`)
  if (process.argv.includes('--open')) openGame()
})

function openGame() {
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', launchAddress], {
    detached: true, stdio: 'ignore', windowsHide: true,
  })
  browser.on('error', () => console.log(`Abra ${launchAddress} no navegador.`))
  browser.unref()
}
