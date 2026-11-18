@echo off
:: Stops Oberleaf and every background process it started (API server,
:: Vite dev server, npm and cmd wrappers). Same as Quit in the page.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
echo.
echo Press any key to close this window...
pause >nul
