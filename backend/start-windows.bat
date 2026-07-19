@echo off
title wall.io backend
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js was not found on this computer.
  echo  Download and install it from: https://nodejs.org  (choose the LTS version)
  echo  Then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies, this only happens once...
  call npm install
  if errorlevel 1 (
    echo.
    echo  npm install failed. Check the messages above.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo  Starting the wall.io backend on http://localhost:3001
echo  Leave this window open while you use the extension.
echo  Close this window (or press Ctrl+C) to stop it.
echo.
call npm start

pause
