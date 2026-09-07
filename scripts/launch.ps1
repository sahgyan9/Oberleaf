[CmdletBinding()]
param(
    [switch]$NoSplash
)

$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = [System.IO.Path]::Combine($ProjectRoot, "logs")
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$LogFile = [System.IO.Path]::Combine($LogDir, "project.log")

# Refresh environment PATH from registry in case Node or npm was recently installed
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

$script:OberleafIconBase64 = "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"

# ------------------------------------------------------------------
# Fast Port Check Helper (TCP Socket in <20ms)
# ------------------------------------------------------------------
function Test-PortOpen([string]$HostName, [int]$Port, [int]$TimeoutMs = 80) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $async = $tcp.BeginConnect($HostName, $Port, $null, $null)
        $wait = $async.AsyncWaitHandle.WaitOne($TimeoutMs)
        if ($wait -and $tcp.Connected) {
            $tcp.EndConnect($async)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
    } catch {}
    return $false
}

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
        try {
            $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 }
            foreach ($conn in $conns) {
                Start-Process -FilePath "taskkill.exe" -ArgumentList @("/F", "/T", "/PID", [string]$conn.OwningProcess) -NoNewWindow -Wait -ErrorAction SilentlyContinue
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
# STEP 1: Warm Check (If already running, open in <30ms!)
# ------------------------------------------------------------------
$isWarmVite = Test-PortOpen "127.0.0.1" 5173 80
$isWarmServer = Test-PortOpen "127.0.0.1" 3001 80
if ($isWarmVite -and $isWarmServer) {
    Open-InChrome "http://127.0.0.1:5173"
    exit 0
}

# ------------------------------------------------------------------
# STEP 2: Instant Native Splash Screen
# ------------------------------------------------------------------
$splash = $null
$lblStatus = $null

if (-not $NoSplash) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        [System.Windows.Forms.Application]::EnableVisualStyles()

        $splash = New-Object System.Windows.Forms.Form
        $splash.FormBorderStyle = "None"
        $splash.StartPosition = "CenterScreen"
        $splash.Size = New-Object System.Drawing.Size(380, 142)
        $splash.BackColor = [System.Drawing.Color]::FromArgb(28, 25, 23) # Dark Archival Charcoal
        $splash.TopMost = $true
        $splash.ShowInTaskbar = $false

        $borderPanel = New-Object System.Windows.Forms.Panel
        $borderPanel.Dock = "Fill"
        $borderPanel.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
        $splash.Controls.Add($borderPanel)

        # Decode Logo
        try {
            [byte[]]$bytes = [Convert]::FromBase64String($script:OberleafIconBase64)
            $ms = New-Object System.IO.MemoryStream
            $ms.Write($bytes, 0, $bytes.Length)
            $ms.Position = 0
            $img = [System.Drawing.Image]::FromStream($ms)

            $picLogo = New-Object System.Windows.Forms.PictureBox
            $picLogo.Size = New-Object System.Drawing.Size(42, 42)
            $picLogo.Location = New-Object System.Drawing.Point(24, 20)
            $picLogo.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
            $picLogo.Image = $img
            $borderPanel.Controls.Add($picLogo)

            $bmp = New-Object System.Drawing.Bitmap($img)
            $splash.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
        } catch {}

        # Title: Clean "Oberleaf" (no subtitle)
        $lblTitle = New-Object System.Windows.Forms.Label
        $lblTitle.Text = "Oberleaf"
        $lblTitle.Font = New-Object System.Drawing.Font("Georgia", 20, [System.Drawing.FontStyle]::Bold)
        $lblTitle.ForeColor = [System.Drawing.Color]::FromArgb(245, 245, 244)
        $lblTitle.Location = New-Object System.Drawing.Point(76, 24)
        $lblTitle.AutoSize = $true
        $borderPanel.Controls.Add($lblTitle)

        # Status
        $lblStatus = New-Object System.Windows.Forms.Label
        $lblStatus.Text = "Initializing workspace..."
        $lblStatus.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
        $lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(52, 211, 153) # Emerald
        $lblStatus.Location = New-Object System.Drawing.Point(24, 76)
        $lblStatus.Size = New-Object System.Drawing.Size(330, 18)
        $borderPanel.Controls.Add($lblStatus)

        # Progress bar
        $pb = New-Object System.Windows.Forms.ProgressBar
        $pb.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
        $pb.MarqueeAnimationSpeed = 25
        $pb.Location = New-Object System.Drawing.Point(24, 100)
        $pb.Size = New-Object System.Drawing.Size(330, 8)
        $borderPanel.Controls.Add($pb)

        $splash.Show()
        [System.Windows.Forms.Application]::DoEvents()
    } catch {}
}

function Update-Splash([string]$StatusText) {
    if ($script:lblStatus) {
        try {
            $script:lblStatus.Text = $StatusText
            [System.Windows.Forms.Application]::DoEvents()
        } catch {}
    }
}

# ------------------------------------------------------------------
# STEP 3: Dependency Checks
# ------------------------------------------------------------------
Update-Splash "Checking Node.js & npm..."

