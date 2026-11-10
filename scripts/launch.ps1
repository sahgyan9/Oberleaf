[CmdletBinding()]
param(
    [switch]$NoSplash,
    # Opens nothing; prints "READY <url> <ms>" once the server answers. Used to time startup.
    [switch]$NoBrowser,
    [int]$Port = 3001
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
    # 1. Terminate any previous Oberleaf node/cmd processes associated with this workspace to free files & ports
    try {
        $escapedRoot = [regex]::Escape($ProjectRoot)
        $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
            ($_.Name -eq "node.exe" -or $_.Name -eq "cmd.exe") -and
            $_.CommandLine -and $_.CommandLine -match $escapedRoot
        }
        foreach ($proc in $procs) {
            Start-Process -FilePath "taskkill.exe" -ArgumentList @("/F", "/T", "/PID", [string]$proc.ProcessId) -NoNewWindow -Wait -ErrorAction SilentlyContinue
        }
    } catch {}

    # 2. Terminate any processes holding target ports
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

function Test-HttpOk([string]$Url, [int]$TimeoutMs = 400) {
    try {
        $req = [System.Net.HttpWebRequest]::Create($Url)
        $req.Timeout = $TimeoutMs
        $req.Proxy = $null
        $resp = $req.GetResponse()
        $ok = ([int]$resp.StatusCode -eq 200)
        $resp.Close()
        return $ok
    } catch {
        return $false
    }
}

function Write-StartupLog([string]$Text) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    "[Oberleaf] $stamp $Text" | Out-File -FilePath $LogFile -Encoding utf8 -Append
}

$AppUrl = "http://127.0.0.1:$Port"
$DevUrl = "http://127.0.0.1:5173"
$launchClock = [System.Diagnostics.Stopwatch]::StartNew()

function Open-App([string]$Url) {
    if ($NoBrowser) {
        Write-Output "READY $Url $($launchClock.ElapsedMilliseconds)"
        return
    }
    Open-InChrome $Url
}

# ------------------------------------------------------------------
# STEP 1: Already running? Open it and stop here.
# ------------------------------------------------------------------
if (Test-PortOpen "127.0.0.1" $Port 80) {
    # A server started by this launcher serves the app itself on $Port.
    if (Test-HttpOk "$AppUrl/" 800) {
        Open-App $AppUrl
        exit 0
    }
    # A development session (npm start) serves the page from Vite instead.
    if ((Test-PortOpen "127.0.0.1" 5173 80) -and (Test-HttpOk "$AppUrl/health" 800)) {
        Open-App $DevUrl
        exit 0
    }
}

# ------------------------------------------------------------------
# STEP 2: Splash. Same palette as the app: light by default, dark when
# Windows apps are set to dark (which is also what the app follows until
# the user picks a theme in it).
# ------------------------------------------------------------------
$splash = $null
$lblStatus = $null
$lblDetail = $null
$barFill = $null
$StepNames = @('Checking Node.js', 'Installing dependencies', 'Building the app', 'Starting the server', 'Opening the browser')

function Get-WindowsUsesDarkApps {
    try {
        $v = Get-ItemPropertyValue -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name 'AppsUseLightTheme' -ErrorAction Stop
        return ($v -eq 0)
    } catch {
        return $false
    }
}

