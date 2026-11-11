//go:build windows

// Windows : fenêtres natives du lanceur (ui_windows.go), registre par l'API de Windows (advapi32), raccourcis par
// l'interface IShellLinkW (COM), instance unique (mutex nommé). NEXORA #083 : plus aucun PowerShell ni reg.exe
// (aucune console, aucun script lancé). Aucun droit d'administrateur : tout est écrit dans le profil de
// l'utilisateur (HKCU, %LOCALAPPDATA%).
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

const (
	uninstallKey  = `Software\Microsoft\Windows\CurrentVersion\Uninstall\NEXORA-Devs-Toolbox`
	protocolKey   = `Software\Classes\nexora`
	novxExtKey    = `Software\Classes\.novx`
	novxTypeKey   = `Software\Classes\NEXORA.Projet`
	siteURL       = "https://nexoradevs.online/"
	createNoWin   = 0x08000000
	detachedProc  = 0x00000008
	newProcGroup  = 0x00000200
	mbIconError   = 0x10
	mbIconWarning = 0x30
	mbIconInfo    = 0x40
	keyWow64_64   = 0x0100
)

var (
	user32       = syscall.NewLazyDLL("user32.dll")
	kernel32     = syscall.NewLazyDLL("kernel32.dll")
	advapi32     = syscall.NewLazyDLL("advapi32.dll")
	ole32        = syscall.NewLazyDLL("ole32.dll")
	shell32      = syscall.NewLazyDLL("shell32.dll")
	pMessageBox  = user32.NewProc("MessageBoxW")
	pCreateMutex = kernel32.NewProc("CreateMutexW")
	pCloseHandle = kernel32.NewProc("CloseHandle")

	pRegCreateKeyEx = advapi32.NewProc("RegCreateKeyExW")
	pRegSetValueEx  = advapi32.NewProc("RegSetValueExW")
	pRegDeleteTree  = advapi32.NewProc("RegDeleteTreeW")
	pRegDeleteKey   = advapi32.NewProc("RegDeleteKeyW")

	pCoInitializeEx   = ole32.NewProc("CoInitializeEx")
	pCoUninitialize   = ole32.NewProc("CoUninitialize")
	pCoCreateInstance = ole32.NewProc("CoCreateInstance")
	pSHChangeNotify   = shell32.NewProc("SHChangeNotify")
)

func installRoot() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, "AppData", "Local")
	}
	return filepath.Join(base, "Programs", productName)
}

func singleInstance() (func(), bool) {
	name, _ := syscall.UTF16PtrFromString(`Local\NEXORA-Devs-Toolbox`)
	h, _, err := pCreateMutex.Call(0, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return func() {}, true
	}
	if errno, ok := err.(syscall.Errno); ok && errno == 183 { // ERROR_ALREADY_EXISTS
		pCloseHandle.Call(h)
		return func() {}, false
	}
	return func() { pCloseHandle.Call(h) }, true
}

// messageBox : repli si la fenêtre du lanceur ne peut pas s'ouvrir.
func messageBox(text string, flags uintptr) {
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(productName)
	pMessageBox.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), flags)
}

func showMessage(tone, title, msg string, flags uintptr) {
	if _, _, ok := runDialog(messageSpec(tone, title, msg)); !ok {
		messageBox(title+"\n\n"+msg, flags)
	}
}

func showError(err error) {
	showMessage("danger", "Une erreur est survenue", capitalize(err.Error())+".", mbIconError)
}
func showWarning(msg string) { showMessage("warning", "Attention", msg, mbIconWarning) }
func showInfo(msg string)    { showMessage("brand", "Information", msg, mbIconInfo) }

// showDone : fin d'une opération réussie (désinstallation).
func showDone(title, msg string) { showMessage("success", title, msg, mbIconInfo) }

func capitalize(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	return strings.ToUpper(string(r[0])) + string(r[1:])
}

func detach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: detachedProc | newProcGroup}
}

func commandFor(p string, args ...string) *exec.Cmd { return exec.Command(p, args...) }

// ---------------------------------------------------------------- écrans
// securityScreen : écran de sécurité ; renvoie l'action choisie, « quit » si la fenêtre est fermée.
func securityScreen(kind, title, msg string, actions []string) string {
	a, _, ok := runDialog(securitySpec(kind, title, msg, actions))
	if !ok {
		messageBox(title+"\n\n"+msg, mbIconError)
		return "quit"
	}
	for _, x := range actions {
		if x == a {
			return a
		}
	}
	return "quit"
}

