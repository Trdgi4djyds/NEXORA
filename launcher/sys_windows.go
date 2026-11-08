//go:build windows

// Windows : fenêtres (MessageBox, progression et choix de désinstallation en Windows Forms par PowerShell, livré
// avec Windows 10 et 11), registre (reg.exe), raccourcis (WScript.Shell), instance unique (mutex nommé).
// Aucun droit d'administrateur : tout est écrit dans le profil de l'utilisateur (HKCU, %LOCALAPPDATA%).
package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

const (
	uninstallKey  = `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NEXORA-Devs-Toolbox`
	protocolKey   = `HKCU\Software\Classes\nexora`
	novxExtKey    = `HKCU\Software\Classes\.novx`
	novxTypeKey   = `HKCU\Software\Classes\NEXORA.Projet`
	siteURL       = "https://nexora.abrahamtogbonon0.workers.dev/site/"
	createNoWin   = 0x08000000
	detachedProc  = 0x00000008
	newProcGroup  = 0x00000200
	mbIconError   = 0x10
	mbIconWarning = 0x30
	mbIconInfo    = 0x40
)

var (
	user32       = syscall.NewLazyDLL("user32.dll")
	kernel32     = syscall.NewLazyDLL("kernel32.dll")
	pMessageBox  = user32.NewProc("MessageBoxW")
	pCreateMutex = kernel32.NewProc("CreateMutexW")
	pCloseHandle = kernel32.NewProc("CloseHandle")
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

func messageBox(text string, flags uintptr) {
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(productName)
	pMessageBox.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), flags)
}

func showError(err error) {
	messageBox(capitalize(err.Error())+".", mbIconError)
}
func showWarning(msg string) { messageBox(msg, mbIconWarning) }
func showInfo(msg string)    { messageBox(msg, mbIconInfo) }

func capitalize(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	return strings.ToUpper(string(r[0])) + string(r[1:])
}

// hidden : aucune console pour les outils en ligne de commande (reg.exe, powershell.exe). Pas de HideWindow :
// il masquerait aussi la première fenêtre Windows Forms (progression, choix de désinstallation).
func hidden(cmd *exec.Cmd) *exec.Cmd {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWin}
	return cmd
}

func detach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: detachedProc | newProcGroup}
}

func commandFor(p string, args ...string) *exec.Cmd { return exec.Command(p, args...) }

