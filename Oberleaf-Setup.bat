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
    :: Download install.ps1 to a temp file first, then run it with -File.
    :: This avoids Invoke-Expression quote/encoding parse errors.
    set "TMPSCRIPT=%TEMP%\oberleaf_install_%RANDOM%.ps1"
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://raw.githubusercontent.com/sahgyan9/Oberleaf/main/scripts/install.ps1', '%TMPSCRIPT%')"
    if exist "%TMPSCRIPT%" (
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TMPSCRIPT%"
        del /f /q "%TMPSCRIPT%" 2>nul
    ) else (
        echo [!] Failed to download Oberleaf installer. Check your internet connection.
        echo     Try manually visiting: https://github.com/sahgyan9/Oberleaf
    )
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Setup encountered a notice or error.
    echo Press any key to exit...
    pause >nul
)
