# Oberleaf - Windows Integration Script
# Creates Start Menu, Desktop shortcuts, File Explorer context menu, and Uninstaller registration
param(
    [switch]$NoDesktop = $false,
    [switch]$NoStartMenu = $false,
    [switch]$NoContextMenu = $false
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$StartMenuPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs")
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$AltDesktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")

# 1. Compile fresh multi-resolution icons from assets/icon.svg if Node and generator exist
$IconGenerator = [System.IO.Path]::Combine($ProjectRoot, "scripts\generate-icons.cjs")
if (Test-Path $IconGenerator) {
    try {
        Write-Host "Compiling fresh icons from assets\icon.svg..." -ForegroundColor Cyan
        & node $IconGenerator
    } catch {
        Write-Warning "Could not compile icons: $_"
    }
}

$VbsLauncher = [System.IO.Path]::Combine($ProjectRoot, "scripts\launch.vbs")
$IconPath = [System.IO.Path]::Combine($ProjectRoot, "assets\icon.ico")

Write-Host "Setting up Oberleaf shortcuts with custom icon..." -ForegroundColor Cyan

$WshShell = New-Object -ComObject WScript.Shell

$TargetLocations = @(
    @{ Name = "Project Folder"; Path = [System.IO.Path]::Combine($ProjectRoot, "Oberleaf.lnk"); LegacyPath = [System.IO.Path]::Combine($ProjectRoot, "Overleaf Copy.lnk") }
)

if (-not $NoStartMenu) {
    $TargetLocations += @{ Name = "Start Menu (Windows Search)"; Path = [System.IO.Path]::Combine($StartMenuPath, "Oberleaf.lnk"); LegacyPath = [System.IO.Path]::Combine($StartMenuPath, "Overleaf Copy.lnk") }
}

if (-not $NoDesktop) {
    $TargetLocations += @{ Name = "Desktop"; Path = [System.IO.Path]::Combine($DesktopPath, "Oberleaf.lnk"); LegacyPath = [System.IO.Path]::Combine($DesktopPath, "Overleaf Copy.lnk") }
    if ($AltDesktopPath -ne $DesktopPath -and (Test-Path $AltDesktopPath)) {
        $TargetLocations += @{ Name = "User Desktop"; Path = [System.IO.Path]::Combine($AltDesktopPath, "Oberleaf.lnk"); LegacyPath = [System.IO.Path]::Combine($AltDesktopPath, "Overleaf Copy.lnk") }
    }
}

foreach ($loc in $TargetLocations) {
    # Remove legacy Overleaf Copy.lnk if present
    if ($loc.LegacyPath -and (Test-Path $loc.LegacyPath)) {
        Remove-Item $loc.LegacyPath -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $loc.Path) {
        Remove-Item $loc.Path -Force -ErrorAction SilentlyContinue
    }

    $Shortcut = $WshShell.CreateShortcut($loc.Path)
    $Shortcut.TargetPath = "wscript.exe"
    $Shortcut.Arguments = "`"$VbsLauncher`""
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.Description = "Oberleaf - Local LaTeX Editor with Instant Equation Preview"

    if (Test-Path $IconPath) {
        $Shortcut.IconLocation = "$IconPath,0"
    }

    $Shortcut.Save()
    (Get-Item $loc.Path).LastWriteTime = Get-Date
    Write-Host "[+] Created shortcut in $($loc.Name): $($loc.Path)" -ForegroundColor Green
}

# 2. File Explorer Context Menu Integration
if (-not $NoContextMenu) {
    try {
        Write-Host "Registering File Explorer context menu..." -ForegroundColor Cyan
        $vbsArg = "wscript.exe `"$VbsLauncher`""

        $regKey1 = "HKCU:\Software\Classes\Directory\shell\Oberleaf"
        New-Item -Path $regKey1 -Force | Out-Null
        Set-ItemProperty -Path $regKey1 -Name "(Default)" -Value "Open with Oberleaf"
        if (Test-Path $IconPath) { Set-ItemProperty -Path $regKey1 -Name "Icon" -Value "$IconPath,0" }
        $cmdKey1 = Join-Path $regKey1 "command"
        New-Item -Path $cmdKey1 -Force | Out-Null
        Set-ItemProperty -Path $cmdKey1 -Name "(Default)" -Value $vbsArg

        $regKey2 = "HKCU:\Software\Classes\Directory\Background\shell\Oberleaf"
        New-Item -Path $regKey2 -Force | Out-Null
        Set-ItemProperty -Path $regKey2 -Name "(Default)" -Value "Open with Oberleaf"
        if (Test-Path $IconPath) { Set-ItemProperty -Path $regKey2 -Name "Icon" -Value "$IconPath,0" }
        $cmdKey2 = Join-Path $regKey2 "command"
        New-Item -Path $cmdKey2 -Force | Out-Null
        Set-ItemProperty -Path $cmdKey2 -Name "(Default)" -Value $vbsArg
        Write-Host "[+] Registered 'Open with Oberleaf' in File Explorer right-click menu" -ForegroundColor Green
    } catch {
        Write-Warning "Could not register File Explorer context menu: $_"
    }
}

