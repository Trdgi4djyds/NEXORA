//go:build windows && nxdemo

// NEXORA #083 : démonstration des fenêtres du lanceur pour les captures (scripts/captures-lanceur.mjs), compilée
// seulement avec l'étiquette nxdemo : jamais dans l'exécutable publié. NEXORA-Devs-Toolbox.exe --demo=<écran>.
// NEXORA #084 : pages des assistants d'installation et de désinstallation.
package main

import (
	"errors"
	"os"
	"strings"
	"time"
)

func init() {
	if len(os.Args) < 2 || !strings.HasPrefix(os.Args[1], "--demo=") {
		return
	}
	screen := strings.TrimPrefix(os.Args[1], "--demo=")
	progress := func(f float64, msg string) {
		p := newProgress(productName)
		p.Set(f, msg)
		time.Sleep(time.Hour)
	}
	page := func(p wizPage, opts ...bool) {
		wz := newWizard()
		if len(opts) > 0 {
			for i := range p.options {
				if i < len(opts) {
					p.options[i].checked = opts[i]
				}
			}
		}
		go wz.Page(p)
		time.Sleep(time.Hour)
	}
	root := `C:\Users\Awa\AppData\Local\Programs\NEXORA Devs Toolbox`
	switch screen {
	case "demarrage":
		progress(-1, "Chargement…")
	case "chargement":
		progress(-1, "Chargement de votre espace…")
	case "telechargement":
		progress(0.02+0.68*0.45, "Téléchargement : 78 / 174 Mo")
	case "installation":
		progress(0.85, "Installation de NEXORA…")
	case "assistant-bienvenue":
		page(welcomePage(root, false))
	case "assistant-mise-a-jour": // #121 : page de mise à jour (titre sur deux lignes avant la correction)
		page(welcomePage(root, true))
	case "assistant-installation":
		wz := newWizard()
		p := wz.Progress(installProgressPage(false))
		p.Set(0.02+0.68*0.62, "Téléchargement : 108 / 174 Mo")
		time.Sleep(time.Hour)
	case "assistant-termine":
		page(installDonePage(false))
	case "assistant-erreur":
		page(installErrorPage("offline", secTitle("offline"), secActions("offline")))
	case "desinstallation":
		page(uninstallPage(root), true, false, true)
	case "assistant-long": // #121 : page trop haute pour 520 pixels : la fenêtre doit grandir, sans chevauchement
		p := uninstallPage(root)
		p.body += " " + p.body
		p.options = append(p.options, p.options...)
		page(p, true, false, true, false, true, false)
	case "desinstallation-progression":
		wz := newWizard()
		p := wz.Progress(uninstallProgressPage())
		p.Set(0.45, "Suppression des données choisies…")
		time.Sleep(time.Hour)
	case "desinstallation-ouvert":
		page(uninstallBusyPage())
	case "desinstallation-terminee":
		page(uninstallDonePage("NEXORA Devs Toolbox a été retiré de ce PC. Ce que vous avez choisi de garder est resté en place ; une réinstallation le retrouvera."))
	case "integrite":
		securityScreen("integrity", secTitle("integrity"), "", secActions("integrity"))
	case "connexion":
		securityScreen("offline", secTitle("offline"), "", secActions("offline"))
	case "version":
		securityScreen("outdated", secTitle("outdated"), "", secActions("outdated"))
	case "manifeste":
		securityScreen("manifest", secTitle("manifest"), "", secActions("manifest"))
	case "erreur":
		showError(errors.New("NEXORA n’a pas pu démarrer : le fichier NEXORA.exe est introuvable"))
	}
	os.Exit(0)
}
