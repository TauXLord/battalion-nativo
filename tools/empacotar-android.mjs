// Gera Battalion-Nativo-Android.apk sem Android Studio nem Gradle:
//   1. sobe o servidor do jogo numa porta temporária e copia de lá todos os arquivos que a página usa (assets/www);
//   2. aapt2 (recursos + manifesto), javac + d8 (MainActivity), aapt (adiciona o classes.dex), zipalign e apksigner.
// Precisa do JDK (javac, keytool) e de um Android SDK mínimo com build-tools e platforms/android-35:
//   node tools/empacotar-android.mjs [--sdk %LOCALAPPDATA%/BattalionAndroidSdk]
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)),'..')
const args = process.argv.slice(2)
const option = name => { const at = args.indexOf(name); return at >= 0 ? args[at+1] : undefined }
const sdk = option('--sdk') ?? join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '.','.local'),'BattalionAndroidSdk')
const windows = process.platform === 'win32'
const first = folder => { const entries = fs.existsSync(folder) ? fs.readdirSync(folder).sort() : []; return entries.length ? join(folder,entries.at(-1)) : null }
const buildTools = first(join(sdk,'build-tools'))
const platform = first(join(sdk,'platforms'))
if (!buildTools || !platform) throw Error('Android SDK mínimo não encontrado em ' + sdk + ' (precisa de build-tools e platforms/android-35).')
const tool = name => join(buildTools,name + (windows ? (['d8','apksigner'].includes(name) ? '.bat' : '.exe') : ''))
const androidJar = join(platform,'android.jar')

// Ferramentas do JDK (javac, keytool): pela pasta do Java em uso (java.home), que nem sempre está no PATH.
function jdkTool(name) {
  const homes = [process.env.JAVA_HOME]
  const settings = spawnSync('java',['-XshowSettings:properties','-version'],{encoding:'utf8'})
  const home = (settings.stderr + settings.stdout).match(/java.home = (.+)/)?.[1]?.trim()
  if (home) homes.push(home)
  for (const base of homes.filter(Boolean)) {
    const file = join(base,'bin',name + (windows ? '.exe' : ''))
    if (fs.existsSync(file)) return file
  }
  return name
}

function run(command,list,options = {}) {
  const result = spawnSync(command,list,{stdio:'inherit',shell:windows && /\.bat$/i.test(command),...options})
  if (result.status !== 0) throw Error(`falhou: ${command} ${list.join(' ')}`)
}

// Versão do APK a partir de nativo/versao.json (1.2.3 → versionCode 10203).
const edition = JSON.parse(fs.readFileSync(join(root,'nativo/versao.json'),'utf8'))
const [major,minor,patch] = edition.versao.split('.').map(part=>Number.parseInt(part,10) || 0)
const versionCode = major*10000 + minor*100 + patch

