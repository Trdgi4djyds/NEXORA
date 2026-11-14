// NEXORA #083 : dessin des fenêtres du lanceur, sans dépendance ni ressource système : formes lissées (distances
// signées), dégradé de la marque, icônes Lucide au trait (tracés SVG aplatis), logo de NEXORA redimensionné.
// Indépendant de Windows (essayé sous Linux) ; le texte est écrit ensuite par GDI (ui_windows.go).
package main

import (
	"bytes"
	_ "embed"
	"image"
	"image/draw"
	"image/png"
	"math"
	"strconv"
	"strings"
	"sync"
)

//go:embed assets/logo.png
var logoPNG []byte

type rgb struct{ r, g, b uint8 }

func hexc(s string) rgb {
	v, _ := strconv.ParseUint(strings.TrimPrefix(s, "#"), 16, 32)
	return rgb{uint8(v >> 16), uint8(v >> 8), uint8(v)}
}

func mix(a, b rgb, t float64) rgb {
	t = clamp01(t)
	f := func(x, y uint8) uint8 { return uint8(float64(x)*(1-t) + float64(y)*t + 0.5) }
	return rgb{f(a.r, b.r), f(a.g, b.g), f(a.b, b.b)}
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// Couleurs de NEXORA. #103 : direction « Horizon » du site vitrine (noir, gris très sombre, monochrome) : fenêtre noire,
// colonne de l'assistant gris très sombre, accent blanc (boutons principaux blancs à texte noir, barre de progression
// blanche). Les anciens noms (violet, magenta, rose) désignent désormais l'accent blanc ; gradBrand reste pour les
// appels existants et rend une couleur unie.
var (
	colBg      = hexc("#0b0b0b")
	colInk     = hexc("#ffffff")
	colBody    = hexc("#c4c4c4")
	colMuted   = hexc("#8c8c8c")
	colLine    = hexc("#232323")
	colFooter  = hexc("#111111")
	colTrack   = hexc("#262626")
	colSide    = hexc("#151515")
	colRaised  = hexc("#181818")
	colEdge    = hexc("#333333")
	colEdgeHi  = hexc("#4d4d4d")
	colViolet  = hexc("#ffffff")
	colMagenta = hexc("#ffffff")
	colPink    = hexc("#ffffff")
	colGreen   = hexc("#34d399")
)

// gradBrand : couleur de l'accent à la position t (0 à 1) ; unie depuis #103 (monochrome).
func gradBrand(t float64) rgb {
	if t < 0.5 {
		return mix(colViolet, colMagenta, t*2)
	}
	return mix(colMagenta, colPink, (t-0.5)*2)
}

// canvas : pixels BGRA (ordre des DIB de Windows), toujours opaques.
type canvas struct {
	w, h int
	pix  []byte
}

func newCanvas(w, h int) *canvas { return &canvas{w, h, make([]byte, w*h*4)} }

func (c *canvas) blend(x, y int, col rgb, a float64) {
	if a <= 0 || x < 0 || y < 0 || x >= c.w || y >= c.h {
		return
	}
	if a > 1 {
		a = 1
	}
	i := (y*c.w + x) * 4
	p := c.pix[i : i+4 : i+4]
	p[0] = uint8(float64(p[0])*(1-a) + float64(col.b)*a + 0.5)
	p[1] = uint8(float64(p[1])*(1-a) + float64(col.g)*a + 0.5)
	p[2] = uint8(float64(p[2])*(1-a) + float64(col.r)*a + 0.5)
	p[3] = 255
}

func (c *canvas) fill(col rgb) {
	for i := 0; i < len(c.pix); i += 4 {
		c.pix[i], c.pix[i+1], c.pix[i+2], c.pix[i+3] = col.b, col.g, col.r, 255
	}
}

// fillRect : rectangle plein aux bords entiers (fonds, bandeaux, filets).
func (c *canvas) fillRect(x0, y0, x1, y1 int, col rgb) {
	for y := max(y0, 0); y < min(y1, c.h); y++ {
		for x := max(x0, 0); x < min(x1, c.w); x++ {
			i := (y*c.w + x) * 4
			c.pix[i], c.pix[i+1], c.pix[i+2], c.pix[i+3] = col.b, col.g, col.r, 255
		}
	}
}

func sdRoundRect(px, py, x, y, w, h, r float64) float64 {
	r = math.Min(r, math.Min(w, h)/2)
	qx := math.Abs(px-(x+w/2)) - w/2 + r
	qy := math.Abs(py-(y+h/2)) - h/2 + r
	return math.Hypot(math.Max(qx, 0), math.Max(qy, 0)) + math.Min(math.Max(qx, qy), 0) - r
}

// roundRect : rectangle arrondi plein ; paint donne la couleur au point (dégradés), alpha l'opacité.
func (c *canvas) roundRect(x, y, w, h, r float64, paint func(px, py float64) rgb, alpha float64) {
	for py := int(math.Floor(y)) - 1; py <= int(math.Ceil(y+h)); py++ {
		for px := int(math.Floor(x)) - 1; px <= int(math.Ceil(x+w)); px++ {
			cx, cy := float64(px)+0.5, float64(py)+0.5
			if a := clamp01(0.5 - sdRoundRect(cx, cy, x, y, w, h, r)); a > 0 {
				c.blend(px, py, paint(cx, cy), a*alpha)
			}
		}
	}
}

func solid(col rgb) func(float64, float64) rgb { return func(float64, float64) rgb { return col } }

// strokeRoundRect : contour intérieur d'épaisseur sw.
func (c *canvas) strokeRoundRect(x, y, w, h, r, sw float64, col rgb, alpha float64) {
	for py := int(math.Floor(y)) - 1; py <= int(math.Ceil(y+h)); py++ {
		for px := int(math.Floor(x)) - 1; px <= int(math.Ceil(x+w)); px++ {
			d := sdRoundRect(float64(px)+0.5, float64(py)+0.5, x, y, w, h, r)
			if a := clamp01(0.5 - (math.Abs(d+sw/2) - sw/2)); a > 0 {
				c.blend(px, py, col, a*alpha)
			}
		}
	}
}

func (c *canvas) circle(cx, cy, rad float64, col rgb, alpha float64) {
	for py := int(cy-rad) - 1; py <= int(cy+rad)+1; py++ {
		for px := int(cx-rad) - 1; px <= int(cx+rad)+1; px++ {
			d := math.Hypot(float64(px)+0.5-cx, float64(py)+0.5-cy) - rad
			if a := clamp01(0.5 - d); a > 0 {
				c.blend(px, py, col, a*alpha)
			}
		}
	}
}

// ---------------------------------------------------------------- icônes Lucide
type pt struct{ x, y float64 }

type mask struct {
	w, h int
	a    []float32
}

var (
	iconMu    sync.Mutex
	iconSegs  = map[string][][2]pt{}
	iconMasks = map[string]*mask{}
)

// segmentsOf : segments de l'icône sur la grille de 24 (tracés aplatis), mis en cache.
func segmentsOf(name string) [][2]pt {
	if s, ok := iconSegs[name]; ok {
		return s
	}
	var segs [][2]pt
	for _, d := range lucide[name] {
		for _, poly := range flattenPath(d) {
			if len(poly) == 1 {
				segs = append(segs, [2]pt{poly[0], poly[0]})
			}
			for i := 1; i < len(poly); i++ {
				segs = append(segs, [2]pt{poly[i-1], poly[i]})
			}
		}
	}
	iconSegs[name] = segs
	return segs
}

func distSeg(p, a, b pt) float64 {
	dx, dy := b.x-a.x, b.y-a.y
	l := dx*dx + dy*dy
	t := 0.0
	if l > 0 {
		t = clamp01(((p.x-a.x)*dx + (p.y-a.y)*dy) / l)
	}
	return math.Hypot(p.x-a.x-t*dx, p.y-a.y-t*dy)
}

// iconMask : couverture de l'icône au trait (bouts et jonctions arrondis, comme Lucide) pour une taille en pixels.
func iconMask(name string, size int, stroke float64) *mask {
	key := name + ":" + strconv.Itoa(size) + ":" + strconv.FormatFloat(stroke, 'f', 2, 64)
	iconMu.Lock()
	defer iconMu.Unlock()
	if m, ok := iconMasks[key]; ok {
		return m
	}
	s := float64(size) / 24
	hw := stroke * s / 2
	segs := segmentsOf(name)
	m := &mask{size, size, make([]float32, size*size)}
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			p := pt{(float64(x) + 0.5) / s, (float64(y) + 0.5) / s}
			d := math.Inf(1)
			for _, sg := range segs {
				if v := distSeg(p, sg[0], sg[1]); v < d {
					d = v
				}
			}
			m.a[y*size+x] = float32(clamp01(hw + 0.5 - d*s))
		}
	}
	iconMasks[key] = m
	return m
}

