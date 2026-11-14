//go:build windows

// NEXORA #083 : fenêtres du lanceur dessinées par le lanceur lui-même (Win32 et GDI, bibliothèque standard
// seulement) : progression (contrôle au démarrage, téléchargement, installation), écran de sécurité, choix de
// désinstallation et messages. Plus aucun PowerShell ni console. Fenêtre sans cadre (ombre et coins arrondis de
// Windows 11 par DWM), déplaçable, nette à toutes les échelles (DPI par écran), clavier (Tab, Espace, Entrée, Échap).
// Formes, icônes et logo : paint.go ; texte : GDI (Segoe UI, ClearType).
package main

import (
	"math"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

var (
	gdi32  = syscall.NewLazyDLL("gdi32.dll")
	dwmapi = syscall.NewLazyDLL("dwmapi.dll")
	shcore = syscall.NewLazyDLL("shcore.dll")

	pRegisterClassEx     = user32.NewProc("RegisterClassExW")
	pCreateWindowEx      = user32.NewProc("CreateWindowExW")
	pDefWindowProc       = user32.NewProc("DefWindowProcW")
	pDestroyWindow       = user32.NewProc("DestroyWindow")
	pShowWindow          = user32.NewProc("ShowWindow")
	pUpdateWindow        = user32.NewProc("UpdateWindow")
	pGetMessage          = user32.NewProc("GetMessageW")
	pTranslateMessage    = user32.NewProc("TranslateMessage")
	pDispatchMessage     = user32.NewProc("DispatchMessageW")
	pPostQuitMessage     = user32.NewProc("PostQuitMessage")
	pPostMessage         = user32.NewProc("PostMessageW")
	pSendMessage         = user32.NewProc("SendMessageW")
	pInvalidateRect      = user32.NewProc("InvalidateRect")
	pBeginPaint          = user32.NewProc("BeginPaint")
	pEndPaint            = user32.NewProc("EndPaint")
	pSetTimer            = user32.NewProc("SetTimer")
	pKillTimer           = user32.NewProc("KillTimer")
	pLoadCursor          = user32.NewProc("LoadCursorW")
	pSetCursor           = user32.NewProc("SetCursor")
	pLoadImage           = user32.NewProc("LoadImageW")
	pTrackMouseEvent     = user32.NewProc("TrackMouseEvent")
	pSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	pGetCursorPos        = user32.NewProc("GetCursorPos")
	pScreenToClient      = user32.NewProc("ScreenToClient")
	pMonitorFromPoint    = user32.NewProc("MonitorFromPoint")
	pGetMonitorInfo      = user32.NewProc("GetMonitorInfoW")
	pSetWindowPos        = user32.NewProc("SetWindowPos")
	pSetCapture          = user32.NewProc("SetCapture")
	pReleaseCapture      = user32.NewProc("ReleaseCapture")
	pGetKeyState         = user32.NewProc("GetKeyState")
	pGetSystemMetrics    = user32.NewProc("GetSystemMetrics")
	pSetDpiAwarenessCtx  = user32.NewProc("SetProcessDpiAwarenessContext")
	pSystemParamsInfo    = user32.NewProc("SystemParametersInfoW")
	pGetModuleHandle     = kernel32.NewProc("GetModuleHandleW")

	pCreateCompatibleDC = gdi32.NewProc("CreateCompatibleDC")
	pCreateDIBSection   = gdi32.NewProc("CreateDIBSection")
	pSelectObject       = gdi32.NewProc("SelectObject")
	pDeleteObject       = gdi32.NewProc("DeleteObject")
	pDeleteDC           = gdi32.NewProc("DeleteDC")
	pBitBlt             = gdi32.NewProc("BitBlt")
	pCreateFont         = gdi32.NewProc("CreateFontW")
	pSetTextColor       = gdi32.NewProc("SetTextColor")
	pSetBkMode          = gdi32.NewProc("SetBkMode")
	pGdiFlush           = gdi32.NewProc("GdiFlush")
	pDrawText           = user32.NewProc("DrawTextW")

	pDwmSetWindowAttribute = dwmapi.NewProc("DwmSetWindowAttribute")
	pDwmExtendFrame        = dwmapi.NewProc("DwmExtendFrameIntoClientArea")
	pGetDpiForMonitor      = shcore.NewProc("GetDpiForMonitor")
)

const (
	wmDestroy       = 0x0002
	wmPaint         = 0x000F
	wmClose         = 0x0010
	wmEraseBkgnd    = 0x0014
	wmSetCursor     = 0x0020
	wmSetIcon       = 0x0080
	wmNCCreate      = 0x0081
	wmNCCalcSize    = 0x0083
	wmNCHitTest     = 0x0084
	wmNCMouseMove   = 0x00A0
	wmNCLBtnDblClk  = 0x00A3
	wmKeyDown       = 0x0100
	wmTimer         = 0x0113
	wmMouseMove     = 0x0200
	wmLButtonDown   = 0x0201
	wmLButtonUp     = 0x0202
	wmMouseLeave    = 0x02A3
	wmDpiChanged    = 0x02E0
	wmAppUpdate     = 0x8001
	wmAppClose      = 0x8002
	wsPopup         = 0x80000000
	wsCaption       = 0x00C00000
	wsSysMenu       = 0x00080000
	wsMinimizeBox   = 0x00020000
	wsExAppWindow   = 0x00040000
	htClient        = 1
	htCaption       = 2
	dtCenter        = 0x1
	dtRight         = 0x2
	dtVCenter       = 0x4
	dtWordBreak     = 0x10
	dtSingleLine    = 0x20
	dtCalcRect      = 0x400
	dtNoPrefix      = 0x800
	dtEndEllipsis   = 0x8000
	ctlButton       = 1
	ctlOption       = 2
	ctlClose        = 3
	animInterval    = 33
	progressLogical = 680 // #121 : toutes les fenêtres ont le panneau de la marque (mosaïque) à gauche
	progressSide    = 220
	wizardW         = 780
	wizardH         = 520
	wizardSide      = 300
	dialogSide      = 184
	footH           = 72 // pied (boutons)
	dtPathEllipsis  = 0x4000
)

type wPoint struct{ X, Y int32 }
type wRect struct{ L, T, R, B int32 }

type wMsg struct {
	Hwnd     uintptr
	Message  uint32
	WParam   uintptr
	LParam   uintptr
	Time     uint32
	Pt       wPoint
	LPrivate uint32
}

type wndClassEx struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   uintptr
	Icon       uintptr
	Cursor     uintptr
	Background uintptr
	MenuName   *uint16
	ClassName  *uint16
	IconSm     uintptr
}

type paintStruct struct {
	Hdc       uintptr
	Erase     int32
	Paint     wRect
	Restore   int32
	IncUpdate int32
	Reserved  [32]byte
}

type bitmapInfo struct {
	Size          uint32
	Width         int32
	Height        int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
	Colors        [4]byte
}

type trackMouse struct {
	Size      uint32
	Flags     uint32
	Track     uintptr
	HoverTime uint32
}

type monitorInfo struct {
	Size    uint32
	Monitor wRect
	Work    wRect
	Flags   uint32
}

type dwmMargins struct{ L, R, T, B int32 }

type uiCtrl struct {
	kind       int
	id, style  string
	idx        int
	x, y, w, h float64
	label      string
}

type wizChoice struct {
	id   string
	opts []bool
}

type uiText struct {
	px, weight int
	col        rgb
	r          wRect
	flags      uint32
	s          string
}