const work = fs.mkdtempSync(join(tmpdir(),'battalion-android-'))
const www = join(work,'assets','www')
try {
  // 1. Arquivos do jogo, servidos pelo próprio servidor (só o que a página realmente usa).
  const port = 8790 + Math.floor(Math.random()*8)
  const server = spawn(process.execPath,['nativo/servidor.js'],{cwd:root,stdio:'ignore',
    env:{...process.env,BATTALION_NATIVE_PORT:String(port),BATTALION_VAULT_DIR:join(work,'cofre'),BATTALION_SAVES_DIR:join(work,'salvas')}})
  const origin = `http://127.0.0.1:${port}`
  try {
    for (let i=0; ; i++) {
      try { if ((await fetch(origin + '/launcher-status')).ok) break } catch {}
      if (i > 60) throw Error('o servidor do jogo não subiu')
      await new Promise(done=>setTimeout(done,100))
    }
    const data = JSON.parse(fs.readFileSync(join(root,'nativo/dados.json'),'utf8'))
    const ghosts = JSON.parse(fs.readFileSync(join(root,'nativo/dados-ghosts.json'),'utf8'))
    const pending = ['/index.html','/inicio.js','/pagina.js','/ia-worker.js','/editor.js','/nativo.css','/launcher.css',
      '/dados.json','/dados-ghosts.json','/local-maps.json','/ia-treinada.json','/versao.json','/traducao-en.json','/traducao-pt.json',
      ...['campanha','bootcamp','bonus'].flatMap(name=>[`/${name}.json`,`/${name}-ghosts.json`]),
      ...[...Object.values(data.assets),...Object.values(ghosts.assets)].map(file=>'/recursos/' + file)]
    const seen = new Set()
    let bytes = 0
    while (pending.length) {
      const path = pending.pop()
      if (seen.has(path)) continue
      seen.add(path)
      const response = await fetch(origin + path)
      if (!response.ok) {
        if (path === '/ia-treinada.json') continue
        throw Error(`arquivo do jogo indisponível: ${path} (${response.status})`)
      }
      const content = Buffer.from(await response.arrayBuffer())
      bytes += content.length
      const target = join(www,path)
      fs.mkdirSync(dirname(target),{recursive:true})
      fs.writeFileSync(target,content)
      if (/\.(js|css|html)$/.test(path)) {
        const text = content.toString('utf8')
        for (const [,name] of text.matchAll(/(?:from|import)\s*\(?\s*'\.\/([\w-]+\.js)'/g)) pending.push('/' + name)
        for (const [,name] of text.matchAll(/new URL\('\.\/([\w-]+\.js)'/g)) pending.push('/' + name)
        for (const [,name] of text.matchAll(/src="\/([\w-]+\.js)"/g)) pending.push('/' + name)
        for (const [,name] of text.matchAll(/href="\/([\w-]+\.css)"/g)) pending.push('/' + name)
        for (const [,name] of text.matchAll(/url\('(\/recursos\/[^']+)'\)/g)) pending.push(name)
      }
    }
    console.log(`Arquivos do jogo: ${seen.size} (${(bytes/1048576).toFixed(1)} MB)`)
    // --copiar-arquivos <pasta>: guarda uma cópia dos arquivos do APK (para testar no navegador sem o servidor).
    const copy = option('--copiar-arquivos')
    if (copy) fs.cpSync(www,resolve(copy),{recursive:true})
  } finally { server.kill() }

  // 2. Recursos e manifesto (versão preenchida aqui).
  const manifest = fs.readFileSync(join(root,'android/AndroidManifest.xml'),'utf8')
    .replace('package="br.battalion.nativo">',`package="br.battalion.nativo"\n    android:versionCode="${versionCode}"\n    android:versionName="${edition.versao}">`)
  fs.writeFileSync(join(work,'AndroidManifest.xml'),manifest)
  const compiled = join(work,'compiled.zip')
  run(tool('aapt2'),['compile','--dir',join(root,'android/res'),'-o',compiled])
  const unsigned = join(work,'base.apk')
  run(tool('aapt2'),['link','-o',unsigned,'-I',androidJar,'--manifest',join(work,'AndroidManifest.xml'),
    '--min-sdk-version','24','--target-sdk-version','35','-A',join(work,'assets'),'-0','mp3','-0','png',compiled])

  // 3. Código Java → classes.dex.
  const classes = join(work,'classes'), dex = join(work,'dex')
  fs.mkdirSync(classes,{recursive:true})
  fs.mkdirSync(dex,{recursive:true})
  run(jdkTool('javac'),['--release','11','-classpath',androidJar,'-d',classes,
    join(root,'android/src/br/battalion/nativo/MainActivity.java')])
  const classFiles = []
  const walk = folder => { for (const entry of fs.readdirSync(folder,{withFileTypes:true})) {
    const full = join(folder,entry.name)
    if (entry.isDirectory()) walk(full); else if (full.endsWith('.class')) classFiles.push(full)
  } }
  walk(classes)
  run(tool('d8'),['--release','--min-api','24','--lib',androidJar,'--output',dex,...classFiles])
  run(tool('aapt'),['add',unsigned,'classes.dex'],{cwd:dex})

  // 4. Alinhar e assinar (chave local guardada junto do SDK; a mesma chave permite atualizar o app instalado).
  const aligned = join(work,'aligned.apk')
  run(tool('zipalign'),['-f','-p','4',unsigned,aligned])
  const keystore = join(sdk,'battalion-nativo.keystore')
  if (!fs.existsSync(keystore)) {
    run(jdkTool('keytool'),['-genkeypair','-keystore',keystore,'-storepass','battalion-nativo','-keypass','battalion-nativo',
      '-alias','battalion','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Battalion Nativo'])
  }
  const output = join(root,'Battalion-Nativo-Android.apk')
  run(tool('apksigner'),['sign','--ks',keystore,'--ks-pass','pass:battalion-nativo','--ks-key-alias','battalion',
    '--out',output,aligned])
  run(tool('apksigner'),['verify',output])
  console.log(`${output} · versão ${edition.versao} · ${(fs.statSync(output).size/1048576).toFixed(1)} MB`)
} finally {
  fs.rmSync(work,{recursive:true,force:true})
}
