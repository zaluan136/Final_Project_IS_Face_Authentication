$ErrorActionPreference = 'Stop'
$backendPath = Join-Path $PSScriptRoot 'backend'
if (-not (Test-Path (Join-Path $backendPath 'package.json'))) { Write-Host 'Backend package.json not found.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
try { $node = Get-Command node -ErrorAction Stop; $npm = Get-Command npm.cmd -ErrorAction Stop } catch { Write-Host 'Node.js/npm not found. Install Node.js 22.5 or newer.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
$nodeVersion = (& $node.Source --version 2>$null) -replace '^v', ''
try { $version = [version]$nodeVersion } catch { Write-Host "Invalid Node.js version: $nodeVersion" -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
if ($version -lt [version]'22.5') { Write-Host "Node.js 22.5+ required. Found: $nodeVersion" -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
Set-Location -LiteralPath $backendPath
if (-not (Test-Path (Join-Path $backendPath 'node_modules'))) { Write-Host 'Installing dependencies...' -ForegroundColor Cyan; & $npm.Source install; if ($LASTEXITCODE -ne 0) { Write-Host 'Dependency installation failed.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 } }
Write-Host 'Creating or refreshing demo accounts...' -ForegroundColor Cyan
& $npm.Source run seed
if ($LASTEXITCODE -ne 0) { Write-Host 'Demo account setup failed.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
$port = 3000
$envFile = Join-Path $backendPath '.env'
if (Test-Path $envFile) { $portLine = Get-Content $envFile | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1; if ($portLine -match '^\s*PORT\s*=\s*(\d+)') { $port = [int]$Matches[1] } }
$appUrl = "http://127.0.0.1:$port/login"
$listener = $null
try { $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port); $listener.Start(); $listener.Stop(); $listener = $null } catch { if ($listener) { $listener.Stop() }; Write-Host "Port $port is in use. Opening $appUrl" -ForegroundColor Yellow; Start-Process $appUrl; Read-Host 'Press Enter to close'; exit 0 }
Write-Host "Starting AttendSecure at $appUrl" -ForegroundColor Green
Start-Process $appUrl
Write-Host 'Keep this window open. Press Ctrl+C to stop the server.' -ForegroundColor Yellow
& $npm.Source start