if (-not $NoSplash) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        [System.Windows.Forms.Application]::EnableVisualStyles()

        if (Get-WindowsUsesDarkApps) {
            $cCanvas = [System.Drawing.Color]::FromArgb(28, 28, 31)   # #1C1C1F
            $cBorder = [System.Drawing.Color]::FromArgb(46, 46, 53)   # #2E2E35
            $cText   = [System.Drawing.Color]::FromArgb(245, 245, 244) # #F5F5F4
            $cMuted  = [System.Drawing.Color]::FromArgb(168, 162, 158) # #A8A29E
            $cTrack  = [System.Drawing.Color]::FromArgb(38, 38, 43)   # #26262B
            $cAccent = [System.Drawing.Color]::FromArgb(46, 160, 67)  # #2EA043
        } else {
            $cCanvas = [System.Drawing.Color]::FromArgb(255, 255, 255) # #FFFFFF
            $cBorder = [System.Drawing.Color]::FromArgb(231, 229, 223) # #E7E5DF
            $cText   = [System.Drawing.Color]::FromArgb(28, 25, 23)    # #1C1917
            $cMuted  = [System.Drawing.Color]::FromArgb(87, 83, 78)    # #57534E
            $cTrack  = [System.Drawing.Color]::FromArgb(244, 243, 239) # #F4F3EF
            $cAccent = [System.Drawing.Color]::FromArgb(27, 94, 32)    # #1B5E20
        }

        $splash = New-Object System.Windows.Forms.Form
        $splash.FormBorderStyle = "None"
        $splash.StartPosition = "CenterScreen"
        $splash.Size = New-Object System.Drawing.Size(380, 150)
        $splash.BackColor = $cBorder   # 1 px frame around the inner panel
        $splash.Padding = New-Object System.Windows.Forms.Padding(1)
        $splash.TopMost = $true
        $splash.ShowInTaskbar = $false
        $splash.Text = "Oberleaf"

        $panel = New-Object System.Windows.Forms.Panel
        $panel.Dock = "Fill"
        $panel.BackColor = $cCanvas
        $splash.Controls.Add($panel)

        try {
            # Read from disk rather than embedded as base64: a changed script is
            # scanned before its first run, and the 9 KB blob added about 2 s.
            $img = [System.Drawing.Image]::FromFile((Join-Path $ProjectRoot "assets\icon.png"))

            $picLogo = New-Object System.Windows.Forms.PictureBox
            $picLogo.Size = New-Object System.Drawing.Size(40, 40)
            $picLogo.Location = New-Object System.Drawing.Point(24, 22)
            $picLogo.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
            $picLogo.Image = $img
            $panel.Controls.Add($picLogo)

            $bmp = New-Object System.Drawing.Bitmap($img)
            $splash.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
        } catch {}

        $lblTitle = New-Object System.Windows.Forms.Label
        $lblTitle.Text = "Oberleaf"
        $lblTitle.Font = New-Object System.Drawing.Font("Georgia", 18, [System.Drawing.FontStyle]::Bold)
        $lblTitle.ForeColor = $cText
        $lblTitle.Location = New-Object System.Drawing.Point(74, 27)
        $lblTitle.AutoSize = $true
        $panel.Controls.Add($lblTitle)

        $lblStatus = New-Object System.Windows.Forms.Label
        $lblStatus.Text = "Starting"
        $lblStatus.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
        $lblStatus.ForeColor = $cText
        $lblStatus.Location = New-Object System.Drawing.Point(24, 80)
        $lblStatus.Size = New-Object System.Drawing.Size(330, 20)
        $panel.Controls.Add($lblStatus)

        $lblDetail = New-Object System.Windows.Forms.Label
        $lblDetail.Text = ""
        $lblDetail.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
        $lblDetail.ForeColor = $cMuted
        $lblDetail.Location = New-Object System.Drawing.Point(24, 100)
        $lblDetail.Size = New-Object System.Drawing.Size(330, 18)
        $panel.Controls.Add($lblDetail)

        # Determinate step bar: fills by completed steps, no marquee.
        $barTrack = New-Object System.Windows.Forms.Panel
        $barTrack.BackColor = $cTrack
        $barTrack.Dock = "Bottom"
        $barTrack.Height = 3
        $panel.Controls.Add($barTrack)

        $barFill = New-Object System.Windows.Forms.Panel
        $barFill.BackColor = $cAccent
        $barFill.Location = New-Object System.Drawing.Point(0, 0)
        $barFill.Size = New-Object System.Drawing.Size(0, 3)
        $barTrack.Controls.Add($barFill)

        $splash.Show()
        [System.Windows.Forms.Application]::DoEvents()
    } catch {}
}

# Shows the step that is running now. $Index is the step's position in
# $StepNames; the bar shows how many steps are behind it.
function Update-Splash([int]$Index, [string]$Detail = "") {
    $text = $StepNames[$Index]
    Write-StartupLog "Step: $text"
    if ($script:lblStatus) {
        try {
            $script:lblStatus.Text = $text
            $script:lblDetail.Text = $Detail
            $width = $script:barFill.Parent.ClientSize.Width
            $script:barFill.Width = [int]($width * $Index / $StepNames.Count)
            [System.Windows.Forms.Application]::DoEvents()
        } catch {}
    }
}

