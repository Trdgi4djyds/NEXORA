// NEXORA #121 : panneau de la marque des fenêtres du lanceur, comme celui de la fenêtre de connexion de NEXORA
// (nx/auth/, #119) : mosaïque de vrais rendus faits dans NEX-DESIGN et le Studio 3D, en colonnes inclinées de 7°
// qui défilent lentement en sens alterné, sous un voile sombre (haut assombri pour le logo, bas presque noir pour le
// texte). Indépendant de Windows (essayé sous Linux) : images JPEG intégrées (assets/rendus/), décodées une seule
// fois ; colonnes préparées une fois par taille d'affichage ; chaque image du panneau est ensuite échantillonnée
// (bilinéaire) dans ces colonnes, ce qui lisse les bords inclinés.
package main

import (
	"bytes"
	"embed"
	"image"
	"image/draw"
	"image/jpeg"
	"math"
	"sync"
)

//go:embed assets/rendus/*.jpg
var rendusFS embed.FS

// Composition de la fenêtre de connexion (RENDUS de nx/auth/index.js) : une liste de rendus par colonne.
var mosaicLists = [3][]string{
	{"cartes", "studio-dessous", "rochers", "studio-tablette"},
	{"mosaique", "facade", "studio-diagonale"},
	{"planche", "tablette", "studio-rochers", "dessous"},
}

// Durée, en secondes, du passage de deux listes devant le panneau (animations nxl-up et nxl-down de la connexion).
var mosaicPeriods = [3]float64{72, 62, 66}

// Décalage de départ de chaque colonne (fraction de sa liste) : les rendus ne commencent pas tous à la même hauteur.
var mosaicPhases = [3]float64{0, 0.37, 0.71}

// Voile du panneau (opacité du noir #050505 du haut vers le bas), repris de .nxl-brand.nxl-mosaic::before.
var mosaicVeil = [][2]float64{{0, .78}, {.16, .15}, {.28, 0}, {.42, .35}, {.58, .88}, {.74, 1}, {1, 1}}

// Fond du panneau et textes posés sur le voile (repris de la connexion : #b5b5b5 pour les sous-titres, #9a9a9a).
var (
	colPanel     = hexc("#050505")
	colPanelSub  = hexc("#b5b5b5")
	colPanelSoft = hexc("#9a9a9a")
)

var (
	rendusOnce sync.Once
	rendusImgs map[string]*image.NRGBA
)

// rendus : images décodées (JPEG, bibliothèque standard), par nom.
func rendus() map[string]*image.NRGBA {
	rendusOnce.Do(func() {
		rendusImgs = map[string]*image.NRGBA{}
		for _, list := range mosaicLists {
			for _, n := range list {
				b, err := rendusFS.ReadFile("assets/rendus/" + n + ".jpg")
				if err != nil {
					continue
				}
				img, err := jpeg.Decode(bytes.NewReader(b))
				if err != nil {
					continue
				}
				m := image.NewNRGBA(image.Rect(0, 0, img.Bounds().Dx(), img.Bounds().Dy()))
				draw.Draw(m, m.Bounds(), img, img.Bounds().Min, draw.Src)
				rendusImgs[n] = m
			}
		}
	})
	return rendusImgs
}

func veilAt(f float64) float64 {
	for i := 1; i < len(mosaicVeil); i++ {
		a, b := mosaicVeil[i-1], mosaicVeil[i]
		if f <= b[0] {
			return a[1] + (b[1]-a[1])*clamp01((f-a[0])/(b[0]-a[0]))
		}
	}
	return 1
}

func smooth(t float64) float64 {
	t = clamp01(t)
	return t * t * (3 - 2*t)
}

// panelVeil : opacité du voile, ligne par ligne, d'un panneau de h pixels à l'échelle s. Haut presque noir derrière
// le logo et le nom (lisibles sur n'importe quel rendu), effacé ensuite ; bas noir sous les textes qui commencent à
// textTop (repère, étapes, version), en montant progressivement comme sur la connexion ; sans texte en bas
// (textTop ≤ 0, petites fenêtres), simple fondu pour laisser voir les rendus.
func panelVeil(h int, s, textTop float64) []float64 {
	v := make([]float64, h)
	topEnd := math.Min(150*s, 0.45*float64(h))
	for y := range v {
		fy := float64(y) + 0.5
		top := 0.86
		if fy > 72*s {
			top = 0.86 * smooth((topEnd-fy)/math.Max(1, topEnd-72*s))
		}
		bot := 0.0
		if textTop > 0 {
			if start := textTop - 160*s; fy > start {
				bot = smooth((fy - start) / (170 * s))
			}
		} else if start := float64(h) - 90*s; fy > start {
			bot = 0.8 * smooth((fy-start)/(90*s))
		}
		v[y] = math.Max(top, bot)
	}
	return v
}

