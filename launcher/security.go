// NEXORA #077 : contrôle de sécurité au démarrage, avant NEXORA.
//  1. Le service de sécurité de NEXORA (Worker) fournit une déclaration SIGNÉE (clé de licence, Ed25519), valable
//     24 h : dernière publication autorisée (version, numéro de manifeste, empreinte SHA-256 du manifeste) et
//     versions minimales (politique du back office). Déclaration expirée, non signée ou d'une autre application :
//     refus.
//  2. Le manifeste du dépôt officiel (GitHub) est vérifié avec la clé de publication ET doit avoir l'empreinte
//     déclarée par le service : un fichier simplement présent sur GitHub ne suffit pas.
//  3. Retour en arrière refusé : numéro de manifeste inférieur au dernier accepté sur ce PC ou au minimum autorisé.
//  4. Tous les fichiers installés sont comparés à leurs empreintes ; une installation modifiée n'est jamais lancée
//     (réparation proposée). Nouvelle version : mise à jour vérifiée, puis lancement.
//
// Réactions : réseau ou serveur injoignable → « Connexion perdue » ; fichiers → « Échec du contrôle d'intégrité —
// Installation non authentifiée » ; version → « Version non autorisée » ; manifeste → « expiré ou incohérent ».
// Chaque refus est écrit dans journal-securite.txt et envoyé au service (sans donnée personnelle).
package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Clé publique du service de sécurité (identique à LICENSE_KEY de nexora/app/src/license.js).
const licensePublicKey = "MCowBQYDK2VwAyEA5qntAYP+NTzIAelhd3Sm2lUpg2Wi5b+TL0LM8np5sN8="

var serverBase = "https://nexora.abrahamtogbonon0.workers.dev"

// SecFail : refus de sécurité montré à l'utilisateur (écran dédié) et consigné.
type SecFail struct {
	Kind, Message, Detail string
}

func (e *SecFail) Error() string { return e.Message }

// LauncherUpdate : la publication exige un lanceur plus récent (min_launcher) ; run() l'installe puis le relance.
type LauncherUpdate struct{ Release *Release }

func (e *LauncherUpdate) Error() string { return "nouveau lanceur exigé par la publication" }

var secTitles = map[string]string{
	"offline":   "Connexion perdue",
	"server":    "Serveur de sécurité indisponible",
	"integrity": "Échec du contrôle d’intégrité — Installation non authentifiée",
	"manifest":  "Manifeste de sécurité expiré ou incohérent",
	"outdated":  "Version non autorisée",
}

func secTitle(kind string) string {
	if t := secTitles[kind]; t != "" {
		return t
	}
	return "Ouverture bloquée"
}

func secActions(kind string) []string {
	switch kind {
	case "integrity":
		return []string{"repair", "quit"}
	case "outdated":
		return []string{"update", "quit"}
	default:
		return []string{"retry", "quit"}
	}
}

type Latest struct {
	Version         string `json:"version"`
	ManifestVersion int64  `json:"manifest_version"`
	ManifestSHA256  string `json:"manifest_sha256"`
}

type Statement struct {
	Application        string  `json:"application"`
	Kind               string  `json:"kind"`
	Status             string  `json:"status"`
	IssuedAt           string  `json:"issued_at"`
	ExpiresAt          string  `json:"expires_at"`
	Latest             *Latest `json:"latest"`
	MinVersion         string  `json:"min_version"`
	MinManifestVersion int64   `json:"min_manifest_version"`
	BlockOutdated      bool    `json:"block_outdated"`
}

func licenseKey() (ed25519.PublicKey, error) {
	der, err := base64.StdEncoding.DecodeString(licensePublicKey)
	if err != nil {
		return nil, err
	}
	k, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		return nil, err
	}
	pk, ok := k.(ed25519.PublicKey)
	if !ok {
		return nil, errors.New("clé du service de sécurité invalide")
	}
	return pk, nil
}

