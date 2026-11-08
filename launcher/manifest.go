// NEXORA #076 : manifeste de publication signé (Ed25519) et vérification des fichiers (SHA-256).
//
// Une publication de NEXORA sur GitHub contient :
//   - nexora.manifest.json : version, paquet ZIP (taille, SHA-256), empreinte de chaque fichier du logiciel ;
//   - nexora.manifest.sig  : signature Ed25519 du manifeste (octets exacts), en base64 ;
//   - le paquet ZIP (contenu du dossier NEXORA-win32-x64) et, au besoin, le lanceur lui-même.
//
// La clé publique ci-dessous est la même que celle de nexora/app/src/license.js (RELEASE_KEY) ; la clé privée
// reste sur le poste de publication (NX_RELEASE_SIGNING_KEY), jamais dans le dépôt.
package main

import (
	"archive/zip"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const releasePublicKey = "MCowBQYDK2VwAyEAuylEQNJveeY4JGMR7lmlzN/tsqE/DWeWntYU7n1OxNc="

const (
	manifestName  = "nexora.manifest.json"
	signatureName = "nexora.manifest.sig"
)

type FileEntry struct {
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type Asset struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	SHA256  string `json:"sha256"`
	Version string `json:"version,omitempty"`
}

type Manifest struct {
	Format      int    `json:"format"`
	Application string `json:"application"`
	Product     string `json:"product"`
	Version     string `json:"version"`
	Release     string `json:"release"`
	Channel     string `json:"channel"`
	// NEXORA #077 : numéro croissant de publication (refus des retours en arrière), dates d'émission et de fin.
	ManifestVersion int64                `json:"manifest_version"`
	IssuedAt        string               `json:"issued_at"`
	ExpiresAt       string               `json:"expires_at"`
	PublishedAt     string               `json:"published_at"`
	Exe             string               `json:"exe"`
	MinLauncher     string               `json:"min_launcher"`
	Package         Asset                `json:"package"`
	Launcher        *Asset               `json:"launcher,omitempty"`
	Files           map[string]FileEntry `json:"files"`
}

var (
	errSignature = errors.New("la signature de la publication n’est pas authentique")
	errExpired   = errors.New("le manifeste de la publication a expiré")
	nowFunc      = time.Now
	hexSHA       = regexp.MustCompile(`^[0-9a-f]{64}$`)
	versionRe    = regexp.MustCompile(`^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$`)
)

func releaseKey() (ed25519.PublicKey, error) {
	der, err := base64.StdEncoding.DecodeString(releasePublicKey)
	if err != nil {
		return nil, err
	}
	k, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		return nil, err
	}
	pk, ok := k.(ed25519.PublicKey)
	if !ok {
		return nil, errors.New("clé de publication invalide")
	}
	return pk, nil
}

// safeRel : chemin relatif sans « .. », sans lecteur ni racine (protection contre l'écriture hors du dossier).
func safeRel(p string) bool {
	if p == "" || strings.ContainsAny(p, "\\:\x00") || strings.HasPrefix(p, "/") {
		return false
	}
	c := path.Clean(p)
	if c != p || c == "." {
		return false
	}
	for _, part := range strings.Split(c, "/") {
		if part == ".." || part == "" {
			return false
		}
	}
	return true
}

// VerifyManifest vérifie la signature des octets exacts du manifeste, puis sa cohérence.
func VerifyManifest(raw []byte, sigB64 string, key ed25519.PublicKey) (*Manifest, error) {
	sig, err := base64.StdEncoding.DecodeString(strings.TrimSpace(sigB64))
	if err != nil || len(sig) != ed25519.SignatureSize {
		return nil, errSignature
	}
	if !ed25519.Verify(key, raw, sig) {
		return nil, errSignature
	}
	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("manifeste illisible : %w", err)
	}
	if m.Format != 1 || !versionRe.MatchString(m.Version) {
		return nil, errors.New("manifeste de format inconnu")
	}
	if app := m.Application + m.Product; app != "" && m.Application != "NEXORA" && m.Product != "NEXORA" {
		return nil, errors.New("manifeste d’une autre application")
	}
	if m.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, m.ExpiresAt)
		if err != nil {
			return nil, errors.New("manifeste incohérent (date de fin illisible)")
		}
		if nowFunc().After(t) {
			return nil, errExpired
		}
	}
	if m.Exe == "" {
		m.Exe = "NEXORA.exe"
	}
	if !safeRel(m.Exe) || m.Package.Name == "" || strings.ContainsAny(m.Package.Name, "/\\") || !hexSHA.MatchString(m.Package.SHA256) || m.Package.Size <= 0 {
		return nil, errors.New("manifeste incomplet (paquet)")
	}
	if m.Launcher != nil && (m.Launcher.Name == "" || strings.ContainsAny(m.Launcher.Name, "/\\") || !hexSHA.MatchString(m.Launcher.SHA256)) {
		return nil, errors.New("manifeste incomplet (lanceur)")
	}
	if len(m.Files) == 0 {
		return nil, errors.New("manifeste sans fichiers")
	}
	for p, f := range m.Files {
		if !safeRel(p) || !hexSHA.MatchString(f.SHA256) || f.Size < 0 {
			return nil, fmt.Errorf("entrée de manifeste refusée : %q", p)
		}
	}
	for _, need := range []string{m.Exe, "resources/app.asar"} {
		if _, ok := m.Files[need]; !ok {
			return nil, fmt.Errorf("manifeste sans %s", need)
		}
	}
	return &m, nil
}

