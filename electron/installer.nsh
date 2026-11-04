; ==============================================================================
; DiwaliPlay NSIS Installer Custom Hooks
; Pre-installation and uninstallation process termination hooks
; Prevents "DiwaliPlay cannot be closed" error by gracefully stopping watchdog,
; guardian, bridge and running DiwaliPlay application before file extraction.
; ==============================================================================

!macro customInit
  ; Terminate running DiwaliPlay application and background kiosk services
  nsExec::Exec 'cmd.exe /c taskkill /F /IM DiwaliPlay.exe /T'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskWatchdog"'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskGuardian"'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskBridge"'
  nsExec::Exec 'powershell.exe -NoProfile -Command "Stop-Process -Name DiwaliPlay -Force -ErrorAction SilentlyContinue"'
  Sleep 1000
!macroend

!macro customUnInit
  ; Terminate running DiwaliPlay application and background kiosk services on uninstall
  nsExec::Exec 'cmd.exe /c taskkill /F /IM DiwaliPlay.exe /T'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskWatchdog"'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskGuardian"'
  nsExec::Exec 'cmd.exe /c schtasks /End /TN "DiwaliPlayKioskBridge"'
  nsExec::Exec 'powershell.exe -NoProfile -Command "Stop-Process -Name DiwaliPlay -Force -ErrorAction SilentlyContinue"'
  Sleep 1000
!macroend
