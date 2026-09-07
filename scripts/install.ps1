[CmdletBinding()]
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\Oberleaf",
    [switch]$NoDesktop,
    [switch]$NoStartMenu,
    [switch]$NoContextMenu,
    [switch]$NoLaunch,
    [switch]$Silent,
    [switch]$NoGui
)

$ErrorActionPreference = "Continue"

# -------------------------------------------------------------
# Base64 Embedded Logo & State
# -------------------------------------------------------------
$script:OberleafIconBase64 = "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"

$LogDir = Join-Path $env:TEMP "oberleaf-setup"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $LogDir ("setup-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
try { Start-Transcript -Path $LogFile -Append -Force | Out-Null } catch {}

$Failures = [System.Collections.Generic.List[string]]::new()
$IsElevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$script:CreateDesktopShortcut = -not $NoDesktop
$script:CreateStartMenuShortcut = -not $NoStartMenu
$script:AddContextMenu = -not $NoContextMenu
$script:LaunchOnFinish = -not $NoLaunch
$script:LogTextBox = $null
$script:ProgressBar = $null
$script:StatusLabel = $null
$script:InstallTriggered = $false

# -------------------------------------------------------------
# Logging and Progress Helpers
# -------------------------------------------------------------
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

function Update-SessionEnvironment {
    foreach ($level in @("Machine", "User")) {
        $p = [Environment]::GetEnvironmentVariable("Path", $level)
        if ($p) {
            foreach ($dir in $p.Split(';')) {
                if ($dir -and (Test-Path $dir) -and -not (($env:Path -split ';') -contains $dir)) {
                    $env:Path = "$dir;" + $env:Path
                }
            }
        }
    }
}

function Get-Tool([string[]]$Names) {
    foreach ($n in $Names) {
        $c = Get-Command $n -ErrorAction SilentlyContinue
        if ($c) { return $c }
    }
    return $null
}

function Install-Package {
    param([string]$Id)
    Write-Log "      winget install $Id..." "DarkGray"
    $args = @("install", "--id", $Id, "-e", "--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity")
    if (-not $IsElevated) { $args += @("--scope", "user") }
    $p = Start-Process -FilePath "winget.exe" -ArgumentList $args -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
    if ($p) { return $p.ExitCode }
    return 1
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
            '\usepackage{enumitem}',
            '\usepackage{fontenc}',
            '\usepackage{geometry}',
            '\usepackage{graphicx}',
            '\usepackage{hyperref}',
            '\usepackage{lmodern}',
            '\usepackage{microtype}',
            '\usepackage{parskip}',
            '\usepackage{titlesec}',
            '\usepackage{xcolor}',
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

# -------------------------------------------------------------
# Main Installation Pipeline
# -------------------------------------------------------------
function Start-InstallationPipeline {
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    Write-Log "Target Directory: $InstallDir" "Gray"
    Write-Log "Setup log:        $LogFile" "Gray"
    Write-Log ""

    # Step 1: Windows Package Manager (winget)
    Set-ProgressStep 10 "Checking Windows Package Manager..."
    $hasWinget = [bool](Get-Command winget.exe -ErrorAction SilentlyContinue)
    if (-not $hasWinget) {
        Write-Log "[1/5] Windows Package Manager (winget) was not found." "Yellow"
        Write-Log "      Install 'App Installer' from the Microsoft Store, then run setup again:" "Yellow"
        Write-Log "      https://apps.microsoft.com/detail/9nblggh4nns1" "Yellow"
    } else {
        Write-Log "[1/5] winget detected." "Green"
    }

    # Step 2: Git
    Set-ProgressStep 25 "Checking Git..."
    Update-SessionEnvironment
    $gitCmd = Get-Tool @("git.exe", "git")
    if (-not $gitCmd) {
        Write-Log "[2/5] Installing Git..." "Yellow"
        if ($hasWinget) { Install-Package -Id "Git.Git" | Out-Null }
        $gitCmd = Get-Tool @("git.exe", "git")
        if (-not $gitCmd) {
            foreach ($p in @("$env:ProgramFiles\Git\cmd\git.exe",
                             "C:Program Files (x86)\Git\cmd\git.exe",
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

    # Step 3: Node.js LTS
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

    # Step 4: LaTeX (MiKTeX)
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

    # Step 5: Fetch Oberleaf
    Set-ProgressStep 70 "Syncing Oberleaf repository..."
    Write-Log "[5/5] Syncing the Oberleaf codebase..." "Cyan"

    $RepoUrl = "https://github.com/sahgyan9/Oberleaf.git"
    $repoReady = $false

    if (Test-Path (Join-Path $InstallDir ".git")) {
        Set-Location $InstallDir
        & git pull origin main 2>&1 | ForEach-Object { Write-Log $_ "Gray" }
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
            & git clone --depth 1 $RepoUrl $staging 2>&1 | ForEach-Object { Write-Log $_ "Gray" }
            if (Test-Path (Join-Path $staging ".git")) {
                Get-ChildItem -LiteralPath $staging -Force |
                    Move-Item -Destination $InstallDir -Force -ErrorAction SilentlyContinue
                Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
                $repoReady = Test-Path (Join-Path $InstallDir "package.json")
            }
        } else {
            & git clone --depth 1 $RepoUrl $InstallDir 2>&1 | ForEach-Object { Write-Log $_ "Gray" }
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
            & $npm.Source install 2>&1 | ForEach-Object { Write-Log $_ "Gray" }
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
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SetupScript @setupArgs 2>&1 | ForEach-Object { Write-Log $_ "Gray" }
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

# -------------------------------------------------------------
# Setup Wizard WinForms GUI
# -------------------------------------------------------------
function Show-SetupWizard {
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

        # Load Logo Icon from Base64
        $logoImage = $null
        try {
            [byte[]]$iconBytes = [Convert]::FromBase64String($script:OberleafIconBase64)
            $iconMs = New-Object System.IO.MemoryStream
            $iconMs.Write($iconBytes, 0, $iconBytes.Length)
            $iconMs.Position = 0
            $logoImage = [System.Drawing.Image]::FromStream($iconMs)
            $bmp = New-Object System.Drawing.Bitmap($logoImage)
            $setupForm.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
        } catch {}

        # Header panel: Clean Scholarly Atelier dark bar (#1C1917)
        $pnlHeader = New-Object System.Windows.Forms.Panel
        $pnlHeader.Location = New-Object System.Drawing.Point(0, 0)
        $pnlHeader.Size = New-Object System.Drawing.Size(560, 68)
        $pnlHeader.BackColor = [System.Drawing.Color]::FromArgb(28, 25, 23)

        if ($logoImage) {
            $picLogo = New-Object System.Windows.Forms.PictureBox
            $picLogo.Size = New-Object System.Drawing.Size(40, 40)
            $picLogo.Location = New-Object System.Drawing.Point(20, 14)
            $picLogo.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
            $picLogo.Image = $logoImage
            $pnlHeader.Controls.Add($picLogo)
        }

        $lblHeaderTitle = New-Object System.Windows.Forms.Label
        $lblHeaderTitle.Text = "Oberleaf"
        $lblHeaderTitle.Font = New-Object System.Drawing.Font("Georgia", 19, [System.Drawing.FontStyle]::Bold)
        $lblHeaderTitle.ForeColor = [System.Drawing.Color]::FromArgb(245, 245, 244)
        $lblHeaderTitle.Location = New-Object System.Drawing.Point(68, 18)
        $lblHeaderTitle.AutoSize = $true
        $pnlHeader.Controls.Add($lblHeaderTitle)

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
        if ($freeGB) {
            $lblSpace.Text = "Space required: ~250 MB | Available on drive $driveLetter $freeGB GB"
        } else {
            $lblSpace.Text = "Space required: ~250 MB"
        }
        $lblSpace.Font = New-Object System.Drawing.Font("Segoe UI", 8)
        $lblSpace.ForeColor = [System.Drawing.Color]::Gray
        $lblSpace.Location = New-Object System.Drawing.Point(0, 60)
        $lblSpace.Size = New-Object System.Drawing.Size(480, 20)
        $pnlOptions.Controls.Add($lblSpace)

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
        $btnInstall.Location = New-Object System.Drawing.Point(315, 360)
        $btnInstall.Size = New-Object System.Drawing.Size(110, 30)

        $btnCancel = New-Object System.Windows.Forms.Button
        $btnCancel.Text = "Cancel"
        $btnCancel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
        $btnCancel.Location = New-Object System.Drawing.Point(435, 360)
        $btnCancel.Size = New-Object System.Drawing.Size(85, 30)

        $btnCancel.Add_Click({
            $setupForm.Close()
        })

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

                try {
                    Start-InstallationPipeline
                    $btnInstall.Text = "Launch Oberleaf"
                    $btnInstall.Enabled = $true
                    $btnCancel.Text = "Close"
                    $btnCancel.Enabled = $true
                    $setupForm.ControlBox = $true
                } catch {
                    Write-Log ("Installation exception: " + $_.ToString()) "Red"
                    $btnInstall.Text = "Close"
                    $btnInstall.Enabled = $true
                    $btnCancel.Text = "Close"
                    $btnCancel.Enabled = $true
                    $setupForm.ControlBox = $true
                }
            } else {
                $setupForm.Close()
            }
        })

        $setupForm.Controls.Add($btnInstall)
        $setupForm.Controls.Add($btnCancel)
        $setupForm.AcceptButton = $btnInstall

        $setupForm.ShowDialog() | Out-Null
        if (-not $script:InstallTriggered) {
            Write-Host "Setup was closed before installing."
            exit 0
        }
    } catch {
        Write-Warning "GUI wizard issue: $_. Continuing in console mode."
        Start-InstallationPipeline
    }
}

# -------------------------------------------------------------
# Execution Entry Point
# -------------------------------------------------------------
$isInteractive = [Environment]::UserInteractive -and -not $Silent -and -not $NoGui

if ($isInteractive) {
    Show-SetupWizard
} else {
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