// uiPill : repère « / … » à contour (#121, comme la fenêtre de connexion de NEXORA), dessiné avant les textes.
type uiPill struct {
	x, y, w, h float64
	col        rgb
}

// uiWin : une fenêtre du lanceur (progression ou dialogue), pilotée par le fil qui l'a créée.
type uiWin struct {
	hwnd     uintptr
	mu       sync.Mutex
	progress bool
	wizard   bool           // #084 : assistant d'installation ou de désinstallation
	page     wizPage        // page affichée par l'assistant
	choice   chan wizChoice // choix de l'utilisateur sur une page de l'assistant
	spec     uiSpec
	opts     []bool
	result   string

	// progression
	title, msg string
	target     float64 // < 0 : durée inconnue (barre animée)
	shown      float64
	started    time.Time
	cancelled  atomic.Bool

	dpi        int
	s          float64
	W, H       int
	ctrls      []uiCtrl
	texts      []uiText
	g          map[string]float64
	hover      int
	press      int
	focus      int
	kbd        bool
	tracking   bool
	memDC, bmp uintptr
	bits       unsafe.Pointer
	bw, bh     int
	fonts      map[[2]int]uintptr

	// #121 : panneau de la marque (mosaïque de rendus) et hauteur de l'assistant
	opened         time.Time // départ du défilement de la mosaïque
	animate        bool      // défilement : fenêtres à minuterie et animations de Windows actives
	panel          []byte    // image du panneau, recalculée seulement quand elle change
	panelKey       [4]int
	veil           []float64 // voile du panneau, ligne par ligne
	veilKey        [3]int
	panelCost      time.Duration // durée moyenne d'une image du panneau (défilement ralenti si elle est longue)
	pills          []uiPill
	minH           float64 // assistant : hauteur logique atteinte (la fenêtre ne rapetisse pas d'une page à l'autre)
	sizedW, sizedH int     // taille donnée à la fenêtre
}

var (
	uiOnce     sync.Once
	uiClass    *uint16
	uiInstance uintptr
	uiReady    bool
	winMu      sync.Mutex
	wins       = map[uintptr]*uiWin{}
	createMu   sync.Mutex
	creating   *uiWin
)

func uiInit() bool {
	uiOnce.Do(func() {
		if pSetDpiAwarenessCtx.Find() == nil {
			pSetDpiAwarenessCtx.Call(^uintptr(3)) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (-4)
		}
		uiInstance, _, _ = pGetModuleHandle.Call(0)
		uiClass, _ = syscall.UTF16PtrFromString("NEXORADevsToolbox")
		appIcon, _ := syscall.UTF16PtrFromString("APP")
		icon, _, _ := pLoadImage.Call(uiInstance, uintptr(unsafe.Pointer(appIcon)), 1, 0, 0, 0x40) // LR_DEFAULTSIZE
		cursor, _, _ := pLoadCursor.Call(0, 32512)                                                 // IDC_ARROW
		wc := wndClassEx{WndProc: syscall.NewCallback(uiWndProc), Instance: uiInstance, Icon: icon, Cursor: cursor, ClassName: uiClass, IconSm: icon}
		wc.Size = uint32(unsafe.Sizeof(wc))
		r, _, _ := pRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))
		uiReady = r != 0
	})
	return uiReady
}

func uiWndProc(hwnd, msg, wp, lp uintptr) uintptr {
	winMu.Lock()
	w := wins[hwnd]
	if w == nil && creating != nil {
		w = creating
		w.hwnd = hwnd
		wins[hwnd] = w
	}
	winMu.Unlock()
	if w != nil {
		if r, ok := w.handle(msg, wp, lp); ok {
			return r
		}
	}
	r, _, _ := pDefWindowProc.Call(hwnd, msg, wp, lp)
	return r
}

// ---------------------------------------------------------------- création et boucle
func (w *uiWin) px(v float64) float64 { return math.Round(v * w.s) }

func (w *uiWin) setDPI(dpi int) {
	if dpi <= 0 {
		dpi = 96
	}
	w.dpi, w.s = dpi, float64(dpi)/96
	for _, f := range w.fonts {
		pDeleteObject.Call(f)
	}
	w.fonts = map[[2]int]uintptr{}
	w.layout()
}

func (w *uiWin) layout() {
	if w.wizard {
		w.layoutWizard()
	} else if w.progress {
		w.layoutProgress()
	} else {
		w.layoutDialog()
	}
}

// clientAnimations : réglage « Effets d'animation » de Windows (SPI_GETCLIENTAREAANIMATION) ; vrai par défaut.
func clientAnimations() bool {
	on := int32(1)
	if r, _, _ := pSystemParamsInfo.Call(0x1042, 0, uintptr(unsafe.Pointer(&on)), 0); r == 0 {
		return true
	}
	return on != 0
}

// open : crée et montre la fenêtre au centre de l'écran du pointeur ; faux si Windows refuse (repli MessageBox).
func (w *uiWin) open() bool {
	if !uiInit() {
		return false
	}
	w.hover, w.press, w.focus = -1, -1, -1
	w.started = time.Now()
	w.opened = w.started
	w.animate = (w.progress || w.wizard) && clientAnimations()
	dc, _, _ := pCreateCompatibleDC.Call(0)
	if dc == 0 {
		return false
	}
	w.memDC = dc
	var p wPoint
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
	mon, _, _ := pMonitorFromPoint.Call(uintptr(uint32(p.X))|uintptr(uint32(p.Y))<<32, 2)
	mi := monitorInfo{}
	mi.Size = uint32(unsafe.Sizeof(mi))
	pGetMonitorInfo.Call(mon, uintptr(unsafe.Pointer(&mi)))
	dpi := 96
	if pGetDpiForMonitor.Find() == nil {
		var dx, dy uint32
		if r, _, _ := pGetDpiForMonitor.Call(mon, 0, uintptr(unsafe.Pointer(&dx)), uintptr(unsafe.Pointer(&dy))); r == 0 && dx > 0 {
			dpi = int(dx)
		}
	}
	w.setDPI(dpi)
	x := mi.Work.L + (mi.Work.R-mi.Work.L-int32(w.W))/2
	y := mi.Work.T + (mi.Work.B-mi.Work.T-int32(w.H))*9/20
	title, _ := syscall.UTF16PtrFromString(productName)
	createMu.Lock()
	winMu.Lock()
	creating = w
	winMu.Unlock()
	hwnd, _, _ := pCreateWindowEx.Call(wsExAppWindow, uintptr(unsafe.Pointer(uiClass)), uintptr(unsafe.Pointer(title)),
		wsPopup|wsCaption|wsSysMenu|wsMinimizeBox, uintptr(x), uintptr(y), uintptr(w.W), uintptr(w.H), 0, 0, uiInstance, 0)
	winMu.Lock()
	creating = nil
	winMu.Unlock()
	createMu.Unlock()
	if hwnd == 0 {
		pDeleteDC.Call(w.memDC)
		return false
	}
	w.hwnd = hwnd
	// Windows 11 : coins arrondis ; ombre portée par DWM (cadre étendu d'un pixel, invisible).
	if pDwmSetWindowAttribute.Find() == nil {
		corner := int32(2) // DWMWCP_ROUND
		pDwmSetWindowAttribute.Call(hwnd, 33, uintptr(unsafe.Pointer(&corner)), 4)
		m := dwmMargins{1, 1, 1, 1}
		pDwmExtendFrame.Call(hwnd, uintptr(unsafe.Pointer(&m)))
	}
	appIcon, _ := syscall.UTF16PtrFromString("APP")
	for i, sm := range []uintptr{49, 11} { // petite (SM_CXSMICON), grande (SM_CXICON)
		size, _, _ := pGetSystemMetrics.Call(sm)
		if ic, _, _ := pLoadImage.Call(uiInstance, uintptr(unsafe.Pointer(appIcon)), 1, size, size, 0); ic != 0 {
			pSendMessage.Call(hwnd, wmSetIcon, uintptr(i), ic)
		}
	}
	pSetWindowPos.Call(hwnd, 0, uintptr(x), uintptr(y), uintptr(w.W), uintptr(w.H), 0x0234) // cadre recalculé, sans activation ni ordre
	w.sizedW, w.sizedH = w.W, w.H
	pShowWindow.Call(hwnd, 5)
	pSetForegroundWindow.Call(hwnd)
	pUpdateWindow.Call(hwnd)
	if w.progress || w.wizard {
		pSetTimer.Call(hwnd, 1, animInterval, 0)
	}
	return true
}

