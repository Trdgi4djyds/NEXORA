package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Service de sécurité et dépôt factices réunis dans un seul serveur.
type world struct {
	t             *testing.T
	f             *fixture
	lic           ed25519.PrivateKey
	licPub        ed25519.PublicKey
	ver           string
	pkg, raw      []byte
	sig           string
	declSHA       string // empreinte déclarée par le service (vide : celle du manifeste)
	expires       time.Time
	minManifest   int64
	minVersion    string
	statementDown bool
	repoDown      bool
	reports       int64
	srv           *httptest.Server
}

func newWorld(t *testing.T) *world {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	w := &world{t: t, f: newFixture(t), lic: priv, licPub: pub, expires: time.Now().Add(24 * time.Hour), minVersion: "1.0.0"}
	w.publish("1.2.0")
	w.srv = httptest.NewServer(http.HandlerFunc(w.serve))
	t.Cleanup(w.srv.Close)
	allowHTTP = true
	apiBase, webBase = w.srv.URL, w.srv.URL
	serverBase = w.srv.URL
	t.Cleanup(func() {
		allowHTTP = false
		apiBase, webBase = "https://api.github.com", "https://github.com"
		serverBase = "https://nexora.abrahamtogbonon0.workers.dev"
	})
	return w
}

func (w *world) publish(ver string) {
	w.ver = ver
	w.f.files["resources/app.asar"] = []byte("asar " + ver)
	w.pkg = zipOf(w.t, w.f.files, nil)
	w.raw, w.sig = w.f.manifest(w.t, ver, w.pkg)
}

func (w *world) serve(rw http.ResponseWriter, r *http.Request) {
	// NEXORA #082 : liens directs du dépôt (voie principale du lanceur), coupés avec repoDown comme l'API.
	dir := "/o/r/releases/download/v" + w.ver + "/"
	if strings.HasPrefix(r.URL.Path, "/o/r/releases/") {
		switch {
		case w.repoDown:
			hj, _ := rw.(http.Hijacker)
			c, _, _ := hj.Hijack()
			c.Close()
		case r.URL.Path == "/o/r/releases/latest/download/"+manifestName:
			http.Redirect(rw, r, w.srv.URL+dir+manifestName, http.StatusFound)
		case r.URL.Path == dir+manifestName:
			rw.Write(w.raw)
		case r.URL.Path == dir+signatureName:
			rw.Write([]byte(w.sig))
		case r.URL.Path == dir+"NEXORA-Devs-Toolbox.exe" && w.f.launcher != nil:
			rw.Write(w.f.launcher)
		case r.URL.Path == dir+"NEXORA-"+w.ver+"-win-x64.zip":
			http.ServeContent(rw, r, "p.zip", time.Time{}, bytes.NewReader(w.pkg))
		default:
			http.NotFound(rw, r)
		}
		return
	}
	switch r.URL.Path {
	case "/security/manifest":
		if w.statementDown {
			hj, _ := rw.(http.Hijacker)
			c, _, _ := hj.Hijack()
			c.Close()
			return
		}
		sha := w.declSHA
		if sha == "" {
			sha = sha256Hex(w.raw)
		}
		st := map[string]any{"application": "NEXORA", "kind": "release_statement", "status": "ok",
			"issued_at": time.Now().UTC().Format(time.RFC3339), "expires_at": w.expires.UTC().Format(time.RFC3339),
			"latest":      map[string]any{"version": w.ver, "manifest_version": manifestNumber(w.ver), "manifest_sha256": sha},
			"min_version": w.minVersion, "min_manifest_version": w.minManifest, "block_outdated": true}
		payload, _ := json.Marshal(st)
		json.NewEncoder(rw).Encode(map[string]string{"payload": string(payload), "sig": base64.StdEncoding.EncodeToString(ed25519.Sign(w.lic, payload))})
	case "/security/report":
		atomic.AddInt64(&w.reports, 1)
		rw.Write([]byte(`{"ok":true}`))
	case "/repos/o/r/releases/latest":
		if w.repoDown {
			hj, _ := rw.(http.Hijacker)
			c, _, _ := hj.Hijack()
			c.Close()
			return
		}
		name := "NEXORA-" + w.ver + "-win-x64.zip"
		fmt.Fprintf(rw, `{"tag_name":"v%s","assets":[{"name":%q,"browser_download_url":"%s/dl/m"},{"name":%q,"browser_download_url":"%s/dl/s"},{"name":%q,"browser_download_url":"%s/dl/p"}]}`,
			w.ver, manifestName, w.srv.URL, signatureName, w.srv.URL, name, w.srv.URL)
	case "/dl/m":
		rw.Write(w.raw)
	case "/dl/s":
		rw.Write([]byte(w.sig))
	case "/dl/p":
		http.ServeContent(rw, r, "p.zip", time.Time{}, bytes.NewReader(w.pkg))
	default:
		http.NotFound(rw, r)
	}
}