function Close-Splash {
    if ($script:splash) {
        try { $script:splash.Close() } catch {}
        $script:splash = $null
    }
}

# Waits for a process while keeping the splash responsive.
function Wait-Process-WithSplash($Proc) {
    while (-not $Proc.HasExited) {
        if ($script:splash) { [System.Windows.Forms.Application]::DoEvents() }
        Start-Sleep -Milliseconds 100
    }
    $Proc.WaitForExit()
}

# ------------------------------------------------------------------
# STEP 3: Node.js and dependencies
# ------------------------------------------------------------------
Update-Splash 0

$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) { $nodeCmd = Get-Command node -ErrorAction SilentlyContinue }
if (-not $nodeCmd) {
    Close-Splash
    Show-ErrorDialog "Oberleaf - Node.js Not Found" (
        "Oberleaf needs Node.js to run, but it was not found on this computer.`n`n" +
        "Fix: Run 'Oberleaf-Setup.bat' (in the Oberleaf folder) to install everything automatically.`n`n" +
        "Or install Node.js manually from: https://nodejs.org"
    )
    exit 1
}
$NodeExe = $nodeCmd.Source

$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npmCmd) {
    Close-Splash
    Show-ErrorDialog "Oberleaf - npm Not Found" (
        "npm was not found on this computer.`n`n" +
        "Fix: Run 'Oberleaf-Setup.bat' to install everything automatically."
    )
    exit 1
}

# Rotate the previous session log so stale errors do not bleed into this one.
if (Test-Path $LogFile) {
    try {
        Move-Item -Path $LogFile -Destination ([System.IO.Path]::Combine($LogDir, "project.prev.log")) -Force -ErrorAction SilentlyContinue
    } catch {}
}
"========================================`r`n[Oberleaf] Session started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`r`n========================================" |
    Out-File -FilePath $LogFile -Encoding utf8

$nodeModulesPath = Join-Path $ProjectRoot "node_modules"
if (-not (Test-Path $nodeModulesPath)) {
    Update-Splash 1 "First run only. This takes 1-2 minutes."
    $npmInstall = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm install >> `"$LogFile`" 2>&1" `
        -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden
    Wait-Process-WithSplash $npmInstall

    if ($npmInstall.ExitCode -ne 0 -or -not (Test-Path $nodeModulesPath)) {
        Close-Splash
        Show-ErrorDialog "Oberleaf - Dependency Install Failed" (
            "npm install failed. Oberleaf cannot start without its dependencies.`n`n" +
            "Check the log for errors: $LogFile"
        )
        exit 1
    }
}

# ------------------------------------------------------------------
# STEP 4: Build the app if the sources are newer than the last build.
# A git update (or any edit) gives the changed files a new timestamp, so
# this runs once after an update and is skipped on every other launch.
# ------------------------------------------------------------------
$DistIndex = Join-Path $ProjectRoot "dist\index.html"

function Test-BuildStale {
    if (-not (Test-Path $DistIndex)) { return $true }
    $builtAt = (Get-Item $DistIndex).LastWriteTimeUtc
    $inputs = @("index.html", "package-lock.json", "vite.config.ts", "tailwind.config.ts", "postcss.config.js") |
        ForEach-Object { Join-Path $ProjectRoot $_ } | Where-Object { Test-Path $_ } | ForEach-Object { Get-Item $_ }
    $inputs += Get-ChildItem -Path (Join-Path $ProjectRoot "src"), (Join-Path $ProjectRoot "public") -Recurse -File -ErrorAction SilentlyContinue
    foreach ($f in $inputs) {
        if ($f.LastWriteTimeUtc -gt $builtAt) { return $true }
    }
    return $false
}

$useBuild = $true
if (Test-BuildStale) {
    Update-Splash 2 "After an install or update only. Usually under a minute."
    Write-StartupLog "Client build is missing or older than the sources; running vite build."
    $viteJs = Join-Path $ProjectRoot "node_modules\vite\bin\vite.js"
    $build = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c `"`"$NodeExe`" `"$viteJs`" build >> `"$LogFile`" 2>&1`"" `
        -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden
    Wait-Process-WithSplash $build
    if ($build.ExitCode -ne 0 -or -not (Test-Path $DistIndex)) {
        # Still open the app: the development servers need no build.
        Write-StartupLog "vite build failed (exit $($build.ExitCode)); starting the development servers instead."
        $useBuild = $false
    }
}

