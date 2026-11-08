package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
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

// Numéro de manifeste croissant avec la version (1.2.0 → 1002000).
func manifestNumber(ver string) int64 {
	p := versionParts(ver)
	return int64(p[0]*1000000 + p[1]*1000 + p[2])
}

type fixture struct {
	pub   ed25519.PublicKey
	priv  ed25519.PrivateKey
	files map[string][]byte
}

func newFixture(t *testing.T) *fixture {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return &fixture{pub: pub, priv: priv, files: map[string][]byte{
		"NEXORA.exe":           []byte("MZ exécutable de démonstration"),
		"resources/app.asar":   bytes.Repeat([]byte("asar"), 4096),
		"locales/fr.pak":       []byte("traductions"),
		"resources/icon.ico":   []byte{0, 0, 1, 0},
		"chrome_100_percent.p": []byte("ressources"),
	}}
}

func zipOf(t *testing.T, files map[string][]byte, extra map[string][]byte) []byte {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, m := range []map[string][]byte{files, extra} {
		for name, b := range m {
			w, err := zw.Create(name)
			if err != nil {
				t.Fatal(err)
			}
			w.Write(b)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func (f *fixture) manifest(t *testing.T, ver string, pkg []byte) ([]byte, string) {
	files := map[string]FileEntry{}
	for p, b := range f.files {
		files[p] = FileEntry{SHA256: sha256Hex(b), Size: int64(len(b))}
	}
	m := Manifest{Format: 1, Application: "NEXORA", Product: "NEXORA", Version: ver, Channel: "stable", Exe: "NEXORA.exe", MinLauncher: "1.0.0",
		ManifestVersion: manifestNumber(ver), IssuedAt: time.Now().UTC().Format(time.RFC3339), ExpiresAt: time.Now().Add(400 * 24 * time.Hour).UTC().Format(time.RFC3339),
		Package: Asset{Name: "NEXORA-" + ver + "-win-x64.zip", Size: int64(len(pkg)), SHA256: sha256Hex(pkg)}, Files: files}
	raw, _ := json.MarshalIndent(m, "", "  ")
	return raw, base64.StdEncoding.EncodeToString(ed25519.Sign(f.priv, raw))
}

func TestReleaseKeyMatchesApp(t *testing.T) {
	k, err := releaseKey()
	if err != nil || len(k) != ed25519.PublicKeySize {
		t.Fatalf("clé de publication illisible : %v", err)
	}
	app, err := os.ReadFile("../nexora/app/src/license.js")
	if err != nil {
		t.Skip("sources de l'application absentes")
	}
	if !strings.Contains(string(app), "RELEASE_KEY = '"+releasePublicKey+"'") {
		t.Fatal("la clé de publication du lanceur diffère de celle de l'application (src/license.js)")
	}
	if !strings.Contains(string(app), "LICENSE_KEY = '"+licensePublicKey+"'") {
		t.Fatal("la clé du service de sécurité du lanceur diffère de celle de l'application (src/license.js)")
	}
}

func TestVerifyManifest(t *testing.T) {
	f := newFixture(t)
	pkg := zipOf(t, f.files, nil)
	raw, sig := f.manifest(t, "1.2.0", pkg)
	if _, err := VerifyManifest(raw, sig, f.pub); err != nil {
		t.Fatalf("manifeste authentique refusé : %v", err)
	}
	tampered := bytes.Replace(raw, []byte("1.2.0"), []byte("9.9.9"), 1)
	if _, err := VerifyManifest(tampered, sig, f.pub); err != errSignature {
		t.Fatal("manifeste modifié accepté")
	}
	other, _, _ := ed25519.GenerateKey(rand.Reader)
	if _, err := VerifyManifest(raw, sig, other); err != errSignature {
		t.Fatal("manifeste signé par une autre clé accepté")
	}
	if _, err := VerifyManifest(raw, "pas-une-signature", f.pub); err != errSignature {
		t.Fatal("signature illisible acceptée")
	}
	// Chemin piégé dans un manifeste pourtant signé.
	f.files["../evil.dll"] = []byte("x")
	raw2, sig2 := f.manifest(t, "1.2.0", pkg)
	if _, err := VerifyManifest(raw2, sig2, f.pub); err == nil {
		t.Fatal("chemin « .. » accepté dans le manifeste")
	}
}

func TestSafeRelAndVersions(t *testing.T) {
	for _, p := range []string{"a/b.txt", "NEXORA.exe", "resources/app.asar"} {
		if !safeRel(p) {
			t.Errorf("%q refusé", p)
		}
	}
	for _, p := range []string{"", "/etc/x", "../x", "a/../../x", `C:\x`, "a\\b", "a//b", "./a"} {
		if safeRel(p) {
			t.Errorf("%q accepté", p)
		}
	}
	cases := []struct {
		a, b string
		want int
	}{{"1.2.0", "1.10.0", -1}, {"2.0.0", "1.99.9", 1}, {"1.2.0", "v1.2.0", 0}, {"", "0.0.1", -1}, {"1.3.0-beta", "1.3.0", 0}}
	for _, c := range cases {
		if got := CompareVersions(c.a, c.b); got != c.want {
			t.Errorf("CompareVersions(%q, %q) = %d", c.a, c.b, got)
		}
	}
}

func TestExtractZip(t *testing.T) {
	f := newFixture(t)
	expect := map[string]FileEntry{}
	for p, b := range f.files {
		expect[p] = FileEntry{SHA256: sha256Hex(b), Size: int64(len(b))}
	}
	write := func(b []byte) string {
		p := filepath.Join(t.TempDir(), "p.zip")
		os.WriteFile(p, b, 0o644)
		return p
	}
	dest := t.TempDir()
	if err := ExtractZip(write(zipOf(t, f.files, nil)), dest, expect, nil, nil); err != nil {
		t.Fatalf("paquet sain refusé : %v", err)
	}
	if err := VerifyTree(dest, expect, nil); err != nil {
		t.Fatalf("arborescence extraite refusée : %v", err)
	}
	bad := map[string][]byte{}
	for k, v := range f.files {
		bad[k] = v
	}
	bad["resources/app.asar"] = []byte("asar modifié")
	if err := ExtractZip(write(zipOf(t, bad, nil)), t.TempDir(), expect, nil, nil); err == nil || !strings.Contains(err.Error(), "empreinte") {
		t.Fatalf("fichier modifié accepté : %v", err)
	}
	if err := ExtractZip(write(zipOf(t, f.files, map[string][]byte{"../../evil.dll": []byte("x")})), t.TempDir(), expect, nil, nil); err == nil {
		t.Fatal("chemin sortant du dossier accepté (zip slip)")
	}
	if err := ExtractZip(write(zipOf(t, f.files, map[string][]byte{"extra.dll": []byte("x")})), t.TempDir(), expect, nil, nil); err == nil {
		t.Fatal("fichier inattendu accepté")
	}
	partial := map[string][]byte{"NEXORA.exe": f.files["NEXORA.exe"]}
	if err := ExtractZip(write(zipOf(t, partial, nil)), t.TempDir(), expect, nil, nil); err == nil {
		t.Fatal("paquet incomplet accepté")
	}
	// Fichier modifié après installation : détecté par le contrôle.
	os.WriteFile(filepath.Join(dest, "locales", "fr.pak"), []byte("traductions altérées"), 0o644)
	if err := VerifyTree(dest, expect, nil); err == nil {
		t.Fatal("fichier installé modifié non détecté")
	}
	if err := VerifyTree(dest, expect, []string{"NEXORA.exe", "resources/app.asar"}); err != nil {
		t.Fatalf("contrôle rapide en échec : %v", err)
	}
}

// Serveur GitHub factice : API des publications et fichiers attachés.
func fakeGitHub(t *testing.T, ver string, pkg, raw []byte, sig string, hits *int64) *httptest.Server {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/repos/o/r/releases/latest":
			name := "NEXORA-" + ver + "-win-x64.zip"
			fmt.Fprintf(w, `{"tag_name":"v%s","assets":[{"name":%q,"browser_download_url":"%s/dl/m"},{"name":%q,"browser_download_url":"%s/dl/s"},{"name":%q,"browser_download_url":"%s/dl/p","size":%d}]}`,
				ver, manifestName, srv.URL, signatureName, srv.URL, name, srv.URL, len(pkg))
		case r.URL.Path == "/dl/m":
			w.Write(raw)
		case r.URL.Path == "/dl/s":
			w.Write([]byte(sig))
		case r.URL.Path == "/dl/p":
			if hits != nil {
				atomic.AddInt64(hits, 1)
			}
			http.ServeContent(w, r, "p.zip", timeZero, bytes.NewReader(pkg))
		default:
			http.NotFound(w, r)
		}
	}))
	return srv
}

