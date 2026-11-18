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
# STEP 1: Splash. Same palette as the app: light by default, dark when
# Windows apps are set to dark (which is also what the app follows until
# the user picks a theme in it).
#
# The window runs on its own thread with its own message loop. The launcher
# below blocks for seconds at a time (process queries, HTTP probes), and a
# splash pumped from this thread froze during exactly those waits. The two
# sides share one synchronized hashtable: the launcher writes the step and
# detail, the splash reads them on a timer and draws.
# ------------------------------------------------------------------
$splashState = $null
$splashShell = $null
$StepNames = @('Checking Node.js', 'Installing dependencies', 'Building the app', 'Starting the server', 'Opening the browser')

function Get-WindowsUsesDarkApps {
    try {
        $v = Get-ItemPropertyValue -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name 'AppsUseLightTheme' -ErrorAction Stop
        return ($v -eq 0)
    } catch {
        return $false
    }
}

function Get-AppVersion {
    try {
        $pkg = Get-Content -Path (Join-Path $ProjectRoot 'package.json') -Raw -ErrorAction Stop
        if ($pkg -match '"version"\s*:\s*"([^"]+)"') { return $Matches[1] }
    } catch {}
    return ''
}

# The splash window itself lives in scripts\splash.ps1 (render its frames with
# scripts\splash-render.ps1 to check a change without launching).
$SplashPath = Join-Path $PSScriptRoot "splash.ps1"

if (-not $NoSplash -and (Test-Path $SplashPath)) {
    try {
        $splashState = [hashtable]::Synchronized(@{
            Step      = 0
            StepCount = $StepNames.Count
            StepNames = $StepNames
            Detail    = ''
            Activity  = ''
            Close     = $false
            Closed    = $false
            Ready     = $false
            Dark      = (Get-WindowsUsesDarkApps)
            IconPath  = (Join-Path $ProjectRoot 'assets\icon.png')
            Version   = (Get-AppVersion)
        })
        $splashRunspace = [runspacefactory]::CreateRunspace()
        $splashRunspace.ApartmentState = 'STA'
        $splashRunspace.ThreadOptions = 'ReuseThread'
        $splashRunspace.Open()
        $splashRunspace.SessionStateProxy.SetVariable('S', $splashState)
        $splashShell = [powershell]::Create()
        $splashShell.Runspace = $splashRunspace
        [void]$splashShell.AddScript((Get-Content -Raw -Path $SplashPath))
        [void]$splashShell.BeginInvoke()
    } catch {
        $splashState = $null
        $splashShell = $null
    }
}

# Shows the step that is running now. $Index is the step's position in
# $StepNames; the bar shows how many steps are behind it.
function Update-Splash([int]$Index, [string]$Detail = "") {
    if ($Index -lt $StepNames.Count) { Write-StartupLog "Step: $($StepNames[$Index])" }
    if ($script:splashState) {
        $script:splashState.Detail = $Detail
        $script:splashState.Activity = ''
        $script:splashState.Step = $Index
    }
}

# One line under the status saying what the running step is doing right now.
function Set-SplashActivity([string]$Text) {
    if ($script:splashState) { $script:splashState.Activity = $Text }
}

function Close-Splash {
    if ($script:splashState) {
        $script:splashState.Close = $true
        # Let the fade-out finish; never wait long on a window that is going away.
        $until = [DateTime]::UtcNow.AddMilliseconds(600)
        while (-not $script:splashState.Closed -and [DateTime]::UtcNow -lt $until) { Start-Sleep -Milliseconds 20 }
        $script:splashState = $null
    }
    if ($script:splashShell) {
        try { $script:splashShell.Runspace.Dispose() } catch {}
        try { $script:splashShell.Dispose() } catch {}
        $script:splashShell = $null
    }
}

# The newest line of this session's log, cleaned up for one line of the splash.
function Get-LogActivity {
    try {
        $last = Get-Content -Path $LogFile -Tail 3 -ErrorAction Stop | Where-Object { $_ -and $_.Trim() } | Select-Object -Last 1
        if (-not $last) { return '' }
        # Drop ANSI colour codes and anything the splash font cannot show.
        $clean = ($last -replace "$([char]27)\[[0-9;]*[A-Za-z]", '') -replace '[^\x20-\x7E]', ''
        return $clean.Trim()
    } catch {
        return ''
    }
}

# Waits for a process, showing what it last wrote to the log.
function Wait-Process-WithSplash($Proc) {
    $nextRead = [DateTime]::UtcNow
    while (-not $Proc.HasExited) {
        if ($script:splashState -and [DateTime]::UtcNow -ge $nextRead) {
            Set-SplashActivity (Get-LogActivity)
            $nextRead = [DateTime]::UtcNow.AddMilliseconds(400)
        }
        Start-Sleep -Milliseconds 100
    }
    $Proc.WaitForExit()
    Set-SplashActivity ''
}

# ------------------------------------------------------------------
# STEP 2: Already running? Open it and stop here.
# Closing the browser tab leaves the server running, so this is the usual
# path after the first launch of a session. It comes after the splash is up
# so every launch shows it, not only a cold start; the only step left is
# opening the browser, and that is what the splash says.
# ------------------------------------------------------------------
function Open-RunningApp([string]$Url) {
    # Splash first, browser last: opening the browser first put it over the
    # splash at once, so on this (the usual) path the splash was never seen.
    Update-Splash 4 "Oberleaf is already running."
    if ($script:splashState) {
        $until = [DateTime]::UtcNow.AddMilliseconds(1500)
        while (-not $script:splashState.Ready -and [DateTime]::UtcNow -lt $until) { Start-Sleep -Milliseconds 20 }
        Start-Sleep -Milliseconds 900
        Update-Splash $StepNames.Count "Oberleaf is already running."
        Start-Sleep -Milliseconds 400
    }
    Open-App $Url
    Close-Splash
    exit 0
}

if (Test-PortOpen "127.0.0.1" $Port 80) {
    # A server started by this launcher serves the app itself on $Port.
    if (Test-HttpOk "$AppUrl/" 800) { Open-RunningApp $AppUrl }
    # A development session (npm start) serves the page from Vite instead.
    if ((Test-PortOpen "127.0.0.1" 5173 80) -and (Test-HttpOk "$AppUrl/health" 800)) { Open-RunningApp $DevUrl }
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
    # browser window appears so there is no blank gap between the two. Marking
    # every step done lets the bar reach the end before the window fades.
    if ($splashState) {
        Update-Splash $StepNames.Count
        Start-Sleep -Milliseconds 700
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