func (c *canvas) icon(name string, x, y, size int, stroke float64, col rgb) {
	m := iconMask(name, size, stroke)
	for j := 0; j < m.h; j++ {
		for i := 0; i < m.w; i++ {
			c.blend(x+i, y+j, col, float64(m.a[j*m.w+i]))
		}
	}
}

// ---------------------------------------------------------------- tracés SVG
type pathLexer struct {
	s string
	i int
}

func (l *pathLexer) skip() {
	for l.i < len(l.s) && (l.s[l.i] == ' ' || l.s[l.i] == ',' || l.s[l.i] == '\n' || l.s[l.i] == '\t') {
		l.i++
	}
}

func (l *pathLexer) hasNumber() bool {
	l.skip()
	if l.i >= len(l.s) {
		return false
	}
	ch := l.s[l.i]
	return ch == '-' || ch == '+' || ch == '.' || (ch >= '0' && ch <= '9')
}

func (l *pathLexer) number() float64 {
	l.skip()
	start := l.i
	if l.i < len(l.s) && (l.s[l.i] == '-' || l.s[l.i] == '+') {
		l.i++
	}
	dot, exp := false, false
	for l.i < len(l.s) {
		ch := l.s[l.i]
		switch {
		case ch >= '0' && ch <= '9':
		case ch == '.' && !dot && !exp:
			dot = true
		case (ch == 'e' || ch == 'E') && !exp:
			exp = true
			if l.i+1 < len(l.s) && (l.s[l.i+1] == '-' || l.s[l.i+1] == '+') {
				l.i++
			}
		default:
			v, _ := strconv.ParseFloat(l.s[start:l.i], 64)
			return v
		}
		l.i++
	}
	v, _ := strconv.ParseFloat(l.s[start:l.i], 64)
	return v
}

