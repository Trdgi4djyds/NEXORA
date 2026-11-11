package main

import (
	"strings"
	"testing"
)

// NEXORA #083 : contenu des fenêtres (sans Windows).
func TestUISpecs(t *testing.T) {
	s := securitySpec("integrity", secTitle("integrity"), secTitle("integrity")+" : resources/app.asar modifié. NEXORA ne sera pas ouvert.", secActions("integrity"))
	if s.tone != "danger" || s.icon != "shieldAlert" || !strings.Contains(s.body, "Réparer") {
		t.Fatalf("écran d'intégrité : %+v", s)
	}
	if strings.Contains(s.body, "app.asar") || strings.Contains(s.body, "signature") {
		t.Fatalf("détail technique affiché : %q", s.body)
	}
	if len(s.buttons) != 2 || s.buttons[0].id != "quit" || s.buttons[1].id != "repair" || s.buttons[1].style != "primary" || s.cancel != "quit" {
		t.Fatalf("boutons de l'écran d'intégrité : %+v", s.buttons)
	}
	o := securitySpec("offline", secTitle("offline"), "Connexion perdue : le dépôt est injoignable.", secActions("offline"))
	if o.icon != "wifiOff" || !strings.Contains(o.body, "connexion à Internet") || o.buttons[1].label != "Réessayer" {
		t.Fatalf("écran hors ligne : %+v", o)
	}
	if v := securitySpec("outdated", secTitle("outdated"), "x", secActions("outdated")); v.tone != "brand" || v.buttons[1].label != "Mettre à jour" {
		t.Fatalf("écran de version : %+v", v)
	}
	u := uninstallPage(`C:\\NEXORA`)
	if len(u.options) != 3 || u.buttons[len(u.buttons)-1].style != "danger" || u.cancel != "cancel" || u.steps[u.step] != "Confirmation" {
		t.Fatalf("désinstallation : %+v", u)
	}
	for _, wp := range []wizPage{welcomePage("x", false), installDonePage(false), uninstallDonePage("x"), uninstallBusyPage(), installErrorPage("offline", "Connexion perdue", secActions("offline"))} {
		if wp.icon != "" {
			if _, ok := lucide[wp.icon]; !ok {
				t.Fatalf("icône inconnue : %q", wp.icon)
			}
		}
		if len(wp.buttons) == 0 || wp.cancel == "" || wp.step >= len(wp.steps) {
			t.Fatalf("page d'assistant incomplète : %+v", wp)
		}
	}
	for _, sp := range []uiSpec{s, o, messageSpec("danger", "Erreur", "x"), messageSpec("success", "Fait", "x")} {
		if _, ok := lucide[sp.icon]; !ok {
			t.Fatalf("icône inconnue : %q", sp.icon)
		}
		if _, ok := uiTones[sp.tone]; !ok {
			t.Fatalf("ton inconnu : %q", sp.tone)
		}
	}
	for f, want := range map[float64]int{0.02: 0, 0.5: 0, 0.71: 1, 0.8: 2, 0.98: 3} {
		if got := progressStage(f); got != want {
			t.Fatalf("étape de %.2f : %d au lieu de %d", f, got, want)
		}
	}
}