func TestInstallUpdateRollback(t *testing.T) {
	allowHTTP = true
	defer func() { allowHTTP = false; apiBase = "https://api.github.com" }()
	f := newFixture(t)
	l := newLayout(t.TempDir())
	st := loadState(l)
	c := httpClient()

	install := func(ver string) {
		f.files["resources/app.asar"] = []byte("asar " + ver)
		pkg := zipOf(t, f.files, nil)
		raw, sig := f.manifest(t, ver, pkg)
		srv := fakeGitHub(t, ver, pkg, raw, sig, nil)
		defer srv.Close()
		apiBase = srv.URL
		rel, err := LatestRelease(context.Background(), c, "o/r", f.pub)
		if err != nil {
			t.Fatalf("publication %s refusée : %v", ver, err)
		}
		if err := InstallRelease(context.Background(), c, l, &st, rel, nopProgress{}); err != nil {
			t.Fatalf("installation %s : %v", ver, err)
		}
	}
	install("1.2.0")
	if st.Current != "1.2.0" || st.Previous != "" {
		t.Fatalf("état après installation : %+v", st)
	}
	if _, err := Installed(l, "1.2.0", f.pub, true); err != nil {
		t.Fatalf("version installée refusée : %v", err)
	}
	install("1.3.0")
	if st.Current != "1.3.0" || st.Previous != "1.2.0" {
		t.Fatalf("état après mise à jour : %+v", st)
	}
	install("1.4.0")
	if _, err := os.Stat(l.versionDir("1.2.0")); !os.IsNotExist(err) {
		t.Fatal("les versions trop anciennes ne sont pas retirées")
	}
	if err := Rollback(l, &st, f.pub); err != nil || st.Current != "1.3.0" || st.Previous != "1.4.0" {
		t.Fatalf("retour arrière : %v %+v", err, st)
	}
	saved := loadState(l)
	if saved.Current != "1.3.0" {
		t.Fatal("état non enregistré")
	}
	// Fichier altéré après installation : refusé avant le lancement.
	os.WriteFile(filepath.Join(l.versionDir("1.3.0"), "resources", "app.asar"), []byte("altéré"), 0o644)
	if _, err := Installed(l, "1.3.0", f.pub, false); err == nil {
		t.Fatal("app.asar altéré accepté au lancement")
	}
	// Manifeste gardé dans resources : NEXORA le vérifie aussi (même format que src/license.js).
	if _, err := os.Stat(filepath.Join(l.versionDir("1.4.0"), "resources", manifestName)); err != nil {
		t.Fatal("manifeste non copié dans resources")
	}
	cmd := LaunchCommand(l, &Manifest{Version: "1.4.0", Exe: "NEXORA.exe"}, []string{"nexora://licence?key=NXDT-AAAA-BBBB-CCCC-DDDD"})
	env := strings.Join(cmd.Env, "\n")
	if !strings.Contains(env, "NEXORA_LAUNCHED_BY="+launchedBy) || !strings.Contains(env, "NEXORA_LAUNCHER_PATH="+l.Launcher) || cmd.Args[1] != "nexora://licence?key=NXDT-AAAA-BBBB-CCCC-DDDD" {
		t.Fatal("variables ou arguments de lancement incorrects")
	}
}

