' DiwaliPlay Remote Kiosk Cloud Agent Hidden Launcher
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = currentDir & "\kiosk-cloud-agent.ps1"
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """"
WshShell.Run cmd, 0, False