// flag : drapeau d'arc (un seul caractère, les tracés compacts collent « 01 »).
func (l *pathLexer) flag() bool {
	l.skip()
	if l.i < len(l.s) {
		f := l.s[l.i] == '1'
		l.i++
		return f
	}
	return false
}

// flattenPath : tracé SVG (M L H V C S Q T A Z, absolus et relatifs) → lignes brisées.
func flattenPath(d string) [][]pt {
	l := &pathLexer{s: d}
	var out [][]pt
	var cur []pt
	var p, start, ctrl pt
	var last byte
	add := func(q pt) { cur = append(cur, q); p = q }
	flush := func() {
		if len(cur) > 0 {
			out = append(out, cur)
		}
		cur = nil
	}
	for {
		l.skip()
		if l.i >= len(l.s) {
			break
		}
		cmd := l.s[l.i]
		if (cmd >= 'a' && cmd <= 'z') || (cmd >= 'A' && cmd <= 'Z') {
			l.i++
		} else if last != 0 {
			cmd = last // répétition implicite
			if cmd == 'M' {
				cmd = 'L'
			} else if cmd == 'm' {
				cmd = 'l'
			}
		} else {
			break
		}
		rel := cmd >= 'a'
		o := pt{}
		if rel {
			o = p
		}
		up := cmd &^ 0x20
		switch up {
		case 'M':
			flush()
			q := pt{o.x + l.number(), o.y + l.number()}
			start = q
			add(q)
		case 'L':
			add(pt{o.x + l.number(), o.y + l.number()})
		case 'H':
			v := l.number()
			if rel {
				add(pt{p.x + v, p.y})
			} else {
				add(pt{v, p.y})
			}
		case 'V':
			v := l.number()
			if rel {
				add(pt{p.x, p.y + v})
			} else {
				add(pt{p.x, v})
			}
		case 'C', 'S':
			var c1 pt
			if up == 'C' {
				c1 = pt{o.x + l.number(), o.y + l.number()}
			} else if lu := last &^ 0x20; lu == 'C' || lu == 'S' {
				c1 = pt{2*p.x - ctrl.x, 2*p.y - ctrl.y}
			} else {
				c1 = p
			}
			c2 := pt{o.x + l.number(), o.y + l.number()}
			e := pt{o.x + l.number(), o.y + l.number()}
			p0 := p
			for k := 1; k <= 14; k++ {
				t := float64(k) / 14
				u := 1 - t
				add(pt{u*u*u*p0.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*e.x, u*u*u*p0.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*e.y})
			}
			ctrl = c2
		case 'Q', 'T':
			var c1 pt
			if up == 'Q' {
				c1 = pt{o.x + l.number(), o.y + l.number()}
			} else if lu := last &^ 0x20; lu == 'Q' || lu == 'T' {
				c1 = pt{2*p.x - ctrl.x, 2*p.y - ctrl.y}
			} else {
				c1 = p
			}
			e := pt{o.x + l.number(), o.y + l.number()}
			p0 := p
			for k := 1; k <= 10; k++ {
				t := float64(k) / 10
				u := 1 - t
				add(pt{u*u*p0.x + 2*u*t*c1.x + t*t*e.x, u*u*p0.y + 2*u*t*c1.y + t*t*e.y})
			}
			ctrl = c1
		case 'A':
			rx, ry, phi := l.number(), l.number(), l.number()
			fa, fs := l.flag(), l.flag()
			e := pt{o.x + l.number(), o.y + l.number()}
			for _, q := range arcPoints(p, rx, ry, phi, fa, fs, e) {
				add(q)
			}
		case 'Z':
			add(start)
			flush()
			cur = []pt{start}
			p = start
		default:
			return out
		}
		last = cmd
		if up == 'Z' {
			last = 0
		}
	}
	flush()
	return out
}

