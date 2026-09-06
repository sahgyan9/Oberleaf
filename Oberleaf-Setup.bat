@echo off
setlocal
title Oberleaf - Scholarly TeX Studio Setup

set "LOG=%TEMP%\oberleaf-setup.log"
set "PS1=%TEMP%\oberleaf_install_%RANDOM%%RANDOM%.ps1"
set "ISTEMP="
set "URL1=https://friendly-learning-srmap.vercel.app/downloads/install.ps1"
set "URL2=https://raw.githubusercontent.com/sahgyan9/Oberleaf/main/scripts/install.ps1"

echo ==========================================================
echo         Oberleaf - Scholarly TeX Studio Setup
echo     Fast, Local-First LaTeX Without Cloud Timeouts
echo ==========================================================
echo.
echo This window stays open until you close it, so you can read
echo any message it prints. A full log is written to:
echo   %LOG%
echo.

>"%LOG%" echo [%DATE% %TIME%] Oberleaf setup started

:: -----------------------------------------------------------------
:: Prefer a bundled installer. This is the case when the file came
:: from the .zip download or sits inside an Oberleaf checkout, and it
:: skips the network entirely - the most reliable path by far.
:: -----------------------------------------------------------------
if exist "%~dp0scripts\install.ps1" (
    echo Using the installer bundled in this Oberleaf checkout.
    set "PS1=%~dp0scripts\install.ps1"
    goto :run
)
if exist "%~dp0install.ps1" (
    echo Using install.ps1 found next to this file.
    set "PS1=%~dp0install.ps1"
    goto :run
)

:: -----------------------------------------------------------------
:: Otherwise download it. curl.exe ships with Windows 10 1803 and up.
:: -f is what matters: it makes curl fail on a 404 instead of quietly
:: saving the server's HTML error page as if it were the installer.
:: -----------------------------------------------------------------
echo Downloading the Oberleaf installer...
set "ISTEMP=1"
where curl.exe >nul 2>&1
if errorlevel 1 goto :nocurl

curl.exe -fsSL --retry 2 --connect-timeout 20 -o "%PS1%" "%URL1%" >>"%LOG%" 2>&1
if not errorlevel 1 goto :verify
echo   Primary mirror did not answer, trying GitHub...
curl.exe -fsSL --retry 2 --connect-timeout 20 -o "%PS1%" "%URL2%" >>"%LOG%" 2>&1
if not errorlevel 1 goto :verify
goto :dlfail

:nocurl
echo   curl.exe is unavailable on this Windows build, using PowerShell...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -Uri $env:URL1 -OutFile $env:PS1 -UseBasicParsing } catch { Invoke-WebRequest -Uri $env:URL2 -OutFile $env:PS1 -UseBasicParsing }" >>"%LOG%" 2>&1
if errorlevel 1 goto :dlfail
goto :verify

:: -----------------------------------------------------------------
:: Make sure what landed is actually the installer. A misconfigured
:: host or a captive-portal Wi-Fi page will happily return HTML with
:: a 200 status, and running that through PowerShell is exactly the
:: wall of red errors that made this window slam shut before.
:: -----------------------------------------------------------------
:verify
if not exist "%PS1%" goto :dlfail
findstr /I /C:"<!DOCTYPE" /C:"<html" "%PS1%" >nul 2>&1
if not errorlevel 1 goto :badfile
findstr /I /C:"Oberleaf" "%PS1%" >nul 2>&1
if errorlevel 1 goto :badfile

:: Clear the "downloaded from the internet" mark so Windows does not
:: refuse to run the script.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath $env:PS1" >>"%LOG%" 2>&1

:run
echo.
echo Starting the installer. The first run can take several minutes
echo because Git, Node.js and MiKTeX may need to be installed.
echo If Windows asks for permission, choose Yes.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%ERRORLEVEL%"
if defined ISTEMP del /f /q "%PS1%" >nul 2>&1

echo.
if "%RC%"=="0" goto :ok
echo ==========================================================
echo   Setup stopped with exit code %RC%.
echo   The full log is at:
echo     %LOG%
echo   Please send that file along when reporting the problem.
echo ==========================================================
goto :end

:ok
echo ==========================================================
echo   Oberleaf setup finished.
echo   Open it from the Oberleaf shortcut on your Desktop, or
echo   press the Windows key and type: oberleaf
echo ==========================================================
goto :end

:dlfail
echo.
echo   Could not download the Oberleaf installer.
echo   Tried:
echo     %URL1%
echo     %URL2%
echo.
echo   Usual causes: no internet, campus Wi-Fi still waiting on a
echo   login page, or antivirus blocking the download.
echo   Workaround: open the GitHub link above in a browser, save the
echo   file as install.ps1 in this same folder, and run this file again.
goto :end

:badfile
echo.
echo   The downloaded file is not the Oberleaf installer - the server
echo   returned an error page instead. Nothing was run.
echo   The file was left at:
echo     %PS1%
echo   Please report this along with %LOG%
goto :end

:end
echo.
echo Press any key to close this window...
pause >nul
endlocal