# 3. Register Uninstaller in Windows Settings -> Installed Apps
try {
    Write-Host "Registering in Windows Installed Apps..." -ForegroundColor Cyan
    $uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Oberleaf"
    if (-not (Test-Path $uninstallKey)) {
        New-Item -Path $uninstallKey -Force | Out-Null
    }
    $uninstallBat = Join-Path $ProjectRoot "Uninstall-Oberleaf.bat"
    $uninstallPs1 = Join-Path $ProjectRoot "scripts\uninstall.ps1"

    Set-ItemProperty -Path $uninstallKey -Name "DisplayName" -Value "Oberleaf - Scholarly TeX Studio"
    Set-ItemProperty -Path $uninstallKey -Name "DisplayVersion" -Value "1.0.0"
    Set-ItemProperty -Path $uninstallKey -Name "Publisher" -Value "Oberleaf"
    Set-ItemProperty -Path $uninstallKey -Name "InstallLocation" -Value $ProjectRoot
    if (Test-Path $IconPath) { Set-ItemProperty -Path $uninstallKey -Name "DisplayIcon" -Value "$IconPath,0" }
    Set-ItemProperty -Path $uninstallKey -Name "UninstallString" -Value "`"$uninstallBat`""
    Set-ItemProperty -Path $uninstallKey -Name "QuietUninstallString" -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$uninstallPs1`" -Silent"
    Set-ItemProperty -Path $uninstallKey -Name "EstimatedSize" -Value 250000 -Type DWord
    Set-ItemProperty -Path $uninstallKey -Name "URLInfoAbout" -Value "https://friendly-learning-srmap.vercel.app/oberleaf"
    Set-ItemProperty -Path $uninstallKey -Name "NoModify" -Value 1 -Type DWord
    Set-ItemProperty -Path $uninstallKey -Name "NoRepair" -Value 1 -Type DWord
    Write-Host "[+] Registered in Windows Settings Installed Apps" -ForegroundColor Green
} catch {
    Write-Warning "Could not register uninstaller in registry: $_"
}

# 4. Invalidate Windows Shell icon cache
Write-Host "Refreshing Windows icon cache..." -ForegroundColor Cyan
try {
    if (-not ([System.Management.Automation.PSTypeName]'Win32.ShellNotification').Type) {
        $code = @'
        [System.Runtime.InteropServices.DllImport("Shell32.dll")]
        public static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2);
'@
        Add-Type -MemberDefinition $code -Name "ShellNotification" -Namespace "Win32" -ErrorAction SilentlyContinue
    }
    [Win32.ShellNotification]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero) # SHCNE_ASSOCCHANGED
} catch {}

Write-Host ""
Write-Host "ALL SET!" -ForegroundColor Green
Write-Host "1. Press Windows Key and search 'oberleaf' or 'Oberleaf' to find and open it." -ForegroundColor Cyan
Write-Host "2. Or double-click the 'Oberleaf' shortcut on your Desktop or project folder." -ForegroundColor Cyan
