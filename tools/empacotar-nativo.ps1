param(
    [ValidatePattern('^[^\\/:*?"<>|]+\.exe$')]
    [string]$Nome = 'Battalion-Nativo.exe'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root $Nome
$node = (Get-Command node.exe).Source
$version = (& $node -p 'process.version').Trim()
if ($version -notmatch '^v\d+\.\d+\.\d+$' -or (& $node -p 'process.arch').Trim() -ne 'x64') {
    throw 'Use uma edição oficial x64 do Node.js para compilar o executável.'
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('battalion-nativo-' + [Guid]::NewGuid().ToString('n'))
$null = New-Item -ItemType Directory $tmp
$zip = Join-Path $tmp 'payload.zip'
$exe = Join-Path $tmp 'Battalion-Nativo.exe'
$license = Join-Path $tmp 'LICENSE-Node.js.txt'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    $checksums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$version/SHASUMS256.txt").Content
    $official = [regex]::Match([string]$checksums, '(?m)^([0-9a-f]{64})\s+win-x64/node\.exe\r?$').Groups[1].Value
    if (!$official -or (Get-FileHash -Algorithm SHA256 -LiteralPath $node).Hash -ne $official) {
        throw 'O node.exe local não corresponde ao binário oficial dessa versão.'
    }
    Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/nodejs/node/$version/LICENSE" -OutFile $license
    $files = [ordered]@{
        'runtime/node.exe' = $node
        'LICENSE-Node.js.txt' = $license
        'camera.js' = Join-Path $root 'camera.js'
        'lan.js' = Join-Path $root 'lan.js'
        'launcher.css' = Join-Path $root 'launcher.css'
    }
    $tunnel = Join-Path $root 'work/bin/cloudflared.exe'
    if (Test-Path -LiteralPath $tunnel) {
        $files['runtime/cloudflared.exe'] = $tunnel
        $files['LICENSE-cloudflared.txt'] = Join-Path $root 'work/bin/LICENSE-cloudflared.txt'
    }
    $game = Join-Path $root 'nativo'
    Get-ChildItem -LiteralPath $game -File | Where-Object Extension -in '.js','.json','.html','.css' | ForEach-Object {
        $files["nativo/$($_.Name)"] = $_.FullName
    }
    $assets = foreach ($name in 'dados.json','dados-ghosts.json') {
        $data = Get-Content -LiteralPath (Join-Path $game $name) -Encoding UTF8 -Raw | ConvertFrom-Json
        $data.assets.PSObject.Properties.Value
    }
    $assets | Sort-Object -Unique | ForEach-Object {
        $files["nativo/recursos/$_"] = Join-Path $game "recursos/$_"
    }

    $archive = [IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($item in $files.GetEnumerator()) {
            $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$item.Value,$item.Key)
        }
    } finally { $archive.Dispose() }
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    $icon = Join-Path $PSScriptRoot 'battalion.ico'
    if (!(Test-Path -LiteralPath $icon)) { & (Join-Path $PSScriptRoot 'gerar-icone.ps1') | Out-Null }
    & $compiler /nologo /codepage:65001 /optimize+ /platform:x64 /target:exe "/out:$exe" "/win32icon:$icon" "/resource:$zip,BattalionNative" /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot 'NativeLauncher.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar a edição nativa.' }
    Copy-Item -LiteralPath $exe -Destination $out -Force
    Get-Item -LiteralPath $out | Select-Object FullName,Length
} finally {
    foreach ($file in $zip,$exe,$license) {
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    }
    Remove-Item -LiteralPath $tmp
}