// powershell : script passé encodé (UTF-16LE, base64), sans fichier temporaire ni problème de guillemets.
func powershell(script string) *exec.Cmd {
	u := utf16.Encode([]rune(script))
	b := make([]byte, len(u)*2)
	for i, v := range u {
		b[i*2], b[i*2+1] = byte(v), byte(v>>8)
	}
	return hidden(exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", base64.StdEncoding.EncodeToString(b)))
}

func psQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

// ---------------------------------------------------------------- progression
type winProgress struct {
	file, cancel string
	cmd          *exec.Cmd
	last         time.Time
}

func newProgress(title string) Progress {
	dir, _ := os.MkdirTemp("", "nxdt-")
	p := &winProgress{file: filepath.Join(dir, "progress.txt"), cancel: filepath.Join(dir, "cancel")}
	_ = os.WriteFile(p.file, []byte("0|Préparation…"), 0o644)
	script := `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$p=` + psQuote(p.file) + `; $c=` + psQuote(p.cancel) + `; $done=$false
$f=New-Object Windows.Forms.Form; $f.Text=` + psQuote(title) + `; $f.ClientSize=New-Object Drawing.Size(480,132)
$f.StartPosition='CenterScreen'; $f.FormBorderStyle='FixedDialog'; $f.MaximizeBox=$false; $f.BackColor=[Drawing.Color]::White
$h=New-Object Windows.Forms.Label; $h.Text='NEXORA Devs Toolbox'; $h.Font=New-Object Drawing.Font('Segoe UI Semibold',12); $h.SetBounds(22,16,436,26)
$l=New-Object Windows.Forms.Label; $l.Font=New-Object Drawing.Font('Segoe UI',9.5); $l.SetBounds(22,46,436,22)
$b=New-Object Windows.Forms.ProgressBar; $b.SetBounds(22,78,436,14); $b.Maximum=1000
$n=New-Object Windows.Forms.Label; $n.Font=New-Object Drawing.Font('Segoe UI',8.5); $n.ForeColor=[Drawing.Color]::DimGray; $n.SetBounds(22,100,436,20); $n.Text='Fichiers vérifiés par signature avant installation. Fermer cette fenêtre annule.'
$f.Controls.AddRange(@($h,$l,$b,$n))
$t=New-Object Windows.Forms.Timer; $t.Interval=150
$t.Add_Tick({ try { $x=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8) } catch { return }
  if($x -eq 'done'){ $script:done=$true; $f.Close(); return }
  $i=$x.IndexOf('|'); if($i -gt 0){ $b.Value=[Math]::Max(0,[Math]::Min(1000,[int]$x.Substring(0,$i))); $l.Text=$x.Substring($i+1) } })
$f.Add_FormClosing({ if(-not $script:done){ [IO.File]::WriteAllText($c,'1') } })
$f.Add_Shown({ $t.Start(); $f.Activate() }); [void]$f.ShowDialog()`
	p.cmd = powershell(script)
	_ = p.cmd.Start()
	return p
}

func (p *winProgress) Set(f float64, msg string) {
	if time.Since(p.last) < 100*time.Millisecond && f < 0.99 {
		return
	}
	p.last = time.Now()
	tmp := p.file + ".tmp"
	if os.WriteFile(tmp, []byte(strconv.Itoa(int(f*1000))+"|"+msg), 0o644) == nil {
		_ = os.Rename(tmp, p.file)
	}
}

func (p *winProgress) Cancelled() bool {
	_, err := os.Stat(p.cancel)
	return err == nil
}

func (p *winProgress) Close() {
	_ = os.WriteFile(p.file, []byte("done"), 0o644)
	if p.cmd != nil && p.cmd.Process != nil {
		ch := make(chan struct{})
		go func() { _ = p.cmd.Wait(); close(ch) }()
		select {
		case <-ch:
		case <-time.After(3 * time.Second):
			_ = p.cmd.Process.Kill()
		}
	}
	os.RemoveAll(filepath.Dir(p.file))
}

// ---------------------------------------------------------------- désinstallation : ce qu'on garde
func askUninstall() (UninstallChoice, bool) {
	script := `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$f=New-Object Windows.Forms.Form; $f.Text='Désinstaller NEXORA Devs Toolbox'; $f.ClientSize=New-Object Drawing.Size(500,286)
$f.StartPosition='CenterScreen'; $f.FormBorderStyle='FixedDialog'; $f.MaximizeBox=$false; $f.MinimizeBox=$false; $f.BackColor=[Drawing.Color]::White
$h=New-Object Windows.Forms.Label; $h.Text='Désinstaller NEXORA Devs Toolbox'; $h.Font=New-Object Drawing.Font('Segoe UI Semibold',12); $h.SetBounds(22,16,456,26)
$s=New-Object Windows.Forms.Label; $s.Text='Le logiciel sera retiré. Coche ce que tu veux aussi supprimer ; le reste est gardé et sera retrouvé si tu réinstalles NEXORA.'; $s.Font=New-Object Drawing.Font('Segoe UI',9.5); $s.SetBounds(22,46,456,40)
function Box($y,$t){ $x=New-Object Windows.Forms.CheckBox; $x.Text=$t; $x.Font=New-Object Drawing.Font('Segoe UI',9.5); $x.SetBounds(26,$y,452,24); $f.Controls.Add($x); $x }
$d=Box 96 'Mes documents et projets (Documents\NEXORA : sites, applications construites)'
$r=Box 126 'Mes réglages, mon compte enregistré et ma licence sur ce PC'
$k=Box 156 'Les bibliothèques et outils téléchargés (plusieurs Go possibles)'
$w=New-Object Windows.Forms.Label; $w.Text='Ce qui est supprimé ne peut pas être récupéré. Tes projets synchronisés restent sur ton compte NEXORA.'; $w.Font=New-Object Drawing.Font('Segoe UI',8.5); $w.ForeColor=[Drawing.Color]::DimGray; $w.SetBounds(22,192,456,34)
$ok=New-Object Windows.Forms.Button; $ok.Text='Désinstaller'; $ok.SetBounds(278,238,104,30); $ok.DialogResult='OK'
$no=New-Object Windows.Forms.Button; $no.Text='Annuler'; $no.SetBounds(392,238,86,30); $no.DialogResult='Cancel'
$f.Controls.AddRange(@($h,$s,$w,$ok,$no)); $f.AcceptButton=$ok; $f.CancelButton=$no
if($f.ShowDialog() -eq 'OK'){ [Console]::Out.Write(('ok|{0}|{1}|{2}' -f [int]$d.Checked,[int]$r.Checked,[int]$k.Checked)) } else { [Console]::Out.Write('cancel') }`
	out, err := powershell(script).Output()
	if err != nil {
		// PowerShell indisponible : on garde toutes les données.
		return UninstallChoice{}, true
	}
	parts := strings.Split(strings.TrimSpace(string(out)), "|")
	if len(parts) != 4 || parts[0] != "ok" {
		return UninstallChoice{}, false
	}
	return UninstallChoice{Documents: parts[1] == "1", Settings: parts[2] == "1", Library: parts[3] == "1"}, true
}

// ---------------------------------------------------------------- registre, raccourcis, protocole
func reg(args ...string) error {
	out, err := hidden(exec.Command("reg.exe", args...)).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v : %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func regSZ(key, name, value string) error {
	if name == "" {
		return reg("add", key, "/ve", "/t", "REG_SZ", "/d", value, "/f")
	}
	return reg("add", key, "/v", name, "/t", "REG_SZ", "/d", value, "/f")
}

func regDWORD(key, name string, v int64) error {
	return reg("add", key, "/v", name, "/t", "REG_DWORD", "/d", strconv.FormatInt(v, 10), "/f")
}

func shellFolder(name, fallback string) string {
	out, err := hidden(exec.Command("reg.exe", "query", `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders`, "/v", name)).Output()
	if err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			f := strings.Fields(line)
			if len(f) >= 3 && strings.EqualFold(f[0], name) {
				i := strings.Index(line, f[1]) + len(f[1])
				return os.ExpandEnv(winEnv(strings.TrimSpace(line[i:])))
			}
		}
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

func startMenuDir() string {
	return filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs")
}

func shortcuts() []string {
	home, _ := os.UserHomeDir()
	return []string{
		filepath.Join(shellFolder("Desktop", filepath.Join(home, "Desktop")), productName+".lnk"),
		filepath.Join(startMenuDir(), productName+".lnk"),
	}
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
	ps := ""
	for _, lnk := range shortcuts() {
		ps += fmt.Sprintf("$s=$w.CreateShortcut(%s); $s.TargetPath=%s; $s.WorkingDirectory=%s; $s.IconLocation=%s; $s.Description='Ouvre NEXORA après vérification'; $s.Save()\n",
			psQuote(lnk), psQuote(l.Launcher), psQuote(l.Root), psQuote(icon+",0"))
	}
	if out, err := powershell("$w=New-Object -ComObject WScript.Shell\n" + ps).CombinedOutput(); err != nil {
		errs = append(errs, "raccourcis : "+strings.TrimSpace(string(out)))
	}
	q := `"` + l.Launcher + `"`
	steps := []error{
		regSZ(uninstallKey, "DisplayName", productName),
		regSZ(uninstallKey, "DisplayVersion", m.Version),
		regSZ(uninstallKey, "Publisher", "NEXORA"),
		regSZ(uninstallKey, "InstallLocation", l.Root),
		regSZ(uninstallKey, "DisplayIcon", icon+",0"),
		regSZ(uninstallKey, "UninstallString", q+" --uninstall"),
		regSZ(uninstallKey, "ModifyPath", q+" --repair"),
		regSZ(uninstallKey, "URLInfoAbout", siteURL),
		regSZ(uninstallKey, "HelpLink", siteURL+"#/licence"),
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
	_ = reg("delete", uninstallKey, "/f")
	_ = reg("delete", protocolKey, "/f")
	_ = reg("delete", novxTypeKey, "/f")
	_ = reg("delete", novxExtKey, "/f")
}

func scheduleRemoval(root string) {
	cmd := exec.Command("cmd.exe", "/c", "ping -n 4 127.0.0.1 >nul & rd /s /q \""+root+"\"")
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWin | detachedProc}
	_ = cmd.Start()
}

func userDataDirs() DataDirs {
	home, _ := os.UserHomeDir()
	return dataDirs(shellFolder("Personal", filepath.Join(home, "Documents")), os.Getenv("APPDATA"), os.Getenv("LOCALAPPDATA"))
}

func machineGUID() string {
	out, err := hidden(exec.Command("reg.exe", "query", `HKLM\SOFTWARE\Microsoft\Cryptography`, "/v", "MachineGuid")).Output()
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		f := strings.Fields(line)
		if len(f) >= 3 && strings.EqualFold(f[0], "MachineGuid") {
			return strings.ToLower(f[len(f)-1])
		}
	}
	return ""
}

var actionLabels = map[string]string{
	"retry":  "Réessayer",
	"repair": "Réparer",
	"update": "Mettre à jour",
	"quit":   "Quitter",
}

// securityScreen : écran de sécurité (Windows Forms) ; renvoie l'action choisie, « quit » si la fenêtre est fermée.
func securityScreen(kind, title, msg string, actions []string) string {
	color := "[Drawing.Color]::FromArgb(185,28,28)"
	if kind == "offline" || kind == "server" {
		color = "[Drawing.Color]::FromArgb(180,83,9)"
	}
	btns := ""
	x := 470
	for i := len(actions) - 1; i >= 0; i-- {
		a := actions[i]
		w := 110
		if a == "repair" || a == "update" {
			w = 130
		}
		x -= w + 8
		btns += fmt.Sprintf("$b=New-Object Windows.Forms.Button; $b.Text=%s; $b.SetBounds(%d,212,%d,32); $b.Tag=%s; $b.Add_Click({ $script:choice=$this.Tag; $f.Close() }); $f.Controls.Add($b)\n",
			psQuote(actionLabels[a]), x, w, psQuote(a))
	}
	script := `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:choice='quit'
$f=New-Object Windows.Forms.Form; $f.Text='NEXORA Devs Toolbox · Contrôle de sécurité'; $f.ClientSize=New-Object Drawing.Size(480,258)
$f.StartPosition='CenterScreen'; $f.FormBorderStyle='FixedDialog'; $f.MaximizeBox=$false; $f.MinimizeBox=$false; $f.BackColor=[Drawing.Color]::White; $f.TopMost=$true
$k=New-Object Windows.Forms.Label; $k.Text='CONTRÔLE DE SÉCURITÉ'; $k.Font=New-Object Drawing.Font('Segoe UI Semibold',8.5); $k.ForeColor=` + color + `; $k.SetBounds(22,18,436,18)
$h=New-Object Windows.Forms.Label; $h.Text=` + psQuote(title) + `; $h.Font=New-Object Drawing.Font('Segoe UI Semibold',12.5); $h.SetBounds(22,38,436,52)
$m=New-Object Windows.Forms.Label; $m.Text=` + psQuote(msg) + `; $m.Font=New-Object Drawing.Font('Segoe UI',9.5); $m.SetBounds(22,94,436,84)
$n=New-Object Windows.Forms.Label; $n.Text='NEXORA ne s’ouvre qu’après la validation de la licence, de la signature et de chaque fichier.'; $n.Font=New-Object Drawing.Font('Segoe UI',8.5); $n.ForeColor=[Drawing.Color]::DimGray; $n.SetBounds(22,180,436,26)
$f.Controls.AddRange(@($k,$h,$m,$n))
` + btns + `[void]$f.ShowDialog(); [Console]::Out.Write($script:choice)`
	out, err := powershell(script).Output()
	if err != nil {
		messageBox(title+"\n\n"+msg, mbIconError)
		return "quit"
	}
	a := strings.TrimSpace(string(out))
	for _, x := range actions {
		if x == a {
			return a
		}
	}
	return "quit"
}
