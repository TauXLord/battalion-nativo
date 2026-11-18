# Gera tools/battalion.ico (e uma prévia PNG) a partir do sprite do Annihilator, com a paleta verde do jogo.
param(
    [string]$Sprite = (Join-Path $PSScriptRoot '../nativo/recursos/annihilator.png'),
    [int]$Quadro = 0,
    [string]$Destino = (Join-Path $PSScriptRoot 'battalion.ico')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$dados = Get-Content -LiteralPath (Join-Path $root 'nativo/dados.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$map = @{}
for ($i = 0; $i -lt 4; $i++) { $map[[uint32]$dados.palettes.ffff0000[$i]] = [uint32]$dados.palettes.ff00ff00[$i] }

$sheet = [Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $Sprite).Path)
try {
    $w = [int]($sheet.Width / 6); $h = [int]($sheet.Height / 4)
    $x0 = $Quadro * $w
    # Recorta o quadro e troca as cores de equipe.
    $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
    $cell = New-Object Drawing.Bitmap $w, $h
    for ($y = 0; $y -lt $h; $y++) { for ($x = 0; $x -lt $w; $x++) {
        $c = $sheet.GetPixel($x0 + $x, $y)
        if ($c.A -eq 0) { continue }
        $argb = [uint32]([int64]$c.ToArgb() -band 0xffffffffL)
        if ($map.ContainsKey($argb)) { $c = [Drawing.Color]::FromArgb([int]([int64]$map[$argb] - 0x100000000L)) }
        $cell.SetPixel($x, $y, $c)
        if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    } }
    $tank = $cell.Clone((New-Object Drawing.Rectangle $minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1)), $cell.PixelFormat)
} finally { $sheet.Dispose() }

function Badge([int]$size) {
    $bmp = New-Object Drawing.Bitmap $size, $size
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $r = [Math]::Max(2, [int]($size * .18)); $pad = [Math]::Max(0, [int]($size * .03))
    $rect = New-Object Drawing.Rectangle $pad, $pad, ($size - 2 * $pad - 1), ($size - 2 * $pad - 1)
    $path = New-Object Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90); $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90); $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $fill = New-Object Drawing.Drawing2D.LinearGradientBrush $rect, ([Drawing.Color]::FromArgb(255, 58, 79, 58)), ([Drawing.Color]::FromArgb(255, 20, 30, 23)), 90
    $g.FillPath($fill, $path)
    $pen = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(255, 209, 171, 100)), ([Math]::Max(1, $size / 32))
    $g.DrawPath($pen, $path)
    # Tanque em pixel art, ampliado sem suavização.
    $g.InterpolationMode = 'NearestNeighbor'; $g.PixelOffsetMode = 'Half'
    $scale = [Math]::Max(1, [Math]::Floor(($size * .84) / [Math]::Max($tank.Width, $tank.Height)))
    if ($size -lt 48) { $scale = ($size * .9) / [Math]::Max($tank.Width, $tank.Height); $g.InterpolationMode = 'HighQualityBicubic' }
    $tw = $tank.Width * $scale; $th = $tank.Height * $scale
    $g.DrawImage($tank, [single](($size - $tw) / 2), [single](($size - $th) / 2 + $size * .03), [single]$tw, [single]$th)
    $g.Dispose()
    return $bmp
}

$sizes = 256, 64, 48, 32, 16
$pngs = foreach ($s in $sizes) {
    $b = Badge $s
    $ms = New-Object IO.MemoryStream
    $b.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
    if ($s -eq 256) { $b.Save([IO.Path]::ChangeExtension($Destino, '.png'), [Drawing.Imaging.ImageFormat]::Png) }
    if ($s -eq 32) { $b.Save((Join-Path (Split-Path $Destino) 'battalion-32.png'), [Drawing.Imaging.ImageFormat]::Png) }
    $b.Dispose()
    , $ms.ToArray()
}
# ICO com imagens PNG embutidas (Windows Vista ou mais novo).
$out = New-Object IO.MemoryStream
$bw = New-Object IO.BinaryWriter $out
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $len = $pngs[$i].Length
    $bw.Write([byte]($s % 256)); $bw.Write([byte]($s % 256)); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$len); $bw.Write([uint32]$offset)
    $offset += $len
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Flush()
[IO.File]::WriteAllBytes($Destino, $out.ToArray())
$tank.Dispose(); $cell.Dispose()
Get-Item -LiteralPath $Destino | Select-Object FullName, Length
