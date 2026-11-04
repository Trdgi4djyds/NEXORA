; Installeur NEXORA (per-user, sans droits administrateur) — NSIS 3 / MUI2.
Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!define APP "NEXORA"
!define VER "1.1.0"
!define PUB "IPPOO"
!define EXE "NEXORA.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}"

Name "${APP}"
OutFile "/home/claude/vitrine/dist/NEXORA-Setup-1.1.exe"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "Software\${APP}" "InstallDir"
SetCompressor /SOLID lzma

VIProductVersion "1.1.0.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileVersion" "1.1.0.0"
VIAddVersionKey "ProductVersion" "${VER}"
VIAddVersionKey "CompanyName" "${PUB}"
VIAddVersionKey "LegalCopyright" "© ${PUB}"
VIAddVersionKey "FileDescription" "Installeur de ${APP}"

!define MUI_ICON "/home/claude/vitrine/build/icon.ico"
!define MUI_UNICON "/home/claude/vitrine/build/icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer ${APP}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
UninstPage custom un.DataPageCreate un.DataPageLeave
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

; ---------------------------------------------------------------- NEXORA ouvert pendant l'installation
!macro CLOSE_NEXORA UN
Function ${UN}CloseNexora
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq NEXORA.exe" /NH | find /I "NEXORA.exe"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "NEXORA est ouvert. Il va être fermé pour continuer (enregistre ton travail en cours)." IDOK +2
    Abort
    nsExec::Exec 'taskkill /IM NEXORA.exe /T /F'
    Sleep 1200
  ${EndIf}
FunctionEnd
!macroend
!insertmacro CLOSE_NEXORA ""
!insertmacro CLOSE_NEXORA "un."

Function .onInit
  Call CloseNexora
FunctionEnd

