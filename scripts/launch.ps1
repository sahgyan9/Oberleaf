$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = [System.IO.Path]::Combine($ProjectRoot, "logs")
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$LogFile = [System.IO.Path]::Combine($LogDir, "project.log")

# Refresh environment PATH from registry in case Node or npm was recently installed
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

function Show-Notification {
    param([string]$Title, [string]$Message)
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastImageAndText02)
        $textNodes = $template.GetElementsByTagName("text")
        $textNodes.Item(0).AppendChild($template.CreateTextNode($Title)) | Out-Null
        $textNodes.Item(1).AppendChild($template.CreateTextNode($Message)) | Out-Null
        
        $iconPath = (Join-Path $ProjectRoot "assets\icon.png").Replace('\', '/')
        if (Test-Path (Join-Path $ProjectRoot "assets\icon.png")) {
            $imageNodes = $template.GetElementsByTagName("image")
            $imageNodes.Item(0).Attributes.GetNamedItem("src").NodeValue = "file:///$iconPath"
        }

        $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Oberleaf")
        $notifier.Show($toast)
    } catch {}
}

function Show-ErrorDialog {
    param([string]$Title, [string]$Message)
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        $Title,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

function Stop-PortProcesses {
    param([int[]]$Ports)
    foreach ($port in $Ports) {
        # 1. Try Get-NetTCPConnection
        try {
            $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
            foreach ($conn in $conns) {
                if ($conn.OwningProcess -and $conn.OwningProcess -gt 4) {
                    Start-Process -FilePath "taskkill.exe" -ArgumentList "/F /T /PID $($conn.OwningProcess)" -NoNewWindow -Wait -ErrorAction SilentlyContinue
                }
            }
        } catch {}

        # 2. Netstat fallback for orphaned or half-closed sockets
        try {
            $netstatMatches = netstat -ano | Select-String ":$port\s+"
            foreach ($match in $netstatMatches) {
                $cols = ($match.ToString().Trim() -split '\s+')
                if ($cols.Length -ge 5) {
                    $pidToKill = [int]$cols[-1]
                    if ($pidToKill -gt 4) {
                        Start-Process -FilePath "taskkill.exe" -ArgumentList "/F /T /PID $pidToKill" -NoNewWindow -Wait -ErrorAction SilentlyContinue
                    }
                }
            }
        } catch {}
    }
}

function Open-InChrome {
    param([string]$Url)

    # 1. Prioritize Google Chrome
    $chromeCandidates = @(
        (Get-Command chrome.exe -ErrorAction SilentlyContinue).Source,
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

    $chromePath = $chromeCandidates | Select-Object -First 1

    if ($chromePath) {
        Start-Process -FilePath $chromePath -ArgumentList $Url
        return
    }

    # 2. Fallback to Edge
    $edgeCandidates = @(
        (Get-Command msedge.exe -ErrorAction SilentlyContinue).Source,
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

    $edgePath = $edgeCandidates | Select-Object -First 1
    if ($edgePath) {
        Start-Process -FilePath $edgePath -ArgumentList $Url
        return
    }

    # 3. Fallback to system default browser
    Start-Process $Url
}

# ------------------------------------------------------------------
# STEP 0: Dependency checks - fail loud and early
# ------------------------------------------------------------------

# Check Node.js
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) { $nodeCmd = Get-Command node -ErrorAction SilentlyContinue }
if (-not $nodeCmd) {
    Show-ErrorDialog "Oberleaf - Node.js Not Found" (
        "Oberleaf needs Node.js to run, but it was not found on this computer.`n`n" +
        "Fix: Run 'Oberleaf-Setup.bat' (in the Oberleaf folder) to install everything automatically.`n`n" +
        "Or install Node.js manually from: https://nodejs.org`n`n" +
        "After installing, open Oberleaf again."
    )
    exit 1
}

# Check npm
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npmCmd) {
    Show-ErrorDialog "Oberleaf - npm Not Found" (
        "npm (Node package manager) was not found on this computer.`n`n" +
        "Fix: Run 'Oberleaf-Setup.bat' to install everything automatically.`n`n" +
        "If Node.js is installed, try restarting your computer so PATH updates take effect."
    )
    exit 1
}

# Check node_modules - install them if they are missing
$nodeModulesPath = Join-Path $ProjectRoot "node_modules"
if (-not (Test-Path $nodeModulesPath)) {
    Show-Notification "Oberleaf" "First-time setup: installing dependencies (1-2 min)..."
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    "`n========================================`n[Oberleaf] npm install started at $timestamp`n========================================" |
        Out-File -FilePath $LogFile -Encoding utf8 -Append

    $npmInstall = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm install >> `"$LogFile`" 2>&1" `
        -WorkingDirectory $ProjectRoot -Wait -PassThru -WindowStyle Hidden
    
    if ($npmInstall.ExitCode -ne 0 -or -not (Test-Path $nodeModulesPath)) {
        Show-ErrorDialog "Oberleaf - Dependency Install Failed" (
            "npm install failed. Oberleaf cannot start without its dependencies.`n`n" +
            "What to try:`n" +
            "  1. Make sure you have an internet connection.`n" +
            "  2. Open a terminal in the Oberleaf folder and run:  npm install`n" +
            "  3. Check the log for errors: $LogFile`n`n" +
            "If the problem persists, run 'Oberleaf-Setup.bat' again."
        )
        exit 1
    }
}