# ------------------------------------------------------------------
# STEP 5: Free the ports only if something holds them, then start the server.
# (Querying Get-NetTCPConnection costs about 1.2 s, so it is skipped when
# the fast socket probe finds the ports free.)
# ------------------------------------------------------------------
Update-Splash 3
$portsToFree = @($Port)
if (-not $useBuild) { $portsToFree += 5173 }
if ($portsToFree | Where-Object { Test-PortOpen "127.0.0.1" $_ 60 }) {
    Write-StartupLog "Ports $($portsToFree -join ', ') are held by a stale process; stopping it."
    Stop-PortProcesses $portsToFree
}

$env:OBERLEAF_PORT = [string]$Port
if ($useBuild) {
    # One Node process: the API and the built page on the same port. The
    # absolute script path lets Stop-PortProcesses find it next time.
    $serverScript = Join-Path $ProjectRoot "server\index.ts"
    $serverProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c `"`"$NodeExe`" --import tsx `"$serverScript`" --serve-build >> `"$LogFile`" 2>&1`"" `
        -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
    $openUrl = $AppUrl
} else {
    $serverProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start >> `"$LogFile`" 2>&1" `
        -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
    $openUrl = $DevUrl
}

# ------------------------------------------------------------------
# STEP 6: Wait until the server answers, then open the browser.
# ------------------------------------------------------------------
$ready = $false
$deadline = [DateTime]::UtcNow.AddSeconds(90)
while ([DateTime]::UtcNow -lt $deadline) {
    if ($splash) { [System.Windows.Forms.Application]::DoEvents() }
    if ($useBuild) {
        $ready = (Test-PortOpen "127.0.0.1" $Port 40) -and (Test-HttpOk "$AppUrl/health" 1000)
    } else {
        $ready = (Test-PortOpen "127.0.0.1" $Port 40) -and (Test-PortOpen "127.0.0.1" 5173 40)
    }
    if ($ready) { break }
    if ($serverProc.HasExited) { break }
    Start-Sleep -Milliseconds 40
}

if ($ready) {
    Update-Splash 4
    Write-StartupLog "Server ready after $($launchClock.ElapsedMilliseconds) ms; opening $openUrl"
    Open-App $openUrl
    # The page shows its own startup screen; keep the splash up while the
    # browser window appears so there is no blank gap between the two.
    if ($splash) {
        $until = [DateTime]::UtcNow.AddMilliseconds(700)
        while ([DateTime]::UtcNow -lt $until) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 30 }
    }
    Close-Splash
    exit 0
}

Close-Splash

# Clean up partial or zombie processes on startup failure.
Stop-PortProcesses $portsToFree
if ($serverProc -and -not $serverProc.HasExited) {
    try { Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue } catch {}
}

# Extract genuine fatal errors from the current session log.
$crashText = ""
if (Test-Path $LogFile) {
    $recentLog = Get-Content -Path $LogFile -Tail 40 -ErrorAction SilentlyContinue
    $fatalLines = $recentLog | Where-Object {
        $_ -match "EADDRINUSE|Cannot find module|SyntaxError:|ReferenceError:|npm ERR!|ERR_MODULE_NOT_FOUND|Failed to resolve import|does not exist" -and
        $_ -notmatch "http proxy error|ECONNREFUSED"
    }
    if ($fatalLines) {
        $crashText = ($fatalLines | Select-Object -First 5) -join "`n"
    }
}

$dialogMessage = if ($crashText) {
    "Oberleaf encountered a startup error.`n`nError details:`n$crashText`n`nFull log: $LogFile"
} else {
    "The Oberleaf server did not start within 90 seconds.`n`nCheck the log file for details: $LogFile"
}
if ($NoBrowser) {
    Write-Output "FAILED $($launchClock.ElapsedMilliseconds)"
    Write-Output $dialogMessage
    exit 1
}
Show-ErrorDialog "Oberleaf - Startup Failed" $dialogMessage
exit 1
