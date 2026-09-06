# Oberleaf - Automated 1-Click Bootstrap Installer
# Provisions Git, Node.js LTS and MiKTeX when they are missing, then clones
# and starts Oberleaf.
#
# Exit codes: 0 success, 2 a required dependency could not be installed,
# 3 the repository could not be fetched. Oberleaf-Setup.bat reports these
# back to the user, so keep them meaningful.
#
# ENCODING - do not remove the UTF-8 byte order mark, and keep this file ASCII.
# Windows PowerShell 5.1, which is what ships with Windows 10 and 11, reads a
# BOM-less .ps1 as Windows-1252. An em dash then decodes to three characters,
# one of which is a double quote, and that stray quote swallows the rest of the
# script as a string literal. This installer shipped with em dashes in its
# banner for exactly that reason and every student who ran it got a wall of
# parse errors instead of an install.

$ErrorActionPreference = "Continue"
$ProgressPreference    = "SilentlyContinue"

$LogFile = Join-Path $env:TEMP "oberleaf-install.log"
try { Start-Transcript -Path $LogFile -Force | Out-Null } catch {}

$Failures = New-Object System.Collections.Generic.List[string]

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         Oberleaf - Scholarly TeX Studio Setup            " -ForegroundColor Green
Write-Host "    Fast, Local-First LaTeX Without Cloud Timeouts        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# Refresh this process's PATH from the registry. Needed after every winget
# install, because the installer updates the registry but not a shell that is
# already running.
function Update-SessionEnvironment {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path    = "$machinePath;$userPath"
}