func TestTamperedPackageRejected(t *testing.T) {
	allowHTTP = true
	defer func() { allowHTTP = false; apiBase = "https://api.github.com" }()
	f := newFixture(t)
	l := newLayout(t.TempDir())
	st := State{}
	pkg := zipOf(t, f.files, nil)
	raw, sig := f.manifest(t, "1.2.0", pkg)
	evil := zipOf(t, f.files, map[string][]byte{"evil.dll": []byte("x")})
	srv := fakeGitHub(t, "1.2.0", evil, raw, sig, nil)
	defer srv.Close()
	apiBase = srv.URL
	rel, err := LatestRelease(context.Background(), httpClient(), "o/r", f.pub)
	if err != nil {
		t.Fatal(err)
	}
	if err := InstallRelease(context.Background(), httpClient(), l, &st, rel, nopProgress{}); err == nil {
		t.Fatal("paquet différent du manifeste installé")
	}
	if st.Current != "" {
		t.Fatal("version courante changée malgré l'échec")
	}
	// Manifeste signé par une autre clé : publication refusée.
	other := newFixture(t)
	raw2, sig2 := other.manifest(t, "1.2.0", pkg)
	srv2 := fakeGitHub(t, "1.2.0", pkg, raw2, sig2, nil)
	defer srv2.Close()
	apiBase = srv2.URL
	if _, err := LatestRelease(context.Background(), httpClient(), "o/r", f.pub); err != errSignature {
		t.Fatalf("publication d'une autre clé acceptée : %v", err)
	}
	// HTTPS obligatoire hors essais.
	allowHTTP = false
	if _, err := LatestRelease(context.Background(), httpClient(), "o/r", f.pub); err == nil {
		t.Fatal("adresse http acceptée")
	}
}