func uiLoop() {
	var m wMsg
	for {
		r, _, _ := pGetMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			return
		}
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		pDispatchMessage.Call(uintptr(unsafe.Pointer(&m)))
	}
}

// runDialog : fenêtre modale ; renvoie le bouton choisi et l'état des cases. ok faux : aucune fenêtre possible.
func runDialog(spec uiSpec) (string, []bool, bool) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	w := &uiWin{spec: spec, result: spec.cancel}
	for _, o := range spec.options {
		w.opts = append(w.opts, o.checked)
	}
	if !w.open() {
		return "", nil, false
	}
	uiLoop()
	return w.result, w.opts, true
}

// ---------------------------------------------------------------- progression
type winProgress struct {
	w    *uiWin
	done chan struct{}
}

func newProgress(title string) Progress {
	p := &winProgress{done: make(chan struct{})}
	ready := make(chan bool, 1)
	go func() {
		runtime.LockOSThread()
		defer close(p.done)
		w := &uiWin{progress: true, title: title, msg: "Préparation…", target: -1}
		if !w.open() {
			ready <- false
			return
		}
		p.w = w
		ready <- true
		uiLoop()
	}()
	select {
	case ok := <-ready:
		if !ok {
			return nopProgress{}
		}
	case <-time.After(5 * time.Second):
		return nopProgress{}
	}
	return p
}

func (p *winProgress) Set(f float64, msg string) {
	p.w.mu.Lock()
	if f >= 0 && p.w.target < 0 {
		p.w.shown = 0
	}
	p.w.target, p.w.msg = f, msg
	p.w.mu.Unlock()
	pPostMessage.Call(p.w.hwnd, wmAppUpdate, 0, 0)
}

func (p *winProgress) Cancelled() bool { return p.w.cancelled.Load() }

func (p *winProgress) Close() {
	pPostMessage.Call(p.w.hwnd, wmAppClose, 0, 0)
	select {
	case <-p.done:
	case <-time.After(3 * time.Second):
	}
}

// ---------------------------------------------------------------- messages
func (w *uiWin) handle(msg, wp, lp uintptr) (uintptr, bool) {
	switch msg {
	case wmNCCalcSize:
		if wp != 0 {
			return 0, true // toute la fenêtre est zone client : pas de cadre ni de barre de titre de Windows
		}
	case wmNCHitTest:
		pt := wPoint{int32(int16(lp & 0xffff)), int32(int16(lp >> 16 & 0xffff))}
		pScreenToClient.Call(w.hwnd, uintptr(unsafe.Pointer(&pt)))
		if w.hit(float64(pt.X), float64(pt.Y)) >= 0 {
			return htClient, true
		}
		return htCaption, true // la fenêtre se déplace en la tirant
	case wmNCLBtnDblClk:
		return 0, true
	case wmEraseBkgnd:
		return 1, true
	case wmPaint:
		var ps paintStruct
		hdc, _, _ := pBeginPaint.Call(w.hwnd, uintptr(unsafe.Pointer(&ps)))
		w.paint(hdc)
		pEndPaint.Call(w.hwnd, uintptr(unsafe.Pointer(&ps)))
		return 0, true
	case wmTimer, wmAppUpdate:
		w.mu.Lock()
		if w.target >= 0 {
			w.shown += (w.target - w.shown) * 0.22
			if math.Abs(w.target-w.shown) < 0.001 {
				w.shown = w.target
			}
		}
		// #121 : page de l'assistant plus haute que la fenêtre : la fenêtre grandit (vers le bas) au lieu de laisser
		// le pied recouvrir le contenu.
		resize := false
		if w.wizard && msg == wmAppUpdate {
			w.layoutWizard()
			if resize = w.W != w.sizedW || w.H != w.sizedH; resize {
				w.sizedW, w.sizedH = w.W, w.H
			}
		}
		W, H := w.W, w.H
		w.mu.Unlock()
		if resize {
			pSetWindowPos.Call(w.hwnd, 0, 0, 0, uintptr(W), uintptr(H), 0x0016) // SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE
		}
		pInvalidateRect.Call(w.hwnd, 0, 0)
		return 0, true
	case wmAppClose:
		pDestroyWindow.Call(w.hwnd)
		return 0, true
	case wmMouseMove:
		if !w.tracking {
			tm := trackMouse{Flags: 2, Track: w.hwnd} // TME_LEAVE
			tm.Size = uint32(unsafe.Sizeof(tm))
			pTrackMouseEvent.Call(uintptr(unsafe.Pointer(&tm)))
			w.tracking = true
		}
		w.setHover(w.hit(float64(int16(lp&0xffff)), float64(int16(lp>>16&0xffff))))
		return 0, true
	case wmMouseLeave:
		w.tracking = false
		w.setHover(-1)
		return 0, true
	case wmNCMouseMove:
		w.setHover(-1)
	case wmSetCursor:
		if lp&0xffff == htClient && w.hover >= 0 {
			c, _, _ := pLoadCursor.Call(0, 32649) // IDC_HAND
			pSetCursor.Call(c)
			return 1, true
		}
	case wmLButtonDown:
		w.press = w.hit(float64(int16(lp&0xffff)), float64(int16(lp>>16&0xffff)))
		pSetCapture.Call(w.hwnd)
		pInvalidateRect.Call(w.hwnd, 0, 0)
		return 0, true
	case wmLButtonUp:
		pReleaseCapture.Call()
		i := w.hit(float64(int16(lp&0xffff)), float64(int16(lp>>16&0xffff)))
		p := w.press
		w.press = -1
		pInvalidateRect.Call(w.hwnd, 0, 0)
		if i >= 0 && i == p {
			w.activate(i)
		}
		return 0, true
	case wmKeyDown:
		w.key(wp)
		return 0, true
	case wmClose:
		w.cancel()
		return 0, true
	case wmDpiChanged:
		w.mu.Lock()
		w.setDPI(int(wp & 0xffff))
		r := (*wRect)(unsafe.Add(unsafe.Pointer(nil), lp)) // rectangle proposé par Windows
		x := r.L + (r.R-r.L-int32(w.W))/2
		y := r.T + (r.B-r.T-int32(w.H))/2
		w.sizedW, w.sizedH = w.W, w.H
		w.mu.Unlock()
		pSetWindowPos.Call(w.hwnd, 0, uintptr(x), uintptr(y), uintptr(w.W), uintptr(w.H), 0x0014)
		pInvalidateRect.Call(w.hwnd, 0, 0)
		return 0, true
	case wmDestroy:
		pKillTimer.Call(w.hwnd, 1)
		for _, f := range w.fonts {
			pDeleteObject.Call(f)
		}
		if w.bmp != 0 {
			pDeleteObject.Call(w.bmp)
		}
		pDeleteDC.Call(w.memDC)
		winMu.Lock()
		delete(wins, w.hwnd)
		winMu.Unlock()
		pPostQuitMessage.Call(0)
		return 0, true
	}
	return 0, false
}

