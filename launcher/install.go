// NEXORA #076 : installation locale sans droits d'administrateur, versions côte à côte, retour arrière,
// réparation, lancement de NEXORA et désinstallation avec choix de ce qui est gardé.
//
//	%LOCALAPPDATA%\Programs\NEXORA Devs Toolbox\
//	  NEXORA Devs Toolbox.exe   le lanceur (seul élément visible : raccourcis, liens nexora://, Paramètres)
//	  app\<version>\            NEXORA (NEXORA.exe, resources\app.asar, resources\nexora.manifest.json + .sig)
//	  downloads\                paquets en cours de téléchargement
//	  state.json                version courante et précédente
package main

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	productName = "NEXORA Devs Toolbox"
	launcherExe = "NEXORA Devs Toolbox.exe"
	launchedBy  = "nexora-devs-toolbox"
)

type Layout struct {
	Root, AppDir, Downloads, StateFile, Launcher string
}

func newLayout(root string) Layout {
	return Layout{
		Root:      root,
		AppDir:    filepath.Join(root, "app"),
		Downloads: filepath.Join(root, "downloads"),
		StateFile: filepath.Join(root, "state.json"),
		Launcher:  filepath.Join(root, launcherExe),
	}
}

func (l Layout) versionDir(v string) string { return filepath.Join(l.AppDir, v) }

type State struct {
	Current       string `json:"current"`
	Previous      string `json:"previous,omitempty"`
	Repo          string `json:"repo,omitempty"`
	InstalledAt   string `json:"installed_at,omitempty"`
	UpdatedAt     string `json:"updated_at,omitempty"`
	Registered    string `json:"registered,omitempty"`    // version du lanceur qui a posé raccourcis et registre
	LastManifest  int64  `json:"last_manifest,omitempty"` // NEXORA #077 : dernier numéro de manifeste accepté (retours en arrière refusés)
	RegisteredFor string `json:"registered_for,omitempty"`
	// NEXORA #084 : choix de l'assistant d'installation (raccourcis du Bureau et du menu Démarrer).
	NoDesktop   bool `json:"no_desktop,omitempty"`
	NoStartMenu bool `json:"no_start_menu,omitempty"`
}

func loadState(l Layout) State {
	var s State
	if b, err := os.ReadFile(l.StateFile); err == nil {
		_ = json.Unmarshal(b, &s)
	}
	return s
}

func saveState(l Layout, s State) error {
	if err := os.MkdirAll(l.Root, 0o755); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(s, "", "  ")
	tmp := l.StateFile + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, l.StateFile)
}

// Installed : manifeste signé gardé dans resources\ de la version, puis contrôle des fichiers.
// full = tous les fichiers (réparation) ; sinon NEXORA.exe et app.asar (avant chaque lancement).
func Installed(l Layout, v string, key ed25519.PublicKey, full bool) (*Manifest, error) {
	if v == "" {
		return nil, errors.New("NEXORA n’est pas encore installé")
	}
	dir := l.versionDir(v)
	raw, err := os.ReadFile(filepath.Join(dir, "resources", manifestName))
	if err != nil {
		return nil, errors.New("manifeste de la version installée introuvable")
	}
	sig, err := os.ReadFile(filepath.Join(dir, "resources", signatureName))
	if err != nil {
		return nil, errors.New("signature de la version installée introuvable")
	}
	m, err := VerifyManifest(raw, string(sig), key)
	if err != nil {
		return nil, err
	}
	if m.Version != v {
		return nil, errors.New("version installée incohérente")
	}
	var only []string
	if !full {
		only = []string{m.Exe, "resources/app.asar"}
	}
	if err := VerifyTree(dir, m.Files, only); err != nil {
		return nil, err
	}
	return m, nil
}

