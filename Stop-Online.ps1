$ErrorActionPreference = 'Stop'
$statePath = Join-Path $PSScriptRoot '.online-runtime/state.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Host 'Tidak ada server online yang tercatat.'; return }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
foreach ($saved in $state.processes) {
    $process = Get-Process -Id $saved.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks -eq ([datetime]$saved.started).ToUniversalTime().Ticks) { Stop-Process -Id $process.Id }
}
Write-Host 'Server dan tunnel online sudah dihentikan.'
