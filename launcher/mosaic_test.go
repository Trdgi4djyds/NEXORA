package main

import (
	"image"
	"image/png"
	"math"
	"os"
	"strconv"
	"testing"
	"time"
)

// NEXORA #121 : mosaïque du panneau de la marque (sans Windows). NX_MOSAIC_PNG=<fichier> écrit le panneau de
// l'assistant (300 × 520, échelle 1) pour le regarder.
func TestMosaicPanel(t *testing.T) {
	imgs := rendus()
	for _, list := range mosaicLists {
		for _, n := range list {
			if m := imgs[n]; m == nil || m.Bounds().Dx() < 200 {
				t.Fatalf("rendu %s absent ou trop petit", n)
			}
		}
	}
	if c := len(mosaicFor(300, 520, 1).strips); c != 3 {
		t.Fatalf("panneau de l'assistant : %d colonnes au lieu de 3", c)
	}
	if c := len(mosaicFor(184, 300, 1).strips); c != 2 {
		t.Fatalf("panneau étroit : %d colonnes au lieu de 2", c)
	}
	if ml := mosaicFor(450, 780, 1.5); len(ml.strips) != 3 || ml.colW < 190 {
		t.Fatalf("échelle 1,5 : %d colonnes de %d pixels", len(ml.strips), ml.colW)
	}
	ml := mosaicFor(300, 520, 1)
	a := make([]byte, 300*520*4)
	start := time.Now()
	ml.render(a, 0, nil)
	t.Logf("panneau 300 × 520 rendu en %v", time.Since(start))
	lum := func(p []byte, y0, y1 int) (mean, spread float64) {
		var s, s2, n float64
		for y := y0; y < y1; y++ {
			for x := 0; x < 300; x++ {
				i := (y*300 + x) * 4
				l := 0.2126*float64(p[i+2]) + 0.7152*float64(p[i+1]) + 0.0722*float64(p[i])
				s, s2, n = s+l, s2+l*l, n+1
			}
		}
		mean = s / n
		return mean, math.Sqrt(math.Max(0, s2/n-mean*mean))
	}
	midMean, midSpread := lum(a, 150, 210) // 29 à 40 % de la hauteur : rendus visibles
	topMean, _ := lum(a, 0, 6)
	botMean, botSpread := lum(a, 500, 520)
	if midSpread < 20 || midMean < 25 {
		t.Fatalf("rendus peu visibles au milieu du panneau : moyenne %.0f, écart %.0f", midMean, midSpread)
	}
	if topMean >= midMean {
		t.Fatalf("haut du panneau pas assombri pour le logo : %.0f (milieu %.0f)", topMean, midMean)
	}
	if botMean > 7 || botSpread > 1 {
		t.Fatalf("bas du panneau pas noir sous le texte : moyenne %.1f, écart %.1f", botMean, botSpread)
	}
	b := make([]byte, len(a))
	ml.render(b, 8, nil)
	diff := 0
	for i := range a {
		if a[i] != b[i] {
			diff++
		}
	}
	if diff < len(a)/20 {
		t.Fatalf("la mosaïque ne défile pas (%d octets changés en 8 s)", diff)
	}
	// Voile des fenêtres : logo lisible en haut, rendus visibles au milieu, noir sous les étapes de l'assistant.
	v := panelVeil(520, 1, 311)
	if v[30] < 0.85 || v[170] > 0.05 || v[330] < 0.99 || v[519] < 0.99 {
		t.Fatalf("voile de l'assistant : haut %.2f, milieu %.2f, étapes %.2f, bas %.2f", v[30], v[170], v[330], v[519])
	}
	if s := panelVeil(294, 1, 0); s[40] < 0.85 || s[150] > 0.1 || s[293] < 0.7 {
		t.Fatalf("voile de la fenêtre de démarrage : haut %.2f, milieu %.2f, bas %.2f", s[40], s[150], s[293])
	}
	if out := os.Getenv("NX_MOSAIC_PNG"); out != "" {
		img := image.NewRGBA(image.Rect(0, 0, 300, 520))
		for i := 0; i < 300*520; i++ {
			img.Pix[i*4], img.Pix[i*4+1], img.Pix[i*4+2], img.Pix[i*4+3] = a[i*4+2], a[i*4+1], a[i*4], 255
		}
		f, err := os.Create(out)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, img); err != nil {
			t.Fatal(err)
		}
	}
}

// NEXORA #121 : coût d'une image du panneau de l'assistant (défilement à 15 images par seconde au plus).
// go test -bench Mosaic -run '^$' .
func BenchmarkMosaicRender(b *testing.B) {
	for _, s := range []float64{1, 1.5, 2} {
		w, h := int(300*s), int(520*s)
		ml := mosaicFor(w, h, s)
		veil := panelVeil(h, s, 311*s)
		dst := make([]byte, w*h*4)
		b.Run(strconv.Itoa(int(s*100))+"%", func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				ml.render(dst, float64(i)/15, veil)
			}
		})
	}
}
