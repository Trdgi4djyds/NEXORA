//go:build windows && nxdemo

// NEXORA #083 : démonstration des fenêtres du lanceur pour les captures (scripts/captures-lanceur.mjs), compilée
// seulement avec l'étiquette nxdemo : jamais dans l'exécutable publié. NEXORA-Devs-Toolbox.exe --demo=<écran>.
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
	switch screen {
	case "demarrage":
		progress(-1, "Contrôle de sécurité de NEXORA…")
	case "telechargement":
		progress(0.02+0.68*0.45, "Téléchargement de NEXORA 1.2.0 : 78 / 174 Mo")
	case "installation":
		progress(0.85, "Installation et vérification de chaque fichier…")
	case "integrite":
		securityScreen("integrity", secTitle("integrity"), "Échec du contrôle d’intégrité — Installation non authentifiée : resources/app.asar modifié depuis l’installation. NEXORA ne sera pas ouvert ; NEXORA Devs Toolbox peut réinstaller les fichiers officiels.", secActions("integrity"))
	case "connexion":
		securityScreen("offline", secTitle("offline"), "Connexion perdue : NEXORA Devs Toolbox ne peut pas joindre le serveur de sécurité de NEXORA. Vérifie ta connexion à Internet, puis réessaie.", secActions("offline"))
	case "version":
		securityScreen("outdated", secTitle("outdated"), "NEXORA 1.1.0 n’est plus autorisé (version minimale : 1.2.0) et aucune publication plus récente n’est disponible.", secActions("outdated"))
	case "manifeste":
		securityScreen("manifest", secTitle("manifest"), "La déclaration du serveur de sécurité a expiré. Vérifie la date et l’heure de Windows, puis réessaie.", secActions("manifest"))
	case "desinstallation":
		askUninstall()
	case "erreur":
		showError(errors.New("NEXORA n’a pas pu démarrer : le fichier NEXORA.exe est introuvable"))
	case "termine":
		showDone("Désinstallation terminée", "NEXORA Devs Toolbox a été désinstallé. Ce que tu as choisi de garder est resté en place ; une réinstallation le retrouvera.")
	}
	os.Exit(0)
}