// VerifyStatement : signature, application, dates (5 minutes de tolérance d'horloge).
func VerifyStatement(payload, sigB64 string, key ed25519.PublicKey) (*Statement, error) {
	sig, err := base64.StdEncoding.DecodeString(strings.TrimSpace(sigB64))
	if err != nil || len(sig) != ed25519.SignatureSize || !ed25519.Verify(key, []byte(payload), sig) {
		return nil, &SecFail{Kind: "manifest", Message: "La déclaration du serveur de sécurité n’est pas authentique (proxy ou pare-feu qui modifie la connexion ?)."}
	}
	var s Statement
	if err := json.Unmarshal([]byte(payload), &s); err != nil || s.Application != "NEXORA" || s.Kind != "release_statement" {
		return nil, &SecFail{Kind: "manifest", Message: "La déclaration du serveur de sécurité est incohérente."}
	}
	now := nowFunc()
	iss, e1 := time.Parse(time.RFC3339, s.IssuedAt)
	exp, e2 := time.Parse(time.RFC3339, s.ExpiresAt)
	if e1 != nil || e2 != nil || iss.After(now.Add(5*time.Minute)) {
		return nil, &SecFail{Kind: "manifest", Message: "La déclaration du serveur de sécurité est incohérente (dates). Vérifie la date et l’heure de Windows."}
	}
	if now.After(exp.Add(5 * time.Minute)) {
		return nil, &SecFail{Kind: "manifest", Message: "La déclaration du serveur de sécurité a expiré. Vérifie la date et l’heure de Windows, puis réessaie."}
	}
	return &s, nil
}

