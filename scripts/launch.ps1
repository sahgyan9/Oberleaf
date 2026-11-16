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

$SplashScript = {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()

    $W = 540
    $H = 300
    # Windows' "show animations" setting: off means no fade and no moving parts.
    $animate = [System.Windows.Forms.SystemInformation]::UIEffectsEnabled

    function New-Color([int]$r, [int]$g, [int]$b) { [System.Drawing.Color]::FromArgb($r, $g, $b) }
    if ($S.Dark) {
        $cCanvas = New-Color 28 28 31;    $cBorder = New-Color 46 46 53
        $cText   = New-Color 245 245 244; $cMuted  = New-Color 168 162 158
        $cTrack  = New-Color 38 38 43;    $cAccent = New-Color 46 160 67
        $cPage   = New-Color 20 20 22;    $cInk    = New-Color 87 83 78
    } else {
        $cCanvas = New-Color 255 255 255; $cBorder = New-Color 231 229 223
        $cText   = New-Color 28 25 23;    $cMuted  = New-Color 87 83 78
        $cTrack  = New-Color 244 243 239; $cAccent = New-Color 27 94 32
        $cPage   = New-Color 251 251 250; $cInk    = New-Color 214 211 205
    }

    $bCanvas = New-Object System.Drawing.SolidBrush $cCanvas
    $bText   = New-Object System.Drawing.SolidBrush $cText
    $bMuted  = New-Object System.Drawing.SolidBrush $cMuted
    $bTrack  = New-Object System.Drawing.SolidBrush $cTrack
    $bAccent = New-Object System.Drawing.SolidBrush $cAccent
    $bPage   = New-Object System.Drawing.SolidBrush $cPage
    $bInk    = New-Object System.Drawing.SolidBrush $cInk
    $bSheen  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(110, $cAccent))
    $pBorder = New-Object System.Drawing.Pen $cBorder, 1
    $pGlyph  = New-Object System.Drawing.Pen $cMuted, 1.6

    $fTitle  = New-Object System.Drawing.Font('Georgia', 24, [System.Drawing.FontStyle]::Bold)
    $fSub    = New-Object System.Drawing.Font('Segoe UI', 9.5)
    $fStatus = New-Object System.Drawing.Font('Segoe UI', 10.5)
    $fDetail = New-Object System.Drawing.Font('Segoe UI', 8.5)
    $fMono   = New-Object System.Drawing.Font('Consolas', 8)

    $noWrap = New-Object System.Drawing.StringFormat
    $noWrap.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
    $noWrap.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
    $rightAlign = New-Object System.Drawing.StringFormat
    $rightAlign.Alignment = [System.Drawing.StringAlignment]::Far
    $rightAlign.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap

    $logo = $null
    try { $logo = [System.Drawing.Image]::FromFile($S.IconPath) } catch {}

    $form = New-Object System.Windows.Forms.Form
    $form.FormBorderStyle = 'None'
    $form.StartPosition = 'CenterScreen'
    $form.ClientSize = New-Object System.Drawing.Size($W, $H)
    $form.BackColor = $cCanvas
    $form.Text = 'Oberleaf'
    # In the taskbar and not always-on-top: it can be minimized, restored and
    # covered by other windows while a first-run install or a build runs.
    $form.ShowInTaskbar = $true
    $form.TopMost = $false
    $form.MinimizeBox = $true
    if ($animate) { $form.Opacity = 0 }
    if ($logo) {
        try {
            $bmp = New-Object System.Drawing.Bitmap($logo)
            $form.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
        } catch {}
    }

    # A PictureBox is double-buffered, so one Paint handler draws the whole
    # splash without flicker.
    $canvas = New-Object System.Windows.Forms.PictureBox
    $canvas.Dock = 'Fill'
    $form.Controls.Add($canvas)

    $minRect = New-Object System.Drawing.Rectangle(($W - 42), 8, 32, 26)
    $tip = New-Object System.Windows.Forms.ToolTip

    # Mutable view state lives in one table so the event handlers can change it.
    $view = @{
        Shown = 0.0            # eased 0..1 progress
        Tick = 0
        LastStep = -1
        StepStart = [DateTime]::UtcNow
        HoverMin = $false
        Drag = $null
        TipShown = $false
    }

    # Line widths (fraction of the text block) of the page the splash "typesets"
    # as startup advances: a title, body text and one displayed equation.
    $pageLines = @(
        @{ W = 0.62; Center = $true;  Bold = $true },
        @{ W = 0.34; Center = $true;  Bold = $false },
        @{ W = 0.0 },
        @{ W = 1.0 }, @{ W = 1.0 }, @{ W = 0.94 }, @{ W = 0.55 },
        @{ W = 0.0 },
        @{ W = 0.46; Center = $true;  Bold = $true },
        @{ W = 0.0 },
        @{ W = 1.0 }, @{ W = 0.97 }, @{ W = 0.72 }
    )

    $canvas.Add_Paint({
        param($sender, $e)
        try {
            $g = $e.Graphics
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
            $g.Clear($cCanvas)

            # Brand
            if ($logo) { $g.DrawImage($logo, 36, 40, 52, 52) }
            $g.DrawString('Oberleaf', $fTitle, $bText, 98, 40)
            $sub = 'Local LaTeX studio'
            if ($S.Version) { $sub = "$sub  $([char]0x00B7)  version $($S.Version)" }
            $g.DrawString($sub, $fSub, $bMuted, 102, 80)

            # Minimize button
            if ($view.HoverMin) { $g.FillRectangle($bTrack, $minRect) }
            $my = $minRect.Y + 15
            $g.DrawLine($pGlyph, ($minRect.X + 11), $my, ($minRect.X + 21), $my)

            # The page being typeset
            $px = 384; $py = 54; $pw = 112; $ph = 146
            $g.FillRectangle($bPage, $px, $py, $pw, $ph)
            $g.DrawRectangle($pBorder, $px, $py, $pw, $ph)
            $tx = $px + 14; $tw = $pw - 28; $ty = $py + 16
            $count = $pageLines.Count
            $written = [double]$view.Shown * $count
            $caretX = -1; $caretY = -1
            for ($i = 0; $i -lt $count; $i++) {
                $line = $pageLines[$i]
                $frac = [Math]::Max(0.0, [Math]::Min(1.0, $written - $i))
                if ($frac -le 0) { break }
                $y = $ty + $i * 9
                if ($line.W -le 0) { continue }
                $full = [int]($tw * $line.W)
                $lw = [int]($full * $frac)
                $lx = $tx
                if ($line.Center) { $lx = $tx + [int](($tw - $full) / 2) }
                $lh = 2
                $brush = $bInk
                if ($line.Bold) { $lh = 3; $brush = $bMuted }
                if ($lw -gt 0) { $g.FillRectangle($brush, $lx, $y, $lw, $lh) }
                if ($frac -lt 1) { $caretX = $lx + $lw + 1; $caretY = $y - 3 }
            }
            # Caret at the writing position; it blinks while a step is running.
            if ($caretX -ge 0 -and ((-not $animate) -or (([int]($view.Tick / 8)) % 2 -eq 0))) {
                $g.FillRectangle($bAccent, $caretX, $caretY, 2, 8)
            }

            # Status
            $step = [int]$S.Step
            $total = [int]$S.StepCount
            $name = 'Ready'
            if ($step -lt $total) { $name = $S.StepNames[$step] }
            $g.DrawString($name, $fStatus, $bText, 34, 192)
            if ($step -lt $total) {
                $counter = "Step $($step + 1) of $total"
                $elapsed = [int]([DateTime]::UtcNow - $view.StepStart).TotalSeconds
                if ($elapsed -ge 3) { $counter = "$counter  $([char]0x00B7)  $elapsed s" }
                $g.DrawString($counter, $fDetail, $bMuted, (New-Object System.Drawing.RectangleF(204, 196, 160, 18)), $rightAlign)
            }
            if ($S.Detail) {
                $g.DrawString([string]$S.Detail, $fDetail, $bMuted, (New-Object System.Drawing.RectangleF(36, 216, 330, 18)), $noWrap)
            }
            if ($S.Activity) {
                $g.DrawString([string]$S.Activity, $fMono, $bMuted, (New-Object System.Drawing.RectangleF(36, 240, ($W - 72), 16)), $noWrap)
            }

            # Progress: completed steps are solid. The step that is running is
            # not a made-up percentage; a band sweeps across its share of the bar.
            $barY = $H - 5
            $g.FillRectangle($bTrack, 0, $barY, $W, 5)
            $fill = [int]($W * [double]$view.Shown)
            if ($fill -gt 0) { $g.FillRectangle($bAccent, 0, $barY, $fill, 5) }
            if ($animate -and $step -lt $total) {
                $segEnd = [int]($W * ($step + 1) / $total)
                $segW = $segEnd - $fill
                if ($segW -gt 24) {
                    $bandW = [Math]::Min(56, [int]($segW / 2))
                    $period = 44
                    $pos = (($view.Tick % $period) / [double]$period) * ($segW + $bandW) - $bandW
                    $bx = $fill + [int]$pos
                    $bx0 = [Math]::Max($fill, $bx)
                    $bx1 = [Math]::Min($segEnd, $bx + $bandW)
                    if ($bx1 -gt $bx0) { $g.FillRectangle($bSheen, $bx0, $barY, ($bx1 - $bx0), 5) }
                }
            }

            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
            $g.DrawRectangle($pBorder, 0, 0, ($W - 1), ($H - 1))
        } catch {}
    })

    # The window has no title bar: drag it by its body, minimize with the button.
    $canvas.Add_MouseDown({
        param($sender, $e)
        if ($e.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
        if ($minRect.Contains($e.Location)) {
            $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
            return
        }
        $view.Drag = @{ Mouse = [System.Windows.Forms.Cursor]::Position; Origin = $form.Location }
    })
    $canvas.Add_MouseMove({
        param($sender, $e)
        $hover = $minRect.Contains($e.Location)
        if ($hover -ne $view.HoverMin) {
            $view.HoverMin = $hover
            if ($hover) { $tip.Show('Minimize', $canvas, ($minRect.X - 20), ($minRect.Bottom + 4), 1500) } else { $tip.Hide($canvas) }
            $canvas.Invalidate()
        }
        if ($view.Drag) {
            $now = [System.Windows.Forms.Cursor]::Position
            $form.Location = New-Object System.Drawing.Point(
                ($view.Drag.Origin.X + $now.X - $view.Drag.Mouse.X),
                ($view.Drag.Origin.Y + $now.Y - $view.Drag.Mouse.Y))
        }
    })
    $canvas.Add_MouseUp({ $view.Drag = $null })
    $canvas.Add_MouseLeave({
        if ($view.HoverMin) { $view.HoverMin = $false; $tip.Hide($canvas); $canvas.Invalidate() }
    })

    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 33
    $timer.Add_Tick({
        try {
            if ($S.Close) {
                if ($animate -and $form.Opacity -gt 0.15 -and $form.WindowState -ne 'Minimized') {
                    $form.Opacity = [Math]::Max(0, $form.Opacity - 0.2)
                } else {
                    $timer.Stop()
                    $form.Close()
                }
                return
            }
            if ($animate -and $form.Opacity -lt 1) { $form.Opacity = [Math]::Min(1, $form.Opacity + 0.14) }

            $step = [int]$S.Step
            if ($step -ne $view.LastStep) {
                $view.LastStep = $step
                $view.StepStart = [DateTime]::UtcNow
            }
            $target = [Math]::Min(1.0, $step / [double]$S.StepCount)
            $delta = $target - $view.Shown
            if ((-not $animate) -or [Math]::Abs($delta) -lt 0.002) { $view.Shown = $target } else { $view.Shown += $delta * 0.14 }
            $view.Tick++

            # Nothing to draw while minimized.
            if ($form.WindowState -ne 'Minimized') { $canvas.Invalidate() }
        } catch {}
    })

    $form.Add_Shown({
        # Raise it once so it does not open behind the window the user launched
        # from, then let go: it must not stay above their other work.
        $form.TopMost = $true
        $form.Activate()
        $form.TopMost = $false
        $S.Ready = $true
    })
    $form.Add_FormClosed({ $timer.Stop() })
    $timer.Start()
    try {
        [System.Windows.Forms.Application]::Run($form)
    } finally {
        $S.Closed = $true
    }
}

if (-not $NoSplash) {
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
        [void]$splashShell.AddScript($SplashScript.ToString())
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
    Update-Splash 4 "Oberleaf is already running."
    Open-App $Url
    if ($script:splashState) {
        Start-Sleep -Milliseconds 900
        Update-Splash $StepNames.Count "Oberleaf is already running."
        Start-Sleep -Milliseconds 600
    }
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
