// Publica uma versão nova do Battalion Nativo no GitHub (repositório privado TauXLord/battalion-nativo):
//   1. confere que tudo está no git e enviado;
//   2. gera Battalion-Nativo.exe, os pacotes de Linux e macOS e o APK de Android;
//   3. cria a Release vX.Y.Z com esses arquivos e as notas;
//   4. se existir o repositório público de versão, atualiza o versao.json dele (o jogo usa para avisar da atualização).
// Uso: node tools/publicar-versao.mjs --notas notas.md
// Antes: aumente "versao" e "data" em nativo/versao.json e faça o commit.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)),'..')
const repo = 'TauXLord/battalion-nativo', versionRepo = 'TauXLord/battalion-nativo-versao'
const windows = process.platform === 'win32'
const gh = windows && fs.existsSync('C:/Program Files/GitHub CLI/gh.exe') ? 'C:/Program Files/GitHub CLI/gh.exe' : 'gh'
const git = windows && fs.existsSync('C:/Program Files/Git/cmd/git.exe') ? 'C:/Program Files/Git/cmd/git.exe' : 'git'
const args = process.argv.slice(2)
const notes = args.includes('--notas') ? resolve(args[args.indexOf('--notas')+1]) : null
if (!notes || !fs.existsSync(notes)) throw Error('Passe o arquivo de notas: --notas notas.md')

const run = (command,list,options = {}) => {
  const result = spawnSync(command,list,{cwd:root,encoding:'utf8',stdio:options.capture ? 'pipe' : 'inherit',...options})
  if (result.status !== 0 && !options.allowFailure) throw Error(`falhou: ${command} ${list.join(' ')}\n${result.stderr ?? ''}`)
  return result
}

const edition = JSON.parse(fs.readFileSync(join(root,'nativo/versao.json'),'utf8'))
const tag = 'v' + edition.versao
if (run(git,['status','--porcelain'],{capture:true}).stdout.trim()) throw Error('Há mudanças sem commit. Faça o commit antes de publicar.')
run(git,['push','-q'])
if (run(gh,['release','view',tag,'--repo',repo],{capture:true,allowFailure:true}).status === 0) throw Error(`A versão ${tag} já foi publicada.`)

run('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File','tools/empacotar-nativo.ps1'])
run(windows ? 'python' : 'python3',['tools/empacotar-unix.py'])
run(process.execPath,['tools/empacotar-android.mjs'])
const files = ['Battalion-Nativo.exe','Battalion-Nativo-Linux-x64.tar.gz','Battalion-Nativo-macOS.tar.gz','Battalion-Nativo-Android.apk']
run(gh,['release','create',tag,...files,'--repo',repo,'--title',`Battalion Nativo ${edition.versao}`,'--notes-file',notes])
const link = `https://github.com/${repo}/releases/tag/${tag}`

// Arquivo público de versão (só número, data e link; nada do jogo).
if (run(gh,['repo','view',versionRepo],{capture:true,allowFailure:true}).status === 0) {
  const published = {versao:edition.versao,data:edition.data,link}
  const current = run(gh,['api',`repos/${versionRepo}/contents/versao.json`],{capture:true,allowFailure:true})
  const sha = current.status === 0 ? JSON.parse(current.stdout).sha : undefined
  const body = {message:`Versão ${edition.versao}`,content:Buffer.from(JSON.stringify(published,null,1)+'\n').toString('base64'),...(sha ? {sha} : {})}
  run(gh,['api','-X','PUT',`repos/${versionRepo}/contents/versao.json`,'--input','-'],{input:JSON.stringify(body),capture:true})
  console.log('Aviso de atualização publicado:',edition.versao)
}
console.log('Publicado:',link)
