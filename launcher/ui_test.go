package main

import (
	"strings"
	"testing"
)

// NEXORA #083 : contenu des fenêtres (sans Windows).
func TestUISpecs(t *testing.T) {
	s := securitySpec("integrity", secTitle("integrity"), secTitle("integrity")+" : resources/app.asar modifié. NEXORA ne sera pas ouvert.", secActions("integrity"))
	if s.tone != "danger" || s.icon != "shieldAlert" || !strings.HasPrefix(s.body, "resources/app.asar") {
		t.Fatalf("écran d'intégrité : %+v", s)
	}
	if len(s.buttons) != 2 || s.buttons[0].id != "quit" || s.buttons[1].id != "repair" || s.buttons[1].style != "primary" || s.cancel != "quit" {
		t.Fatalf("boutons de l'écran d'intégrité : %+v", s.buttons)
	}
	o := securitySpec("offline", secTitle("offline"), "Connexion perdue : le dépôt est injoignable.", secActions("offline"))
	if o.icon != "wifiOff" || o.body != "Le dépôt est injoignable." || o.buttons[1].label != "Réessayer" {
		t.Fatalf("écran hors ligne : %+v", o)
	}
	if v := securitySpec("outdated", secTitle("outdated"), "x", secActions("outdated")); v.tone != "brand" || v.buttons[1].label != "Mettre à jour" {
		t.Fatalf("écran de version : %+v", v)
	}
	u := uninstallSpec()
	if len(u.options) != 3 || u.buttons[len(u.buttons)-1].style != "danger" || u.cancel != "cancel" {
		t.Fatalf("désinstallation : %+v", u)
	}
	for _, sp := range []uiSpec{s, o, u, messageSpec("danger", "Erreur", "x"), messageSpec("success", "Fait", "x")} {
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
