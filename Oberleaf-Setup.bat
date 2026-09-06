@echo off
setlocal
title Oberleaf - Scholarly TeX Studio Setup
echo ==========================================================
echo       Oberleaf - Scholarly TeX Studio Setup
echo    Fast, Local-First LaTeX Without Cloud Timeouts
echo ==========================================================
echo.
echo Launching automated setup...
echo.

if exist "%~dp0scripts\install.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $script = (New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/sahgyan9/Oberleaf/main/scripts/install.ps1'); Invoke-Expression $script"
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Setup encountered a notice or error.
    echo Press any key to exit...
    pause >nul
)