// InstallRelease télécharge le paquet, le vérifie, l'extrait à côté puis bascule : la version courante ne change
// qu'une fois la nouvelle entièrement vérifiée (une coupure laisse l'ancienne intacte).
func InstallRelease(ctx context.Context, c *http.Client, l Layout, st *State, rel *Release, p Progress) error {
	m := rel.Manifest
	a := rel.gh.asset(m.Package.Name)
	if err := os.MkdirAll(l.Downloads, 0o755); err != nil {
		return err
	}
	// NEXORA #126 : place vérifiée (et reprise) avant de télécharger ; un disque plein n'est plus pris pour un
	// fichier refusé.
	if err := ensureSpace(l, st, m); err != nil {
		return err
	}
	zipPath := filepath.Join(l.Downloads, m.Package.Name)
	p.Set(0.02, fmt.Sprintf("Téléchargement de NEXORA %s…", m.Version))
	err := Download(ctx, c, a.URL, zipPath, m.Package, func(got, total int64) {
		p.Set(0.02+0.68*float64(got)/float64(max64(total, 1)), fmt.Sprintf("Téléchargement : %d / %d Mo", got>>20, total>>20))
	}, p.Cancelled)
	if err != nil {
		return spaceErr(l, m, err) // le fichier partiel est gardé : le téléchargement reprendra
	}
	p.Set(0.71, "Vérification…")
	staging := l.versionDir(m.Version) + ".staging"
	os.RemoveAll(staging)
	if err := ExtractZip(zipPath, staging, m.Files, func(done, total int64) {
		p.Set(0.72+0.24*float64(done)/float64(max64(total, 1)), "Installation de NEXORA…")
	}, p.Cancelled); err != nil {
		os.RemoveAll(staging)
		if errors.Is(err, errCancelled) {
			return err
		}
		if isDiskFull(err) {
			return spaceErr(l, m, err) // paquet vérifié gardé : rien à retélécharger après avoir fait de la place
		}
		os.Remove(zipPath) // paquet refusé : il sera retéléchargé
		return err
	}
	if err := os.WriteFile(filepath.Join(staging, "resources", manifestName), rel.Raw, 0o644); err != nil {
		os.RemoveAll(staging)
		return spaceErr(l, m, err)
	}
	if err := os.WriteFile(filepath.Join(staging, "resources", signatureName), []byte(rel.Sig+"\n"), 0o644); err != nil {
		os.RemoveAll(staging)
		return spaceErr(l, m, err)
	}
	final := l.versionDir(m.Version)
	if err := os.RemoveAll(final); err != nil {
		os.RemoveAll(staging)
		return fmt.Errorf("NEXORA %s est encore ouvert : fermez-le, puis réessayez", m.Version)
	}
	if err := os.Rename(staging, final); err != nil {
		os.RemoveAll(staging)
		return err
	}
	p.Set(0.98, "Finalisation…")
	now := time.Now().UTC().Format(time.RFC3339)
	if st.Current != "" && st.Current != m.Version {
		st.Previous = st.Current
	}
	if st.InstalledAt == "" {
		st.InstalledAt = now
	}
	st.Current, st.UpdatedAt = m.Version, now
	if err := saveState(l, *st); err != nil {
		return err
	}
	os.Remove(zipPath)
	Prune(l, *st)
	return nil
}

// NEXORA #126 : place disque. Une mise à jour demande le paquet (s'il n'est pas déjà téléchargé), tous les fichiers
// extraits à côté de la version en place, et une marge.
const spaceMargin = 128 << 20

// freeSpace : octets disponibles sur le disque d'un dossier (remplaçable dans les essais).
var freeSpace = diskFree

// SpaceError : place insuffisante pour installer, même après avoir repris ce qui pouvait l'être.
type SpaceError struct {
	Need, Free uint64
	Dir        string
}

func (e *SpaceError) Error() string {
	return fmt.Sprintf("espace disque insuffisant : %s nécessaires, %s disponibles", sizeText(e.Need), sizeText(e.Free))
}

// sizeText : taille lisible (« 640 Mo », « 1,2 Go »).
func sizeText(n uint64) string {
	if n < 1000<<20 {
		return fmt.Sprintf("%d Mo", (n+(1<<20)-1)>>20)
	}
	return strings.Replace(fmt.Sprintf("%.1f Go", float64(n)/float64(1<<30)), ".", ",", 1)
}

// installNeed : place demandée par l'installation de m (téléchargement déjà fait ou commencé déduit).
func installNeed(l Layout, m *Manifest) uint64 {
	var need uint64 = spaceMargin
	for _, f := range m.Files {
		need += uint64(max64(f.Size, 0))
	}
	zipPath := filepath.Join(l.Downloads, m.Package.Name)
	pkg := max64(m.Package.Size, 0)
	if fi, err := os.Stat(zipPath); err == nil && fi.Size() == m.Package.Size {
		pkg = 0
	} else if fi, err := os.Stat(zipPath + ".part"); err == nil && fi.Size() < pkg {
		pkg -= fi.Size()
	}
	return need + uint64(pkg)
}

// existingDir : premier dossier existant en remontant (le dossier d'installation n'existe pas encore au premier
// lancement).
func existingDir(dir string) string {
	for d := filepath.Clean(dir); ; d = filepath.Dir(d) {
		if fi, err := os.Stat(d); err == nil && fi.IsDir() {
			return d
		}
		if filepath.Dir(d) == d {
			return d
		}
	}
}

// ensureSpace : vérifie la place ; si elle manque, reprend d'abord ce qui ne sert plus (paquets d'autres versions,
// installations interrompues, versions que Prune supprimerait), puis la copie de retour arrière (version
// précédente) seulement si elle empêche la mise à jour. Mesure impossible : l'installation est tentée.
func ensureSpace(l Layout, st *State, m *Manifest) error {
	need := installNeed(l, m)
	free, err := freeSpace(l.Root)
	if err != nil || free >= need {
		return nil
	}
	if entries, err := os.ReadDir(l.Downloads); err == nil {
		for _, e := range entries {
			if n := e.Name(); n != m.Package.Name && n != m.Package.Name+".part" {
				os.RemoveAll(filepath.Join(l.Downloads, n))
			}
		}
	}
	if entries, err := os.ReadDir(l.AppDir); err == nil {
		for _, e := range entries {
			if n := e.Name(); e.IsDir() && n != st.Current && n != st.Previous && n != m.Version {
				os.RemoveAll(filepath.Join(l.AppDir, n))
			}
		}
	}
	if free, err = freeSpace(l.Root); err != nil || free >= need {
		return nil
	}
	if p := st.Previous; p != "" && p != st.Current && p != m.Version {
		if os.RemoveAll(l.versionDir(p)) == nil {
			journal(l, "space", "version précédente "+p+" retirée pour faire de la place à NEXORA "+m.Version)
			st.Previous = ""
			_ = saveState(l, *st)
		}
		if free, err = freeSpace(l.Root); err != nil || free >= need {
			return nil
		}
	}
	return &SpaceError{Need: need, Free: free, Dir: l.Root}
}

