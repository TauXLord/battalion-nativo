param([ValidateSet('vengeance', 'ghosts')][string]$Game = 'vengeance')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

try {
    $ffdec = Join-Path $root '.tools/ffdec/ffdec.jar'
    $original = Join-Path $root "original/battalion-$Game.swf"
    $target = Join-Path $root "jogo/battalion-$Game.swf"
    $mods = Join-Path $root $(if ($Game -eq 'ghosts') { 'mods-ghosts' } else { 'mods' })
    $temporary = Join-Path $root ('jogo/build-' + [Guid]::NewGuid().ToString('N') + '.swf')
    if (!(Test-Path -LiteralPath $ffdec -PathType Leaf)) {
        throw 'Extraia o JPEXS FFDec na pasta .tools/ffdec. Veja README.md.'
    }
    $null = Get-Command java.exe -ErrorAction Stop

    $manifest = Get-Content -Raw -LiteralPath (Join-Path $mods 'recursos.json') | ConvertFrom-Json
    $arguments = @()
    foreach ($entry in $manifest.PSObject.Properties) {
        $source = Join-Path $mods $entry.Name
        try {
            $xml = New-Object System.Xml.XmlDocument
            $settings = New-Object System.Xml.XmlReaderSettings
            $settings.DtdProcessing = 'Prohibit'
            $reader = [System.Xml.XmlReader]::Create($source, $settings)
            try { $xml.Load($reader) } finally { $reader.Dispose() }
        } catch {
            throw ('XML invalido em ' + $entry.Name + ' - ' + $_.Exception.Message)
        }
        $arguments += @([string]$entry.Value, $source)
    }
    $repairs = [ordered]@{
        'com.gamedozer.battalion.ui.MouseCursor' = 'MouseCursor.as'
        'com.gamedozer.battalion.ui.ToolTip' = 'ToolTip.as'
        'com.gamedozer.battalion.ui.VistaButton' = 'VistaButton.as'
        'com.gamedozer.battalion.ui.BattalionPanel' = 'BattalionPanel.as'
        'com.gamedozer.battalion.display.GameButton' = 'GameButton.as'
        'com.gamedozer.battalion.display.GameSpriteScroller' = 'GameSpriteScroller.as'
        'com.gamedozer.battalion.ui.MiniMap' = 'MiniMap.as'
        'com.gamedozer.battalion.game.GameCamera' = 'GameCamera.as'
        'com.gamedozer.battalion.game.GameManager' = 'GameManager.as'
        'com.gamedozer.battalion.game.controllers.HumanController' = 'HumanController.as'
    }
    $main = if ($Game -eq 'ghosts') { 'Ep2Main' } else { 'Ep3Main' }
    $repairs["com.gamedozer.battalion.$main"] = "$main.as"
    if ($Game -eq 'vengeance') {
        $repairs['com.gamedozer.battalion.ui.CampaignMenu'] = 'CampaignMenu.as'
        $repairs['com.gamedozer.battalion.game.actions.StartTurnAction'] = 'StartTurnAction.as'
        $repairs['com.gamedozer.battalion.game.actions.EndTurnAction'] = 'EndTurnAction.as'
    }
    foreach ($entry in $repairs.GetEnumerator()) {
        $arguments += @($entry.Key, (Join-Path $root ('correcoes/' + $entry.Value)))
    }

    & java.exe -jar $ffdec -replace $original $temporary @arguments
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $temporary -PathType Leaf)) {
        throw 'O JPEXS nao conseguiu gerar a copia modificada.'
    }
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        [IO.File]::Replace($temporary, $target, "$temporary.bak")
        Remove-Item -LiteralPath "$temporary.bak" -Force
    } else {
        [IO.File]::Move($temporary, $target)
    }
    Write-Host 'Mods aplicados. Recarregue a pagina do Battalion.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if ($temporary -and (Test-Path -LiteralPath $temporary -PathType Leaf)) {
        Remove-Item -LiteralPath $temporary -Force
    }
}
