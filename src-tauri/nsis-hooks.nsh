!macro NSIS_HOOK_PREUNINSTALL
  RMDir /r "$INSTDIR\reline_ws"
  RMDir /r "$INSTDIR\uv_bin"
  Delete "$INSTDIR\config.json"
!macroend