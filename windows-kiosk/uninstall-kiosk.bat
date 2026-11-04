@echo off
title DiwaliPlay Windows Kiosk Uninstaller
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "uninstall-kiosk.ps1"
echo.
pause