func (w *world) check(l Layout, st *State, repair bool) (*Manifest, error) {
	return StartupCheck(context.Background(), httpClient(), l, st, w.f.pub, w.licPub, "o/r", repair, func() Progress { return nopProgress{} })
}

func kindOf(err error) string {
	if f, ok := err.(*SecFail); ok {
		return f.Kind
	}
	if err == nil {
		return ""
	}
	return "autre:" + err.Error()
}

func TestStatementVerification(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	mk := func(m map[string]any) (string, string) {
		b, _ := json.Marshal(m)
		return string(b), base64.StdEncoding.EncodeToString(ed25519.Sign(priv, b))
	}
	now := time.Now().UTC()
	good := map[string]any{"application": "NEXORA", "kind": "release_statement", "issued_at": now.Format(time.RFC3339), "expires_at": now.Add(24 * time.Hour).Format(time.RFC3339)}
	p, s := mk(good)
	if _, err := VerifyStatement(p, s, pub); err != nil {
		t.Fatalf("déclaration authentique refusée : %v", err)
	}
	if _, err := VerifyStatement(strings.Replace(p, "NEXORA", "AUTRE", 1), s, pub); kindOf(err) != "manifest" {
		t.Fatal("déclaration modifiée acceptée")
	}
	other, _, _ := ed25519.GenerateKey(rand.Reader)
	if _, err := VerifyStatement(p, s, other); kindOf(err) != "manifest" {
		t.Fatal("déclaration d'une autre clé acceptée")
	}
	old := map[string]any{"application": "NEXORA", "kind": "release_statement", "issued_at": now.Add(-48 * time.Hour).Format(time.RFC3339), "expires_at": now.Add(-24 * time.Hour).Format(time.RFC3339)}
	p, s = mk(old)
	if _, err := VerifyStatement(p, s, pub); err == nil || !strings.Contains(err.Error(), "expiré") {
		t.Fatalf("déclaration expirée acceptée : %v", err)
	}
	wrong := map[string]any{"application": "AUTRE", "kind": "release_statement", "issued_at": now.Format(time.RFC3339), "expires_at": now.Add(time.Hour).Format(time.RFC3339)}
	p, s = mk(wrong)
	if _, err := VerifyStatement(p, s, pub); kindOf(err) != "manifest" {
		t.Fatal("déclaration d'une autre application acceptée")
	}
}

