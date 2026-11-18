$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'Battalion.exe'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('battalion-' + [Guid]::NewGuid().ToString('n'))
$null = New-Item -ItemType Directory $tmp
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    $zip = Join-Path $tmp 'payload.zip'
    $exe = Join-Path $tmp 'Battalion.exe'
    $files = [ordered]@{
        'index.html' = 'index.html'
        'launcher.css' = 'launcher.css'
        'editor.js' = 'editor.js'
        'cenarios.js' = 'cenarios.js'
        'lan.js' = 'lan.js'
        'camera.js' = 'camera.js'
        'swf-map.js' = 'swf-map.js'
        'jogo/battalion-ghosts.swf' = 'jogo/battalion-ghosts.swf'
        'jogo/battalion-vengeance.swf' = 'jogo/battalion-vengeance.swf'
        'mapas/ghosts.yimf' = 'mods-ghosts/campanha/Mission_1.yimf'
        'mapas/vengeance.yimf' = 'mods/campanha/Mission_1.yimf'
        'mapas/ghosts.xml' = 'mods-ghosts/dados/campaign.xml'
        'mapas/vengeance.xml' = 'mods/dados/campaign.xml'
    }
    Get-ChildItem (Join-Path $root 'cenarios') -Filter '*.yimf' -File | ForEach-Object {
        $files["cenarios/$($_.Name)"] = "cenarios/$($_.Name)"
    }
    Get-ChildItem (Join-Path $root 'runtime') -File | Where-Object Name -match '\.(js|wasm|swf)$|^LICENSE_' | ForEach-Object {
        $files["runtime/$($_.Name)"] = "runtime/$($_.Name)"
    }
    $archive = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($item in $files.GetEnumerator()) {
            $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $root $item.Value), $item.Key)
        }
    } finally { $archive.Dispose() }
    $framework = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
    & (Join-Path $framework 'csc.exe') /nologo /optimize+ /target:winexe "/out:$exe" "/resource:$zip,BattalionAssets" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll (Join-Path $PSScriptRoot 'PortableLauncher.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o executável.' }
    Copy-Item -LiteralPath $exe -Destination $out -Force
    Write-Output $out
} finally {
    foreach ($item in 'payload.zip', 'Battalion.exe') {
        $path = Join-Path $tmp $item
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
    }
    Remove-Item -LiteralPath $tmp
}