// mosaicStrip : une colonne préparée : rendus empilés à la largeur de la colonne (coins arrondis, liseré clair
// comme box-shadow 0 0 0 1px rgba(255,255,255,.06)), marge de fond de chaque côté pour lisser les bords une fois
// inclinés ; elle se répète verticalement (période h).
type mosaicStrip struct {
	w, h, m int
	pix     []uint8 // RVB
}

func buildStrip(names []string, colW int, gap, radius, ring float64) *mosaicStrip {
	type tile struct {
		img  *image.NRGBA
		y, h int
	}
	imgs := rendus()
	g := int(math.Round(gap))
	var tiles []tile
	y := 0
	for _, n := range names {
		src := imgs[n]
		if src == nil {
			continue
		}
		th := max(1, int(math.Round(float64(colW)*float64(src.Bounds().Dy())/float64(src.Bounds().Dx()))))
		tiles = append(tiles, tile{resizeTo(src, colW, th), y, th})
		y += th + g
	}
	m := 2
	st := &mosaicStrip{w: colW + 2*m, h: max(y, 1), m: m}
	st.pix = make([]uint8, st.w*st.h*3)
	for i := 0; i < len(st.pix); i += 3 {
		st.pix[i], st.pix[i+1], st.pix[i+2] = colPanel.r, colPanel.g, colPanel.b
	}
	for _, t := range tiles {
		x0, y0, tw, th := float64(m), float64(t.y), float64(colW), float64(t.h)
		for py := t.y - 2; py < t.y+t.h+2; py++ {
			row := ((py % st.h) + st.h) % st.h // la colonne boucle : le liseré du premier rendu passe en bas
			for px := 0; px < st.w; px++ {
				d := sdRoundRect(float64(px)+0.5, float64(py)+0.5, x0, y0, tw, th, radius)
				i := (row*st.w + px) * 3
				r, gr, b := float64(st.pix[i]), float64(st.pix[i+1]), float64(st.pix[i+2])
				if a := clamp01(0.5 - d); a > 0 {
					ix, iy := min(max(px-m, 0), colW-1), min(max(py-t.y, 0), t.h-1)
					k := (iy*colW + ix) * 4
					r = r*(1-a) + float64(t.img.Pix[k])*a
					gr = gr*(1-a) + float64(t.img.Pix[k+1])*a
					b = b*(1-a) + float64(t.img.Pix[k+2])*a
				}
				if e := clamp01(0.5 - (math.Abs(d-ring/2) - ring/2)); e > 0 {
					a := 0.06 * e
					r, gr, b = r*(1-a)+255*a, gr*(1-a)+255*a, b*(1-a)+255*a
				}
				st.pix[i], st.pix[i+1], st.pix[i+2] = uint8(r+0.5), uint8(gr+0.5), uint8(b+0.5)
			}
		}
	}
	return st
}

// mosaicLayout : colonnes préparées pour un panneau de w × h pixels à l'échelle s (96 ppp = 1).
type mosaicLayout struct {
	w, h   int
	colW   int
	gap    float64
	strips []*mosaicStrip
	lists  []int // liste de chaque colonne (période et sens)
}

var (
	mosaicMu    sync.Mutex
	mosaicCache = map[[3]int]*mosaicLayout{}
)

// mosaicFor : colonnes du panneau (mur 44 % plus large et 36 % plus haut que le panneau, comme inset: -18% -22%) :
// trois colonnes d'environ 150 pixels logiques, deux pour un panneau étroit.
func mosaicFor(w, h int, s float64) *mosaicLayout {
	key := [3]int{w, h, int(math.Round(s * 100))}
	mosaicMu.Lock()
	defer mosaicMu.Unlock()
	if ml, ok := mosaicCache[key]; ok {
		return ml
	}
	if len(mosaicCache) > 8 {
		mosaicCache = map[[3]int]*mosaicLayout{}
	}
	wallW := float64(w) * 1.44
	gap := 12 * s
	cols := min(max(int(math.Round((wallW+gap)/(150*s+gap))), 2), 3)
	ml := &mosaicLayout{w: w, h: h, gap: gap}
	ml.colW = max(8, int(math.Round((wallW-gap*float64(cols-1))/float64(cols))))
	ml.lists = []int{0, 1, 2}[:cols]
	if cols == 2 {
		ml.lists = []int{0, 2}
	}
	for _, l := range ml.lists {
		ml.strips = append(ml.strips, buildStrip(mosaicLists[l], ml.colW, gap, 14*s, math.Max(1, math.Round(s))))
	}
	mosaicCache[key] = ml
	return ml
}

