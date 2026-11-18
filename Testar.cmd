@echo off
rem Roda os testes automáticos do Battalion nativo (motor, mapas, campanha em dupla e servidor da rede).
cd /d "%~dp0"
node --test "testes/*.test.mjs"
pause
