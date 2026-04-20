!macro NSIS_HOOK_POSTINSTALL
  ; Refresh Windows icon cache so taskbar/desktop shortcuts pick up the new icon
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'
!macroend