$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) { $nodeCmd = Get-Command node -ErrorAction SilentlyContinue }
if (-not $nodeCmd) {
    if ($splash) { $splash.Close() }
    Show-ErrorDialog "Oberleaf - Node.js Not Found" (
        "Oberleaf needs Node.js to run, but it was not found on this computer.`n`n" +
        "Fix: Run 'Oberleaf-Setup.bat' (in the Oberleaf folder) to install everything automatically.`n`n" +
        "Or install Node.js manually from: https://nodejs.org"
    )
    exit 1
}

$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npmCmd) {
    if ($splash) { $splash.Close() }
    Show-ErrorDialog "Oberleaf - npm Not Found" (
        "npm was not found on this computer.`n`n" +
        "Fix: Run 'Oberleaf-Setup.bat' to install everything automatically."
    )
    exit 1
}

# Check node_modules
$nodeModulesPath = Join-Path $ProjectRoot "node_modules"
if (-not (Test-Path $nodeModulesPath)) {
    Update-Splash "First-time setup: installing dependencies (1-2 min)..."
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    "`n========================================`n[Oberleaf] npm install started at $timestamp`n========================================" |
        Out-File -FilePath $LogFile -Encoding utf8 -Append

    $npmInstall = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm install >> `"$LogFile`" 2>&1" `
        -WorkingDirectory $ProjectRoot -Wait -PassThru -WindowStyle Hidden
    
    if ($npmInstall.ExitCode -ne 0 -or -not (Test-Path $nodeModulesPath)) {
        if ($splash) { $splash.Close() }
        Show-ErrorDialog "Oberleaf - Dependency Install Failed" (
            "npm install failed. Oberleaf cannot start without its dependencies.`n`n" +
            "Check the log for errors: $LogFile"
        )
        exit 1
    }
}

# ------------------------------------------------------------------
# STEP 4: Clean Port Conflicts & Start Servers
# ------------------------------------------------------------------
Update-Splash "Checking local ports (:3001, :5173)..."
Stop-PortProcesses @(3001, 5173)

Update-Splash "Starting local TeX daemon & workspace..."
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"`n========================================`n[Oberleaf] Session started at $timestamp`n========================================" | Out-File -FilePath $LogFile -Encoding utf8 -Append

Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start >> `"$LogFile`" 2>&1" -WorkingDirectory $ProjectRoot -WindowStyle Hidden

# ------------------------------------------------------------------
# STEP 5: High-Speed Socket Polling Loop
# ------------------------------------------------------------------
$viteReady = $false
$serverReady = $false

for ($i = 0; $i -lt 300; $i++) {
    [System.Windows.Forms.Application]::DoEvents()
    
    if (-not $viteReady) {
        $viteReady = Test-PortOpen "127.0.0.1" 5173 40
    }
    if (-not $serverReady) {
        $serverReady = Test-PortOpen "127.0.0.1" 3001 40
    }

    if ($viteReady -and $serverReady) {
        break
    }

    if ($i -eq 15) {
        Update-Splash "Starting TeX daemon (:3001)..."
    } elseif ($i -eq 35) {
        Update-Splash "Starting workspace editor (:5173)..."
    }

    # Early crash detection
    if ($i -eq 40 -and (Test-Path $LogFile)) {
        $recentLog = Get-Content -Path $LogFile -Tail 20 -ErrorAction SilentlyContinue
        $crashSignals = $recentLog | Where-Object {
            $_ -match "Error:|EADDRINUSE|Cannot find module|SyntaxError|npm ERR!"
        }
        if ($crashSignals) {
            if ($splash) { $splash.Close() }
            $crashText = ($crashSignals | Select-Object -First 5) -join "`n"
            Show-ErrorDialog "Oberleaf - Startup Failed" (
                "Oberleaf crashed shortly after starting.`n`n" +
                "Error details:`n$crashText`n`n" +
                "Full log: $LogFile"
            )
            exit 1
        }
    }

    Start-Sleep -Milliseconds 60
}

# ------------------------------------------------------------------
# STEP 6: Readiness, Cache Pre-Warming & Instant Browser Launch
# ------------------------------------------------------------------
if ($viteReady -and $serverReady) {
    Update-Splash "Workspace ready! Opening browser..."
    
    # Pre-warm Vite in memory before opening Chrome for instant 0ms page render
    try {
        $wc = New-Object System.Net.WebClient
        $null = $wc.DownloadString("http://127.0.0.1:5173/")
        $wc.Dispose()
    } catch {}

    Open-InChrome "http://127.0.0.1:5173"
    Start-Sleep -Milliseconds 300
    if ($splash) { $splash.Close() }
    exit 0
} else {
    if ($splash) { $splash.Close() }
    $missingParts = @()
    if (-not $viteReady)   { $missingParts += "Frontend (port 5173)" }
    if (-not $serverReady) { $missingParts += "Backend (port 3001)" }
    $missingText = $missingParts -join " and "

    Show-ErrorDialog "Oberleaf - Could Not Start" (
        "$missingText did not start within expected time.`n`n" +
        "Check log file for details: $LogFile"
    )
    exit 1
}