// arcPoints : arc elliptique SVG (paramètres d'extrémités) aplati, sans le point de départ (SVG 1.1, annexe F.6.5).
func arcPoints(a pt, rx, ry, phiDeg float64, large, sweep bool, b pt) []pt {
	if rx == 0 || ry == 0 || (a == b) {
		return []pt{b}
	}
	rx, ry = math.Abs(rx), math.Abs(ry)
	phi := phiDeg * math.Pi / 180
	cs, sn := math.Cos(phi), math.Sin(phi)
	dx, dy := (a.x-b.x)/2, (a.y-b.y)/2
	x1, y1 := cs*dx+sn*dy, -sn*dx+cs*dy
	if lam := x1*x1/(rx*rx) + y1*y1/(ry*ry); lam > 1 {
		rx, ry = rx*math.Sqrt(lam), ry*math.Sqrt(lam)
	}
	num := rx*rx*ry*ry - rx*rx*y1*y1 - ry*ry*x1*x1
	den := rx*rx*y1*y1 + ry*ry*x1*x1
	co := math.Sqrt(math.Max(0, num/den))
	if large == sweep {
		co = -co
	}
	cxp, cyp := co*rx*y1/ry, -co*ry*x1/rx
	cx, cy := cs*cxp-sn*cyp+(a.x+b.x)/2, sn*cxp+cs*cyp+(a.y+b.y)/2
	ang := func(ux, uy, vx, vy float64) float64 { return math.Atan2(ux*vy-uy*vx, ux*vx+uy*vy) }
	ux, uy := (x1-cxp)/rx, (y1-cyp)/ry
	vx, vy := (-x1-cxp)/rx, (-y1-cyp)/ry
	t1 := ang(1, 0, ux, uy)
	dt := ang(ux, uy, vx, vy)
	if !sweep && dt > 0 {
		dt -= 2 * math.Pi
	} else if sweep && dt < 0 {
		dt += 2 * math.Pi
	}
	n := int(math.Max(4, math.Ceil(math.Abs(dt)/(math.Pi/18))))
	pts := make([]pt, 0, n)
	for k := 1; k <= n; k++ {
		t := t1 + dt*float64(k)/float64(n)
		pts = append(pts, pt{cs*rx*math.Cos(t) - sn*ry*math.Sin(t) + cx, sn*rx*math.Cos(t) + cs*ry*math.Sin(t) + cy})
	}
	pts[len(pts)-1] = b
	return pts
}

// ---------------------------------------------------------------- logo
var (
	logoOnce   sync.Once
	logoSrc    *image.NRGBA
	logoMu     sync.Mutex
	logoScaled = map[int]*image.NRGBA{}
)

