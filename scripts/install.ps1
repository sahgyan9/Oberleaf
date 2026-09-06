# Oberleaf — Automated 1-Click Bootstrap Installer
# Designed for university students, scholars, and professors.
# Automatically provisions Git, Node.js LTS, and MiKTeX LaTeX if missing.

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         Oberleaf — Scholarly TeX Studio Setup            " -ForegroundColor Green
Write-Host "    Fast, Local-First LaTeX Without Cloud Timeouts        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# Function to refresh current process PATH from registry
function Update-SessionEnvironment {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path    = "$machinePath;$userPath"
}

# Anonymous telemetry ping (non-blocking, best-effort)
try {
    $telemetryBody = @{
        p_app_name = "oberleaf"
        p_download_type = "powershell_installer"
        p_platform = "windows"
    } | ConvertTo-Json
    $telemetryHeaders = @{
        "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1YXBka3JnY2Jxcmh2c2F5dnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4ODU5NzMsImV4cCI6MjA1NjQ2MTk3M30.V5jQfO-__C1gSbX33c2M-iBouFVWbO1bSPnRlc9iw1s"
    }
    Invoke-RestMethod -Uri "https://ruapdkrgcbqrhvsayvpf.supabase.co/rest/v1/rpc/record_app_download" -Method Post -Body $telemetryBody -ContentType "application/json" -Headers $telemetryHeaders -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
} catch {}

# Determine installation directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRootCandidate = Split-Path -Parent $ScriptDir

if ((Test-Path (Join-Path $RepoRootCandidate "package.json")) -and (Test-Path (Join-Path $RepoRootCandidate "server"))) {
    # Running from within an existing Oberleaf clone
    $InstallDir = $RepoRootCandidate
} else {
    # Running from standalone downloader (e.g. Downloads folder)
    $InstallDir = [System.IO.Path]::Combine($env:LOCALAPPDATA, "Oberleaf")
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
}

Write-Host "Target Directory: $InstallDir" -ForegroundColor Gray
Write-Host ""

# -------------------------------------------------------------
# Step 1: Verify Windows Package Manager (winget)
# -------------------------------------------------------------
$hasWinget = (Get-Command winget.exe -ErrorAction SilentlyContinue)
if (-not $hasWinget) {
    Write-Warning "Windows Package Manager (winget) was not detected."
    Write-Host "Please ensure you are on Windows 10 (1809+) or Windows 11." -ForegroundColor Yellow
}

# -------------------------------------------------------------
# Step 2: Check & Install Git
# -------------------------------------------------------------
Update-SessionEnvironment
$gitCmd = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    Write-Host "[1/5] Git is required to download Oberleaf. Installing Git via winget..." -ForegroundColor Yellow
    if ($hasWinget) {
        & winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements --silent
        Update-SessionEnvironment
        $gitCmd = Get-Command git.exe -ErrorAction SilentlyContinue
    }
    
    if (-not $gitCmd) {
        Write-Host "Git installation could not be completed automatically. Please install Git from https://git-scm.com" -ForegroundColor Red
    } else {
        Write-Host "[+] Git installed successfully!" -ForegroundColor Green
    }
} else {
    Write-Host "[1/5] Git detected: $($gitCmd.Source)" -ForegroundColor Green
}

# -------------------------------------------------------------
# Step 3: Check & Install Node.js LTS
# -------------------------------------------------------------
Update-SessionEnvironment
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "[2/5] Node.js is required to run Oberleaf. Installing Node.js LTS via winget..." -ForegroundColor Yellow
    if ($hasWinget) {
        & winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements --silent
        Update-SessionEnvironment
        $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
    }

    if (-not $nodeCmd) {
        Write-Host "Node.js installation could not be completed automatically. Please install Node.js from https://nodejs.org" -ForegroundColor Red
    } else {
        Write-Host "[+] Node.js installed successfully!" -ForegroundColor Green
    }
} else {
    Write-Host "[2/5] Node.js detected: $($nodeCmd.Source)" -ForegroundColor Green
}

# -------------------------------------------------------------
# Step 4: Check & Install LaTeX (MiKTeX)
# -------------------------------------------------------------
Update-SessionEnvironment
$latexCmd = Get-Command pdflatex.exe -ErrorAction SilentlyContinue
if (-not $latexCmd) {
    $latexCmd = Get-Command latexmk.exe -ErrorAction SilentlyContinue
}

if (-not $latexCmd) {
    Write-Host "[3/5] No local LaTeX compiler found." -ForegroundColor Yellow
    Write-Host "   Installing MiKTeX (lightweight, automatically installs packages on-the-fly)..." -ForegroundColor Cyan
    if ($hasWinget) {
        & winget install --id MiKTeX.MiKTeX -e --source winget --accept-source-agreements --accept-package-agreements
        Update-SessionEnvironment
        $latexCmd = Get-Command pdflatex.exe -ErrorAction SilentlyContinue
    }
    
    if (-not $latexCmd) {
        Write-Host "   Note: If MiKTeX requires a terminal restart, Oberleaf's built-in Dependency Doctor will help configure it on first launch." -ForegroundColor Yellow
    } else {
        Write-Host "[+] MiKTeX installed successfully!" -ForegroundColor Green
    }
} else {
    Write-Host "[3/5] LaTeX compiler detected: $($latexCmd.Source)" -ForegroundColor Green
}

# -------------------------------------------------------------
# Step 5: Sync Oberleaf Repository
# -------------------------------------------------------------
Write-Host "[4/5] Syncing Oberleaf codebase..." -ForegroundColor Cyan

if (Test-Path (Join-Path $InstallDir ".git")) {
    Set-Location $InstallDir
    try {
        & git pull origin main
    } catch {
        Write-Warning "Could not update repository via git pull: $_"
    }
} elseif (-not (Test-Path (Join-Path $InstallDir "package.json"))) {
    Write-Host "Cloning Oberleaf to $InstallDir..." -ForegroundColor Cyan
    & git clone https://github.com/sahgyan9/Oberleaf.git $InstallDir
    Set-Location $InstallDir
} else {
    Set-Location $InstallDir
}

# -------------------------------------------------------------
# Step 6: Install Node Packages
# -------------------------------------------------------------
Write-Host "[5/5] Installing Oberleaf dependencies..." -ForegroundColor Cyan
if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
    & npm.cmd install
} elseif (Get-Command npm -ErrorAction SilentlyContinue) {
    & npm install
} else {
    Write-Host "npm command not found in current PATH. Attempting with Node path..." -ForegroundColor Yellow
}

# -------------------------------------------------------------
# Step 7: Create Desktop & Start Menu Shortcuts
# -------------------------------------------------------------
$SetupScript = Join-Path $InstallDir "scripts\setup-windows.ps1"
if (Test-Path $SetupScript) {
    Write-Host ""
    Write-Host "Registering Oberleaf Desktop & Start Menu shortcuts..." -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SetupScript
}

# -------------------------------------------------------------
# Step 8: Launch Oberleaf
# -------------------------------------------------------------
$Launcher = Join-Path $InstallDir "scripts\launch.vbs"
if (Test-Path $Launcher) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  Setup complete! Starting Oberleaf in Google Chrome...   " -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host ""
    Start-Process -FilePath "wscript.exe" -ArgumentList "`"$Launcher`"" -WorkingDirectory $InstallDir
} else {
    Write-Host "Setup finished. Launch Oberleaf anytime by running 'npm start'." -ForegroundColor Green
}