# ------------------------------------------------------------------
# STEP 1: Warm check - if both servers are already running, open instantly
# ------------------------------------------------------------------
try {
    $checkVite   = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    $checkServer = Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    if ($checkVite.StatusCode -eq 200 -and $checkServer.StatusCode -eq 200) {
        Open-InChrome "http://localhost:5173"
        exit 0
    }
} catch {}

# ------------------------------------------------------------------
# STEP 2: Cold start - notify user that startup has begun
# ------------------------------------------------------------------
Show-Notification "Oberleaf" "Starting Oberleaf LaTeX Studio, please wait..."

# ------------------------------------------------------------------
# STEP 3: Free up ports 3001 and 5173 if orphaned processes are stuck
# ------------------------------------------------------------------
Stop-PortProcesses @(3001, 5173)
Start-Sleep -Milliseconds 600

# ------------------------------------------------------------------
# STEP 4: Launch npm start - stream full output to logs/project.log
# ------------------------------------------------------------------
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"`n========================================`n[Oberleaf] Session started at $timestamp`n========================================" | Out-File -FilePath $LogFile -Encoding utf8 -Append

Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start >> `"$LogFile`" 2>&1" -WorkingDirectory $ProjectRoot -WindowStyle Hidden

# ------------------------------------------------------------------
# STEP 5: Poll until BOTH Vite (5173) AND Express (3001) are ready
#         Timeout 60 seconds (120 x 500ms)
# ------------------------------------------------------------------
$viteReady   = $false
$serverReady = $false
for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Milliseconds 500
    if (-not $viteReady) {
        try {
            $res = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
            if ($res.StatusCode -eq 200) { $viteReady = $true }
        } catch {}
    }
    if (-not $serverReady) {
        try {
            $res = Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
            if ($res.StatusCode -eq 200) { $serverReady = $true }
        } catch {}
    }
    if ($viteReady -and $serverReady) { break }

    # Check for early crash after 10 seconds (20 polls)
    if ($i -eq 20 -and (Test-Path $LogFile)) {
        $recentLog = Get-Content -Path $LogFile -Tail 20 -ErrorAction SilentlyContinue
        $crashSignals = $recentLog | Where-Object {
            $_ -match "Error:|EADDRINUSE|Cannot find module|SyntaxError|npm ERR!"
        }
        if ($crashSignals) {
            $crashText = ($crashSignals | Select-Object -First 5) -join "`n"
            Show-ErrorDialog "Oberleaf - Startup Failed" (
                "Oberleaf crashed shortly after starting.`n`n" +
                "Error details:`n$crashText`n`n" +
                "Full log: $LogFile`n`n" +
                "To fix: Open a terminal in the Oberleaf folder and run:  npm start"
            )
            exit 1
        }
    }
}

# ------------------------------------------------------------------
# STEP 6: If servers never came up - show a clear error dialog
# ------------------------------------------------------------------
if (-not ($viteReady -and $serverReady)) {
    $missingParts = @()
    if (-not $viteReady)   { $missingParts += "Frontend (port 5173)" }
    if (-not $serverReady) { $missingParts += "Backend (port 3001)" }
    $missingText = $missingParts -join " and "

    $logTail = ""
    if (Test-Path $LogFile) {
        $logTail = "`n`nLast log lines:`n" + ((Get-Content -Path $LogFile -Tail 10 -ErrorAction SilentlyContinue) -join "`n")
    }

    Show-ErrorDialog "Oberleaf - Could Not Start" (
        "$missingText did not start within 60 seconds.`n`n" +
        "To diagnose:`n" +
        "  1. Open a terminal in the Oberleaf folder`n" +
        "  2. Run:  npm start`n" +
        "  3. Look for any red error messages`n`n" +
        "Full log: $LogFile" + $logTail
    )
    exit 1
}

# ------------------------------------------------------------------
# STEP 7: Both servers are verified up - open in browser
# ------------------------------------------------------------------
Open-InChrome "http://localhost:5173"