func logoImage(size int) *image.NRGBA {
	logoOnce.Do(func() {
		img, err := png.Decode(bytes.NewReader(logoPNG))
		if err != nil {
			return
		}
		logoSrc = image.NewNRGBA(img.Bounds())
		draw.Draw(logoSrc, logoSrc.Bounds(), img, img.Bounds().Min, draw.Src)
	})
	if logoSrc == nil || size <= 0 {
		return nil
	}
	logoMu.Lock()
	defer logoMu.Unlock()
	if m, ok := logoScaled[size]; ok {
		return m
	}
	m := resizeArea(logoSrc, size)
	logoScaled[size] = m
	return m
}

// resizeArea : réduction par moyenne des surfaces (alpha prémultiplié), nette à toutes les tailles d'affichage.
func resizeArea(src *image.NRGBA, n int) *image.NRGBA {
	return resizeTo(src, n, n)
}

// resizeTo : même réduction vers une taille quelconque (#121 : rendus de la mosaïque, qui ne sont pas carrés).
func resizeTo(src *image.NRGBA, nw, nh int) *image.NRGBA {
	sw, sh := src.Bounds().Dx(), src.Bounds().Dy()
	pre := make([]float64, sw*sh*4)
	for i := 0; i < sw*sh; i++ {
		a := float64(src.Pix[i*4+3]) / 255
		pre[i*4], pre[i*4+1], pre[i*4+2], pre[i*4+3] = float64(src.Pix[i*4])*a, float64(src.Pix[i*4+1])*a, float64(src.Pix[i*4+2])*a, a
	}
	axis := func(srcLen, n int) [][]struct {
		i int
		w float64
	} {
		sc := float64(srcLen) / float64(n)
		out := make([][]struct {
			i int
			w float64
		}, n)
		for d := 0; d < n; d++ {
			x0, x1 := float64(d)*sc, float64(d+1)*sc
			if sc < 1 { // agrandissement : plus proche voisin pondéré
				x0, x1 = (float64(d)+0.5)*sc-0.5, (float64(d)+0.5)*sc+0.5
			}
			tot := 0.0
			for s := int(math.Floor(x0)); s < int(math.Ceil(x1)); s++ {
				w := math.Min(x1, float64(s+1)) - math.Max(x0, float64(s))
				si := min(max(s, 0), srcLen-1)
				if w > 0 {
					out[d] = append(out[d], struct {
						i int
						w float64
					}{si, w})
					tot += w
				}
			}
			for k := range out[d] {
				out[d][k].w /= tot
			}
		}
		return out
	}
	ax, ay := axis(sw, nw), axis(sh, nh)
	tmp := make([]float64, nw*sh*4)
	for y := 0; y < sh; y++ {
		for x := 0; x < nw; x++ {
			for _, t := range ax[x] {
				for k := 0; k < 4; k++ {
					tmp[(y*nw+x)*4+k] += pre[(y*sw+t.i)*4+k] * t.w
				}
			}
		}
	}
	dst := image.NewNRGBA(image.Rect(0, 0, nw, nh))
	for y := 0; y < nh; y++ {
		for x := 0; x < nw; x++ {
			var acc [4]float64
			for _, t := range ay[y] {
				for k := 0; k < 4; k++ {
					acc[k] += tmp[(t.i*nw+x)*4+k] * t.w
				}
			}
			i := (y*nw + x) * 4
			if acc[3] > 0 {
				dst.Pix[i], dst.Pix[i+1], dst.Pix[i+2] = uint8(math.Min(255, acc[0]/acc[3]+0.5)), uint8(math.Min(255, acc[1]/acc[3]+0.5)), uint8(math.Min(255, acc[2]/acc[3]+0.5))
			}
			dst.Pix[i+3] = uint8(math.Min(255, acc[3]*255+0.5))
		}
	}
	return dst
}

func (c *canvas) image(img *image.NRGBA, x, y int) {
	if img == nil {
		return
	}
	b := img.Bounds()
	for j := 0; j < b.Dy(); j++ {
		for i := 0; i < b.Dx(); i++ {
			k := (j*b.Dx() + i) * 4
			c.blend(x+i, y+j, rgb{img.Pix[k], img.Pix[k+1], img.Pix[k+2]}, float64(img.Pix[k+3])/255)
		}
	}
}

// toImage : copie RGBA du canevas (essais, captures).
func (c *canvas) toImage() *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, c.w, c.h))
	for i := 0; i < c.w*c.h; i++ {
		img.Pix[i*4], img.Pix[i*4+1], img.Pix[i*4+2], img.Pix[i*4+3] = c.pix[i*4+2], c.pix[i*4+1], c.pix[i*4], 255
	}
	return img
}
