param(
    [string]$JogoEmpacotado = (Join-Path $PSScriptRoot '../Battalion-Atualizado/Battalion-Nativo.exe'),
    [string]$Destino = (Join-Path $PSScriptRoot '../Treinador-Battalion.exe'),
    [switch]$DoZero
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('battalion-treinador-' + [Guid]::NewGuid().ToString('n'))
$null = New-Item -ItemType Directory -Path $tmp
$zip = Join-Path $tmp 'treinador.zip'
$exe = Join-Path $tmp 'Treinador-Battalion.exe'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    $game = [Reflection.Assembly]::LoadFile((Resolve-Path -LiteralPath $JogoEmpacotado).Path)
    $payload = $game.GetManifestResourceStream('BattalionNative')
    if ($null -eq $payload) { throw 'O executável informado não contém o pacote do jogo.' }
    $source = [IO.Compression.ZipArchive]::new($payload,[IO.Compression.ZipArchiveMode]::Read)
    try {
        $bundle = [IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
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
            $files = 'tools/treinar-ia.mjs','tools/pontuacao-ia.mjs','nativo/dados.json','nativo/ia.js','nativo/partida.js',
                'nativo/movimento.js','nativo/procedural.js','nativo/rede-ia.js','nativo/perfil-ia.js'
            foreach ($name in $files) {
                $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $bundle,(Join-Path $root $name),$name,[IO.Compression.CompressionLevel]::Optimal
                )
            }
        } finally { $bundle.Dispose() }
    } finally { $source.Dispose() }

    $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    $defines = @()
    if ($DoZero) { $defines += '/define:TREINO_DO_ZERO' }
    & $compiler /nologo /codepage:65001 /optimize+ /platform:x64 /target:exe @defines "/out:$exe" "/resource:$zip,BattalionTrainer" /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot 'PortableTrainingLauncher.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o treinador portátil.' }
    Copy-Item -LiteralPath $exe -Destination $Destino -Force
    Get-Item -LiteralPath $Destino | Select-Object FullName,Length
} finally {
    foreach ($file in $zip,$exe) {
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    }
    Remove-Item -LiteralPath $tmp
}
