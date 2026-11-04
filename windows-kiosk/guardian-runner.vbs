' DiwaliPlay Windows Kiosk Silent Guardian Launcher
' Runs guardian-keys.ps1 completely in background with zero console window flicker

Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")

strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
strPsScript = strScriptDir & "\guardian-keys.ps1"

' Build PowerShell invocation command line with ExecutionPolicy Bypass and Hidden WindowStyle
strCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & strPsScript & """"

' Run command with window style 0 (SW_HIDE) and False (do not wait for termination)
objShell.Run strCommand, 0, False