func (w *uiWin) hit(x, y float64) int {
	for i, c := range w.ctrls {
		if x >= c.x && x < c.x+c.w && y >= c.y && y < c.y+c.h {
			return i
		}
	}
	return -1
}

func (w *uiWin) setHover(i int) {
	if i != w.hover {
		w.hover = i
		pInvalidateRect.Call(w.hwnd, 0, 0)
	}
}

func (w *uiWin) cancel() {
	if w.wizard {
		w.wizardChoose(w.page.cancel)
		return
	}
	if w.progress {
		w.cancelled.Store(true)
	}
	w.result = w.spec.cancel
	pDestroyWindow.Call(w.hwnd)
}

func (w *uiWin) activate(i int) {
	c := w.ctrls[i]
	switch c.kind {
	case ctlOption:
		w.opts[c.idx] = !w.opts[c.idx]
		pInvalidateRect.Call(w.hwnd, 0, 0)
	case ctlClose:
		w.cancel()
	case ctlButton:
		if w.wizard {
			w.wizardChoose(c.id)
			return
		}
		if w.progress { // seul bouton : Annuler
			w.cancel()
			return
		}
		w.result = c.id
		pDestroyWindow.Call(w.hwnd)
	}
}

// wizardChoose : sur une page de progression, demande l'annulation ; sinon transmet le choix à l'assistant.
func (w *uiWin) wizardChoose(id string) {
	if w.page.progress {
		if !w.cancelled.Load() && len(w.page.buttons) > 0 {
			w.cancelled.Store(true)
			w.mu.Lock()
			w.msg = "Annulation…"
			w.mu.Unlock()
			pInvalidateRect.Call(w.hwnd, 0, 0)
		}
		return
	}
	select {
	case w.choice <- wizChoice{id, append([]bool(nil), w.opts...)}:
	default:
	}
}

func (w *uiWin) key(vk uintptr) {
	switch vk {
	case 0x1B: // Échap
		w.cancel()
	case 0x09: // Tab, Maj+Tab
		if len(w.ctrls) == 0 {
			return
		}
		shift, _, _ := pGetKeyState.Call(0x10)
		step := 1
		if int16(shift) < 0 {
			step = -1
		}
		for k := 0; k < len(w.ctrls); k++ {
			w.focus = (w.focus + step + len(w.ctrls)) % len(w.ctrls)
			if w.ctrls[w.focus].kind != ctlClose {
				break
			}
		}
		w.kbd = true
		pInvalidateRect.Call(w.hwnd, 0, 0)
	case 0x20: // Espace
		if w.focus >= 0 && w.focus < len(w.ctrls) {
			w.activate(w.focus)
		}
	case 0x0D: // Entrée : bouton ciblé, sinon bouton principal
		if w.focus >= 0 && w.focus < len(w.ctrls) && w.ctrls[w.focus].kind == ctlButton {
			w.activate(w.focus)
			return
		}
		for i, c := range w.ctrls {
			if c.kind == ctlButton && (c.style == "primary" || c.style == "danger") {
				w.activate(i)
				return
			}
		}
	}
}

// ---------------------------------------------------------------- texte (GDI)
func (w *uiWin) font(px, weight int) uintptr {
	k := [2]int{px, weight}
	if f, ok := w.fonts[k]; ok {
		return f
	}
	face, _ := syscall.UTF16PtrFromString("Segoe UI")
	f, _, _ := pCreateFont.Call(uintptr(-int32(px)), 0, 0, 0, uintptr(weight), 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(face)))
	w.fonts[k] = f
	return f
}

// measure : hauteur (et largeur) d'un texte en pixels, renvoyé à la ligne dans width (0 : une seule ligne).
func (w *uiWin) measure(sizePx float64, weight int, s string, width float64) (float64, float64) {
	if s == "" {
		return 0, 0
	}
	pSelectObject.Call(w.memDC, w.font(int(math.Round(sizePx*w.s)), weight))
	r := wRect{0, 0, int32(math.Max(1, width)), 0}
	flags := uintptr(dtCalcRect | dtNoPrefix | dtWordBreak)
	if width <= 0 {
		r.R = 1 << 20
		flags = dtCalcRect | dtNoPrefix | dtSingleLine
	}
	u, _ := syscall.UTF16PtrFromString(s)
	pDrawText.Call(w.memDC, uintptr(unsafe.Pointer(u)), ^uintptr(0), uintptr(unsafe.Pointer(&r)), flags)
	return float64(r.R - r.L), float64(r.B - r.T)
}

func (w *uiWin) text(sizePx float64, weight int, col rgb, x, y, wd, ht float64, flags uint32, s string) {
	w.texts = append(w.texts, uiText{int(math.Round(sizePx * w.s)), weight, col, wRect{int32(x), int32(y), int32(x + wd), int32(y + ht)}, flags | dtNoPrefix, s})
}

// ---------------------------------------------------------------- panneau de la marque (#121)
// tag : repère « / … » à contour, comme sur la fenêtre de connexion de NEXORA ; renvoie sa hauteur.
func (w *uiWin) tag(x, y float64, label string, col rgb) float64 {
	sw, _ := w.measure(11.5, 400, "/", 0)
	lw, _ := w.measure(11.5, 400, label, 0)
	h := w.px(26)
	pw := w.px(12) + sw + w.px(6) + lw + w.px(12)
	w.pills = append(w.pills, uiPill{x, y, pw, h, col})
	w.text(11.5, 400, mix(colBg, col, 0.5), x+w.px(12), y, sw+w.px(2), h, dtVCenter|dtSingleLine, "/")
	w.text(11.5, 400, mix(colBg, col, 0.88), x+w.px(12)+sw+w.px(6), y, lw+w.px(4), h, dtVCenter|dtSingleLine, label)
	return h
}

// layoutPanel : textes du panneau de la marque (logo, NEXORA, Devs Toolbox en haut ; repère « / Fait avec
// NEXORA » dont le bas est en pillBottom, si pillBottom > 0).
func (w *uiWin) layoutPanel(side, pillBottom float64) {
	w.g["side"] = side
	ls := w.px(36)
	w.g["logoS"], w.g["logoX"], w.g["logoY"] = ls, w.px(24), w.px(24)
	tx := w.px(24) + ls + w.px(12)
	w.text(16, 700, colInk, tx, w.px(24), side-tx-w.px(12), w.px(20), dtSingleLine|dtEndEllipsis, "NEXORA")
	w.text(12, 400, colPanelSub, tx, w.px(43), side-tx-w.px(12), w.px(17), dtSingleLine|dtEndEllipsis, "Devs Toolbox")
	if pillBottom > 0 {
		w.tag(w.px(24), pillBottom-w.px(26), "Fait avec NEXORA", colInk)
		w.g["veilText"] = pillBottom - w.px(26)
	}
}