func TestStartupSequence(t *testing.T) {
	w := newWorld(t)
	l := newLayout(t.TempDir())
	st := loadState(l)

	// Premier lancement : installation vérifiée puis autorisation.
	m, err := w.check(l, &st, false)
	if err != nil || m.Version != "1.2.0" || st.LastManifest != manifestNumber("1.2.0") {
		t.Fatalf("premier lancement : %v %+v", err, st)
	}
	// Aucune mise à jour : ouverture après contrôle de tous les fichiers.
	if m, err = w.check(l, &st, false); err != nil || m.Version != "1.2.0" {
		t.Fatalf("lancement sans mise à jour : %v", err)
	}
	// Nouvelle version : mise à jour automatique avant l'ouverture.
	w.publish("1.3.0")
	if m, err = w.check(l, &st, false); err != nil || m.Version != "1.3.0" || st.Current != "1.3.0" {
		t.Fatalf("mise à jour : %v %+v", err, st)
	}
	// Fichier modifié : ouverture bloquée (intégrité), puis réparation à la demande.
	os.WriteFile(filepath.Join(l.versionDir("1.3.0"), "locales", "fr.pak"), []byte("modifié"), 0o644)
	if _, err = w.check(l, &st, false); kindOf(err) != "integrity" || !strings.Contains(err.Error(), "Installation non authentifiée") {
		t.Fatalf("fichier modifié : %v", err)
	}
	if m, err = w.check(l, &st, true); err != nil || m.Version != "1.3.0" {
		t.Fatalf("réparation : %v", err)
	}
	// Fichier supprimé : bloqué.
	os.Remove(filepath.Join(l.versionDir("1.3.0"), "NEXORA.exe"))
	if _, err = w.check(l, &st, false); kindOf(err) != "integrity" {
		t.Fatalf("fichier supprimé : %v", err)
	}
	w.check(l, &st, true)
	// Serveur de sécurité injoignable : « Connexion perdue », rien n'est lancé.
	w.statementDown = true
	if _, err = w.check(l, &st, false); kindOf(err) != "offline" || !strings.HasPrefix(err.Error(), "Connexion perdue") {
		t.Fatalf("serveur injoignable : %v", err)
	}
	w.statementDown = false
	// Dépôt injoignable : « Connexion perdue » aussi.
	w.repoDown = true
	if _, err = w.check(l, &st, false); kindOf(err) != "offline" {
		t.Fatalf("dépôt injoignable : %v", err)
	}
	w.repoDown = false
	// Manifeste du dépôt différent de celui déclaré par le service : refus.
	w.declSHA = strings.Repeat("0", 64)
	if _, err = w.check(l, &st, false); kindOf(err) != "integrity" {
		t.Fatalf("manifeste non déclaré : %v", err)
	}
	w.declSHA = ""
	// Signature du dépôt invalide : refus.
	good := w.sig
	w.sig = base64.StdEncoding.EncodeToString(make([]byte, 64))
	if _, err = w.check(l, &st, false); kindOf(err) != "integrity" {
		t.Fatalf("signature invalide : %v", err)
	}
	w.sig = good
	// Déclaration expirée : manifeste refusé.
	w.expires = time.Now().Add(-time.Hour)
	if _, err = w.check(l, &st, false); kindOf(err) != "manifest" {
		t.Fatalf("déclaration expirée : %v", err)
	}
	w.expires = time.Now().Add(24 * time.Hour)
	// Retour en arrière : publication plus ancienne que la dernière acceptée.
	w.publish("1.2.0")
	if _, err = w.check(l, &st, false); kindOf(err) != "outdated" {
		t.Fatalf("retour en arrière : %v", err)
	}
	w.publish("1.3.0")
	// Numéro de manifeste minimal imposé par le serveur.
	w.minManifest = manifestNumber("1.4.0")
	if _, err = w.check(l, &st, false); kindOf(err) != "outdated" {
		t.Fatalf("manifeste sous le minimum : %v", err)
	}
	w.minManifest = 0
	// Version minimale supérieure à la dernière publication : bloqué.
	w.minVersion = "2.0.0"
	if _, err = w.check(l, &st, false); kindOf(err) != "outdated" {
		t.Fatalf("version minimale : %v", err)
	}
	w.minVersion = "1.0.0"
	if _, err = w.check(l, &st, false); err != nil {
		t.Fatalf("retour à la normale : %v", err)
	}
	// Anomalie envoyée au service et consignée dans le journal local.
	Report(httpClient(), &SecFail{Kind: "integrity", Message: "essai"}, "1.3.0")
	journal(l, "integrity", "essai")
	if atomic.LoadInt64(&w.reports) != 1 {
		t.Fatal("anomalie non envoyée au service de sécurité")
	}
	if b, _ := os.ReadFile(filepath.Join(l.Root, "journal-securite.txt")); !strings.Contains(string(b), "integrity\tessai") {
		t.Fatal("journal local absent")
	}
	if secTitle("offline") != "Connexion perdue" || secTitle("integrity") != "Échec du contrôle d’intégrité — Installation non authentifiée" {
		t.Fatal("titres des écrans de sécurité")
	}
}

// NEXORA #083 : publication qui exige un lanceur plus récent (min_launcher) : nouveau lanceur téléchargé, vérifié
// par le manifeste signé, mis à la place de l'ancien ; un lanceur altéré sur le dépôt est refusé.
func TestLauncherSelfUpdate(t *testing.T) {
	w := newWorld(t)
	w.f.launcher, w.f.minLauncher = []byte("nouveau lanceur NEXORA"), "99.0.0"
	w.publish("1.2.0")
	l := newLayout(t.TempDir())
	if err := os.MkdirAll(l.Root, 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(l.Launcher, []byte("ancien lanceur"), 0o755)
	st := loadState(l)
	_, err := w.check(l, &st, false)
	var lu *LauncherUpdate
	if !errors.As(err, &lu) {
		t.Fatalf("lanceur trop ancien non détecté : %v", err)
	}
	if err := updateSelf(l, lu.Release); err != nil {
		t.Fatalf("mise à jour du lanceur : %v", err)
	}
	if b, _ := os.ReadFile(l.Launcher); string(b) != "nouveau lanceur NEXORA" {
		t.Fatalf("lanceur non remplacé : %q", b)
	}
	if loadState(l).Registered != "" {
		t.Fatal("raccourcis et registre non reposés après la mise à jour du lanceur")
	}
	// Lanceur différent de celui du manifeste signé : refusé, l'ancien reste en place.
	os.WriteFile(l.Launcher, []byte("ancien lanceur"), 0o755)
	good := w.f.launcher
	w.f.launcher = []byte("lanceur altéré sur le dépôt")
	defer func() { w.f.launcher = good }()
	if err := updateSelf(l, lu.Release); err == nil {
		t.Fatal("lanceur altéré accepté")
	}
	if b, _ := os.ReadFile(l.Launcher); string(b) != "ancien lanceur" {
		t.Fatalf("ancien lanceur perdu après un refus : %q", b)
	}
	// Lanceur à jour : aucune mise à jour demandée.
	w.f.minLauncher = "1.0.0"
	w.publish("1.2.0")
	if _, err := w.check(l, &st, false); errors.As(err, &lu) {
		t.Fatal("mise à jour du lanceur demandée alors qu'il est à jour")
	}
}
