@echo off
title DiwaliPlay Windows Kiosk Installer
cd /d "%~dp0"
echo Requesting administrator privileges if available...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "install-kiosk.ps1"
echo.
pause