// ---------------------------------------------------------------- mise en page : dialogue
// #121 : panneau de la marque à gauche (mosaïque fixe), contenu à droite ; la hauteur suit le contenu.
func (w *uiWin) layoutDialog() {
	sp := w.spec
	side := w.px(dialogSide)
	W := side + w.px(float64(max(sp.width, 420)))
	pad := w.px(28)
	x0 := side + pad
	bw := W - x0 - pad
	w.ctrls, w.texts, w.pills, w.g = nil, nil, nil, map[string]float64{"footX": side}
	w.ctrls = append(w.ctrls, uiCtrl{kind: ctlClose, id: sp.cancel, x: W - w.px(44), y: w.px(8), w: w.px(36), h: w.px(36)})
	y := w.px(44)
	// En-tête : pastille d'icône, repère, titre.
	tx := x0 + w.px(48+16)
	tw := W - tx - pad
	_, th := w.measure(19, 600, sp.title, tw)
	w.g["badgeX"], w.g["badgeY"] = x0, y
	if sp.kicker != "" {
		kh := w.tag(tx, y, sp.kicker, hexc(uiTones[sp.tone][0]))
		w.text(19, 600, colInk, tx, y+kh+w.px(8), tw, th, dtWordBreak, sp.title)
		y += math.Max(w.px(48), kh+w.px(8)+th) + w.px(18)
	} else { // sans repère : titre centré sur la pastille
		w.text(19, 600, colInk, tx, y+math.Max(0, (w.px(48)-th)/2), tw, th, dtWordBreak, sp.title)
		y += math.Max(w.px(48), th) + w.px(18)
	}
	// Texte.
	_, bh := w.measure(14, 400, sp.body, bw)
	w.text(14, 400, colBody, x0, y, bw, bh, dtWordBreak, sp.body)
	y += bh + w.px(18)
	// Cases à cocher (cartes).
	for i, o := range sp.options {
		ix := x0 + w.px(14+20+12)
		iw := bw - w.px(14+20+12+14)
		_, oth := w.measure(14, 600, o.title, iw)
		_, odh := w.measure(12.5, 400, o.desc, iw)
		ch := math.Max(w.px(52), w.px(13)+oth+w.px(2)+odh+w.px(13))
		w.ctrls = append(w.ctrls, uiCtrl{kind: ctlOption, idx: i, x: x0, y: y, w: bw, h: ch})
		w.text(14, 600, colInk, ix, y+w.px(13), iw, oth, dtWordBreak, o.title)
		w.text(12.5, 400, colMuted, ix, y+w.px(13)+oth+w.px(2), iw, odh, dtWordBreak, o.desc)
		y += ch + w.px(10)
	}
	if len(sp.options) > 0 {
		y += w.px(6)
	}
	// Encadré de note.
	if sp.note != "" {
		nx := x0 + w.px(12+16+10)
		nw := bw - w.px(12+16+10+12)
		_, nh := w.measure(12.5, 400, sp.note, nw)
		boxH := w.px(11) + math.Max(w.px(17), nh) + w.px(11)
		w.g["noteX"], w.g["noteW"], w.g["noteY"], w.g["noteH"] = x0, bw, y, boxH
		w.text(12.5, 400, colMuted, nx, y+w.px(11), nw, nh, dtWordBreak, sp.note)
		y += boxH + w.px(22)
	} else {
		y += w.px(8)
	}
	// Pied : boutons alignés à droite ; hauteur minimale pour que le panneau garde sa marque et son repère.
	H := math.Max(y+w.px(footH), w.px(268))
	foot := H - w.px(footH)
	w.g["footY"] = foot
	widths := make([]float64, len(sp.buttons))
	total := 0.0
	for i, b := range sp.buttons {
		lw, _ := w.measure(14, 600, b.label, 0)
		widths[i] = math.Max(w.px(104), lw+w.px(40))
		total += widths[i] + w.px(10)
	}
	bx := W - pad - total + w.px(10)
	for i, b := range sp.buttons { // de gauche à droite (ordre de Tab)
		w.ctrls = append(w.ctrls, uiCtrl{kind: ctlButton, id: b.id, style: b.style, label: b.label, x: bx, y: foot + w.px(16), w: widths[i], h: w.px(40)})
		bx += widths[i] + w.px(10)
	}
	w.layoutPanel(side, 0)
	w.W, w.H = int(W), int(H)
}

// ---------------------------------------------------------------- mise en page : progression
// #121 : panneau de la marque à gauche (mosaïque qui défile) ; repère, titre, message, barre et étapes à droite,
// à des positions fixes (la fenêtre garde sa taille quand la progression devient connue).
func (w *uiWin) layoutProgress() {
	W := w.px(progressLogical)
	side := w.px(progressSide)
	x0 := side + w.px(32)
	cw := W - x0 - w.px(32)
	w.ctrls, w.texts, w.pills, w.g = nil, nil, nil, map[string]float64{"footX": side}
	w.ctrls = append(w.ctrls, uiCtrl{kind: ctlClose, id: "cancel", x: W - w.px(44), y: w.px(8), w: w.px(36), h: w.px(36)})
	tag, title := "Démarrage", "Ouverture de NEXORA"
	if w.target >= 0 {
		tag, title = "Mise à jour", "Mise à jour de NEXORA"
	}
	w.tag(x0, w.px(40), tag, colInk)
	w.text(21, 600, colInk, x0, w.px(76), cw-w.px(16), w.px(30), dtSingleLine|dtEndEllipsis, title)
	w.text(14, 400, colBody, x0, w.px(122), cw-w.px(64), w.px(22), dtSingleLine|dtEndEllipsis, w.msg)
	w.g["barX"], w.g["barW"], w.g["barY"] = x0, cw, w.px(154)
	if w.target >= 0 {
		pct := int(math.Round(math.Min(1, math.Max(0, w.shown)) * 100))
		w.text(14, 600, colViolet, x0+cw-w.px(64), w.px(122), w.px(64), w.px(22), dtSingleLine|dtRight, itoa(pct)+" %")
		// Étapes placées selon la largeur de leur nom (« Téléchargement » entier), sinon en trois tiers.
		stage := progressStage(w.target)
		widths := make([]float64, len(progressSteps))
		total := 0.0
		for i, name := range progressSteps {
			widths[i], _ = w.measure(12.5, map[bool]int{true: 600, false: 400}[i == stage], name, 0)
			total += w.px(24) + widths[i]
		}
		gap := (cw - total) / float64(len(progressSteps)-1)
		if gap < w.px(14) {
			gap = w.px(14)
			for i := range widths {
				widths[i] = (cw-2*gap)/3 - w.px(24)
			}
		}
		w.g["stepsY"] = w.px(186)
		sx := x0
		for i, name := range progressSteps {
			col := colMuted
			if i == stage {
				col = colInk
			}
			w.g["stepX"+itoa(i)] = sx + w.px(8)
			w.text(12.5, map[bool]int{true: 600, false: 400}[i == stage], col, sx+w.px(24), w.px(176), widths[i]+w.px(2), w.px(20), dtSingleLine|dtVCenter|dtEndEllipsis, name)
			sx += w.px(24) + widths[i] + gap
		}
	}
	foot := w.px(222)
	w.g["footY"] = foot
	lw, _ := w.measure(14, 600, "Annuler", 0)
	bw := math.Max(w.px(104), lw+w.px(40))
	w.ctrls = append(w.ctrls, uiCtrl{kind: ctlButton, id: "cancel", style: "secondary", label: "Annuler", x: W - w.px(32) - bw, y: foot + w.px(16), w: bw, h: w.px(40)})
	H := foot + w.px(footH)
	w.layoutPanel(side, 0)
	w.W, w.H = int(W), int(H)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}

