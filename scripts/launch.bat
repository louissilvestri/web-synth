@echo off
rem ---------------------------------------------------------------------------
rem  Web Synth launcher
rem  - If the dev server is already listening on the port: open the app in the
rem    Windows default browser.
rem  - If not (and the port is therefore free): start the dev server in its own
rem    window, wait for it to come up, then open the browser.
rem  Lives in scripts\; resolves the repo root relative to itself, so it works
rem  from a shortcut or double-click too.
rem ---------------------------------------------------------------------------
setlocal
set "PORT=3000"
set "URL=http://localhost:%PORT%"
set "APPDIR=%~dp0.."

netstat -ano | findstr /C:":%PORT% " | findstr /C:"LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo Web Synth is already running on port %PORT% - opening browser...
    start "" "%URL%"
    exit /b 0
)

echo Port %PORT% is free - starting the Web Synth dev server...
start "Web Synth dev server" cmd /k "cd /d "%APPDIR%" && npm run dev"

echo Waiting for the server to come up...
for /l %%i in (1,1,60) do (
    timeout /t 1 /nobreak >nul
    netstat -ano | findstr /C:":%PORT% " | findstr /C:"LISTENING" >nul 2>&1
    if not errorlevel 1 goto :up
)
echo Server did not come up within 60 seconds - check the dev-server window.
exit /b 1

:up
echo Server is up - opening browser...
start "" "%URL%"
exit /b 0