// render : pixels BGRA du panneau (dst : w × h × 4) au temps t en secondes (t = 0 : image fixe) ; veil : opacité
// du voile par ligne (panelVeil), ou nil pour le voile de la connexion, en fractions de la hauteur.
func (ml *mosaicLayout) render(dst []byte, t float64, veil []float64) {
	w, h := ml.w, ml.h
	a := 7 * math.Pi / 180 // rotate(-7deg) : on parcourt le mur dans l'autre sens
	ca, sa := math.Cos(a), math.Sin(a)
	cx, cy := float64(w)/2, float64(h)/2
	ox, oy := 0.22*float64(w), 0.18*float64(h)
	pitch := float64(ml.colW) + ml.gap
	invPitch := 1 / pitch
	offs := make([]float64, len(ml.strips))
	for k, st := range ml.strips {
		l := ml.lists[k]
		dir := 1.0
		if k%2 == 1 {
			dir = -1
		}
		offs[k] = mosaicPhases[l]*float64(st.h) + dir*2*float64(st.h)/mosaicPeriods[l]*t
	}
	vb := make([]float64, len(ml.strips))
	for py := 0; py < h; py++ {
		va := veilAt((float64(py) + 0.5) / float64(h))
		if py < len(veil) {
			va = veil[py]
		}
		row := dst[py*w*4 : (py+1)*w*4 : (py+1)*w*4]
		if va >= 0.999 { // ligne entièrement voilée : fond seul
			for i := 0; i < len(row); i += 4 {
				row[i], row[i+1], row[i+2], row[i+3] = colPanel.b, colPanel.g, colPanel.r, 255
			}
			continue
		}
		dy := float64(py) + 0.5 - cy
		dx := 0.5 - cx
		u := cx + ca*dx - sa*dy + ox
		v := cy + sa*dx + ca*dy + oy
		// Ordonnée de départ de chaque colonne (centre des pixels), ramenée une fois par ligne dans la colonne : le
		// long de la ligne elle ne croît que de w·sin 7°, moins qu'une hauteur de colonne.
		for k, st := range ml.strips {
			hf := float64(st.h)
			y := v + offs[k] - 0.5
			vb[k] = y - math.Floor(y/hf)*hf
		}
		// Voile et interpolation en entiers (poids sur 256) : environ deux fois moins de calcul qu'en flottants.
		keep := int(math.Round((1 - va) * 256))
		br, bgc, bb := int(colPanel.r)*(256-keep), int(colPanel.g)*(256-keep), int(colPanel.b)*(256-keep)
		for px := 0; px < w; px++ {
			r, g, b := int(colPanel.r), int(colPanel.g), int(colPanel.b)
			// Colonne dont la bande (rendus et marges de 2 pixels) peut contenir u ; sinon, espace entre colonnes.
			if k := int((u + 2) * invPitch); u > -2 && k < len(ml.strips) {
				st := ml.strips[k]
				if x := u - float64(k)*pitch + float64(st.m) - 0.5; x > -0.5 && x < float64(st.w)-0.5 {
					xi := int(x+1) - 1 // partie entière (x > -1)
					fx := int((x - float64(xi)) * 256)
					x0, x1 := max(xi, 0), min(xi+1, st.w-1)
					y := vb[k] + float64(px)*sa
					if y >= float64(st.h) {
						y -= float64(st.h)
					}
					yi := int(y) // y ≥ 0
					fy := int((y - float64(yi)) * 256)
					y0 := min(yi, st.h-1)
					y1 := y0 + 1
					if y1 >= st.h {
						y1 = 0
					}
					p := st.pix
					i00, i10 := (y0*st.w+x0)*3, (y0*st.w+x1)*3
					i01, i11 := (y1*st.w+x0)*3, (y1*st.w+x1)*3
					w00, w10, w01, w11 := (256-fx)*(256-fy), fx*(256-fy), (256-fx)*fy, fx*fy
					r = (int(p[i00])*w00 + int(p[i10])*w10 + int(p[i01])*w01 + int(p[i11])*w11 + 32768) >> 16
					g = (int(p[i00+1])*w00 + int(p[i10+1])*w10 + int(p[i01+1])*w01 + int(p[i11+1])*w11 + 32768) >> 16
					b = (int(p[i00+2])*w00 + int(p[i10+2])*w10 + int(p[i01+2])*w01 + int(p[i11+2])*w11 + 32768) >> 16
				}
			}
			i := px * 4
			row[i] = uint8((b*keep + bb + 128) >> 8)
			row[i+1] = uint8((g*keep + bgc + 128) >> 8)
			row[i+2] = uint8((r*keep + br + 128) >> 8)
			row[i+3] = 255
			u += ca
		}
	}
}
