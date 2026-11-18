@echo off
cd /d "%~dp0moderno"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22 ou mais recente.
  pause
  exit /b 1
)
if not exist dist\index.html (
  if not exist node_modules\.bin\vite.cmd call npm ci
  if errorlevel 1 goto error
  call npm run build
  if errorlevel 1 goto error
)
node play.mjs --open
if errorlevel 1 goto error
exit /b 0
:error
pause
exit /b 1