// spaceErr : erreur d'écriture due à un disque plein → SpaceError (place mesurée) ; autre erreur inchangée.
func spaceErr(l Layout, m *Manifest, err error) error {
	if err == nil || !isDiskFull(err) {
		return err
	}
	free, _ := freeSpace(l.Root)
	return &SpaceError{Need: installNeed(l, m), Free: free, Dir: l.Root}
}

// Prune garde la version courante et la précédente (retour arrière) ; les autres sont supprimées.
func Prune(l Layout, st State) {
	entries, err := os.ReadDir(l.AppDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		n := e.Name()
		if !e.IsDir() || n == st.Current || n == st.Previous {
			continue
		}
		os.RemoveAll(filepath.Join(l.AppDir, n)) // échoue sans gravité si la version est encore ouverte
	}
}

// Rollback revient à la version précédente si elle est intacte.
func Rollback(l Layout, st *State, key ed25519.PublicKey) error {
	if st.Previous == "" {
		return errors.New("aucune version précédente n’est disponible")
	}
	if _, err := Installed(l, st.Previous, key, true); err != nil {
		return fmt.Errorf("la version précédente est endommagée (%v)", err)
	}
	st.Current, st.Previous = st.Previous, st.Current
	st.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return saveState(l, *st)
}

// LaunchCommand prépare NEXORA : variables qui prouvent le passage par le lanceur, arguments transmis (liens
// nexora://licence?key=… du site, fichiers).
func LaunchCommand(l Layout, m *Manifest, args []string) *exec.Cmd {
	dir := l.versionDir(m.Version)
	cmd := exec.Command(filepath.Join(dir, filepath.FromSlash(m.Exe)), args...)
	cmd.Dir = dir
	env := []string{}
	for _, e := range os.Environ() {
		k := strings.ToUpper(strings.SplitN(e, "=", 2)[0])
		if k == "NEXORA_LAUNCHED_BY" || k == "NEXORA_LAUNCHER_PATH" || k == "NEXORA_LAUNCHER_VERSION" || k == "NEXORA_LICENCE_OFF" || k == "NEXORA_LICENCE_FORCE" {
			continue // jamais hérités : seul le lanceur les pose
		}
		env = append(env, e)
	}
	cmd.Env = append(env, "NEXORA_LAUNCHED_BY="+launchedBy, "NEXORA_LAUNCHER_PATH="+l.Launcher, "NEXORA_LAUNCHER_VERSION="+version)
	return cmd
}

// Données de l'utilisateur, proposées à la désinstallation.
type DataDirs struct {
	Documents []string // projets, sites, applications construites
	Settings  []string // réglages, compte enregistré, licence, journaux
	Library   []string // bibliothèques et outils téléchargés
	KeepIn    map[string][]string
}

func dataDirs(documents, appData, localAppData string) DataDirs {
	vitrine := filepath.Join(appData, "Vitrine")
	return DataDirs{
		Documents: []string{filepath.Join(documents, "NEXORA")},
		Settings:  []string{vitrine, filepath.Join(appData, "NEXORA")},
		Library:   []string{filepath.Join(localAppData, "NEXORA"), filepath.Join(vitrine, "android")},
		// Réglages supprimés mais bibliothèque gardée : le dossier android de Vitrine reste.
		KeepIn: map[string][]string{vitrine: {"android"}},
	}
}

type UninstallChoice struct{ Documents, Settings, Library bool }

// RemoveData supprime ce que l'utilisateur a choisi ; retourne les dossiers qui n'ont pas pu l'être.
func RemoveData(d DataDirs, ch UninstallChoice) []string {
	var failed []string
	rm := func(p string) {
		if err := os.RemoveAll(p); err != nil {
			failed = append(failed, p)
		}
	}
	if ch.Library {
		for _, p := range d.Library {
			rm(p)
		}
	}
	if ch.Documents {
		for _, p := range d.Documents {
			rm(p)
		}
	}
	if ch.Settings {
		for _, p := range d.Settings {
			keep := d.KeepIn[p]
			if ch.Library || len(keep) == 0 {
				rm(p)
				continue
			}
			entries, err := os.ReadDir(p)
			if err != nil {
				continue
			}
			for _, e := range entries {
				if !contains(keep, e.Name()) {
					rm(filepath.Join(p, e.Name()))
				}
			}
		}
	}
	sort.Strings(failed)
	return failed
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if strings.EqualFold(x, s) {
			return true
		}
	}
	return false
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