// CompareVersions compare deux versions « 1.2.3 » (suffixe ignoré) : -1, 0 ou 1. Une version vide est la plus petite.
func CompareVersions(a, b string) int {
	pa, pb := versionParts(a), versionParts(b)
	for i := 0; i < 3; i++ {
		if pa[i] != pb[i] {
			if pa[i] < pb[i] {
				return -1
			}
			return 1
		}
	}
	return 0
}

func versionParts(v string) [3]int {
	var out [3]int
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if i := strings.IndexAny(v, "-+"); i >= 0 {
		v = v[:i]
	}
	for i, s := range strings.SplitN(v, ".", 3) {
		n, _ := strconv.Atoi(s)
		out[i] = n
	}
	return out
}

func FileSHA256(p string) (string, int64, error) {
	f, err := os.Open(p)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

// ExtractZip extrait le paquet dans dest en vérifiant chaque fichier contre le manifeste : un fichier inattendu,
// modifié, manquant ou qui sortirait du dossier interrompt l'installation.
func ExtractZip(zipPath, dest string, expect map[string]FileEntry, progress func(done, total int64), cancelled func() bool) error {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("paquet illisible : %w", err)
	}
	defer zr.Close()
	var total, done int64
	for _, f := range zr.File {
		total += int64(f.UncompressedSize64)
	}
	seen := make(map[string]bool, len(expect))
	absDest, err := filepath.Abs(dest)
	if err != nil {
		return err
	}
	for _, f := range zr.File {
		if cancelled != nil && cancelled() {
			return errCancelled
		}
		name := strings.TrimPrefix(f.Name, "./")
		if strings.HasSuffix(name, "/") {
			if !safeRel(strings.TrimSuffix(name, "/")) {
				return fmt.Errorf("chemin refusé dans le paquet : %q", f.Name)
			}
			continue
		}
		if !safeRel(name) {
			return fmt.Errorf("chemin refusé dans le paquet : %q", f.Name)
		}
		want, ok := expect[name]
		if !ok {
			return fmt.Errorf("fichier inattendu dans le paquet : %s", name)
		}
		if f.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("lien symbolique refusé : %s", name)
		}
		target := filepath.Join(absDest, filepath.FromSlash(name))
		if rel, err := filepath.Rel(absDest, target); err != nil || strings.HasPrefix(rel, "..") {
			return fmt.Errorf("chemin refusé dans le paquet : %q", f.Name)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
		if err != nil {
			rc.Close()
			return err
		}
		h := sha256.New()
		n, err := io.Copy(io.MultiWriter(out, h), io.LimitReader(rc, want.Size+1))
		rc.Close()
		if cerr := out.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return err
		}
		if n != want.Size || hex.EncodeToString(h.Sum(nil)) != want.SHA256 {
			return fmt.Errorf("empreinte différente pour %s : paquet altéré", name)
		}
		seen[name] = true
		done += int64(f.UncompressedSize64)
		if progress != nil {
			progress(done, total)
		}
	}
	for p := range expect {
		if !seen[p] {
			return fmt.Errorf("fichier manquant dans le paquet : %s", p)
		}
	}
	return nil
}

// VerifyTree contrôle les fichiers installés : only = sous-ensemble (contrôle rapide), sinon tous les fichiers.
func VerifyTree(root string, files map[string]FileEntry, only []string) error {
	list := only
	if list == nil {
		for p := range files {
			list = append(list, p)
		}
	}
	for _, p := range list {
		want, ok := files[p]
		if !ok {
			return fmt.Errorf("%s absent du manifeste", p)
		}
		got, n, err := FileSHA256(filepath.Join(root, filepath.FromSlash(p)))
		if err != nil {
			return fmt.Errorf("%s introuvable", p)
		}
		if n != want.Size || got != want.SHA256 {
			return fmt.Errorf("%s a été modifié", p)
		}
	}
	return nil
}
