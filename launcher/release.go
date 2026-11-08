// NEXORA #076 : lecture de la dernière publication sur le dépôt GitHub public et téléchargements vérifiés.
package main

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

const defaultRepo = "Trdgi4djyds/NEXORA-portable"

var (
	apiBase      = "https://api.github.com"
	webBase      = "https://github.com" // NEXORA #082 : liens directs des publications (sans quota)
	allowHTTP    = false                // essais seulement (serveur local)
	errCancelled = errors.New("installation annulée")
	errOffline   = errors.New("hors ligne")
)

type ghAsset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
	Size int64  `json:"size"`
}

type ghRelease struct {
	TagName    string    `json:"tag_name"`
	Draft      bool      `json:"draft"`
	Prerelease bool      `json:"prerelease"`
	Assets     []ghAsset `json:"assets"`
}

func (r *ghRelease) asset(name string) *ghAsset {
	for i := range r.Assets {
		if r.Assets[i].Name == name {
			return &r.Assets[i]
		}
	}
	return nil
}

// Release : publication dont le manifeste a été vérifié.
type Release struct {
	gh       *ghRelease
	Manifest *Manifest
	Raw      []byte
	Sig      string
}

func httpClient() *http.Client {
	return &http.Client{
		Timeout: 0, // les gros téléchargements ont leur propre contexte
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 8 {
				return errors.New("trop de redirections")
			}
			if req.URL.Scheme != "https" && !allowHTTP {
				return errors.New("redirection non sécurisée refusée")
			}
			return nil
		},
	}
}

func checkURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return err
	}
	if u.Scheme != "https" && !(allowHTTP && u.Scheme == "http") {
		return errors.New("adresse non sécurisée refusée")
	}
	return nil
}

func get(ctx context.Context, c *http.Client, raw string, hdr map[string]string) (*http.Response, error) {
	if err := checkURL(raw); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "NEXORA-Devs-Toolbox/"+version)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	res, err := c.Do(req)
	if err != nil {
		if ctx.Err() == nil {
			return nil, fmt.Errorf("%w : %v", errOffline, err)
		}
		return nil, err
	}
	return res, nil
}

func fetchSmall(ctx context.Context, c *http.Client, raw string, max int64, hdr map[string]string) ([]byte, error) {
	res, err := get(ctx, c, raw, hdr)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("réponse %d de %s", res.StatusCode, hostOf(raw))
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > max {
		return nil, errors.New("réponse trop volumineuse")
	}
	return b, nil
}

func hostOf(raw string) string {
	if u, err := url.Parse(raw); err == nil {
		return u.Host
	}
	return raw
}

// LatestRelease lit la dernière publication (hors brouillons et préversions) et vérifie son manifeste signé.
// NEXORA #082 (A-051) : liens directs de github.com d'abord ; l'API (60 appels par heure et par adresse IP sans
// jeton, vite épuisés derrière une adresse partagée : entreprise, école, opérateur mobile) seulement en secours.
// Une signature refusée ou un manifeste expiré est définitif : aucune seconde voie n'est essayée.
func LatestRelease(ctx context.Context, c *http.Client, repo string, key ed25519.PublicKey) (*Release, error) {
	rel, err := latestDirect(ctx, c, repo, key)
	if err == nil || errors.Is(err, errSignature) || errors.Is(err, errExpired) || ctx.Err() != nil {
		return rel, err
	}
	rel, err2 := latestAPI(ctx, c, repo, key)
	if err2 == nil || errors.Is(err2, errSignature) || errors.Is(err2, errExpired) {
		return rel, err2
	}
	return nil, err // l'API ne fait que confirmer l'échec (ou n'a plus de quota) : cause donnée par les liens directs
}

var tagInPath = regexp.MustCompile(`/releases/download/([^/]+)/[^/]+$`)

// latestDirect : …/releases/latest/download/<manifeste> redirige vers …/releases/download/<tag>/<manifeste> ; le tag
// est lu dans la redirection, puis manifeste, signature et fichiers sont pris dans cette même publication.
func latestDirect(ctx context.Context, c *http.Client, repo string, key ed25519.PublicKey) (*Release, error) {
	first := fmt.Sprintf("%s/%s/releases/latest/download/%s", webBase, repo, manifestName)
	hop := *c
	hop.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	res, err := get(ctx, &hop, first, nil)
	if err != nil {
		return nil, err
	}
	io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
	res.Body.Close()
	loc := res.Header.Get("Location")
	if res.StatusCode < 300 || res.StatusCode > 399 || loc == "" {
		return nil, fmt.Errorf("réponse %d de %s", res.StatusCode, hostOf(first)) // 404 : aucune publication
	}
	base, _ := url.Parse(first)
	target, err := base.Parse(loc)
	if err != nil {
		return nil, err
	}
	m := tagInPath.FindStringSubmatch(target.EscapedPath())
	if m == nil {
		return nil, errors.New("redirection inattendue du dépôt officiel")
	}
	tag, err := url.PathUnescape(m[1])
	if err != nil {
		return nil, err
	}
	dir := fmt.Sprintf("%s/%s/releases/download/%s/", webBase, repo, url.PathEscape(tag))
	raw, err := fetchSmall(ctx, c, dir+manifestName, 8<<20, nil)
	if err != nil {
		return nil, err
	}
	sig, err := fetchSmall(ctx, c, dir+signatureName, 4096, nil)
	if err != nil {
		return nil, err
	}
	man, err := VerifyManifest(raw, string(sig), key)
	if err != nil {
		return nil, err
	}
	gh := &ghRelease{TagName: tag, Assets: []ghAsset{{Name: man.Package.Name, URL: dir + url.PathEscape(man.Package.Name), Size: man.Package.Size}}}
	if man.Launcher != nil && man.Launcher.Name != "" {
		gh.Assets = append(gh.Assets, ghAsset{Name: man.Launcher.Name, URL: dir + url.PathEscape(man.Launcher.Name), Size: man.Launcher.Size})
	}
	return &Release{gh: gh, Manifest: man, Raw: raw, Sig: strings.TrimSpace(string(sig))}, nil
}

