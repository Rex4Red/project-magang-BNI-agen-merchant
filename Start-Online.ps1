param([switch]$SkipBuild, [ValidateRange(1024, 65535)][int]$Port = 3001)
$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$appDir = Join-Path $projectDir 'webapp'
$runtimeDir = Join-Path $projectDir '.online-runtime'
$toolsDir = Join-Path $projectDir '.local-tools'
$statePath = Join-Path $runtimeDir 'state.json'
$cloudflaredPath = Join-Path $toolsDir 'cloudflared.exe'

if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $running = @($state.processes | Where-Object {
        $process = Get-Process -Id $_.id -ErrorAction SilentlyContinue
        $process -and $process.StartTime.ToUniversalTime().Ticks -eq ([datetime]$_.started).ToUniversalTime().Ticks
    })
    if ($running.Count -eq 2) {
        Write-Host "Web sudah berjalan: $($state.url)"
        return
    }
    if ($running.Count) { throw 'Ada proses online yang masih berjalan. Jalankan Stop-Online.ps1, lalu coba lagi.' }
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port sedang digunakan. Pilih port lain dengan parameter -Port."
}
New-Item -ItemType Directory -Path $runtimeDir, $toolsDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $cloudflaredPath)) {
    Write-Host 'Mengunduh Cloudflare Tunnel dari release resmi...'
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflaredPath
}
if (-not (Test-Path -LiteralPath (Join-Path $appDir 'node_modules/next/dist/bin/next'))) { throw 'Jalankan npm ci dari folder webapp terlebih dahulu.' }
if (-not $SkipBuild) {
    Push-Location $appDir
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Build webapp gagal.' } }
    finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $appDir '.next/BUILD_ID'))) { throw 'Build belum tersedia. Jalankan script tanpa -SkipBuild.' }

$managed = @()
try {
    $nodePath = (Get-Command node.exe).Source
    $nextPath = Join-Path $appDir 'node_modules/next/dist/bin/next'
    $server = Start-Process -FilePath $nodePath -ArgumentList @('"' + $nextPath + '"', 'start', '-H', '127.0.0.1', '-p', $Port) -WorkingDirectory $appDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'web.out.log') -RedirectStandardError (Join-Path $runtimeDir 'web.err.log')
    $managed += $server
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        if ($server.HasExited) { throw 'Server berhenti. Periksa .online-runtime/web.err.log.' }
        try { $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -UseBasicParsing -TimeoutSec 2; $ready = $response.StatusCode -eq 200 } catch { }
        if ($ready) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'Server lokal belum siap.' }
    $tunnelLog = Join-Path $runtimeDir 'tunnel.err.log'
    $tunnel = Start-Process -FilePath $cloudflaredPath -ArgumentList @('tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', "http://127.0.0.1:$Port") -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'tunnel.out.log') -RedirectStandardError $tunnelLog
    $managed += $tunnel
    $publicUrl = $null
    for ($i = 0; $i -lt 90; $i++) {
        if ($tunnel.HasExited) { throw 'Tunnel berhenti. Periksa .online-runtime/tunnel.err.log.' }
        $log = Get-Content -LiteralPath $tunnelLog -Raw -ErrorAction SilentlyContinue
        if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $publicUrl = $Matches[0]; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $publicUrl) { throw 'Tautan publik belum tersedia. Periksa koneksi internet dan log tunnel.' }
    @{ url = $publicUrl; processes = @($managed | ForEach-Object { @{ id = $_.Id; started = $_.StartTime.ToUniversalTime().ToString('o') } }) } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath
    $publicUrl | Set-Content -LiteralPath (Join-Path $runtimeDir 'public-url.txt')
    Write-Host "Tautan publik: $publicUrl"
    Write-Host 'Server berjalan di background. Laptop dan internet harus tetap aktif.'
    Write-Host 'Untuk menghentikan: powershell -ExecutionPolicy Bypass -File .\Stop-Online.ps1'
} catch {
    foreach ($process in $managed) { if (-not $process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue } }
    throw
}
