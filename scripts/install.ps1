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
# script as a string literal.

param(
    [string]$DestinationPath,
    [switch]$Silent = $false,
    [switch]$NoGui = $false,
    [switch]$NoLaunch = $false,
    [switch]$NoDesktop = $false,
    [switch]$NoStartMenu = $false,
    [switch]$NoContextMenu = $false
)

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

function Install-Package {
    param([string]$Id)

    $scopes = if ($IsElevated) { @($null) } else { @("user", $null) }
    foreach ($scope in $scopes) {
        $wingetArgs = @("install", "--id", $Id, "-e", "--source", "winget",
                        "--accept-source-agreements", "--accept-package-agreements",
                        "--silent", "--disable-interactivity")
        if ($scope) { $wingetArgs += @("--scope", $scope) }

        Write-Log ("   winget " + ($wingetArgs -join " ")) "DarkGray"
        & winget.exe @wingetArgs 2>&1 | Out-String | ForEach-Object { Write-Log $_ "DarkGray" }
        Update-SessionEnvironment

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

if ($DestinationPath -and (Test-Path (Split-Path -Parent $DestinationPath))) {
    $InstallDir = $DestinationPath
} elseif ((Test-Path (Join-Path $RepoRootCandidate "package.json")) -and (Test-Path (Join-Path $RepoRootCandidate "server"))) {
    $InstallDir = $RepoRootCandidate
} else {
    $InstallDir = [System.IO.Path]::Combine($env:LOCALAPPDATA, "Oberleaf")
}

# UI state variables
$script:CreateDesktopShortcut = -not $NoDesktop
$script:CreateStartMenuShortcut = -not $NoStartMenu
$script:AddContextMenu = -not $NoContextMenu
$script:LaunchOnFinish = -not $NoLaunch
$script:LogTextBox = $null
$script:ProgressBar = $null
$script:StatusLabel = $null

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
    if ($script:LogTextBox) {
        try {
            $script:LogTextBox.AppendText($Message + "`r`n")
            $script:LogTextBox.SelectionStart = $script:LogTextBox.Text.Length
            $script:LogTextBox.ScrollToCaret()
            [System.Windows.Forms.Application]::DoEvents()
        } catch {}
    }
}

function Set-ProgressStep {
    param([int]$Percent, [string]$Status)
    if ($script:ProgressBar) {
        try {
            $script:ProgressBar.Value = [Math]::Min(100, [Math]::Max(0, $Percent))
        } catch {}
    }
    if ($script:StatusLabel) {
        try {
            $script:StatusLabel.Text = $Status
        } catch {}
    }
    [System.Windows.Forms.Application]::DoEvents()
}

# -------------------------------------------------------------
# Optional Interactive Setup Wizard Dialog
# -------------------------------------------------------------
$isInteractive = [Environment]::UserInteractive -and -not $Silent -and -not $NoGui

if ($isInteractive) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        [System.Windows.Forms.Application]::EnableVisualStyles()

        $setupForm = New-Object System.Windows.Forms.Form
        $setupForm.Text = "Oberleaf Setup"
        $setupForm.Size = New-Object System.Drawing.Size(560, 440)
        $setupForm.StartPosition = "CenterScreen"
        $setupForm.FormBorderStyle = "FixedDialog"
        $setupForm.MaximizeBox = $false
        $setupForm.MinimizeBox = $false

        # Header panel
        $pnlHeader = New-Object System.Windows.Forms.Panel
        $pnlHeader.Location = New-Object System.Drawing.Point(0, 0)
        $pnlHeader.Size = New-Object System.Drawing.Size(560, 70)
        $pnlHeader.BackColor = [System.Drawing.Color]::FromArgb(47, 57, 169) # Deep Indigo brand

        $lblHeaderTitle = New-Object System.Windows.Forms.Label
        $lblHeaderTitle.Text = "Oberleaf - Scholarly TeX Studio Setup"
        $lblHeaderTitle.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
        $lblHeaderTitle.ForeColor = [System.Drawing.Color]::White
        $lblHeaderTitle.Location = New-Object System.Drawing.Point(20, 15)
        $lblHeaderTitle.Size = New-Object System.Drawing.Size(480, 25)
        $pnlHeader.Controls.Add($lblHeaderTitle)

        $lblHeaderSub = New-Object System.Windows.Forms.Label
        $lblHeaderSub.Text = "Fast, Local-First LaTeX Without Cloud Timeouts"
        $lblHeaderSub.Font = New-Object System.Drawing.Font("Segoe UI", 9)
        $lblHeaderSub.ForeColor = [System.Drawing.Color]::FromArgb(200, 220, 255)
        $lblHeaderSub.Location = New-Object System.Drawing.Point(22, 40)
        $lblHeaderSub.Size = New-Object System.Drawing.Size(480, 20)
        $pnlHeader.Controls.Add($lblHeaderSub)

        $setupForm.Controls.Add($pnlHeader)

        # Page 1 Panel: Options & Destination
        $pnlOptions = New-Object System.Windows.Forms.Panel
        $pnlOptions.Location = New-Object System.Drawing.Point(20, 80)
        $pnlOptions.Size = New-Object System.Drawing.Size(510, 270)

        $lblDest = New-Object System.Windows.Forms.Label
        $lblDest.Text = "Destination Folder:"
        $lblDest.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
        $lblDest.Location = New-Object System.Drawing.Point(0, 10)
        $lblDest.Size = New-Object System.Drawing.Size(200, 20)
        $pnlOptions.Controls.Add($lblDest)

        $txtDest = New-Object System.Windows.Forms.TextBox
        $txtDest.Text = $InstallDir
        $txtDest.Font = New-Object System.Drawing.Font("Segoe UI", 9)
        $txtDest.Location = New-Object System.Drawing.Point(0, 32)
        $txtDest.Size = New-Object System.Drawing.Size(400, 24)
        $pnlOptions.Controls.Add($txtDest)

        $btnBrowse = New-Object System.Windows.Forms.Button
        $btnBrowse.Text = "Browse..."
        $btnBrowse.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
        $btnBrowse.Location = New-Object System.Drawing.Point(410, 30)
        $btnBrowse.Size = New-Object System.Drawing.Size(85, 27)
        $btnBrowse.Add_Click({
            $fbd = New-Object System.Windows.Forms.FolderBrowserDialog
            $fbd.SelectedPath = $txtDest.Text
            $fbd.Description = "Select Destination Folder for Oberleaf"
            if ($fbd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                $txtDest.Text = $fbd.SelectedPath
            }
        })
        $pnlOptions.Controls.Add($btnBrowse)

        $lblSpace = New-Object System.Windows.Forms.Label
        $driveLetter = [System.IO.Path]::GetPathRoot($txtDest.Text)
        $freeGB = ""
        try {
            $drive = Get-PSDrive ($driveLetter.TrimEnd('\').TrimEnd(':')) -ErrorAction SilentlyContinue
            if ($drive) { $freeGB = [Math]::Round($drive.Free / 1GB, 1) }
        } catch {}
        $lblSpace.Text = "Space required: ~250 MB" + $(if ($freeGB) { " | Available on drive $driveLetter : $freeGB GB" } else { "" })
        $lblSpace.Font = New-Object System.Drawing.Font("Segoe UI", 8)
        $lblSpace.ForeColor = [System.Drawing.Color]::DarkSlateGray
        $lblSpace.Location = New-Object System.Drawing.Point(0, 60)
        $lblSpace.Size = New-Object System.Drawing.Size(450, 18)
        $pnlOptions.Controls.Add($lblSpace)

        # Shortcuts group
        $lblTasks = New-Object System.Windows.Forms.Label
        $lblTasks.Text = "Shortcuts & Integration:"
        $lblTasks.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
        $lblTasks.Location = New-Object System.Drawing.Point(0, 95)
        $lblTasks.Size = New-Object System.Drawing.Size(200, 20)
        $pnlOptions.Controls.Add($lblTasks)

        $chkDesktop = New-Object System.Windows.Forms.CheckBox
        $chkDesktop.Text = "Create a Desktop shortcut"
        $chkDesktop.Font = New-Object System.Drawing.Font("Segoe UI", 9)
        $chkDesktop.Checked = $true
        $chkDesktop.Location = New-Object System.Drawing.Point(5, 120)
        $chkDesktop.Size = New-Object System.Drawing.Size(450, 22)
        $pnlOptions.Controls.Add($chkDesktop)

        $chkStartMenu = New-Object System.Windows.Forms.CheckBox
        $chkStartMenu.Text = "Add to Start Menu (searchable via Windows Search)"
        $chkStartMenu.Font = New-Object System.Drawing.Font("Segoe UI", 9)
        $chkStartMenu.Checked = $true
        $chkStartMenu.Location = New-Object System.Drawing.Point(5, 145)
        $chkStartMenu.Size = New-Object System.Drawing.Size(450, 22)
        $pnlOptions.Controls.Add($chkStartMenu)

        $chkContext = New-Object System.Windows.Forms.CheckBox
        $chkContext.Text = "Add 'Open with Oberleaf' to File Explorer right-click menu"
        $chkContext.Font = New-Object System.Drawing.Font("Segoe UI", 9)
        $chkContext.Checked = $true
        $chkContext.Location = New-Object System.Drawing.Point(5, 170)
        $chkContext.Size = New-Object System.Drawing.Size(450, 22)
        $pnlOptions.Controls.Add($chkContext)

        $setupForm.Controls.Add($pnlOptions)

        # Page 2 Panel: Progress & Details Log
        $pnlProgress = New-Object System.Windows.Forms.Panel
        $pnlProgress.Location = New-Object System.Drawing.Point(20, 80)
        $pnlProgress.Size = New-Object System.Drawing.Size(510, 270)
        $pnlProgress.Visible = $false

        $script:StatusLabel = New-Object System.Windows.Forms.Label
        $script:StatusLabel.Text = "Ready to install..."
        $script:StatusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
        $script:StatusLabel.Location = New-Object System.Drawing.Point(0, 10)
        $script:StatusLabel.Size = New-Object System.Drawing.Size(480, 20)
        $pnlProgress.Controls.Add($script:StatusLabel)

        $script:ProgressBar = New-Object System.Windows.Forms.ProgressBar
        $script:ProgressBar.Location = New-Object System.Drawing.Point(0, 35)
        $script:ProgressBar.Size = New-Object System.Drawing.Size(500, 20)
        $pnlProgress.Controls.Add($script:ProgressBar)

        $script:LogTextBox = New-Object System.Windows.Forms.TextBox
        $script:LogTextBox.Multiline = $true
        $script:LogTextBox.ReadOnly = $true
        $script:LogTextBox.ScrollBars = "Vertical"
        $script:LogTextBox.Font = New-Object System.Drawing.Font("Consolas", 8)
        $script:LogTextBox.Location = New-Object System.Drawing.Point(0, 65)
        $script:LogTextBox.Size = New-Object System.Drawing.Size(500, 190)
        $pnlProgress.Controls.Add($script:LogTextBox)

        $setupForm.Controls.Add($pnlProgress)

        # Bottom Buttons
        $btnInstall = New-Object System.Windows.Forms.Button
        $btnInstall.Text = "Install"
        $btnInstall.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
        $btnInstall.Location = New-Object System.Drawing.Point(330, 360)
        $btnInstall.Size = New-Object System.Drawing.Size(95, 30)

        $btnCancel = New-Object System.Windows.Forms.Button
        $btnCancel.Text = "Cancel"
        $btnCancel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
        $btnCancel.Location = New-Object System.Drawing.Point(435, 360)
        $btnCancel.Size = New-Object System.Drawing.Size(85, 30)
        $btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

        $setupForm.Controls.Add($btnInstall)
        $setupForm.Controls.Add($btnCancel)
        $setupForm.AcceptButton = $btnInstall
        $setupForm.CancelButton = $btnCancel

        $script:InstallTriggered = $false

        $btnInstall.Add_Click({
            if (-not $script:InstallTriggered) {
                $script:InstallTriggered = $true
                $InstallDir = $txtDest.Text.Trim()
                $script:CreateDesktopShortcut = $chkDesktop.Checked
                $script:CreateStartMenuShortcut = $chkStartMenu.Checked
                $script:AddContextMenu = $chkContext.Checked

                $pnlOptions.Visible = $false
                $pnlProgress.Visible = $true
                $btnInstall.Enabled = $false
                $btnCancel.Enabled = $false
                $setupForm.ControlBox = $false

                [System.Windows.Forms.Application]::DoEvents()
                # Run the installation pipeline inside GUI
                Start-InstallationPipeline
                $btnInstall.Text = "Finish"
                $btnInstall.Enabled = $true
                $setupForm.ControlBox = $true
            } else {
                $setupForm.Close()
            }
        })

        $setupForm.ShowDialog() | Out-Null
        if (-not $script:InstallTriggered) {
            Write-Host "Setup was closed before installing."
            exit 0
        }
    } catch {
        Write-Warning "GUI wizard encountered an issue: $_. Continuing in console mode."
        $isInteractive = $false
    }
}

function Start-InstallationPipeline {
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    Write-Log "Target Directory: $InstallDir" "Gray"
    Write-Log "Setup log:        $LogFile" "Gray"
    Write-Log ""

    # -------------------------------------------------------------
    # Step 1: Windows Package Manager (winget)
    # -------------------------------------------------------------
    Set-ProgressStep 10 "Checking Windows Package Manager..."
    $hasWinget = [bool](Get-Command winget.exe -ErrorAction SilentlyContinue)
    if (-not $hasWinget) {
        Write-Log "[1/5] Windows Package Manager (winget) was not found." "Yellow"
        Write-Log "      Install 'App Installer' from the Microsoft Store, then run setup again:" "Yellow"
        Write-Log "      https://apps.microsoft.com/detail/9nblggh4nns1" "Yellow"
    } else {
        Write-Log "[1/5] winget detected." "Green"
    }

    # -------------------------------------------------------------
    # Step 2: Git
    # -------------------------------------------------------------
    Set-ProgressStep 25 "Checking Git..."
    Update-SessionEnvironment
    $gitCmd = Get-Tool @("git.exe", "git")
    if (-not $gitCmd) {
        Write-Log "[2/5] Installing Git..." "Yellow"
        if ($hasWinget) { Install-Package -Id "Git.Git" | Out-Null }
        $gitCmd = Get-Tool @("git.exe", "git")
        if (-not $gitCmd) {
            foreach ($p in @("$env:ProgramFiles\Git\cmd\git.exe",
                             "${env:ProgramFiles(x86)}\Git\cmd\git.exe",
                             "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe")) {
                if (Test-Path $p) { $env:Path = (Split-Path $p) + ";" + $env:Path; break }
            }
            $gitCmd = Get-Tool @("git.exe", "git")
        }
    }
    if ($gitCmd) {
        Write-Log "[2/5] Git ready: $($gitCmd.Source)" "Green"
    } else {
        Write-Log "[2/5] Git could not be installed automatically." "Red"
        Write-Log "      Install it from https://git-scm.com and run this setup again." "Red"
        $Failures.Add("Git")
    }

    # -------------------------------------------------------------
    # Step 3: Node.js LTS
    # -------------------------------------------------------------
    Set-ProgressStep 40 "Checking Node.js LTS..."
    Update-SessionEnvironment
    $nodeCmd = Get-Tool @("node.exe", "node")
    if (-not $nodeCmd) {
        Write-Log "[3/5] Installing Node.js LTS..." "Yellow"
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
        Write-Log "[3/5] Node.js ready: $($nodeCmd.Source)" "Green"
    } else {
        Write-Log "[3/5] Node.js could not be installed automatically." "Red"
        Write-Log "      Install the LTS build from https://nodejs.org and run setup again." "Red"
        $Failures.Add("Node.js")
    }

    # -------------------------------------------------------------
    # Step 4: LaTeX (MiKTeX)
    # -------------------------------------------------------------
    Set-ProgressStep 55 "Checking LaTeX distribution (MiKTeX)..."
    Update-SessionEnvironment
    $latexCmd = Get-Tool @("pdflatex.exe", "latexmk.exe", "pdflatex")
    if (-not $latexCmd) {
        Write-Log "[4/5] No LaTeX compiler found. Installing MiKTeX - this may take several minutes..." "Cyan"
        if ($hasWinget) { Install-Package -Id "MiKTeX.MiKTeX" | Out-Null }
        $latexCmd = Get-Tool @("pdflatex.exe", "latexmk.exe", "pdflatex")
    }
    if ($latexCmd) {
        Write-Log "[4/5] LaTeX ready: $($latexCmd.Source)" "Green"
    } else {
        Write-Log "[4/5] MiKTeX is not on PATH yet." "Yellow"
        Write-Log "      That is usually just a pending restart - Oberleaf's Dependency" "Yellow"
        Write-Log "      Doctor will finish configuring it on first launch." "Yellow"
    }

    # Configure MiKTeX AutoInstall
    Update-SessionEnvironment
    $initexmf = Get-Tool @("initexmf.exe", "initexmf")
    if ($initexmf) {
        Write-Log "      Configuring MiKTeX to install missing packages automatically..." "Cyan"
        & $initexmf.Source --set-config-value="[MPM]AutoInstall=1" 2>&1 | Out-Null
        if ($IsElevated) {
            & $initexmf.Source --admin --set-config-value="[MPM]AutoInstall=1" 2>&1 | Out-Null
        }
        $verify = (& $initexmf.Source --show-config-value="[MPM]AutoInstall" 2>&1 | Out-String).Trim()
        if ($verify -eq "1") {
            Write-Log "      MiKTeX will now install packages silently." "Green"
        } else {
            Write-Log "      Could not confirm setting (got '$verify')." "Yellow"
        }
    }

    # -------------------------------------------------------------
    # Step 5: Fetch Oberleaf
    # -------------------------------------------------------------
    Set-ProgressStep 70 "Syncing Oberleaf repository..."
    Write-Log "[5/5] Syncing the Oberleaf codebase..." "Cyan"

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
        Write-Log "      Skipped - Git is not available." "Red"
        $Failures.Add("repository download")
    } else {
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
            Write-Log "      Could not download Oberleaf from GitHub." "Red"
            $Failures.Add("repository download")
        }
    }

    # Node packages
    if ($repoReady -and $nodeCmd) {
        Set-ProgressStep 82 "Installing dependencies (npm install)..."
        Write-Log ""
        Write-Log "Installing Oberleaf dependencies (npm install)..." "Cyan"
        $npm = Get-Tool @("npm.cmd", "npm")
        if ($npm) {
            & $npm.Source install
            if ($LASTEXITCODE -ne 0) {
                Write-Log "npm install reported errors - see $LogFile" "Yellow"
                $Failures.Add("npm install")
            }
        } else {
            Write-Log "npm was not found on PATH. Restart Windows and run this setup again." "Yellow"
            $Failures.Add("npm")
        }
    }

    # Warm LaTeX Packages
    if ($latexCmd -and -not $env:OBERLEAF_SKIP_PACKAGE_WARMUP) {
        Set-ProgressStep 92 "Pre-downloading LaTeX template packages..."
        Write-Log ""
        Write-Log "Pre-downloading the LaTeX packages the templates need..." "Cyan"
        try { Initialize-LatexPackages } catch {
            Write-Log "      Warm-up skipped: $_" "Yellow"
        }
    }

    # Desktop, Start Menu, Context Menu, and Uninstaller Registration
    Set-ProgressStep 97 "Registering shortcuts and uninstaller..."
    $SetupScript = Join-Path $InstallDir "scripts\setup-windows.ps1"
    if ($repoReady -and (Test-Path $SetupScript)) {
        Write-Log ""
        Write-Log "Registering Oberleaf Desktop, Start Menu, and System integrations..." "Cyan"
        $setupArgs = @()
        if (-not $script:CreateDesktopShortcut) { $setupArgs += "-NoDesktop" }
        if (-not $script:CreateStartMenuShortcut) { $setupArgs += "-NoStartMenu" }
        if (-not $script:AddContextMenu) { $setupArgs += "-NoContextMenu" }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SetupScript @setupArgs
    }

    Set-ProgressStep 100 "Setup Complete!"
    Write-Log ""
    if ($Failures.Count -gt 0) {
        Write-Log "==========================================================" "Yellow"
        Write-Log " Setup finished with non-critical warnings:" "Yellow"
        foreach ($f in $Failures) { Write-Log "   - $f" "Yellow" }
        Write-Log " Log: $LogFile" "Yellow"
        Write-Log "==========================================================" "Yellow"
    } else {
        Write-Log "==========================================================" "Green"
        Write-Log "  Setup complete! Oberleaf is ready to use.              " "Green"
        Write-Log "==========================================================" "Green"
    }
}

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
            Write-Log "      $name..." "DarkGray"

            $out = Join-Path $work "$name.out"
            $err = Join-Path $work "$name.err"
            $p = Start-Process -FilePath "pdflatex.exe" `
                -ArgumentList @("-interaction=nonstopmode", "-halt-on-error", $name) `
                -WorkingDirectory $work -NoNewWindow -PassThru `
                -RedirectStandardOutput $out -RedirectStandardError $err

            if (-not $p.WaitForExit(300000)) {
                try { $p.Kill() } catch {}
                Copy-Item $out $warmupLog -Force -ErrorAction SilentlyContinue
                Write-Log "      Timed out on $name. Log: $warmupLog" "Yellow"
                return
            }

            $pdf = Join-Path $work ([IO.Path]::ChangeExtension($name, ".pdf"))
            if (-not (Test-Path $pdf)) {
                Copy-Item $out $warmupLog -Force -ErrorAction SilentlyContinue
                Write-Log "      $name did not produce a PDF. Log: $warmupLog" "Yellow"
                return
            }
        }
        Write-Log "      Package cache ready - first compile will be fast." "Green"
    } finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# If not interactive (e.g. called from command line with -Silent or -NoGui), run directly
if (-not $isInteractive) {
    Start-InstallationPipeline
}

# -------------------------------------------------------------
# Launch
# -------------------------------------------------------------
if ($script:LaunchOnFinish -and ($Failures.Count -eq 0 -or -not ($Failures -contains "repository download"))) {
    $Launcher = Join-Path $InstallDir "scripts\launch.vbs"
    if (Test-Path $Launcher) {
        Write-Host "Starting Oberleaf..." -ForegroundColor Green
        Start-Process -FilePath "wscript.exe" -ArgumentList ('"' + $Launcher + '"') -WorkingDirectory $InstallDir
    }
}

try { Stop-Transcript | Out-Null } catch {}
if ($Failures -contains "repository download") { exit 3 }
if ($Failures.Count -gt 0) { exit 2 }
exit 0
