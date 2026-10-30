@echo off
chcp 65001 >nul
title MAERS-Game Dev Server
cd /d "%~dp0"
echo.
echo  Starting MAERS-Game local server...
echo  Press Ctrl+C to stop.
echo.
python server.py
pause
