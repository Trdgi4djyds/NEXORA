// NEXORA #083 : contenu des fenêtres du lanceur (textes, tons, icônes, boutons), commun à toutes les plateformes ;
// le rendu Windows est dans ui_windows.go, l'équivalent console (essais) dans sys_other.go.
package main

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

// Tons : couleur de l'icône et de son pastillage. #103 : sur fond noir (direction « Horizon ») ; « brand » est blanc.
var uiTones = map[string][2]string{
	"danger":  {"#f87171", "#2a1414"},
	"warning": {"#fb923c", "#2a1c10"},
	"brand":   {"#ffffff", "#1f1f1f"},
	"success": {"#34d399", "#0f2a20"},
}

// NEXORA #084 : messages fixes et sans détail technique (fichier en cause, signatures, serveurs) ; le détail reste
// dans journal-securite.txt et dans le rapport envoyé au service de sécurité.
var securityBodies = map[string]string{
	"integrity": "L’installation de NEXORA a été modifiée : NEXORA ne sera pas ouvert. Cliquez sur Réparer pour réinstaller les fichiers officiels.",
	"offline":   "Impossible de joindre NEXORA. Vérifiez votre connexion à Internet, puis réessayez.",
	"server":    "NEXORA est momentanément indisponible. Réessayez dans quelques minutes.",
	"manifest":  "La vérification de la licence n’a pas abouti. Vérifiez la date et l’heure de Windows, puis réessayez.",
	"outdated":  "Cette version de NEXORA n’est plus autorisée. Mettez-la à jour pour continuer.",
}

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
	body := securityBodies[kind]
	if body == "" {
		body = "NEXORA ne peut pas s’ouvrir pour le moment. Réessayez dans un instant."
	}
	_ = msg // message détaillé : journal seulement
	// #121 : surtitres affichés en repère « / … » à contour, comme sur l'écran de connexion de NEXORA.
	s := uiSpec{tone: tone, icon: icon, kicker: "Vérification de la licence", title: title, body: body, cancel: "quit", width: 480}
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

// ---------------------------------------------------------------- assistants (installation, désinstallation)
// wizPage : une page d'assistant (fenêtre fixe, colonne des étapes à gauche).
type wizPage struct {
	step       int
	steps      []string
	kicker     string
	title      string
	body       string
	tone, icon string      // pastille facultative (fin, erreur)
	rows       [][2]string // informations : libellé, valeur
	options    []uiOption
	progress   bool
	buttons    []uiButton
	cancel     string
}

// Wizard : fenêtre d'assistant ; Page attend le choix de l'utilisateur, Progress montre une page de progression.
type Wizard interface {
	Page(p wizPage) (string, []bool)
	Progress(p wizPage) Progress
	Close()
}

var (
	installSteps   = []string{"Bienvenue", "Installation", "Terminé"}
	uninstallSteps = []string{"Confirmation", "Désinstallation", "Terminé"}
)

func welcomePage(root string, update bool) wizPage {
	p := wizPage{
		step: 0, steps: installSteps, kicker: "Assistant d’installation", title: "Installer NEXORA Devs Toolbox",
		body: "L’assistant va installer NEXORA Devs Toolbox sur ce PC. Aucun droit d’administrateur n’est nécessaire : tout est installé dans votre dossier personnel.",
		rows: [][2]string{{"Dossier d’installation", root}, {"Espace nécessaire", "environ 450 Mo"}},
		options: []uiOption{
			{title: "Créer un raccourci sur le Bureau", checked: true},
			{title: "Ajouter NEXORA au menu Démarrer", checked: true},
		},
		buttons: []uiButton{{"cancel", "Annuler", "secondary"}, {"install", "Installer", "primary"}}, cancel: "cancel",
	}
	if update {
		p.title, p.buttons[1].label = "Mettre à jour NEXORA Devs Toolbox", "Mettre à jour"
		p.body = "NEXORA Devs Toolbox est déjà installé sur ce PC : l’assistant va le mettre à jour. Vos réglages, projets et votre compte sont gardés."
	}
	return p
}

func installProgressPage(update bool) wizPage {
	t := "Installation de NEXORA…"
	if update {
		t = "Mise à jour de NEXORA…"
	}
	return wizPage{step: 1, steps: installSteps, kicker: "Installation", title: t, body: "Patientez quelques minutes : NEXORA sera prêt dès la fin.",
		progress: true, buttons: []uiButton{{"cancel", "Annuler", "secondary"}}, cancel: "cancel"}
}

func installErrorPage(kind, title string, actions []string) wizPage {
	sp := securitySpec(kind, title, "", actions)
	return wizPage{step: 1, steps: installSteps, tone: sp.tone, icon: sp.icon, title: title, body: sp.body, buttons: sp.buttons, cancel: "quit"}
}

func installDonePage(update bool) wizPage {
	t, body := "NEXORA Devs Toolbox est installé", "Vous le retrouvez sur le Bureau et dans le menu Démarrer. À chaque ouverture, il vérifie votre licence et tient NEXORA à jour."
	if update {
		t, body = "NEXORA Devs Toolbox est à jour", "Vos réglages, projets et votre compte sont gardés."
	}
	return wizPage{step: 2, steps: installSteps, tone: "success", icon: "circleCheck", title: t, body: body,
		options: []uiOption{{title: "Lancer NEXORA maintenant", checked: true}},
		buttons: []uiButton{{"finish", "Terminer", "primary"}}, cancel: "finish"}
}

func uninstallPage(root string) wizPage {
	return wizPage{
		step: 0, steps: uninstallSteps, kicker: "Désinstallation", title: "Désinstaller NEXORA Devs Toolbox",
		body: "Le logiciel sera retiré de ce PC. Cochez ce que vous voulez aussi supprimer ; le reste est gardé pour une réinstallation.",
		options: []uiOption{
			{title: "Mes documents et projets", desc: "Documents\\NEXORA : sites et applications construites."},
			{title: "Mes réglages, mon compte et ma licence", desc: "Vous devrez vous reconnecter après une réinstallation."},
			{title: "Les bibliothèques téléchargées", desc: "Plusieurs Go possibles, retéléchargées au besoin."},
		},
		buttons: []uiButton{{"cancel", "Annuler", "secondary"}, {"ok", "Désinstaller", "danger"}}, cancel: "cancel",
	}
}

func uninstallProgressPage() wizPage {
	return wizPage{step: 1, steps: uninstallSteps, kicker: "Désinstallation", title: "Désinstallation de NEXORA…", body: "Patientez quelques secondes.", progress: true}
}

func uninstallBusyPage() wizPage {
	return wizPage{step: 0, steps: uninstallSteps, tone: "warning", icon: "alert", title: "NEXORA est encore ouvert",
		body: "Fermez NEXORA, puis cliquez sur Réessayer.", buttons: []uiButton{{"cancel", "Annuler", "secondary"}, {"retry", "Réessayer", "primary"}}, cancel: "cancel"}
}

func uninstallDonePage(body string) wizPage {
	return wizPage{step: 2, steps: uninstallSteps, tone: "success", icon: "circleCheck", title: "NEXORA Devs Toolbox a été désinstallé", body: body,
		buttons: []uiButton{{"close", "Fermer", "primary"}}, cancel: "close"}
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
