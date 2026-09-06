# Oberleaf - Windows Integration Script
# Creates Start Menu and Desktop shortcuts with custom icon

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
    @{ Name = "Start Menu (Windows Search)"; Path = [System.IO.Path]::Combine($StartMenuPath, "Oberleaf.lnk"); LegacyPath = [System.IO.Path]::Combine($StartMenuPath, "Overleaf Copy.lnk") },
    @{ Name = "Desktop"; Path = [System.IO.Path]::Combine($DesktopPath, "Oberleaf.lnk"); LegacyPath = [System.IO.Path]::Combine($DesktopPath, "Overleaf Copy.lnk") },
    @{ Name = "Project Folder"; Path = [System.IO.Path]::Combine($ProjectRoot, "Oberleaf.lnk"); LegacyPath = [System.IO.Path]::Combine($ProjectRoot, "Overleaf Copy.lnk") }
)

if ($AltDesktopPath -ne $DesktopPath -and (Test-Path $AltDesktopPath)) {
    $TargetLocations += @{ Name = "User Desktop"; Path = [System.IO.Path]::Combine($AltDesktopPath, "Oberleaf.lnk"); LegacyPath = [System.IO.Path]::Combine($AltDesktopPath, "Overleaf Copy.lnk") }
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

# Invalidate Windows Shell icon cache
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

# Windows Search caches the old icon until SearchApp restarts on its own. We
# used to force-kill SearchApp/SearchHost here to make the new icon appear
# instantly, but a downloaded script that terminates system processes is a
# textbook behaviour-monitoring trigger and Defender was quarantining the whole
# installer over it. SHChangeNotify above is enough for Desktop and Start Menu;
# the search result catches up by itself after a sign-out.

Write-Host ""
Write-Host "ALL SET!" -ForegroundColor Green
Write-Host "1. Press Windows Key and search 'oberleaf' or 'Oberleaf' to find and open it." -ForegroundColor Cyan
Write-Host "2. Or double-click the 'Oberleaf' shortcut on your Desktop or project folder." -ForegroundColor Cyan




