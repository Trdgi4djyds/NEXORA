// NEXORA #084 : installation et désinstallation comme un vrai logiciel : assistant en trois étapes (Bienvenue ou
// Confirmation, progression, Terminé) au lieu d'un lancement direct. L'assistant d'installation s'ouvre quand
// l'exécutable est lancé hors de son dossier d'installation (fichier téléchargé) ; ensuite, le raccourci ouvre
// NEXORA après la vérification de la licence (run).
package main

import (
	"context"
	"crypto/ed25519"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// installEnv : ce dont l'assistant d'installation a besoin (remplaçable dans les essais).
type installEnv struct {
	layout         Layout
	client         *http.Client
	relKey, licKey ed25519.PublicKey
	repo           string
	wizard         Wizard
	selfInstall    func(Layout) error
	register       func(Layout, *State, *Manifest) error
	launch         func(Layout, State, *Manifest) error
	updateLauncher func(*Release) error // nouveau lanceur exigé (min_launcher) : installé puis relancé
}

// runningInstalled : vrai si l'exécutable en cours est le lanceur installé (raccourci, Applications installées).
func runningInstalled(l Layout) bool {
	self, err := os.Executable()
	if err != nil {
		return true
	}
	if r, err := filepath.EvalSymlinks(self); err == nil {
		self = r
	}
	return strings.EqualFold(filepath.Clean(self), filepath.Clean(l.Launcher))
}

func runInstaller(e installEnv) error {
	l := e.layout
	st := loadState(l)
	update := st.Current != ""
	wz := e.wizard
	defer wz.Close()
	a, opts := wz.Page(welcomePage(l.Root, update))
	if a != "install" {
		return errCancelled
	}
	desktop, startMenu := len(opts) < 1 || opts[0], len(opts) < 2 || opts[1]
	repair := false
	for {
		p := wz.Progress(installProgressPage(update))
		p.Set(-1, "Préparation…")
		if err := e.selfInstall(l); err != nil {
			journal(l, "install", err.Error())
			wz.Page(wizPage{step: 1, steps: installSteps, tone: "danger", icon: "circleX", title: "Installation impossible",
				body:    "NEXORA Devs Toolbox n’a pas pu être copié dans son dossier. Fermez NEXORA s’il est ouvert, puis relancez l’installation.",
				buttons: []uiButton{{"quit", "Fermer", "primary"}}, cancel: "quit"})
			return errCancelled
		}
		st = loadState(l)
		st.NoDesktop, st.NoStartMenu = !desktop, !startMenu
		st.Registered = "" // raccourcis reposés selon les choix de l'assistant
		_ = saveState(l, st)
		cur, err := StartupCheck(context.Background(), e.client, l, &st, e.relKey, e.licKey, e.repo, repair, func() Progress { return keepOpen{p} })
		if p.Cancelled() || errors.Is(err, errCancelled) {
			return errCancelled
		}
		var lu *LauncherUpdate
		if errors.As(err, &lu) && e.updateLauncher != nil {
			p.Set(-1, "Mise à jour de NEXORA Devs Toolbox…")
			return e.updateLauncher(lu.Release)
		}
		var f *SecFail
		if errors.As(err, &f) {
			journal(l, f.Kind, f.Message+" "+f.Detail)
			Report(e.client, f, st.Current)
			switch a, _ := wz.Page(installErrorPage(f.Kind, secTitle(f.Kind), secActions(f.Kind))); a {
			case "retry", "update":
				repair = false
				continue
			case "repair":
				repair = true
				continue
			default:
				return errCancelled
			}
		}
		if err != nil {
			return err
		}
		p.Set(0.99, "Création des raccourcis…")
		if rerr := e.register(l, &st, cur); rerr != nil {
			journal(l, "register", rerr.Error())
		}
		a, opts = wz.Page(installDonePage(update))
		if len(opts) > 0 && opts[0] {
			return e.launch(l, st, cur)
		}
		return nil
	}
}

// uninstallEnv : ce dont l'assistant de désinstallation a besoin (remplaçable dans les essais).
type uninstallEnv struct {
	layout     Layout
	wizard     Wizard
	dataDirs   DataDirs
	unregister func(Layout)
}

func runUninstaller(e uninstallEnv) error {
	l := e.layout
	wz := e.wizard
	defer wz.Close()
	a, opts := wz.Page(uninstallPage(l.Root))
	if a != "ok" {
		return errCancelled
	}
	ch := UninstallChoice{}
	if len(opts) == 3 {
		ch = UninstallChoice{Documents: opts[0], Settings: opts[1], Library: opts[2]}
	}
	// NEXORA encore ouvert : ses fichiers sont verrouillés par Windows.
	for {
		if err := os.Rename(l.AppDir, l.AppDir+".removing"); err == nil || os.IsNotExist(err) {
			break
		}
		if a, _ := wz.Page(uninstallBusyPage()); a != "retry" {
			return errCancelled
		}
	}
	p := wz.Progress(uninstallProgressPage())
	p.Set(0.15, "Suppression des raccourcis…")
	e.unregister(l)
	p.Set(0.45, "Suppression des données choisies…")
	failed := RemoveData(e.dataDirs, ch)
	p.Set(0.8, "Suppression des fichiers de NEXORA…")
	os.RemoveAll(l.AppDir + ".removing")
	os.RemoveAll(l.Downloads)
	os.Remove(l.StateFile)
	p.Set(1, "Terminé")
	msg := "NEXORA Devs Toolbox a été retiré de ce PC."
	if !ch.Documents || !ch.Settings || !ch.Library {
		msg += " Ce que vous avez choisi de garder est resté en place ; une réinstallation le retrouvera."
	}
	if len(failed) > 0 {
		msg += "\n\nCertains dossiers n’ont pas pu être supprimés :\n" + strings.Join(failed, "\n")
	}
	wz.Page(uninstallDonePage(msg))
	return nil
}
