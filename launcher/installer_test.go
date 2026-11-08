package main

import (
	"os"
	"path/filepath"
	"testing"
)

// scriptWizard : assistant scripté (réponse par titre de page, sinon bouton principal ou annulation).
type scriptWizard struct {
	answers map[string]struct {
		id   string
		opts []bool
	}
	seen []string
}

func (s *scriptWizard) Page(p wizPage) (string, []bool) {
	s.seen = append(s.seen, p.title)
	if a, ok := s.answers[p.title]; ok {
		return a.id, a.opts
	}
	opts := make([]bool, len(p.options))
	for i, o := range p.options {
		opts[i] = o.checked
	}
	for _, b := range p.buttons {
		if b.style == "primary" || b.style == "danger" {
			return b.id, opts
		}
	}
	return p.cancel, opts
}
func (s *scriptWizard) Progress(p wizPage) Progress {
	s.seen = append(s.seen, p.title)
	return nopProgress{}
}
func (s *scriptWizard) Close() {}

func answer(id string, opts ...bool) struct {
	id   string
	opts []bool
} {
	return struct {
		id   string
		opts []bool
	}{id, opts}
}

// NEXORA #084 : assistant d'installation de bout en bout (Bienvenue → installation → Terminé), choix des raccourcis
// gardé, NEXORA lancé si la case est cochée ; annulation à la première page.
func TestInstallerWizard(t *testing.T) {
	w := newWorld(t)
	l := newLayout(t.TempDir())
	var registered, launched int
	var regState State
	env := installEnv{
		layout: l, client: httpClient(), relKey: w.f.pub, licKey: w.licPub, repo: "o/r",
		selfInstall: func(l Layout) error { return os.MkdirAll(l.Root, 0o755) },
		register:    func(_ Layout, st *State, _ *Manifest) error { registered++; regState = *st; return nil },
		launch:      func(Layout, State, *Manifest) error { launched++; return nil },
	}
	cancel := &scriptWizard{answers: map[string]struct {
		id   string
		opts []bool
	}{"Installer NEXORA Devs Toolbox": answer("cancel")}}
	env.wizard = cancel
	if err := runInstaller(env); err != errCancelled || registered != 0 {
		t.Fatalf("annulation à la première page : %v (enregistré %d fois)", err, registered)
	}
	wz := &scriptWizard{answers: map[string]struct {
		id   string
		opts []bool
	}{"Installer NEXORA Devs Toolbox": answer("install", false, true)}}
	env.wizard = wz
	if err := runInstaller(env); err != nil {
		t.Fatalf("installation : %v (pages %v)", err, wz.seen)
	}
	st := loadState(l)
	if st.Current != "1.2.0" || registered != 1 || launched != 1 || !regState.NoDesktop || regState.NoStartMenu {
		t.Fatalf("après l'assistant : %+v, enregistré %d, lancé %d, choix %+v", st, registered, launched, regState)
	}
	want := []string{"Installer NEXORA Devs Toolbox", "Installation de NEXORA…", "NEXORA Devs Toolbox est installé"}
	for i, s := range want {
		if i >= len(wz.seen) || wz.seen[i] != s {
			t.Fatalf("pages de l'assistant : %v", wz.seen)
		}
	}
	// Deuxième passage (déjà installé) : assistant de mise à jour, NEXORA non relancé si la case est décochée.
	up := &scriptWizard{answers: map[string]struct {
		id   string
		opts []bool
	}{"NEXORA Devs Toolbox est à jour": answer("finish", false)}}
	env.wizard = up
	if err := runInstaller(env); err != nil || up.seen[0] != "Mettre à jour NEXORA Devs Toolbox" || launched != 1 {
		t.Fatalf("mise à jour : %v, pages %v, lancé %d", err, up.seen, launched)
	}
}

// NEXORA #084 : assistant de désinstallation : données choisies supprimées, le reste gardé, raccourcis retirés.
func TestUninstallerWizard(t *testing.T) {
	root := t.TempDir()
	l := newLayout(filepath.Join(root, "toolbox"))
	os.MkdirAll(filepath.Join(l.AppDir, "1.2.0"), 0o755)
	os.WriteFile(l.StateFile, []byte(`{"current":"1.2.0"}`), 0o644)
	d := dataDirs(filepath.Join(root, "Documents"), filepath.Join(root, "Roaming"), filepath.Join(root, "Local"))
	for _, p := range []string{d.Documents[0], d.Settings[1]} {
		os.MkdirAll(p, 0o755)
	}
	unreg := 0
	wz := &scriptWizard{answers: map[string]struct {
		id   string
		opts []bool
	}{"Désinstaller NEXORA Devs Toolbox": answer("ok", false, true, false)}}
	if err := runUninstaller(uninstallEnv{layout: l, wizard: wz, dataDirs: d, unregister: func(Layout) { unreg++ }}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(l.AppDir); !os.IsNotExist(err) || unreg != 1 {
		t.Fatalf("NEXORA non retiré (%v) ou raccourcis non retirés (%d)", err, unreg)
	}
	if _, err := os.Stat(d.Documents[0]); err != nil {
		t.Fatal("documents supprimés alors qu'ils devaient être gardés")
	}
	if _, err := os.Stat(d.Settings[1]); !os.IsNotExist(err) {
		t.Fatal("réglages gardés alors qu'ils devaient être supprimés")
	}
	if wz.seen[len(wz.seen)-1] != "NEXORA Devs Toolbox a été désinstallé" {
		t.Fatalf("pages : %v", wz.seen)
	}
}

// NEXORA #084 : fin de la désinstallation par une copie temporaire : seul le dossier de NEXORA Devs Toolbox est effacé.
func TestCleanupAfterGuard(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, productName)
	other := filepath.Join(base, "Documents")
	for _, d := range []string{root, other} {
		os.MkdirAll(d, 0o755)
		os.WriteFile(filepath.Join(d, "f.txt"), []byte("x"), 0o644)
	}
	t.Setenv("NEXORA_TOOLBOX_ROOT", root)
	cleanupAfter(other, "0")
	if _, err := os.Stat(other); err != nil {
		t.Fatal("un autre dossier que celui du lanceur a été effacé")
	}
	cleanupAfter(root, "0")
	if _, err := os.Stat(root); !os.IsNotExist(err) {
		t.Fatal("dossier du lanceur non supprimé")
	}
}
