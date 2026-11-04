' DiwaliPlay Kiosk Bridge Silent Runner (Windowless)
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strCurDir = fso.GetParentFolderName(WScript.ScriptFullName)
strCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & strCurDir & "\kiosk-bridge.ps1"""
WshShell.Run strCommand, 0, False