// ---------------------------------------------------------------- dessin
func (w *uiWin) paint(hdc uintptr) {
	w.mu.Lock()
	defer w.mu.Unlock()
	pGdiFlush.Call()
	if w.wizard {
		w.layoutWizard()
	} else if w.progress {
		w.layoutProgress()
	}
	if w.bw != w.W || w.bh != w.H || w.bmp == 0 {
		bi := bitmapInfo{Width: int32(w.W), Height: -int32(w.H), Planes: 1, BitCount: 32}
		bi.Size = 40
		var bits unsafe.Pointer
		bmp, _, _ := pCreateDIBSection.Call(w.memDC, uintptr(unsafe.Pointer(&bi)), 0, uintptr(unsafe.Pointer(&bits)), 0, 0)
		if bmp == 0 {
			return
		}
		pSelectObject.Call(w.memDC, bmp)
		if w.bmp != 0 {
			pDeleteObject.Call(w.bmp)
		}
		w.bmp, w.bits, w.bw, w.bh = bmp, bits, w.W, w.H
	}
	c := &canvas{w.W, w.H, unsafe.Slice((*byte)(w.bits), w.W*w.H*4)}
	c.fill(colBg)
	foot, fx := int(w.g["footY"]), int(w.g["footX"])
	c.fillRect(fx, foot, w.W, w.H, colFooter)
	c.fillRect(fx, foot, w.W, foot+int(math.Max(1, math.Round(w.s))), colLine)
	w.paintPanel(c)
	if w.wizard {
		w.paintWizard(c)
	} else if w.progress {
		w.paintProgress(c)
	} else {
		w.paintDialog(c)
	}
	for _, p := range w.pills { // repères « / … » : fond sombre léger et contour, comme sur la connexion
		c.roundRect(p.x, p.y, p.w, p.h, p.h/2, solid(colPanel), 0.45)
		c.strokeRoundRect(p.x, p.y, p.w, p.h, p.h/2, math.Max(1, math.Round(w.s)), p.col, 0.24)
	}
	texts := append(append([]uiText(nil), w.texts...), w.paintControls(c)...)
	pSetBkMode.Call(w.memDC, 1)
	for _, t := range texts {
		pSelectObject.Call(w.memDC, w.font(t.px, t.weight))
		pSetTextColor.Call(w.memDC, uintptr(t.col.r)|uintptr(t.col.g)<<8|uintptr(t.col.b)<<16)
		u, _ := syscall.UTF16PtrFromString(t.s)
		r := t.r
		pDrawText.Call(w.memDC, uintptr(unsafe.Pointer(u)), ^uintptr(0), uintptr(unsafe.Pointer(&r)), uintptr(t.flags))
	}
	pBitBlt.Call(hdc, 0, 0, uintptr(w.W), uintptr(w.H), w.memDC, 0, 0, 0x00CC0020)
}

// paintPanel : panneau de la marque (#121) sur toute la hauteur : mosaïque de rendus (défilement à 15 images par
// seconde au plus, image recalculée seulement quand elle change ; fixe sans minuterie ou si Windows coupe les
// animations), filet à droite, logo.
func (w *uiWin) paintPanel(c *canvas) {
	side := int(w.g["side"])
	if side <= 0 || side > w.W {
		return
	}
	// 15 images par seconde au plus ; 8 si une image du panneau coûte plus de 8 ms (grand écran à 200 %, PC lent).
	fps, frame := 15.0, 0
	if w.panelCost > 8*time.Millisecond {
		fps = 8
	}
	if w.animate {
		frame = int(time.Since(w.opened).Seconds() * fps)
	}
	key := [4]int{side, w.H, int(math.Round(w.s * 100)), frame*100 + int(fps)}
	vk := [3]int{w.H, int(math.Round(w.s * 100)), int(w.g["veilText"])}
	if len(w.veil) != w.H || w.veilKey != vk {
		w.veil, w.veilKey = panelVeil(w.H, w.s, w.g["veilText"]), vk
		w.panelKey = [4]int{}
	}
	if len(w.panel) != side*w.H*4 || w.panelKey != key {
		if len(w.panel) != side*w.H*4 {
			w.panel = make([]byte, side*w.H*4)
		}
		t0 := time.Now()
		mosaicFor(side, w.H, w.s).render(w.panel, float64(frame)/fps, w.veil)
		w.panelCost = (w.panelCost*3 + time.Since(t0)) / 4
		w.panelKey = key
	}
	for y := 0; y < w.H; y++ {
		copy(c.pix[y*w.W*4:y*w.W*4+side*4], w.panel[y*side*4:(y+1)*side*4])
	}
	lw := int(math.Max(1, math.Round(w.s)))
	c.fillRect(side-lw, 0, side, w.H, colLine)
	c.image(logoImage(int(w.g["logoS"])), int(w.g["logoX"]), int(w.g["logoY"]))
}

func (w *uiWin) paintDialog(c *canvas) {
	sp := w.spec
	tone := uiTones[sp.tone]
	bx, by := w.g["badgeX"], w.g["badgeY"]
	c.circle(bx+w.px(24), by+w.px(24), w.px(24), hexc(tone[1]), 1)
	isz := int(w.px(24))
	c.icon(sp.icon, int(bx+w.px(24))-isz/2, int(by+w.px(24))-isz/2, isz, 2, hexc(tone[0]))
	if ny, ok := w.g["noteY"]; ok {
		nx := w.g["noteX"]
		c.roundRect(nx, ny, w.g["noteW"], w.g["noteH"], w.px(12), solid(colRaised), 1)
		s := int(w.px(16))
		c.icon("shieldCheck", int(nx+w.px(12)), int(ny+w.px(12)), s, 2, colGreen)
	}
}

func (w *uiWin) paintProgress(c *canvas) {
	bx, by, bwid, bh := w.g["barX"], w.g["barY"], w.g["barW"], w.px(8)
	c.roundRect(bx, by, bwid, bh, bh/2, solid(colTrack), 1)
	brand := func(x, _ float64) rgb { return gradBrand((x - bx) / bwid) }
	if w.target < 0 {
		// Durée inconnue : segment lumineux qui parcourt la barre.
		t := math.Mod(time.Since(w.started).Seconds(), 1.6) / 1.6
		e := t * t * (3 - 2*t)
		x0 := bx + (e*1.35-0.35)*bwid
		x1 := x0 + 0.35*bwid
		x0, x1 = math.Max(x0, bx), math.Min(x1, bx+bwid)
		if x1-x0 > bh {
			c.roundRect(x0, by, x1-x0, bh, bh/2, brand, 1)
		}
	} else if f := math.Min(1, math.Max(0, w.shown)); f > 0 {
		c.roundRect(bx, by, math.Max(bh, f*bwid), bh, bh/2, brand, 1)
	}
	if w.target >= 0 {
		stage := progressStage(w.target)
		for i := range progressSteps {
			cx, cy, r := w.g["stepX"+itoa(i)], w.g["stepsY"], w.px(8)
			switch {
			case i < stage:
				c.circle(cx, cy, r, colGreen, 1)
				s := int(w.px(12))
				c.icon("check", int(cx)-s/2, int(cy)-s/2, s, 3, colBg)
			case i == stage:
				c.circle(cx, cy, r, colViolet, 1)
				c.circle(cx, cy, r*0.4, colBg, 1)
			default:
				c.circle(cx, cy, r, colEdgeHi, 1)
				c.circle(cx, cy, r-math.Max(1, w.px(1.5)), colBg, 1)
			}
		}
	}
}