// latestAPI : voie d'origine (#076) par l'API des publications, gardée en secours.
func latestAPI(ctx context.Context, c *http.Client, repo string, key ed25519.PublicKey) (*Release, error) {
	b, err := fetchSmall(ctx, c, fmt.Sprintf("%s/repos/%s/releases/latest", apiBase, repo), 2<<20, map[string]string{"Accept": "application/vnd.github+json"})
	if err != nil {
		return nil, err
	}
	var gh ghRelease
	if err := json.Unmarshal(b, &gh); err != nil {
		return nil, fmt.Errorf("publication illisible : %w", err)
	}
	ma, sa := gh.asset(manifestName), gh.asset(signatureName)
	if ma == nil || sa == nil {
		return nil, errors.New("la dernière publication ne contient pas de manifeste signé")
	}
	raw, err := fetchSmall(ctx, c, ma.URL, 8<<20, nil)
	if err != nil {
		return nil, err
	}
	sig, err := fetchSmall(ctx, c, sa.URL, 4096, nil)
	if err != nil {
		return nil, err
	}
	m, err := VerifyManifest(raw, string(sig), key)
	if err != nil {
		return nil, err
	}
	if gh.asset(m.Package.Name) == nil {
		return nil, fmt.Errorf("paquet %s absent de la publication", m.Package.Name)
	}
	return &Release{gh: &gh, Manifest: m, Raw: raw, Sig: strings.TrimSpace(string(sig))}, nil
}

// Download télécharge un fichier de la publication (reprise d'un téléchargement interrompu), puis vérifie taille
// et SHA-256 ; le fichier n'est renommé à son nom final qu'une fois vérifié.
func Download(ctx context.Context, c *http.Client, raw, dest string, want Asset, prog func(got, total int64), cancelled func() bool) error {
	part := dest + ".part"
	if got, n, err := FileSHA256(dest); err == nil && n == want.Size && got == want.SHA256 {
		return nil // déjà téléchargé et vérifié
	}
	var start int64
	if st, err := os.Stat(part); err == nil && st.Size() < want.Size {
		start = st.Size()
	} else {
		os.Remove(part)
	}
	hdr := map[string]string{}
	if start > 0 {
		hdr["Range"] = fmt.Sprintf("bytes=%d-", start)
	}
	res, err := get(ctx, c, raw, hdr)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	flags := os.O_CREATE | os.O_WRONLY
	switch res.StatusCode {
	case http.StatusPartialContent:
		flags |= os.O_APPEND
	case http.StatusOK:
		start = 0
		flags |= os.O_TRUNC
	default:
		return fmt.Errorf("réponse %d de %s", res.StatusCode, hostOf(raw))
	}
	out, err := os.OpenFile(part, flags, 0o644)
	if err != nil {
		return err
	}
	got := start
	buf := make([]byte, 256<<10)
	last := time.Time{}
	for {
		if cancelled != nil && cancelled() {
			out.Close()
			return errCancelled
		}
		n, rerr := res.Body.Read(buf)
		if n > 0 {
			if _, werr := out.Write(buf[:n]); werr != nil {
				out.Close()
				return werr
			}
			got += int64(n)
			if got > want.Size {
				out.Close()
				os.Remove(part)
				return errors.New("fichier plus gros qu’annoncé : téléchargement refusé")
			}
			if prog != nil && time.Since(last) > 120*time.Millisecond {
				prog(got, want.Size)
				last = time.Now()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			out.Close()
			return fmt.Errorf("%w : %v", errOffline, rerr)
		}
	}
	if err := out.Close(); err != nil {
		return err
	}
	if prog != nil {
		prog(got, want.Size)
	}
	sum, n, err := FileSHA256(part)
	if err != nil {
		return err
	}
	if n != want.Size || sum != want.SHA256 {
		os.Remove(part)
		return fmt.Errorf("empreinte SHA-256 différente pour %s : fichier refusé", want.Name)
	}
	os.Remove(dest)
	return os.Rename(part, dest)
}

// sha256Hex : empreinte d'octets en mémoire.
func sha256Hex(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}