// ---------------------------------------------------------------- registre (HKCU, sans reg.exe)
func utf16z(s string) []uint16 { return utf16.Encode([]rune(s + "\x00")) }

func regSet(key, name string, typ uint32, data []byte) error {
	k, _ := syscall.UTF16PtrFromString(key)
	var h syscall.Handle
	if r, _, _ := pRegCreateKeyEx.Call(uintptr(syscall.HKEY_CURRENT_USER), uintptr(unsafe.Pointer(k)), 0, 0, 0,
		0x20006, 0, uintptr(unsafe.Pointer(&h)), 0); r != 0 { // KEY_WRITE
		return fmt.Errorf("clé %s : %v", key, syscall.Errno(r))
	}
	defer syscall.RegCloseKey(h)
	var n *uint16
	if name != "" {
		n, _ = syscall.UTF16PtrFromString(name)
	}
	var p uintptr
	if len(data) > 0 {
		p = uintptr(unsafe.Pointer(&data[0]))
	}
	if r, _, _ := pRegSetValueEx.Call(uintptr(h), uintptr(unsafe.Pointer(n)), 0, uintptr(typ), p, uintptr(len(data))); r != 0 {
		return fmt.Errorf("valeur %s\\%s : %v", key, name, syscall.Errno(r))
	}
	return nil
}

func regSZ(key, name, value string) error {
	u := utf16z(value)
	return regSet(key, name, syscall.REG_SZ, unsafe.Slice((*byte)(unsafe.Pointer(&u[0])), len(u)*2))
}

func regDWORD(key, name string, v int64) error {
	d := uint32(v)
	return regSet(key, name, syscall.REG_DWORD, unsafe.Slice((*byte)(unsafe.Pointer(&d)), 4))
}

func regDelete(key string) {
	k, _ := syscall.UTF16PtrFromString(key)
	pRegDeleteTree.Call(uintptr(syscall.HKEY_CURRENT_USER), uintptr(unsafe.Pointer(k)))
	pRegDeleteKey.Call(uintptr(syscall.HKEY_CURRENT_USER), uintptr(unsafe.Pointer(k)))
}

// regRead : valeur texte (REG_SZ ou REG_EXPAND_SZ, non développée).
func regRead(root syscall.Handle, key, name string) string {
	k, _ := syscall.UTF16PtrFromString(key)
	var h syscall.Handle
	if syscall.RegOpenKeyEx(root, k, 0, syscall.KEY_READ|keyWow64_64, &h) != nil {
		return ""
	}
	defer syscall.RegCloseKey(h)
	n, _ := syscall.UTF16PtrFromString(name)
	var typ, size uint32
	if syscall.RegQueryValueEx(h, n, nil, &typ, nil, &size) != nil || size < 2 || (typ != syscall.REG_SZ && typ != syscall.REG_EXPAND_SZ) {
		return ""
	}
	buf := make([]uint16, size/2+1)
	if syscall.RegQueryValueEx(h, n, nil, &typ, (*byte)(unsafe.Pointer(&buf[0])), &size) != nil {
		return ""
	}
	return syscall.UTF16ToString(buf)
}

