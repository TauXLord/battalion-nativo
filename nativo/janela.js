// Abre o jogo numa janela de aplicativo (sem barra de endereço) usando o navegador padrão do Windows.
// Chrome, Edge e Brave têm o modo --app e usam o mesmo perfil de sempre, então o progresso salvo continua lá.
// Outros navegadores (ex.: Firefox) abrem do jeito normal.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const env = process.env
const candidates = {
  chrome:[[env.ProgramFiles,'Google/Chrome/Application/chrome.exe'],[env['ProgramFiles(x86)'],'Google/Chrome/Application/chrome.exe'],
    [env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe']],
  edge:[[env['ProgramFiles(x86)'],'Microsoft/Edge/Application/msedge.exe'],[env.ProgramFiles,'Microsoft/Edge/Application/msedge.exe']],
  brave:[[env.ProgramFiles,'BraveSoftware/Brave-Browser/Application/brave.exe'],
    [env.LOCALAPPDATA,'BraveSoftware/Brave-Browser/Application/brave.exe']],
}

function defaultBrowser() {
  try {
    const result = spawnSync('reg',['query','HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
      '/v','ProgId'],{encoding:'utf8',windowsHide:true,timeout:3000})
    const id = result.stdout?.match(/ProgId\s+REG_SZ\s+(\S+)/)?.[1] ?? ''
    if (/^ChromeHTML/i.test(id)) return 'chrome'
    if (/^MSEdge/i.test(id)) return 'edge'
    if (/^BraveHTML/i.test(id)) return 'brave'
  } catch {}
  return null
}

function executable(kind) {
  for (const [base,path] of candidates[kind] ?? []) {
    if (base && existsSync(join(base,path))) return join(base,path)
  }
  return null
}

export function openAppWindow(url) {
  if (process.platform !== 'win32') return false
  const kind = defaultBrowser()
  const browser = kind && executable(kind)
  const child = browser ?
    spawn(browser,['--app=' + url,'--window-size=1280,860'],{detached:true,stdio:'ignore',windowsHide:false}) :
    spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore',windowsHide:true})
  child.on('error',()=>console.log('Abra ' + url + ' no navegador.'))
  child.unref()
  return Boolean(browser)
}
