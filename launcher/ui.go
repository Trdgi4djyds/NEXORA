// NEXORA #083 : contenu des fenêtres du lanceur (textes, tons, icônes, boutons), commun à toutes les plateformes ;
// le rendu Windows est dans ui_windows.go, l'équivalent console (essais) dans sys_other.go.
package main

import "strings"

type uiButton struct{ id, label, style string } // style : primary, secondary, danger

type uiOption struct {
	title, desc string
	checked     bool
}

// uiSpec : fenêtre de dialogue (écran de sécurité, désinstallation, message).
type uiSpec struct {
	tone, icon, kicker, title, body, note string
	options                               []uiOption
	buttons                               []uiButton
	cancel                                string // réponse d'Échap et de la croix
	width                                 int    // largeur en pixels logiques (96 ppp)
}

// Tons : couleur de l'icône et de son pastillage.
var uiTones = map[string][2]string{
	"danger":  {"#dc2626", "#fef2f2"},
	"warning": {"#c2410c", "#fff7ed"},
	"brand":   {"#6d28d9", "#f3eeff"},
	"success": {"#047857", "#ecfdf5"},
}

const securityNote = "NEXORA ne s’ouvre qu’après la validation de la licence, de la signature et de chaque fichier."

func securitySpec(kind, title, msg string, actions []string) uiSpec {
	tone, icon := "warning", "alert"
	switch kind {
	case "integrity":
		tone, icon = "danger", "shieldAlert"
	case "offline":
		icon = "wifiOff"
	case "server":
		icon = "serverOff"
	case "manifest":
		icon = "fileWarning"
	case "outdated":
		tone, icon = "brand", "arrowUpCircle"
	}
	// Message qui reprend le titre (« Connexion perdue : … ») : le titre est déjà affiché au-dessus.
	if rest, ok := strings.CutPrefix(msg, title+" : "); ok && rest != "" {
		msg = rest
		if first, _, _ := strings.Cut(rest, " "); !strings.ContainsAny(first, "/\\.") { // un nom de fichier garde sa casse
			msg = strings.ToUpper(rest[:1]) + rest[1:]
		}
	}
	s := uiSpec{tone: tone, icon: icon, kicker: "CONTRÔLE DE SÉCURITÉ", title: title, body: msg, note: securityNote, cancel: "quit", width: 500}
	primary := true
	for _, a := range actions {
		if a == "quit" {
			continue
		}
		style := "secondary"
		if primary {
			style, primary = "primary", false
		}
		s.buttons = append(s.buttons, uiButton{a, actionLabels[a], style})
	}
	// Quitter à gauche, action principale à droite.
	s.buttons = append([]uiButton{{"quit", actionLabels["quit"], "secondary"}}, s.buttons...)
	return s
}

var actionLabels = map[string]string{
	"retry":  "Réessayer",
	"repair": "Réparer",
	"update": "Mettre à jour",
	"quit":   "Quitter",
}

func uninstallSpec() uiSpec {
	return uiSpec{
		tone: "danger", icon: "trash", kicker: "DÉSINSTALLATION", title: "Désinstaller NEXORA Devs Toolbox",
		body: "Le logiciel sera retiré de ce PC. Coche ce que tu veux aussi supprimer : le reste est gardé et sera retrouvé si tu réinstalles NEXORA.",
		options: []uiOption{
			{title: "Mes documents et projets", desc: "Documents\\NEXORA : sites et applications construites."},
			{title: "Mes réglages, mon compte et ma licence sur ce PC", desc: "Tu devras te reconnecter après une réinstallation."},
			{title: "Les bibliothèques et outils téléchargés", desc: "Plusieurs Go possibles, téléchargés à nouveau si besoin."},
		},
		note:    "Ce qui est supprimé ne peut pas être récupéré. Tes projets synchronisés restent sur ton compte NEXORA.",
		buttons: []uiButton{{"cancel", "Annuler", "secondary"}, {"ok", "Désinstaller", "danger"}},
		cancel:  "cancel", width: 540,
	}
}

func messageSpec(tone, title, msg string) uiSpec {
	icon := map[string]string{"danger": "circleX", "warning": "alert", "success": "shieldCheck"}[tone]
	if icon == "" {
		icon = "info"
	}
	return uiSpec{tone: tone, icon: icon, title: title, body: msg,
		buttons: []uiButton{{"ok", "Fermer", "primary"}}, cancel: "ok", width: 480}
}

// Étapes affichées sous la barre de progression (fractions annoncées par InstallRelease).
var progressSteps = []string{"Téléchargement", "Vérification", "Installation"}

// progressStage : étape en cours (0 à 2) ; 3 quand tout est terminé.
func progressStage(f float64) int {
	switch {
	case f >= 0.98:
		return 3
	case f >= 0.72:
		return 2
	case f >= 0.705:
		return 1
	default:
		return 0
	}
}