// paintControls dessine boutons, cases et croix ; renvoie les libellés des boutons, écrits ensuite par GDI.
func (w *uiWin) paintControls(c *canvas) []uiText {
	var texts []uiText
	for i, ct := range w.ctrls {
		hover, press := i == w.hover, i == w.press && i == w.hover
		focus := w.kbd && i == w.focus
		switch ct.kind {
		case ctlClose:
			if hover {
				c.roundRect(ct.x, ct.y, ct.w, ct.h, ct.h/2, solid(colRaised), 1)
			}
			s := int(w.px(16))
			col := colMuted
			if hover {
				col = colInk
			}
			c.icon("x", int(ct.x+ct.w/2)-s/2, int(ct.y+ct.h/2)-s/2, s, 2, col)
		case ctlButton:
			r := ct.h / 2 // #103 : boutons en pilule, comme le site
			switch ct.style {
			case "primary":
				x0, wd := ct.x, ct.w
				c.roundRect(ct.x, ct.y, ct.w, ct.h, r, func(x, _ float64) rgb { return gradBrand((x - x0) / wd) }, 1)
			case "danger":
				c.roundRect(ct.x, ct.y, ct.w, ct.h, r, solid(hexc("#dc2626")), 1)
			default:
				bg := colBg
				if hover {
					bg = colRaised
				}
				c.roundRect(ct.x, ct.y, ct.w, ct.h, r, solid(bg), 1)
				c.strokeRoundRect(ct.x, ct.y, ct.w, ct.h, r, math.Max(1, math.Round(w.s)), colEdge, 1)
			}
			if ct.style != "secondary" && (hover || press) {
				a := 0.1
				if press {
					a = 0.2
				}
				c.roundRect(ct.x, ct.y, ct.w, ct.h, r, solid(rgb{0, 0, 0}), a)
			}
			col := colInk
			if ct.style == "primary" { // bouton blanc : texte noir
				col = colBg
			}
			texts = append(texts, uiText{int(math.Round(14 * w.s)), 600, col, wRect{int32(ct.x), int32(ct.y), int32(ct.x + ct.w), int32(ct.y + ct.h)}, dtCenter | dtVCenter | dtSingleLine | dtNoPrefix, ct.label})
		case ctlOption:
			on := w.opts[ct.idx]
			border, bg := colLine, colBg
			if on {
				border, bg = colInk, colRaised
			} else if hover {
				border = colEdgeHi
			}
			c.roundRect(ct.x, ct.y, ct.w, ct.h, w.px(12), solid(bg), 1)
			c.strokeRoundRect(ct.x, ct.y, ct.w, ct.h, w.px(12), math.Max(1, math.Round(w.s)), border, 1)
			bx, by, bs := ct.x+w.px(14), ct.y+w.px(14), w.px(20)
			if on {
				c.roundRect(bx, by, bs, bs, w.px(6), func(x, _ float64) rgb { return gradBrand((x - bx) / bs) }, 1)
				s := int(w.px(14))
				c.icon("check", int(bx+bs/2)-s/2, int(by+bs/2)-s/2, s, 3, colBg)
			} else {
				c.strokeRoundRect(bx, by, bs, bs, w.px(6), math.Max(1.5, w.px(1.5)), colEdgeHi, 1)
			}
		}
		if focus {
			g := w.px(3)
			c.strokeRoundRect(ct.x-g, ct.y-g, ct.w+2*g, ct.h+2*g, w.px(12)+g, math.Max(2, w.px(2)), colViolet, 0.6)
		}
	}
	return texts
}

// ---------------------------------------------------------------- assistant (#084)
type winWizard struct {
	w    *uiWin
	done chan struct{}
}

type wizProgress struct{ z *winWizard }

// fallbackWizard : aucune fenêtre possible (session sans bureau) : choix par défaut, sans affichage.
type fallbackWizard struct{}

func (fallbackWizard) Page(p wizPage) (string, []bool) {
	opts := make([]bool, len(p.options))
	for i, o := range p.options {
		opts[i] = o.checked
	}
	for _, b := range p.buttons {
		if b.style == "primary" || b.style == "danger" {
			return b.id, opts
		}
	}
	return p.cancel, opts
}
func (fallbackWizard) Progress(wizPage) Progress { return nopProgress{} }
func (fallbackWizard) Close()                    {}

func newWizard() Wizard {
	z := &winWizard{done: make(chan struct{})}
	ready := make(chan bool, 1)
	go func() {
		runtime.LockOSThread()
		defer close(z.done)
		w := &uiWin{wizard: true, choice: make(chan wizChoice, 1), target: -1}
		if !w.open() {
			ready <- false
			return
		}
		z.w = w
		ready <- true
		uiLoop()
	}()
	select {
	case ok := <-ready:
		if !ok {
			return fallbackWizard{}
		}
	case <-time.After(5 * time.Second):
		return fallbackWizard{}
	}
	return z
}

func (z *winWizard) show(p wizPage) {
	w := z.w
	w.mu.Lock()
	w.page = p
	w.opts = make([]bool, len(p.options))
	for i, o := range p.options {
		w.opts[i] = o.checked
	}
	w.target, w.shown, w.msg = -1, 0, ""
	w.focus, w.press, w.kbd = -1, -1, false
	w.cancelled.Store(false)
	w.started = time.Now()
	select {
	case <-w.choice:
	default:
	}
	w.mu.Unlock()
	pPostMessage.Call(w.hwnd, wmAppUpdate, 0, 0)
}

func (z *winWizard) Page(p wizPage) (string, []bool) {
	z.show(p)
	select {
	case c := <-z.w.choice:
		return c.id, c.opts
	case <-z.done:
		return p.cancel, nil
	}
}

func (z *winWizard) Progress(p wizPage) Progress {
	p.progress = true
	z.show(p)
	return wizProgress{z}
}

func (z *winWizard) Close() {
	pPostMessage.Call(z.w.hwnd, wmAppClose, 0, 0)
	select {
	case <-z.done:
	case <-time.After(3 * time.Second):
	}
}

func (p wizProgress) Set(f float64, msg string) {
	w := p.z.w
	w.mu.Lock()
	if f >= 0 && w.target < 0 {
		w.shown = 0
	}
	w.target = f
	if !w.cancelled.Load() {
		w.msg = msg
	}
	w.mu.Unlock()
	pPostMessage.Call(w.hwnd, wmAppUpdate, 0, 0)
}
func (p wizProgress) Cancelled() bool { return p.z.w.cancelled.Load() }
func (p wizProgress) Close()          {}

