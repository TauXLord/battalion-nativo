import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { extname } from 'node:path'

const address = 'http://127.0.0.1:8768'
const dist = new URL('./dist/', import.meta.url)
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }
const server = createServer(async (request, response) => {
  const route = request.url?.split('?')[0]
  if (route !== '/' && !/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(route ?? '')) {
    response.writeHead(404).end()
    return
  }
  const path = fileURLToPath(new URL(route === '/' ? 'index.html' : route.slice(1), dist))
  const file = await readFile(path).catch(() => null)
  if (!file) return response.writeHead(404).end()
  response.writeHead(200, { 'Content-Type': types[extname(path)], 'X-Battalion-Moderno': '1', 'Cache-Control': 'no-cache' })
  response.end(request.method === 'HEAD' ? undefined : file)
})

function open() {
  if (!process.argv.includes('--open')) return
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', address], {
    detached: true, stdio: 'ignore', windowsHide: true,
  })
  browser.on('error', () => console.log(`Abra ${address}`))
  browser.unref()
}

server.on('error', async error => {
  if (error.code === 'EADDRINUSE' &&
      await fetch(address).then(r => r.headers.get('X-Battalion-Moderno') === '1').catch(() => false)) {
    open()
    return
  }
  console.error(error.message)
  process.exitCode = 1
})
server.listen(8768, '127.0.0.1', () => {
  console.log(`Battalion moderno — ${address}`)
  open()
})
