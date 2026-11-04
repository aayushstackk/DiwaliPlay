; ==============================================================================
; DiwaliPlay NSIS Installer Custom Hooks
; Pre-installation and uninstallation process termination hooks
; Prevents "DiwaliPlay cannot be closed" error by gracefully stopping watchdog,
; guardian, bridge and running DiwaliPlay application before file extraction.
; Automatically registers kiosk services upon installation.
; ==============================================================================

!macro customInit
  ; Terminate running DiwaliPlay application and background kiosk services
  nsExec::Exec 'cmd.exe /c taskkill /F /IM DiwaliPlay.exe /T'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskWatchdog"'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskGuardian"'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskBridge"'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskCloudAgent"'
  nsExec::Exec 'powershell.exe -NoProfile -Command "Stop-Process -Name DiwaliPlay -Force -ErrorAction SilentlyContinue"'
  Sleep 1000
!macroend

!macro customInstall
  ; Grant write permissions on resources\windows-kiosk so standard users can write config & logs
  nsExec::Exec 'cmd.exe /c icacls.exe "$INSTDIR\resources\windows-kiosk" /grant "Users":(OI)(CI)F /T /C /Q'

  ; Register scheduled tasks (Bridge, Watchdog, Guardian) and start the local bridge service
  nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\windows-kiosk\install-kiosk.ps1"'
!macroend

!macro customUnInit
  ; Terminate running DiwaliPlay application and background kiosk services on uninstall
  nsExec::Exec 'cmd.exe /c taskkill /F /IM DiwaliPlay.exe /T'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskWatchdog"'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskGuardian"'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskBridge"'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskCloudAgent"'
  nsExec::Exec 'cmd.exe /c schtasks /Delete /TN "DiwaliPlayKioskWatchdog" /F'
  nsExec::Exec 'cmd.exe /c schtasks /Delete /TN "DiwaliPlayKioskGuardian" /F'
  nsExec::Exec 'cmd.exe /c schtasks /Delete /TN "DiwaliPlayKioskBridge" /F'
  nsExec::Exec 'cmd.exe /c schtasks /Delete /TN "DiwaliPlayKioskCloudAgent" /F'
  nsExec::Exec 'powershell.exe -NoProfile -Command "Stop-Process -Name DiwaliPlay -Force -ErrorAction SilentlyContinue"'
  Sleep 1000
!macroend
