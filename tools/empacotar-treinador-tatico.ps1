# Gera Treinador-IA-Tatica.exe: Node.js + jogo completo (para assistir às partidas) + treino tático
# + o checkpoint atual (~/.battalion-nativo/treino-tatica/treino.json), para continuar o treino em outra máquina.
param(
    [string]$JogoEmpacotado = (Join-Path $PSScriptRoot '../Battalion-Atualizado/Battalion-Nativo.exe'),
    [string]$Destino = (Join-Path $PSScriptRoot '../Treinador-IA-Tatica.exe'),
    [string]$Checkpoint = (Join-Path $env:USERPROFILE '.battalion-nativo/treino-tatica/treino.json')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('battalion-tatico-' + [Guid]::NewGuid().ToString('n'))
$null = New-Item -ItemType Directory -Path $tmp
$zip = Join-Path $tmp 'treinador.zip'
$exe = Join-Path $tmp 'Treinador-IA-Tatica.exe'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    $bundle = [IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
    try {
        # Node.js oficial (já verificado) vem do pacote do jogo.
        $game = [Reflection.Assembly]::LoadFile((Resolve-Path -LiteralPath $JogoEmpacotado).Path)
        $payload = $game.GetManifestResourceStream('BattalionNative')
        if ($null -eq $payload) { throw 'O executável informado não contém o pacote do jogo.' }
        $source = [IO.Compression.ZipArchive]::new($payload,[IO.Compression.ZipArchiveMode]::Read)
        try {
            foreach ($name in 'runtime/node.exe','LICENSE-Node.js.txt') {
                $original = $source.GetEntry($name)
                if ($null -eq $original) { throw "Arquivo ausente no pacote do jogo. $name" }
                $inputStream = $original.Open()
                try {
                    $outputStream = $bundle.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal).Open()
                    try { $inputStream.CopyTo($outputStream) }
                    finally { $outputStream.Dispose() }
                } finally { $inputStream.Dispose() }
            }
        } finally { $source.Dispose() }

        # Código atual do projeto (jogo + IA tática + treinador).
        $files = [ordered]@{
            'camera.js' = Join-Path $root 'camera.js'
            'lan.js' = Join-Path $root 'lan.js'
            'launcher.css' = Join-Path $root 'launcher.css'
            'tools/treinar-tatica.mjs' = Join-Path $root 'tools/treinar-tatica.mjs'
        }
        $nativo = Join-Path $root 'nativo'
        Get-ChildItem -LiteralPath $nativo -File | Where-Object Extension -in '.js','.json','.html','.css' | ForEach-Object {
            $files["nativo/$($_.Name)"] = $_.FullName
        }
        $assets = foreach ($name in 'dados.json','dados-ghosts.json') {
            $data = Get-Content -LiteralPath (Join-Path $nativo $name) -Encoding UTF8 -Raw | ConvertFrom-Json
            $data.assets.PSObject.Properties.Value
        }
        $assets | Sort-Object -Unique | ForEach-Object { $files["nativo/recursos/$_"] = Join-Path $nativo "recursos/$_" }
        if (Test-Path -LiteralPath $Checkpoint) {
            $files['inicial/treino.json'] = (Resolve-Path -LiteralPath $Checkpoint).Path
            $saved = Get-Content -LiteralPath $Checkpoint -Raw | ConvertFrom-Json
            Write-Host "Checkpoint incluído: geração $($saved.generation), $($saved.matches) partidas."
        } else {
            Write-Host 'Nenhum checkpoint encontrado: o treino começa da geração 0 (ou de um treino.json ao lado do .exe).'
        }
        foreach ($item in $files.GetEnumerator()) {
            $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $bundle,$item.Value,$item.Key,[IO.Compression.CompressionLevel]::Optimal)
        }
    } finally { $bundle.Dispose() }

    $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    & $compiler /nologo /codepage:65001 /optimize+ /platform:x64 /target:exe "/out:$exe" "/resource:$zip,BattalionTacticalTrainer" /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot 'TacticalTrainerLauncher.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o treinador portátil.' }
    Copy-Item -LiteralPath $exe -Destination $Destino -Force
    Get-Item -LiteralPath $Destino | Select-Object FullName,Length
} finally {
    foreach ($file in $zip,$exe) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file } }
    Remove-Item -LiteralPath $tmp
}
