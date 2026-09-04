# Overleaf Copy - Windows Integration Script
# Creates Start Menu and Desktop shortcuts with custom icon

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$StartMenuPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs")
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')

$VbsLauncher = [System.IO.Path]::Combine($ProjectRoot, "scripts\launch.vbs")
$IconPath = [System.IO.Path]::Combine($ProjectRoot, "assets\icon.ico")

Write-Host "Setting up Overleaf Copy shortcuts with custom icon..." -ForegroundColor Cyan

$WshShell = New-Object -ComObject WScript.Shell

$TargetLocations = @(
    @{ Name = "Start Menu (Windows Search)"; Path = [System.IO.Path]::Combine($StartMenuPath, "Overleaf Copy.lnk") },
    @{ Name = "Desktop"; Path = [System.IO.Path]::Combine($DesktopPath, "Overleaf Copy.lnk") },
    @{ Name = "Project Folder"; Path = [System.IO.Path]::Combine($ProjectRoot, "Overleaf Copy.lnk") }
)

foreach ($loc in $TargetLocations) {
    $Shortcut = $WshShell.CreateShortcut($loc.Path)
    $Shortcut.TargetPath = "wscript.exe"
    $Shortcut.Arguments = "`"$VbsLauncher`""
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.Description = "Overleaf Copy - Local LaTeX Editor with Instant Equation Preview"

    if (Test-Path $IconPath) {
        $Shortcut.IconLocation = "$IconPath,0"
    }

    $Shortcut.Save()
    Write-Host "[+] Created shortcut in $($loc.Name): $($loc.Path)" -ForegroundColor Green
}

Write-Host ""
Write-Host "ALL SET!" -ForegroundColor Green
Write-Host "1. Press Windows Key and search 'overleaf' or 'Overleaf Copy' to find and open it." -ForegroundColor Cyan
Write-Host "2. Or double-click the 'Overleaf Copy' shortcut on your Desktop or project folder." -ForegroundColor Cyan


