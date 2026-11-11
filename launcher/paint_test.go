package main

import (
	"image/png"
	"os"
	"testing"
)

// NEXORA #083 : moteur de dessin des fenêtres (sans Windows). NX_PAINT_PNG=<fichier> écrit la planche pour la regarder.
func TestPaintSheet(t *testing.T) {
	names := []string{"shieldCheck", "shieldAlert", "wifiOff", "serverOff", "fileWarning", "arrowUpCircle", "trash", "x", "check", "info", "alert", "circleX", "download", "refresh"}
	c := newCanvas(80+len(names)*56, 200)
	c.fill(colBg)
	c.image(logoImage(64), 8, 8)
	for i, n := range names {
		segs := segmentsOf(n)
		if len(segs) < 2 {
			t.Fatalf("icône %s : %d segments", n, len(segs))
		}
		m := iconMask(n, 40, 2)
		ink := 0.0
		for _, a := range m.a {
			ink += float64(a)
		}
		if ink < 40 || ink > 40*40*0.6 {
			t.Fatalf("icône %s : couverture anormale %.0f", n, ink)
		}
		c.icon(n, 80+i*56, 20, 40, 2, colInk)
	}
	c.roundRect(8, 100, 300, 44, 12, func(x, y float64) rgb { return gradBrand((x - 8) / 300) }, 1)
	c.strokeRoundRect(320, 100, 160, 44, 12, 1, colLine, 1)
	c.roundRect(8, 160, 472, 8, 4, solid(colTrack), 1)
	c.roundRect(8, 160, 300, 8, 4, func(x, y float64) rgb { return gradBrand((x - 8) / 300) }, 1)
	c.circle(520, 140, 24, hexc("#fef2f2"), 1)
	if l := logoImage(64); l == nil || l.Bounds().Dx() != 64 || l.Pix[(32*64+32)*4+3] != 255 {
		t.Fatal("logo absent ou mal redimensionné")
	}
	if out := os.Getenv("NX_PAINT_PNG"); out != "" {
		f, err := os.Create(out)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, c.toImage()); err != nil {
			t.Fatal(err)
		}
	}
}
