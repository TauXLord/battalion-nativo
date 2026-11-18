@echo off
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo O Battalion local precisa do Node.js para iniciar.
  pause
  exit /b 1
)
node server.mjs --open %*
if errorlevel 1 pause
