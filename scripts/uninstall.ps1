# Oberleaf - Clean Uninstaller Script
# Removes shortcuts, registry entries, and program files
# Preserves user LaTeX project files by default
param(
    [switch]$Silent = $false,
    [switch]$RemoveProjects = $false
)

$ErrorActionPreference = "Continue"

function Test-IsInteractive {
    return [Environment]::UserInteractive -and -not $Silent
}

# 1. Prompt User for Confirmation if Interactive
$preserveProjects = -not $RemoveProjects

if (Test-IsInteractive) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Uninstall Oberleaf"
    $form.Size = New-Object System.Drawing.Size(460, 260)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false

    $lblTitle = New-Object System.Windows.Forms.Label
    $lblTitle.Text = "Are you sure you want to uninstall Oberleaf?"
    $lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
    $lblTitle.Location = New-Object System.Drawing.Point(20, 20)
    $lblTitle.Size = New-Object System.Drawing.Size(400, 30)
    $form.Controls.Add($lblTitle)

    $lblDesc = New-Object System.Windows.Forms.Label
    $lblDesc.Text = "This will remove Oberleaf, its desktop shortcuts, and system integrations."
    $lblDesc.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $lblDesc.Location = New-Object System.Drawing.Point(20, 55)
    $lblDesc.Size = New-Object System.Drawing.Size(400, 40)
    $form.Controls.Add($lblDesc)

    $chkKeep = New-Object System.Windows.Forms.CheckBox
    $chkKeep.Text = "Keep my LaTeX documents and research papers (Recommended)"
    $chkKeep.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
    $chkKeep.Checked = $true
    $chkKeep.Location = New-Object System.Drawing.Point(20, 105)
    $chkKeep.Size = New-Object System.Drawing.Size(400, 25)
    $form.Controls.Add($chkKeep)

    $btnUninstall = New-Object System.Windows.Forms.Button
    $btnUninstall.Text = "Uninstall"
    $btnUninstall.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $btnUninstall.Location = New-Object System.Drawing.Point(230, 160)
    $btnUninstall.Size = New-Object System.Drawing.Size(95, 32)
    $btnUninstall.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($btnUninstall)

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.Text = "Cancel"
    $btnCancel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $btnCancel.Location = New-Object System.Drawing.Point(335, 160)
    $btnCancel.Size = New-Object System.Drawing.Size(85, 32)
    $btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($btnCancel)

    $form.AcceptButton = $btnUninstall
    $form.CancelButton = $btnCancel

    $result = $form.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
        Write-Host "Uninstallation cancelled by user."
        exit 0
    }
    $preserveProjects = $chkKeep.Checked
}

Write-Host "Starting Oberleaf uninstallation..." -ForegroundColor Cyan

# 2. Stop any running Oberleaf processes (ports 3001 and 5173)
Write-Host "Stopping running Oberleaf instances..." -ForegroundColor DarkGray
try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*Oberleaf*" -or $_.CommandLine -like "*project.log*"
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
} catch {}
foreach ($port in @(3001, 5173)) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        foreach ($conn in $conns) {
            if ($conn.OwningProcess -and $conn.OwningProcess -gt 4) {
                Start-Process -FilePath "taskkill.exe" -ArgumentList "/F /T /PID $($conn.OwningProcess)" -NoNewWindow -Wait -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}

# 3. Remove Desktop and Start Menu Shortcuts
Write-Host "Removing shortcuts..." -ForegroundColor DarkGray
$desktopShortcut = [System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), "Oberleaf.lnk")
$startMenuShortcut = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Oberleaf.lnk")
$altDesktopShortcut = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop\Oberleaf.lnk")

foreach ($s in @($desktopShortcut, $startMenuShortcut, $altDesktopShortcut)) {
    if (Test-Path $s) {
        try { Remove-Item -LiteralPath $s -Force -ErrorAction SilentlyContinue } catch {}
    }
}

# 4. Remove File Explorer Context Menu entries
Write-Host "Removing File Explorer context menu integration..." -ForegroundColor DarkGray
$regShell1 = "HKCU:\Software\Classes\Directory\shell\Oberleaf"
$regShell2 = "HKCU:\Software\Classes\Directory\Background\shell\Oberleaf"
foreach ($r in @($regShell1, $regShell2)) {
    if (Test-Path $r) {
        try { Remove-Item -Path $r -Recurse -Force -ErrorAction SilentlyContinue } catch {}
    }
}

# 5. Remove Windows Settings Uninstall registration
Write-Host "Unregistering from Windows Installed Apps..." -ForegroundColor DarkGray
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Oberleaf"
if (Test-Path $uninstallKey) {
    try { Remove-Item -Path $uninstallKey -Recurse -Force -ErrorAction SilentlyContinue } catch {}
}

# 6. Delete Application Directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Split-Path -Parent $scriptDir

# Check if running inside AppData installation
$isInstalledDir = $appDir.StartsWith($env:LOCALAPPDATA, [System.StringComparison]::OrdinalIgnoreCase)

if ($isInstalledDir -and (Test-Path $appDir)) {
    Write-Host "Cleaning up application files in: $appDir..." -ForegroundColor DarkGray

    if ($preserveProjects) {
        # If user has projects inside the app dir, move them safely to Documents
        $localProjects = Join-Path $appDir "projects"
        if (Test-Path $localProjects) {
            $docsBackup = [System.IO.Path]::Combine($env:USERPROFILE, "Documents", "Oberleaf Projects")
            if (-not (Test-Path [System.IO.Path]::GetDirectoryName($docsBackup))) {
                $docsBackup = Join-Path ([System.Environment]::GetFolderPath('MyDocuments')) "Oberleaf Projects"
            }
            try {
                if (-not (Test-Path $docsBackup)) {
                    New-Item -ItemType Directory -Path $docsBackup -Force | Out-Null
                }
                Get-ChildItem -LiteralPath $localProjects | ForEach-Object {
                    $dest = Join-Path $docsBackup $_.Name
                    if (-not (Test-Path $dest)) {
                        Move-Item -LiteralPath $_.FullName -Destination $dest -Force -ErrorAction SilentlyContinue
                    }
                }
                Write-Host "Preserved project documents in: $docsBackup" -ForegroundColor Green
            } catch {}
        }
    }

    # Use detached background process to delete directory after this script exits
    $delCmd = "Start-Sleep -Seconds 2; Remove-Item -LiteralPath '$appDir' -Recurse -Force -ErrorAction SilentlyContinue"
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"$delCmd`"" -WindowStyle Hidden
}

# 7. Refresh Windows Shell Icon Cache
try {
    if (-not ([System.Management.Automation.PSTypeName]'Win32.ShellNotification').Type) {
        $code = @'
        [System.Runtime.InteropServices.DllImport("Shell32.dll")]
        public static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2);
'@
        Add-Type -MemberDefinition $code -Name "ShellNotification" -Namespace "Win32" -ErrorAction SilentlyContinue
    }
    [Win32.ShellNotification]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
} catch {}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Oberleaf has been successfully uninstalled.             " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
if ($preserveProjects) {
    Write-Host "  Your project documents remain untouched." -ForegroundColor Cyan
}

if (Test-IsInteractive) {
    [System.Windows.Forms.MessageBox]::Show(
        "Oberleaf has been successfully uninstalled." + $(if ($preserveProjects) { "`n`nYour LaTeX project documents were preserved." } else { "" }),
        "Uninstall Complete",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
}

exit 0