Section "NEXORA" SecMain
  SetOutPath "$INSTDIR"
  ; Une installation précédente est remplacée proprement.
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "/home/claude/vitrine/dist/NEXORA-win32-x64/*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ; Icône dans un fichier à part, au nom versionné : Windows ne peut pas réutiliser l'ancienne image
  ; qu'il garde en cache pour l'exécutable (raccourcis, menu Démarrer, barre des tâches).
  Delete "$INSTDIR\nexora-*.ico"
  File "/oname=nexora-${VER}-2.ico" "/home/claude/vitrine/build/icon.ico"
  !define ICO "$INSTDIR\nexora-${VER}-2.ico"

  ; Anciens raccourcis (Vitrine, ou NEXORA avec l'ancienne icône) remplacés.
  Delete "$DESKTOP\Vitrine.lnk"
  Delete "$SMPROGRAMS\Vitrine.lnk"
  Delete "$SMPROGRAMS\Vitrine\Vitrine.lnk"
  RMDir "$SMPROGRAMS\Vitrine"
  Delete "$DESKTOP\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}\${APP}.lnk"

  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortCut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${EXE}" "" "${ICO}" 0
  CreateShortCut "$SMPROGRAMS\${APP}\Désinstaller ${APP}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}" "" "${ICO}" 0
  ; Raccourci épinglé à la barre des tâches : recréé avec la nouvelle icône s'il existe.
  IfFileExists "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${APP}.lnk" 0 +2
    CreateShortCut "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${APP}.lnk" "$INSTDIR\${EXE}" "" "${ICO}" 0

  WriteRegStr HKCU "Software\${APP}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VER}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PUB}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "${ICO}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"

  ; Le cache d'icônes de Windows est rafraîchi : la nouvelle icône apparaît sans redémarrer.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'
  IfFileExists "$SYSDIR\ie4uinit.exe" 0 +2
    nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
SectionEnd

; ---------------------------------------------------------------- désinstallation : conserver ou supprimer
; Données de NEXORA (le dossier garde l'ancien nom « Vitrine » pour ne pas perdre les clés de signature) :
!define DATA_DIR "$APPDATA\Vitrine"
Var ToolsBox
Var DataBox
Var PurgeTools
Var PurgeData

Function un.onInit
  SetShellVarContext current
  ; Par défaut : tout est conservé. /PURGE (tout supprimer) et /PURGETOOLS (outils seuls) en mode silencieux.
  StrCpy $PurgeTools 0
  StrCpy $PurgeData 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/PURGE" $R1
  ${IfNot} ${Errors}
    StrCpy $PurgeData 1
    StrCpy $PurgeTools 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/PURGETOOLS" $R1
  ${IfNot} ${Errors}
    StrCpy $PurgeTools 1
  ${EndIf}
  Call un.CloseNexora
FunctionEnd

Function un.DataPageCreate
  !insertmacro MUI_HEADER_TEXT "Tes données" "Conserver ou supprimer ce que NEXORA a enregistré sur ce PC"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 30u "Par défaut, tout est conservé : si tu réinstalles NEXORA, tu retrouves tes projets, réglages et outils. Tes photos, vidéos et documents (dossiers Images, Vidéos, Documents) ne sont jamais supprimés."
  Pop $0
  ${NSD_CreateCheckbox} 0 36u 100% 12u "Supprimer les outils téléchargés (SDK Android, Java, kit de notifications, éditeur de code…)"
  Pop $ToolsBox
  ${NSD_CreateLabel} 12u 49u 95% 18u "Libère plusieurs Go. Tes projets, réglages et clés de signature sont gardés ; NEXORA retéléchargera ces outils au besoin."
  Pop $0
  ${NSD_CreateCheckbox} 0 72u 100% 12u "Supprimer aussi toutes mes données NEXORA (irréversible)"
  Pop $DataBox
  ${NSD_CreateLabel} 12u 85u 95% 34u "Projets, réglages, connexions, historique de supervision ET clés de signature de tes applications Android. Sans ces clés, tu ne pourras plus publier de mise à jour de tes applications sur le Play Store : fais d'abord une sauvegarde (Réglages › Sauvegarde)."
  Pop $0
  ${If} $PurgeTools == 1
    ${NSD_Check} $ToolsBox
  ${EndIf}
  ${If} $PurgeData == 1
    ${NSD_Check} $DataBox
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function un.DataPageLeave
  ${NSD_GetState} $ToolsBox $0
  ${NSD_GetState} $DataBox $1
  StrCpy $PurgeTools 0
  StrCpy $PurgeData 0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $PurgeTools 1
  ${EndIf}
  ${If} $1 == ${BST_CHECKED}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Supprimer définitivement tes projets, réglages et clés de signature NEXORA ?$\r$\n$\r$\nCette action est irréversible." IDYES +2
    Abort
    StrCpy $PurgeData 1
    StrCpy $PurgeTools 1
  ${EndIf}
FunctionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}\Désinstaller ${APP}.lnk"
  Delete "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${APP}.lnk"
  RMDir "$SMPROGRAMS\${APP}"
  ; Dossier du programme : supprimé seulement s'il contient bien NEXORA (jamais un autre dossier choisi par erreur).
  ${GetFileName} "$INSTDIR" $0
  ${If} ${FileExists} "$INSTDIR\${EXE}"
  ${AndIf} $0 == "${APP}"
    RMDir /r /REBOOTOK "$INSTDIR"
  ${Else}
    Delete "$INSTDIR\${EXE}"
    Delete "$INSTDIR\Uninstall.exe"
  ${EndIf}
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\${APP}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP}"

  ${If} $PurgeTools == 1
  ${AndIf} "$APPDATA" != ""
    ; Outils et caches retéléchargeables (les clés de signature, réglages et projets restent).
    RMDir /r "${DATA_DIR}\android\sdk"
    RMDir /r "${DATA_DIR}\android\jdk-21"
    RMDir /r "${DATA_DIR}\android\downloads"
    RMDir /r "${DATA_DIR}\android\push"
    Delete "${DATA_DIR}\android\bundletool.jar"
    RMDir /r "${DATA_DIR}\outils"
    RMDir /r "${DATA_DIR}\bin"
    RMDir /r "${DATA_DIR}\vscode"
    RMDir /r "${DATA_DIR}\dev-extensions"
    RMDir /r "${DATA_DIR}\Cache"
    RMDir /r "${DATA_DIR}\Code Cache"
    RMDir /r "${DATA_DIR}\GPUCache"
    RMDir /r "${DATA_DIR}\DawnGraphiteCache"
    RMDir /r "${DATA_DIR}\DawnWebGPUCache"
    RMDir /r "${DATA_DIR}\Crashpad"
    ${If} "$LOCALAPPDATA" != ""
      RMDir /r "$LOCALAPPDATA\${APP}"
    ${EndIf}
    ${If} "$PROFILE" != ""
      RMDir /r "$PROFILE\NEXORA-kit"
    ${EndIf}
    RMDir /r "$WINDIR\..\NEXORA-kit"
  ${EndIf}

  ${If} $PurgeData == 1
  ${AndIf} "$APPDATA" != ""
    RMDir /r "${DATA_DIR}"
    RMDir /r "$APPDATA\${APP}"
    DeleteRegKey HKCU "Software\Classes\nexora"
  ${EndIf}
SectionEnd
