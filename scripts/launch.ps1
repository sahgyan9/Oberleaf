$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# 1. Check if Overleaf Copy is already running
try {
    $check = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    if ($check.StatusCode -eq 200) {
        Start-Process "http://localhost:5173"
        exit 0
    }
} catch {}

# 2. Free up ports 3001 and 5173 if any orphaned processes are stuck
Get-NetTCPConnection -LocalPort 3001, 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

# 3. Launch npm start as an independent detached background process
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start" -WorkingDirectory $ProjectRoot -WindowStyle Hidden

# 4. Poll until the server responds (up to 15 seconds)
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        if ($res.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {}
}

# 5. Open browser
Start-Process "http://localhost:5173"