function Test-IsAdmin {
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
            [Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch { return $false }
}

function Get-Tool {
    param([string[]]$Names)
    foreach ($n in $Names) {
        $c = Get-Command $n -ErrorAction SilentlyContinue
        if ($c) { return $c }
    }
    return $null
}

$IsElevated = Test-IsAdmin

# winget defaults to the machine scope, which needs elevation. When the student
# is not an admin that used to fail while the rest of setup carried on as if
# everything had installed, so try the user scope first and fall back to the
# elevating path only if the package has no user-scope build.
function Install-Package {
    param([string]$Id)

    $scopes = if ($IsElevated) { @($null) } else { @("user", $null) }
    foreach ($scope in $scopes) {
        $wingetArgs = @("install", "--id", $Id, "-e", "--source", "winget",
                        "--accept-source-agreements", "--accept-package-agreements",
                        "--silent", "--disable-interactivity")
        if ($scope) { $wingetArgs += @("--scope", $scope) }

        Write-Host ("   winget " + ($wingetArgs -join " ")) -ForegroundColor DarkGray
        & winget.exe @wingetArgs 2>&1 | Out-String | Write-Host
        Update-SessionEnvironment

        # winget returns 0 both for a fresh install and for "already installed",
        # and a pile of different codes otherwise. The answer that actually
        # matters is whether the command is on PATH afterwards, which the caller
        # re-checks; here just stop retrying once winget is happy.
        if ($LASTEXITCODE -eq 0) { return $true }
    }
    return $false
}

if (-not $IsElevated) {
    Write-Host "Running without administrator rights - packages will be installed" -ForegroundColor Yellow
    Write-Host "for your user account. If an install fails, close this window, then" -ForegroundColor Yellow
    Write-Host "right-click Oberleaf-Setup.bat and choose 'Run as administrator'." -ForegroundColor Yellow
    Write-Host ""
}

# Anonymous telemetry ping (non-blocking, best-effort)
try {
    $telemetryBody = @{
        p_app_name      = "oberleaf"
        p_download_type = "powershell_installer"
        p_platform      = "windows"
    } | ConvertTo-Json
    $telemetryHeaders = @{
        "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1YXBka3JnY2Jxcmh2c2F5dnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4ODU5NzMsImV4cCI6MjA1NjQ2MTk3M30.V5jQfO-__C1gSbX33c2M-iBouFVWbO1bSPnRlc9iw1s"
    }
    Invoke-RestMethod -Uri "https://ruapdkrgcbqrhvsayvpf.supabase.co/rest/v1/rpc/record_app_download" -Method Post -Body $telemetryBody -ContentType "application/json" -Headers $telemetryHeaders -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
} catch {}

# -------------------------------------------------------------
# Where Oberleaf goes
# -------------------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRootCandidate = Split-Path -Parent $ScriptDir

if ((Test-Path (Join-Path $RepoRootCandidate "package.json")) -and (Test-Path (Join-Path $RepoRootCandidate "server"))) {
    # Running from inside an existing Oberleaf clone
    $InstallDir = $RepoRootCandidate
} else {
    # Running from the standalone downloader (e.g. the Downloads folder)
    $InstallDir = [System.IO.Path]::Combine($env:LOCALAPPDATA, "Oberleaf")
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
}

Write-Host "Target Directory: $InstallDir" -ForegroundColor Gray
Write-Host "Setup log:        $LogFile" -ForegroundColor Gray
Write-Host ""

# -------------------------------------------------------------
# Step 1: Windows Package Manager (winget)
# -------------------------------------------------------------
$hasWinget = [bool](Get-Command winget.exe -ErrorAction SilentlyContinue)
if (-not $hasWinget) {
    Write-Host "[1/5] Windows Package Manager (winget) was not found." -ForegroundColor Yellow
    Write-Host "      Install 'App Installer' from the Microsoft Store, then run setup again:" -ForegroundColor Yellow
    Write-Host "      https://apps.microsoft.com/detail/9nblggh4nns1" -ForegroundColor Yellow
} else {
    Write-Host "[1/5] winget detected." -ForegroundColor Green
}

# -------------------------------------------------------------
# Step 2: Git
# -------------------------------------------------------------
Update-SessionEnvironment
$gitCmd = Get-Tool @("git.exe", "git")
if (-not $gitCmd) {
    Write-Host "[2/5] Installing Git..." -ForegroundColor Yellow
    if ($hasWinget) { Install-Package -Id "Git.Git" | Out-Null }
    $gitCmd = Get-Tool @("git.exe", "git")
    if (-not $gitCmd) {
        # winget drops Git in one of these even when PATH has not caught up.
        foreach ($p in @("$env:ProgramFiles\Git\cmd\git.exe",
                         "${env:ProgramFiles(x86)}\Git\cmd\git.exe",
                         "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe")) {
            if (Test-Path $p) { $env:Path = (Split-Path $p) + ";" + $env:Path; break }
        }
        $gitCmd = Get-Tool @("git.exe", "git")
    }
}
if ($gitCmd) {
    Write-Host "[2/5] Git ready: $($gitCmd.Source)" -ForegroundColor Green
} else {
    Write-Host "[2/5] Git could not be installed automatically." -ForegroundColor Red
    Write-Host "      Install it from https://git-scm.com and run this setup again." -ForegroundColor Red
    $Failures.Add("Git")
}

# -------------------------------------------------------------
# Step 3: Node.js LTS
# -------------------------------------------------------------
Update-SessionEnvironment
$nodeCmd = Get-Tool @("node.exe", "node")
if (-not $nodeCmd) {
    Write-Host "[3/5] Installing Node.js LTS..." -ForegroundColor Yellow
    if ($hasWinget) { Install-Package -Id "OpenJS.NodeJS.LTS" | Out-Null }
    $nodeCmd = Get-Tool @("node.exe", "node")
    if (-not $nodeCmd) {
        foreach ($p in @("$env:ProgramFiles\nodejs\node.exe",
                         "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
            if (Test-Path $p) { $env:Path = (Split-Path $p) + ";" + $env:Path; break }
        }
        $nodeCmd = Get-Tool @("node.exe", "node")
    }
}
if ($nodeCmd) {
    Write-Host "[3/5] Node.js ready: $($nodeCmd.Source)" -ForegroundColor Green
} else {
    Write-Host "[3/5] Node.js could not be installed automatically." -ForegroundColor Red
    Write-Host "      Install the LTS build from https://nodejs.org and run setup again." -ForegroundColor Red
    $Failures.Add("Node.js")
}

# -------------------------------------------------------------
# Step 4: LaTeX (MiKTeX)
# -------------------------------------------------------------
Update-SessionEnvironment
$latexCmd = Get-Tool @("pdflatex.exe", "latexmk.exe", "pdflatex")
if (-not $latexCmd) {
    Write-Host "[4/5] No LaTeX compiler found. Installing MiKTeX - this is the slow part..." -ForegroundColor Cyan
    if ($hasWinget) { Install-Package -Id "MiKTeX.MiKTeX" | Out-Null }
    $latexCmd = Get-Tool @("pdflatex.exe", "latexmk.exe", "pdflatex")
}
if ($latexCmd) {
    Write-Host "[4/5] LaTeX ready: $($latexCmd.Source)" -ForegroundColor Green
} else {
    # Deliberately not a failure: MiKTeX very often needs one sign-out before
    # it lands on PATH, and Oberleaf can still install and open without it.
    Write-Host "[4/5] MiKTeX is not on PATH yet." -ForegroundColor Yellow
    Write-Host "      That is usually just a pending restart - Oberleaf's Dependency" -ForegroundColor Yellow
    Write-Host "      Doctor will finish configuring it on first launch." -ForegroundColor Yellow
}

# -------------------------------------------------------------
# Teach MiKTeX to install packages without asking
# -------------------------------------------------------------
# A basic MiKTeX ships with very few packages, so the first real document asks
# for titlesec, geometry, hyperref and a dozen more. Out of the box MiKTeX
# answers that by opening a modal "Package Installation" dialog per package.
# Oberleaf compiles by spawning pdflatex from the local server, so nobody is
# looking at that window: the compile just sits there until the ten minute
# timeout kills it, which reads to the user as a hang. -interaction=nonstopmode
# does not help, because this is MiKTeX's package manager rather than TeX
# waiting on input. Setting AutoInstall=1 makes it fetch quietly instead.
Update-SessionEnvironment
$initexmf = Get-Tool @("initexmf.exe", "initexmf")
if ($initexmf) {
    Write-Host "      Configuring MiKTeX to install missing packages automatically..." -ForegroundColor Cyan
    & $initexmf.Source --set-config-value="[MPM]AutoInstall=1" 2>&1 | Out-Null
    if ($IsElevated) {
        # A machine-wide MiKTeX keeps a separate admin configuration, and the
        # user-scope value above does not reach it.
        & $initexmf.Source --admin --set-config-value="[MPM]AutoInstall=1" 2>&1 | Out-Null
    }
    $verify = (& $initexmf.Source --show-config-value="[MPM]AutoInstall" 2>&1 | Out-String).Trim()
    if ($verify -eq "1") {
        Write-Host "      MiKTeX will now install packages silently." -ForegroundColor Green
    } else {
        Write-Host "      Could not confirm the setting (got '$verify')." -ForegroundColor Yellow
        Write-Host "      If a 'Package Installation' dialog appears while compiling, tick" -ForegroundColor Yellow
        Write-Host "      Install and untick 'Always show this dialog'." -ForegroundColor Yellow
    }
} elseif ($latexCmd) {
    Write-Host "      initexmf not found - if a 'Package Installation' dialog appears" -ForegroundColor Yellow
    Write-Host "      while compiling, click Install and untick 'Always show this dialog'." -ForegroundColor Yellow
}

# -------------------------------------------------------------
# Step 5: Fetch Oberleaf
# -------------------------------------------------------------
Write-Host "[5/5] Syncing the Oberleaf codebase..." -ForegroundColor Cyan

$RepoUrl = "https://github.com/sahgyan9/Oberleaf.git"
$repoReady = $false

if (Test-Path (Join-Path $InstallDir ".git")) {
    Set-Location $InstallDir
    & git pull origin main
    $repoReady = $true
} elseif (Test-Path (Join-Path $InstallDir "package.json")) {
    Set-Location $InstallDir
    $repoReady = $true
} elseif (-not $gitCmd) {
    Write-Host "      Skipped - Git is not available." -ForegroundColor Red
    $Failures.Add("repository download")
} else {
    # git clone refuses a destination that already contains files, and the
    # directory was created a few lines above, so clone into a scratch path and
    # move the contents across when the target is not empty.
    $existing = @(Get-ChildItem -LiteralPath $InstallDir -Force -ErrorAction SilentlyContinue)
    if ($existing.Count -gt 0) {
        $staging = Join-Path $env:TEMP ("oberleaf_clone_" + [guid]::NewGuid().ToString("N").Substring(0, 8))
        & git clone --depth 1 $RepoUrl $staging
        if (Test-Path (Join-Path $staging ".git")) {
            Get-ChildItem -LiteralPath $staging -Force |
                Move-Item -Destination $InstallDir -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
            $repoReady = Test-Path (Join-Path $InstallDir "package.json")
        }
    } else {
        & git clone --depth 1 $RepoUrl $InstallDir
        $repoReady = Test-Path (Join-Path $InstallDir ".git")
    }

    if ($repoReady) {
        Set-Location $InstallDir
    } else {
        Write-Host "      Could not download Oberleaf from GitHub." -ForegroundColor Red
        $Failures.Add("repository download")
    }
}

# -------------------------------------------------------------
# Node packages
# -------------------------------------------------------------
if ($repoReady -and $nodeCmd) {
    Write-Host ""
    Write-Host "Installing Oberleaf dependencies (npm install)..." -ForegroundColor Cyan
    $npm = Get-Tool @("npm.cmd", "npm")
    if ($npm) {
        & $npm.Source install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "npm install reported errors - see $LogFile" -ForegroundColor Yellow
            $Failures.Add("npm install")
        }
    } else {
        Write-Host "npm was not found on PATH. Restart Windows and run this setup again." -ForegroundColor Yellow
        $Failures.Add("npm")
    }
}

# -------------------------------------------------------------
# Warm the LaTeX package cache
# -------------------------------------------------------------
# AutoInstall stops MiKTeX interrupting a compile, but the download still
# happens during that compile, so the first document a student opens sits there
# for a minute or two fetching a dozen packages. Compiling a throwaway file
# that loads everything the shipped templates and seeded projects use pulls all
# of it now, while they are already waiting on an installer.
#
# The probes below are generated from server/projects.ts - one document class
# per probe, loading the packages used with that class. They cannot be read
# from there at runtime, because this script is downloaded and run before the
# repository exists, so the list is baked in and regenerated by
# scripts/generate-latex-probes.mjs. npm run build verifies it is current.
#
# Deliberately best-effort and last: by this point Oberleaf is installed and
# usable, so closing this window only means falling back to on-demand fetching.
# Set OBERLEAF_SKIP_PACKAGE_WARMUP=1 to skip it.
function Initialize-LatexPackages {
    # BEGIN GENERATED PROBES
    # Generated from server/projects.ts. Do not edit by hand - run
    #   npm run generate:latex-probes
    # Class options are dropped on purpose: which package MiKTeX has to
    # download does not depend on them, and templates disagree about them.
    $probes = [ordered]@{
        "probe-article.tex" = @(
            '\documentclass{article}',
            '\usepackage{amsmath}',
            '\usepackage{amssymb}',
            '\usepackage{booktabs}',
            '\usepackage{geometry}',
            '\usepackage{graphicx}',
            '\usepackage{hyperref}',
            '\usepackage{inputenc}',
            '\usepackage{titlesec}',
            '\begin{document}',
            'Oberleaf package warm-up. $E = mc^2$',
            '\end{document}'
        )
        "probe-ieeetran.tex" = @(
            '\documentclass{IEEEtran}',
            '\usepackage{amsfonts}',
            '\usepackage{amsmath}',
            '\usepackage{amssymb}',
            '\usepackage{graphicx}',
            '\usepackage{textcomp}',
            '\usepackage{xcolor}',
            '\begin{document}',
            'Oberleaf package warm-up. $E = mc^2$',
            '\end{document}'
        )
        "probe-report.tex" = @(
            '\documentclass{report}',
            '\usepackage{amsmath}',
            '\usepackage{graphicx}',
            '\usepackage{hyperref}',
            '\usepackage{inputenc}',
            '\begin{document}',
            'Oberleaf package warm-up. $E = mc^2$',
            '\end{document}'
        )
    }
    # END GENERATED PROBES

    $work = Join-Path $env:TEMP ("oberleaf_warmup_" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Path $work -Force | Out-Null

    $warmupLog = Join-Path $env:TEMP "oberleaf-warmup.log"

    try {
        foreach ($name in $probes.Keys) {
            $file = Join-Path $work $name
            Set-Content -LiteralPath $file -Value $probes[$name] -Encoding ASCII

            Write-Host "      $name..." -ForegroundColor DarkGray

            # pdflatex is extremely chatty and none of it is the user's problem,
            # so it goes to a log rather than over the setup output.
            $out = Join-Path $work "$name.out"
            $err = Join-Path $work "$name.err"
            $p = Start-Process -FilePath "pdflatex.exe" `
                -ArgumentList @("-interaction=nonstopmode", "-halt-on-error", $name) `
                -WorkingDirectory $work -NoNewWindow -PassThru `
                -RedirectStandardOutput $out -RedirectStandardError $err

            # A bounded wait: a warm-up must never be the reason setup hangs.
            if (-not $p.WaitForExit(300000)) {
                try { $p.Kill() } catch {}
                Copy-Item $out $warmupLog -Force -ErrorAction SilentlyContinue
                Write-Host "      Timed out on $name. Remaining packages install on" -ForegroundColor Yellow
                Write-Host "      first use instead. Log: $warmupLog" -ForegroundColor Yellow
                return
            }

            # Whether a PDF came out, rather than $p.ExitCode: a process from
            # Start-Process -PassThru does not reliably carry an exit code once
            # the timeout overload of WaitForExit has been used, and "did it
            # actually produce a document" is the thing we care about anyway.
            $pdf = Join-Path $work ([IO.Path]::ChangeExtension($name, ".pdf"))
            if (-not (Test-Path $pdf)) {
                Copy-Item $out $warmupLog -Force -ErrorAction SilentlyContinue
                Write-Host "      $name did not produce a PDF." -ForegroundColor Yellow
                Write-Host "      Not fatal - packages install on first use. Log: $warmupLog" -ForegroundColor Yellow
                return
            }
        }
        Write-Host "      Package cache ready - the first compile will be fast." -ForegroundColor Green
    } finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($latexCmd -and -not $env:OBERLEAF_SKIP_PACKAGE_WARMUP) {
    Write-Host ""
    Write-Host "Pre-downloading the LaTeX packages the templates need..." -ForegroundColor Cyan
    Write-Host "      This is the last step and takes a few minutes. Oberleaf already" -ForegroundColor Gray
    Write-Host "      works - closing this window just means packages arrive later." -ForegroundColor Gray
    try { Initialize-LatexPackages } catch {
        Write-Host "      Warm-up skipped: $_" -ForegroundColor Yellow
    }
}

# -------------------------------------------------------------
# Desktop and Start Menu shortcuts
# -------------------------------------------------------------
$SetupScript = Join-Path $InstallDir "scripts\setup-windows.ps1"
if ($repoReady -and (Test-Path $SetupScript)) {
    Write-Host ""
    Write-Host "Registering Oberleaf Desktop and Start Menu shortcuts..." -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SetupScript
}

# -------------------------------------------------------------
# Result
# -------------------------------------------------------------
Write-Host ""
if ($Failures.Count -gt 0) {
    Write-Host "==========================================================" -ForegroundColor Yellow
    Write-Host " Setup finished, but these steps did not complete:" -ForegroundColor Yellow
    foreach ($f in $Failures) { Write-Host "   - $f" -ForegroundColor Yellow }
    Write-Host " Log: $LogFile" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Yellow
    try { Stop-Transcript | Out-Null } catch {}
    if ($Failures -contains "repository download") { exit 3 } else { exit 2 }
}

$Launcher = Join-Path $InstallDir "scripts\launch.vbs"
if (Test-Path $Launcher) {
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  Setup complete! Starting Oberleaf...                    " -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Start-Process -FilePath "wscript.exe" -ArgumentList ('"' + $Launcher + '"') -WorkingDirectory $InstallDir
} else {
    Write-Host "Setup finished. Launch Oberleaf anytime with 'npm start' in $InstallDir." -ForegroundColor Green
}

try { Stop-Transcript | Out-Null } catch {}
exit 0