func TestDownloadResume(t *testing.T) {
	allowHTTP = true
	defer func() { allowHTTP = false }()
	data := bytes.Repeat([]byte("0123456789"), 100000)
	var hits int64
	srv := fakeGitHub(t, "1.0.0", data, nil, "", &hits)
	defer srv.Close()
	dest := filepath.Join(t.TempDir(), "p.zip")
	os.WriteFile(dest+".part", data[:400000], 0o644)
	want := Asset{Name: "p.zip", Size: int64(len(data)), SHA256: sha256Hex(data)}
	if err := Download(context.Background(), httpClient(), srv.URL+"/dl/p", dest, want, nil, nil); err != nil {
		t.Fatalf("reprise : %v", err)
	}
	if got, _, _ := FileSHA256(dest); got != want.SHA256 {
		t.Fatal("fichier repris incorrect")
	}
	// Déjà téléchargé et vérifié : aucune nouvelle requête.
	before := atomic.LoadInt64(&hits)
	if err := Download(context.Background(), httpClient(), srv.URL+"/dl/p", dest, want, nil, nil); err != nil || atomic.LoadInt64(&hits) != before {
		t.Fatal("fichier vérifié retéléchargé")
	}
	bad := want
	bad.SHA256 = sha256Hex([]byte("autre"))
	if err := Download(context.Background(), httpClient(), srv.URL+"/dl/p", dest+"2", bad, nil, nil); err == nil {
		t.Fatal("empreinte différente acceptée")
	}
	if _, err := os.Stat(dest + "2"); !os.IsNotExist(err) {
		t.Fatal("fichier refusé laissé en place")
	}
}

func TestRemoveDataChoices(t *testing.T) {
	root := t.TempDir()
	docs, appData, local := filepath.Join(root, "Docs"), filepath.Join(root, "Roaming"), filepath.Join(root, "Local")
	mk := func(p string) { os.MkdirAll(p, 0o755); os.WriteFile(filepath.Join(p, "f"), []byte("x"), 0o644) }
	reset := func() {
		os.RemoveAll(root)
		mk(filepath.Join(docs, "NEXORA", "Sites"))
		mk(filepath.Join(appData, "Vitrine"))
		mk(filepath.Join(appData, "Vitrine", "android"))
		mk(filepath.Join(local, "NEXORA", "tools"))
	}
	exists := func(p string) bool { _, err := os.Stat(p); return err == nil }
	d := dataDirs(docs, appData, local)

	reset()
	RemoveData(d, UninstallChoice{})
	if !exists(filepath.Join(docs, "NEXORA")) || !exists(filepath.Join(appData, "Vitrine", "f")) || !exists(filepath.Join(local, "NEXORA")) {
		t.Fatal("rien coché : des données ont été supprimées")
	}
	reset()
	RemoveData(d, UninstallChoice{Settings: true})
	if exists(filepath.Join(appData, "Vitrine", "f")) || !exists(filepath.Join(appData, "Vitrine", "android")) || !exists(filepath.Join(docs, "NEXORA")) {
		t.Fatal("réglages seuls : la bibliothèque Android ou les documents ont été touchés")
	}
	reset()
	RemoveData(d, UninstallChoice{Library: true})
	if exists(filepath.Join(local, "NEXORA")) || exists(filepath.Join(appData, "Vitrine", "android")) || !exists(filepath.Join(appData, "Vitrine", "f")) {
		t.Fatal("bibliothèque seule : mauvais dossiers supprimés")
	}
	reset()
	RemoveData(d, UninstallChoice{Documents: true, Settings: true, Library: true})
	if exists(filepath.Join(docs, "NEXORA")) || exists(filepath.Join(appData, "Vitrine")) || exists(filepath.Join(local, "NEXORA")) {
		t.Fatal("tout coché : des données restent")
	}
}

// Publication réelle préparée par `pnpm toolbox` (NEXORA_TOOLBOX_DIR=<dossier>) : vérifiée avec la vraie clé
// publique et extraite comme le ferait le lanceur.
func TestRealPublication(t *testing.T) {
	dir := os.Getenv("NEXORA_TOOLBOX_DIR")
	if dir == "" {
		t.Skip("NEXORA_TOOLBOX_DIR non défini")
	}
	key, err := releaseKey()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, manifestName))
	if err != nil {
		t.Fatal(err)
	}
	sig, _ := os.ReadFile(filepath.Join(dir, signatureName))
	m, err := VerifyManifest(raw, string(sig), key)
	if err != nil {
		t.Fatalf("publication refusée : %v", err)
	}
	if got, n, _ := FileSHA256(filepath.Join(dir, m.Package.Name)); got != m.Package.SHA256 || n != m.Package.Size {
		t.Fatal("paquet différent du manifeste")
	}
	dest := t.TempDir()
	if err := ExtractZip(filepath.Join(dir, m.Package.Name), dest, m.Files, nil, nil); err != nil {
		t.Fatalf("extraction refusée : %v", err)
	}
	if err := VerifyTree(dest, m.Files, nil); err != nil {
		t.Fatal(err)
	}
	t.Logf("NEXORA %s : %d fichiers vérifiés", m.Version, len(m.Files))
}
