@echo off
title DiwaliPlay Back Protection Controller
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "toggle-protection.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Operation encountered an error.
)
echo.
pause

