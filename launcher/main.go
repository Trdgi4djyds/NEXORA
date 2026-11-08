// NEXORA Devs Toolbox (#076) : lanceur léger de NEXORA pour Windows, seul élément visible du logiciel.
// Il télécharge NEXORA depuis la publication GitHub publique, vérifie le manifeste signé (Ed25519) et l'empreinte
// SHA-256 de chaque fichier, installe sans droits d'administrateur, met à jour, répare, revient en arrière, pose
// les raccourcis, le lien nexora:// et l'entrée « Applications installées » de Windows, puis lance NEXORA
// seulement après validation. NEXORA vérifie ensuite lui-même sa licence auprès du serveur.
//
// Arguments : (aucun) contrôler, installer ou mettre à jour puis lancer · --update · --repair · --uninstall ·
// --version · tout autre argument (lien nexora://…, fichier) est transmis à NEXORA.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var version = "1.0.0" // remplacé à la construction : -ldflags "-X main.version=…"

func main() {
	args := os.Args[1:]
	mode := "run"
	var pass []string
	for _, a := range args {
		switch a {
		case "--update", "--repair", "--rollback", "--uninstall", "--version":
			mode = strings.TrimPrefix(a, "--")
		default:
			pass = append(pass, a)
		}
	}
	if mode == "version" {
		fmt.Println(productName, version)
		return
	}
	release, ok := singleInstance()
	if !ok {
		// Une installation est déjà en cours : elle lancera NEXORA. Les liens reçus entre-temps seront rouverts.
		return
	}
	defer release()
	var err error
	switch mode {
	case "uninstall":
		err = uninstall()
	case "rollback":
		// NEXORA #077 : retours en arrière refusés ; une version défectueuse est remplacée par une publication plus récente.
		showInfo("Le retour à une version précédente est désactivé par la politique de sécurité de NEXORA : seule une publication plus récente, signée et autorisée par le serveur, peut remplacer la version installée.")
	default:
		err = run(mode == "update", mode == "repair", pass)
	}
	if err != nil && !errors.Is(err, errCancelled) {
		showError(err)
		os.Exit(1)
	}
}

func layout() Layout { return newLayout(installRoot()) }

func repo() string {
	if r := strings.TrimSpace(os.Getenv("NEXORA_TOOLBOX_REPO")); r != "" && strings.Count(r, "/") == 1 {
		return r
	}
	return defaultRepo
}

func run(update, repair bool, pass []string) error {
	l := layout()
	relKey, err := releaseKey()
	if err != nil {
		return err
	}
	licKey, err := licenseKey()
	if err != nil {
		return err
	}
	if err := selfInstall(l); err != nil {
		return fmt.Errorf("installation du lanceur impossible : %v", err)
	}
	if update {
		time.Sleep(1500 * time.Millisecond) // NEXORA se ferme avant la mise à jour
	}
	c := httpClient()
	for {
		st := loadState(l)
		cur, err := StartupCheck(context.Background(), c, l, &st, relKey, licKey, repo(), repair, func() Progress {
			return newProgress(productName)
		})
		if err == nil {
			if rerr := register(l, &st, cur); rerr != nil {
				showWarning("Les raccourcis ou l’entrée de désinstallation n’ont pas pu être créés : " + rerr.Error())
			}
			return launch(l, st, cur, pass)
		}
		var f *SecFail
		if !errors.As(err, &f) {
			return err
		}
		journal(l, f.Kind, f.Message+" "+f.Detail)
		Report(c, f, st.Current)
		switch securityScreen(f.Kind, secTitle(f.Kind), f.Message, secActions(f.Kind)) {
		case "retry", "update":
			repair = false
		case "repair":
			repair = true
		default:
			return errCancelled
		}
	}
}

func launch(l Layout, st State, m *Manifest, pass []string) error {
	cmd := LaunchCommand(l, m, pass)
	detach(cmd)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("NEXORA n’a pas pu démarrer : %v", err)
	}
	_ = cmd.Process.Release()
	return nil
}

// selfInstall copie le lanceur dans son dossier d'installation (premier lancement depuis Téléchargements).
func selfInstall(l Layout) error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	self, _ = filepath.EvalSymlinks(self)
	if strings.EqualFold(filepath.Clean(self), filepath.Clean(l.Launcher)) {
		return nil
	}
	if err := os.MkdirAll(l.Root, 0o755); err != nil {
		return err
	}
	sum, _, err := FileSHA256(self)
	if err != nil {
		return err
	}
	if have, _, err := FileSHA256(l.Launcher); err == nil && have == sum {
		return nil
	}
	b, err := os.ReadFile(self)
	if err != nil {
		return err
	}
	old := l.Launcher + ".old"
	os.Remove(old)
	if _, err := os.Stat(l.Launcher); err == nil {
		if err := os.Rename(l.Launcher, old); err != nil {
			return err
		}
	}
	if err := os.WriteFile(l.Launcher, b, 0o755); err != nil {
		return err
	}
	st := loadState(l)
	st.Registered = "" // raccourcis et registre reposés avec le nouveau lanceur
	return saveState(l, st)
}

// updateSelf : nouveau lanceur exigé par la publication (min_launcher), vérifié par le manifeste signé.
func updateSelf(l Layout, rel *Release) error {
	hc := httpClient()
	a := rel.gh.asset(rel.Manifest.Launcher.Name)
	if a == nil {
		return errors.New("lanceur absent de la publication")
	}
	if err := os.MkdirAll(l.Downloads, 0o755); err != nil {
		return err
	}
	tmp := filepath.Join(l.Downloads, "launcher.new")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	if err := Download(ctx, hc, a.URL, tmp, *rel.Manifest.Launcher, nil, nil); err != nil {
		return err
	}
	old := l.Launcher + ".old"
	os.Remove(old)
	if err := os.Rename(l.Launcher, old); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(tmp, l.Launcher); err != nil {
		_ = os.Rename(old, l.Launcher)
		return err
	}
	st := loadState(l)
	st.Registered = ""
	return saveState(l, st)
}

func relaunchSelf(l Layout, args []string) error {
	cmd := commandFor(l.Launcher, args...)
	detach(cmd)
	return cmd.Start()
}

func uninstall() error {
	l := layout()
	ch, ok := askUninstall()
	if !ok {
		return errCancelled
	}
	// NEXORA encore ouvert : ses fichiers sont verrouillés par Windows.
	if err := os.Rename(l.AppDir, l.AppDir+".removing"); err != nil && !os.IsNotExist(err) {
		return errors.New("NEXORA est encore ouvert : ferme-le, puis relance la désinstallation")
	}
	unregister(l)
	failed := RemoveData(userDataDirs(), ch)
	os.RemoveAll(l.AppDir + ".removing")
	os.RemoveAll(l.Downloads)
	os.Remove(l.StateFile)
	scheduleRemoval(l.Root) // le lanceur ne peut pas se supprimer lui-même pendant qu'il tourne
	msg := "NEXORA Devs Toolbox a été désinstallé."
	if !ch.Documents || !ch.Settings || !ch.Library {
		msg += " Ce que tu as choisi de garder est resté en place ; une réinstallation le retrouvera."
	}
	if len(failed) > 0 {
		msg += "\n\nCertains dossiers n’ont pas pu être supprimés :\n" + strings.Join(failed, "\n")
	}
	showInfo(msg)
	return nil
}