// FetchStatement : déclaration du service de sécurité (GET /security/manifest).
func FetchStatement(ctx context.Context, c *http.Client, key ed25519.PublicKey) (*Statement, error) {
	res, err := get(ctx, c, serverBase+"/security/manifest", map[string]string{"Accept": "application/json"})
	if err != nil {
		return nil, &SecFail{Kind: "offline", Message: "Connexion perdue : NEXORA Devs Toolbox ne peut pas joindre le serveur de sécurité de NEXORA. Vérifie ta connexion à Internet, puis réessaie.", Detail: err.Error()}
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode == http.StatusServiceUnavailable {
		return nil, &SecFail{Kind: "server", Message: "Le serveur de sécurité de NEXORA n’est pas encore prêt. Réessaie dans quelques minutes."}
	}
	if res.StatusCode != http.StatusOK {
		return nil, &SecFail{Kind: "offline", Message: fmt.Sprintf("Connexion perdue : le serveur de sécurité répond %d.", res.StatusCode)}
	}
	var env struct {
		Payload string `json:"payload"`
		Sig     string `json:"sig"`
	}
	if json.Unmarshal(b, &env) != nil || env.Payload == "" {
		return nil, &SecFail{Kind: "manifest", Message: "La déclaration du serveur de sécurité est illisible."}
	}
	return VerifyStatement(env.Payload, env.Sig, key)
}

// StartupCheck : toute la séquence ; renvoie le manifeste de la version à lancer, ou un *SecFail.
func StartupCheck(ctx context.Context, c *http.Client, l Layout, st *State, relKey, licKey ed25519.PublicKey, repo string, repair bool, prog func() Progress) (*Manifest, error) {
	sctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	stmt, err := FetchStatement(sctx, c, licKey)
	cancel()
	if err != nil {
		return nil, err
	}
	gctx, gcancel := context.WithTimeout(ctx, 30*time.Second)
	rel, err := LatestRelease(gctx, c, repo, relKey)
	gcancel()
	if err != nil {
		switch {
		case errors.Is(err, errOffline):
			return nil, &SecFail{Kind: "offline", Message: "Connexion perdue : le dépôt officiel des versions de NEXORA est injoignable. Vérifie ta connexion à Internet, puis réessaie.", Detail: err.Error()}
		case errors.Is(err, errSignature):
			return nil, &SecFail{Kind: "integrity", Message: "La publication trouvée sur le dépôt officiel n’est pas signée par NEXORA : rien n’a été installé."}
		case errors.Is(err, errExpired):
			return nil, &SecFail{Kind: "manifest", Message: "Le manifeste de la publication officielle a expiré : une nouvelle publication est attendue."}
		default:
			return nil, &SecFail{Kind: "manifest", Message: "Publication officielle incohérente : " + err.Error()}
		}
	}
	m := rel.Manifest
	if stmt.Latest == nil || stmt.Status != "ok" {
		return nil, &SecFail{Kind: "server", Message: "Le serveur de sécurité ne déclare aucune publication autorisée pour l’instant (" + stmt.Status + ")."}
	}
	if sha256Hex(rel.Raw) != stmt.Latest.ManifestSHA256 || m.Version != stmt.Latest.Version {
		return nil, &SecFail{Kind: "integrity", Message: "La publication du dépôt ne correspond pas à celle autorisée par le serveur de sécurité : rien n’a été installé."}
	}
	if m.ManifestVersion < st.LastManifest || m.ManifestVersion < stmt.MinManifestVersion {
		return nil, &SecFail{Kind: "outdated", Message: "La publication proposée est plus ancienne que la dernière validée sur ce PC : retour en arrière refusé."}
	}
	// NEXORA #083 : lanceur trop ancien pour cette publication authentifiée : nouveau lanceur (vérifié par le
	// manifeste signé) avant toute autre étape ; min_launcher n'était jusqu'ici jamais appliqué.
	if m.Launcher != nil && m.MinLauncher != "" && CompareVersions(version, m.MinLauncher) < 0 {
		return nil, &LauncherUpdate{Release: rel}
	}
	cur, cerr := Installed(l, st.Current, relKey, true)
	if cerr != nil && st.Current != "" && !repair && !errors.Is(cerr, errExpired) {
		return nil, &SecFail{Kind: "integrity", Message: "Échec du contrôle d’intégrité — Installation non authentifiée : " + cerr.Error() + ". NEXORA ne sera pas ouvert ; NEXORA Devs Toolbox peut réinstaller les fichiers officiels.", Detail: cerr.Error()}
	}
	// NEXORA #084 : même numéro de version mais publication plus récente (NEXORA reconstruit) : réinstallée aussi.
	newer := cur != nil && m.Version == cur.Version && m.ManifestVersion > cur.ManifestVersion
	if cerr != nil || newer || CompareVersions(m.Version, st.Current) > 0 || (cur != nil && cur.ManifestVersion < stmt.MinManifestVersion) {
		p := prog()
		err := InstallRelease(ctx, c, l, st, rel, p)
		p.Close()
		if err != nil {
			if errors.Is(err, errCancelled) {
				return nil, err
			}
			if errors.Is(err, errOffline) {
				return nil, &SecFail{Kind: "offline", Message: "Connexion perdue pendant le téléchargement de NEXORA. Réessaie : le téléchargement reprendra où il s’est arrêté.", Detail: err.Error()}
			}
			return nil, &SecFail{Kind: "integrity", Message: "Le téléchargement de NEXORA a été refusé au contrôle : " + err.Error(), Detail: err.Error()}
		}
		if cur, cerr = Installed(l, st.Current, relKey, true); cerr != nil {
			return nil, &SecFail{Kind: "integrity", Message: "NEXORA installé mais refusé au contrôle : " + cerr.Error(), Detail: cerr.Error()}
		}
	}
	if stmt.BlockOutdated && CompareVersions(cur.Version, stmt.MinVersion) < 0 {
		return nil, &SecFail{Kind: "outdated", Message: fmt.Sprintf("NEXORA %s n’est plus autorisé (version minimale : %s) et aucune publication plus récente n’est disponible.", cur.Version, stmt.MinVersion)}
	}
	if cur.ManifestVersion > st.LastManifest {
		st.LastManifest = cur.ManifestVersion
		_ = saveState(l, *st)
	}
	return cur, nil
}

// Journal local des refus (dossier du lanceur) et rapport au service de sécurité.
func journal(l Layout, kind, msg string) {
	_ = os.MkdirAll(l.Root, 0o755)
	f, err := os.OpenFile(filepath.Join(l.Root, "journal-securite.txt"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s\t%s\t%s\n", nowFunc().UTC().Format(time.RFC3339), kind, strings.ReplaceAll(msg, "\n", " "))
}

func deviceHash() string {
	g := machineGUID()
	if g == "" {
		h, _ := os.Hostname()
		g = h
	}
	s := sha256.Sum256([]byte("nexora-device:" + g))
	return hex.EncodeToString(s[:])
}

func Report(c *http.Client, f *SecFail, ver string) {
	if f.Kind == "offline" {
		return // rien à envoyer sans réseau ; le journal local garde la trace
	}
	body, _ := json.Marshal(map[string]any{"device": deviceHash(), "reason": f.Kind, "version": ver, "source": "launcher", "detail": map[string]string{"message": f.Message, "detail": f.Detail, "launcher": version}})
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, serverBase+"/security/report", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "NEXORA-Devs-Toolbox/"+version)
	if res, err := c.Do(req); err == nil {
		res.Body.Close()
	}
}