// #121 : panneau de la marque à gauche (mosaïque qui défile ; étapes et version en bas, sur la partie noire du
// voile), contenu à droite. La hauteur suit le contenu : le pied (boutons) ne recouvre jamais une case ni un texte.
func (w *uiWin) layoutWizard() {
	p := w.page
	W := w.px(wizardW)
	side := w.px(wizardSide)
	x0 := side + w.px(40)
	cw := W - x0 - w.px(40)
	w.ctrls, w.texts, w.pills, w.g = nil, nil, nil, map[string]float64{"footX": side}
	if p.cancel != "" && !(p.progress && len(p.buttons) == 0) {
		w.ctrls = append(w.ctrls, uiCtrl{kind: ctlClose, id: p.cancel, x: W - w.px(44), y: w.px(8), w: w.px(36), h: w.px(36)})
	}
	// Contenu, mesuré d'abord : la hauteur de la fenêtre en dépend.
	y := w.px(48)
	if p.icon != "" {
		w.g["badgeX"], w.g["badgeY"] = x0, y
		y += w.px(48 + 18)
	}
	if p.kicker != "" {
		y += w.tag(x0, y, p.kicker, colInk) + w.px(14)
	}
	_, th := w.measure(21, 600, p.title, cw)
	w.text(21, 600, colInk, x0, y, cw, th, dtWordBreak, p.title)
	y += th + w.px(10)
	if p.body != "" {
		_, bh := w.measure(13.5, 400, p.body, cw)
		w.text(13.5, 400, colBody, x0, y, cw, bh, dtWordBreak, p.body)
		y += bh + w.px(18)
	}
	if len(p.rows) > 0 {
		rowH := w.px(42)
		for i, r := range p.rows {
			ry := y + w.px(11) + float64(i)*rowH
			w.text(12, 400, colMuted, x0+w.px(14), ry, cw-w.px(28), w.px(16), dtSingleLine, r[0])
			w.text(13, 600, colInk, x0+w.px(14), ry+w.px(17), cw-w.px(28), w.px(20), dtSingleLine|dtPathEllipsis, r[1])
		}
		h := w.px(22) + float64(len(p.rows))*rowH - w.px(6)
		w.g["rowsY"], w.g["rowsH"] = y, h
		y += h + w.px(14)
	}
	for i, o := range p.options {
		iw := cw - w.px(14+20+12+14)
		_, oth := w.measure(13.5, 600, o.title, iw)
		odh := 0.0
		if o.desc != "" {
			_, odh = w.measure(12, 400, o.desc, iw)
			odh += w.px(2)
		}
		ch := math.Max(w.px(48), w.px(13)+oth+odh+w.px(13))
		w.ctrls = append(w.ctrls, uiCtrl{kind: ctlOption, idx: i, x: x0, y: y, w: cw, h: ch})
		ty := y + (ch-oth-odh)/2
		w.text(13.5, 600, colInk, x0+w.px(46), ty, iw, oth, dtWordBreak, o.title)
		if o.desc != "" {
			w.text(12, 400, colMuted, x0+w.px(46), ty+oth+w.px(2), iw, odh, dtWordBreak, o.desc)
		}
		y += ch + w.px(8)
	}
	if p.progress {
		y += w.px(4)
		w.text(13.5, 400, colInk, x0, y, cw-w.px(60), w.px(22), dtSingleLine|dtEndEllipsis, w.msg)
		if w.target >= 0 {
			pct := int(math.Round(math.Min(1, math.Max(0, w.shown)) * 100))
			w.text(13.5, 600, colViolet, x0+cw-w.px(60), y, w.px(60), w.px(22), dtSingleLine|dtRight, itoa(pct)+" %")
		}
		w.g["barY"] = y + w.px(30)
		y += w.px(38) + w.px(8)
	}
	// Hauteur : au moins wizardH, davantage si le contenu l'exige (au moins 16 pixels au-dessus du pied) ; jamais
	// moins qu'une page précédente, pour que la fenêtre ne saute pas d'une page à l'autre.
	H := math.Max(math.Max(w.px(wizardH), y+w.px(8)+w.px(footH)), w.px(w.minH))
	w.minH = H / w.s
	foot := H - w.px(footH)
	w.g["footY"] = foot
	widths := make([]float64, len(p.buttons))
	total := 0.0
	for i, b := range p.buttons {
		lw, _ := w.measure(14, 600, b.label, 0)
		widths[i] = math.Max(w.px(104), lw+w.px(40))
		total += widths[i] + w.px(10)
	}
	bx := W - w.px(40) - total + w.px(10)
	for i, b := range p.buttons {
		label := b.label
		if p.progress && w.cancelled.Load() {
			label = "Annulation…"
		}
		w.ctrls = append(w.ctrls, uiCtrl{kind: ctlButton, id: b.id, style: b.style, label: label, x: bx, y: foot + w.px(16), w: widths[i], h: w.px(40)})
		bx += widths[i] + w.px(10)
	}
	// Panneau : marque en haut ; repère, étapes et version en bas, sur la partie noire du voile.
	n := len(p.steps)
	for i, name := range p.steps {
		cy := H - w.px(70) - float64(n-1-i)*w.px(40)
		w.g["step"+itoa(i)] = cy
		col, wt := colPanelSoft, 400
		if i == p.step {
			col, wt = colInk, 600
		}
		w.text(13.5, wt, col, w.px(60), cy-w.px(11), side-w.px(72), w.px(22), dtSingleLine|dtVCenter, name)
	}
	w.text(11.5, 400, colPanelSoft, w.px(24), H-w.px(38), side-w.px(40), w.px(18), dtSingleLine, "Version "+version)
	pill := 0.0
	if n > 0 {
		pill = w.g["step0"] - w.px(11) - w.px(22)
	}
	w.layoutPanel(side, pill)
	w.W, w.H = int(W), int(H)
}

func (w *uiWin) paintWizard(c *canvas) {
	p := w.page
	white := rgb{255, 255, 255}
	cx, r := w.px(34), w.px(10)
	for i := range p.steps {
		cy := w.g["step"+itoa(i)]
		if i < len(p.steps)-1 { // trait vers l'étape suivante
			lx, next := int(cx), w.g["step"+itoa(i+1)]
			for y := int(cy + r + w.px(4)); y < int(next-r-w.px(4)); y++ {
				c.blend(lx, y, white, 0.2)
				if w.s > 1.25 {
					c.blend(lx+1, y, white, 0.2)
				}
			}
		}
		switch {
		case i < p.step:
			c.circle(cx, cy, r, white, 1)
			s := int(w.px(12))
			c.icon("check", int(cx)-s/2, int(cy)-s/2, s, 3, colPanel)
		case i == p.step:
			c.circle(cx, cy, r, white, 1)
			c.circle(cx, cy, r*0.42, colPanel, 1)
		default:
			c.circle(cx, cy, r, colEdgeHi, 1)
			c.circle(cx, cy, r-math.Max(1.5, w.px(1.5)), colPanel, 1)
		}
	}
	if bx, ok := w.g["badgeX"]; ok {
		tone := uiTones[p.tone]
		by := w.g["badgeY"]
		c.circle(bx+w.px(24), by+w.px(24), w.px(24), hexc(tone[1]), 1)
		isz := int(w.px(26))
		c.icon(p.icon, int(bx+w.px(24))-isz/2, int(by+w.px(24))-isz/2, isz, 2, hexc(tone[0]))
	}
	x0 := w.g["footX"] + w.px(40)
	cw := float64(w.W) - x0 - w.px(40)
	if ry, ok := w.g["rowsY"]; ok {
		c.roundRect(x0, ry, cw, w.g["rowsH"], w.px(16), solid(colRaised), 1)
	}
	if by, ok := w.g["barY"]; ok {
		bh := w.px(8)
		c.roundRect(x0, by, cw, bh, bh/2, solid(colTrack), 1)
		brand := func(x, _ float64) rgb { return gradBrand((x - x0) / cw) }
		if w.target < 0 {
			t := math.Mod(time.Since(w.started).Seconds(), 1.6) / 1.6
			e := t * t * (3 - 2*t)
			a := math.Max(x0+(e*1.35-0.35)*cw, x0)
			b := math.Min(a+0.35*cw, x0+cw)
			if b-a > bh {
				c.roundRect(a, by, b-a, bh, bh/2, brand, 1)
			}
		} else if f := math.Min(1, math.Max(0, w.shown)); f > 0 {
			c.roundRect(x0, by, math.Max(bh, f*cw), bh, bh/2, brand, 1)
		}
	}
}