func shellFolder(name, fallback string) string {
	if v := regRead(syscall.HKEY_CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders`, name); v != "" {
		return os.ExpandEnv(winEnv(v))
	}
	return fallback
}

// winEnv : %USERPROFILE% → ${USERPROFILE} pour os.ExpandEnv.
func winEnv(s string) string {
	for {
		i := strings.Index(s, "%")
		if i < 0 {
			return s
		}
		j := strings.Index(s[i+1:], "%")
		if j < 0 {
			return s
		}
		s = s[:i] + "${" + s[i+1:i+1+j] + "}" + s[i+2+j:]
	}
}

// ---------------------------------------------------------------- raccourcis (IShellLinkW, sans script)
type guid struct {
	a    uint32
	b, c uint16
	d    [8]byte
}

var (
	clsidShellLink = guid{0x00021401, 0, 0, [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidShellLinkW  = guid{0x000214F9, 0, 0, [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidPersistFile = guid{0x0000010B, 0, 0, [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
)

// comObj : objet COM (pointeur vers sa table virtuelle).
type comObj struct{ vtbl *[32]uintptr }

// comCall : méthode n de la table virtuelle d'un objet COM.
func comCall(obj *comObj, n int, args ...uintptr) uintptr {
	r, _, _ := syscall.SyscallN(obj.vtbl[n], append([]uintptr{uintptr(unsafe.Pointer(obj))}, args...)...)
	return r
}

func wstr(s string) uintptr {
	p, _ := syscall.UTF16PtrFromString(s)
	return uintptr(unsafe.Pointer(p))
}

func createShortcut(lnk, target, dir, icon, desc string) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if r, _, _ := pCoInitializeEx.Call(0, 2); r == 0 || r == 1 { // S_OK, S_FALSE (COINIT_APARTMENTTHREADED)
		defer pCoUninitialize.Call()
	}
	var sl *comObj
	if r, _, _ := pCoCreateInstance.Call(uintptr(unsafe.Pointer(&clsidShellLink)), 0, 1, uintptr(unsafe.Pointer(&iidShellLinkW)), uintptr(unsafe.Pointer(&sl))); r != 0 || sl == nil {
		return fmt.Errorf("raccourci : objet indisponible (0x%x)", r)
	}
	defer comCall(sl, 2)           // Release
	comCall(sl, 20, wstr(target))  // SetPath
	comCall(sl, 9, wstr(dir))      // SetWorkingDirectory
	comCall(sl, 17, wstr(icon), 0) // SetIconLocation
	comCall(sl, 7, wstr(desc))     // SetDescription
	var pf *comObj
	if r := comCall(sl, 0, uintptr(unsafe.Pointer(&iidPersistFile)), uintptr(unsafe.Pointer(&pf))); r != 0 || pf == nil {
		return fmt.Errorf("raccourci : enregistrement indisponible (0x%x)", r)
	}
	defer comCall(pf, 2)
	if r := comCall(pf, 6, wstr(lnk), 1); r != 0 { // Save
		return fmt.Errorf("raccourci %s : 0x%x", filepath.Base(lnk), r)
	}
	return nil
}

func startMenuDir() string {
	return filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs")
}

// shortcuts : raccourcis du Bureau et du menu Démarrer (tous les deux, pour les retirer).
func shortcuts() []string {
	home, _ := os.UserHomeDir()
	return []string{
		filepath.Join(shellFolder("Desktop", filepath.Join(home, "Desktop")), productName+".lnk"),
		filepath.Join(startMenuDir(), productName+".lnk"),
	}
}

// wantedShortcuts : raccourcis choisis dans l'assistant d'installation (#084).
func wantedShortcuts(st *State) (want, drop []string) {
	all := shortcuts()
	for i, lnk := range all {
		if (i == 0 && st.NoDesktop) || (i == 1 && st.NoStartMenu) {
			drop = append(drop, lnk)
		} else {
			want = append(want, lnk)
		}
	}
	return want, drop
}

func dirSizeKB(root string) int64 {
	var n int64
	_ = filepath.Walk(root, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			n += info.Size()
		}
		return nil
	})
	return n / 1024
}

// register pose (ou met à jour après une nouvelle version) raccourcis, lien nexora:// et entrée de désinstallation.
func register(l Layout, st *State, m *Manifest) error {
	if st.Registered == version && st.RegisteredFor == m.Version {
		return nil
	}
	icon := filepath.Join(l.versionDir(m.Version), filepath.FromSlash(m.Exe))
	var errs []string
	want, drop := wantedShortcuts(st)
	for _, lnk := range drop {
		os.Remove(lnk)
	}
	for _, lnk := range want {
		_ = os.MkdirAll(filepath.Dir(lnk), 0o755)
		if err := createShortcut(lnk, l.Launcher, l.Root, icon, "Ouvre NEXORA après vérification"); err != nil {
			errs = append(errs, err.Error())
		}
	}
	q := `"` + l.Launcher + `"`
	steps := []error{
		regSZ(uninstallKey, "DisplayName", productName),
		regSZ(uninstallKey, "DisplayVersion", m.Version),
		regSZ(uninstallKey, "Publisher", "NEXORA"),
		regSZ(uninstallKey, "InstallLocation", l.Root),
		regSZ(uninstallKey, "DisplayIcon", l.Launcher+",0"),
		regSZ(uninstallKey, "UninstallString", q+" --uninstall"),
		regSZ(uninstallKey, "ModifyPath", q+" --repair"),
		regSZ(uninstallKey, "URLInfoAbout", siteURL),
		regSZ(uninstallKey, "HelpLink", siteURL+"licence"),
		regSZ(uninstallKey, "Comments", "Lanceur et mises à jour vérifiées de NEXORA"),
		regDWORD(uninstallKey, "NoRepair", 0),
		regDWORD(uninstallKey, "EstimatedSize", dirSizeKB(l.Root)),
		regSZ(protocolKey, "", "URL:NEXORA"),
		regSZ(protocolKey, "URL Protocol", ""),
		regSZ(protocolKey+`\DefaultIcon`, "", icon+",0"),
		regSZ(protocolKey+`\shell\open\command`, "", q+` "%1"`),
		// Projets .novx : double-clic → lanceur (vérification) → NEXORA.
		regSZ(novxExtKey, "", "NEXORA.Projet"),
		regSZ(novxTypeKey, "", "Projet NEXORA"),
		regSZ(novxTypeKey+`\DefaultIcon`, "", icon+",0"),
		regSZ(novxTypeKey+`\shell\open\command`, "", q+` "%1"`),
	}
	for _, e := range steps {
		if e != nil {
			errs = append(errs, e.Error())
			break
		}
	}
	pSHChangeNotify.Call(0x08000000, 0, 0, 0) // SHCNE_ASSOCCHANGED : icônes des .novx rafraîchies
	if len(errs) > 0 {
		return fmt.Errorf("%s", strings.Join(errs, " ; "))
	}
	st.Registered, st.RegisteredFor = version, m.Version
	return saveState(l, *st)
}

func unregister(l Layout) {
	for _, lnk := range shortcuts() {
		os.Remove(lnk)
	}
	regDelete(uninstallKey)
	regDelete(protocolKey)
	regDelete(novxTypeKey)
	regDelete(novxExtKey)
	pSHChangeNotify.Call(0x08000000, 0, 0, 0)
}

// scheduleRemoval : le lanceur ne peut pas se supprimer lui-même pendant qu'il tourne. NEXORA #084 : comme les
// désinstallateurs Windows, une copie temporaire du lanceur attend sa fin puis supprime le dossier (--cleanup) ;
// repli sur cmd.exe si la copie est impossible.
func scheduleRemoval(root string) {
	self, err := os.Executable()
	tmp := filepath.Join(os.TempDir(), fmt.Sprintf("nexora-desinstallation-%d.exe", os.Getpid()))
	if err == nil {
		if b, rerr := os.ReadFile(self); rerr == nil && os.WriteFile(tmp, b, 0o755) == nil {
			cmd := exec.Command(tmp, "--cleanup", root, fmt.Sprint(os.Getpid()))
			cmd.Dir = os.TempDir() // jamais le dossier à supprimer (un dossier courant ne peut pas être effacé)
			cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: detachedProc | newProcGroup}
			if cmd.Start() == nil {
				return
			}
		}
	}
	cmd := exec.Command("cmd.exe", "/c", "ping -n 4 127.0.0.1 >nul & rd /s /q \""+root+"\"")
	cmd.Dir = os.TempDir()
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWin | detachedProc, HideWindow: true}
	_ = cmd.Start()
}

var (
	pOpenProcess         = kernel32.NewProc("OpenProcess")
	pWaitForSingleObject = kernel32.NewProc("WaitForSingleObject")
	pMoveFileEx          = kernel32.NewProc("MoveFileExW")
)

func waitProcess(pid int, max time.Duration) {
	h, _, _ := pOpenProcess.Call(0x00100000, 0, uintptr(pid)) // SYNCHRONIZE
	if h == 0 {
		return // déjà terminé
	}
	defer pCloseHandle.Call(h)
	pWaitForSingleObject.Call(h, uintptr(max/time.Millisecond))
}

// selfDelete : la copie temporaire est retirée par Windows au prochain redémarrage si elle ne peut pas l'être avant.
func selfDelete() {
	self, err := os.Executable()
	if err != nil {
		return
	}
	p, _ := syscall.UTF16PtrFromString(self)
	pMoveFileEx.Call(uintptr(unsafe.Pointer(p)), 0, 4) // MOVEFILE_DELAY_UNTIL_REBOOT (ignoré sans droits)
}

func userDataDirs() DataDirs {
	home, _ := os.UserHomeDir()
	return dataDirs(shellFolder("Personal", filepath.Join(home, "Documents")), os.Getenv("APPDATA"), os.Getenv("LOCALAPPDATA"))
}

func machineGUID() string {
	return strings.ToLower(strings.TrimSpace(regRead(syscall.HKEY_LOCAL_MACHINE, `SOFTWARE\Microsoft\Cryptography`, "MachineGuid")))
}
