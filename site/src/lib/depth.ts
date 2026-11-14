// NEXORA #074 : profondeur liée au défilement, sans bibliothèque, avec un seul écouteur pour tout le site.
//   [data-depth]  scène en perspective : reçoit --sp, position de l'élément dans la fenêtre entre 0 (son haut
//                 touche le bas de la fenêtre) et 1 (son bas quitte le haut). Le CSS en tire les rotations 3D
//                 (écrans du hero qui se redressent, anneau des espaces qui pivote, cartes qui se posent).
// Calcul seulement pour les scènes visibles, une fois par image ; rien avec « Réduire les animations » (le CSS
// garde alors sa valeur de repos).
// #120 : plus aucune lecture de la mise en page pendant le défilement. La position de chaque scène dans la page est
// mesurée quand elle entre à l'écran, au redimensionnement et quand la hauteur de la page change, toutes les lectures
// avant toute écriture ; à chaque image, --sp se calcule à partir de scrollY et n'est écrit que s'il change.
// Avant, getBoundingClientRect() suivi d'une écriture, scène après scène, forçait un recalcul de la mise en page à
// chaque image (latence au défilement).
export function installDepth(): () => void {
  if (typeof window === "undefined" || typeof matchMedia !== "function") return () => {}
  const reduce = matchMedia("(prefers-reduced-motion: reduce)")
  let raf = 0
  let stale = true
  // Défilement et hauteur de la fenêtre lus hors des rappels d'image (évènements « scroll » et « resize ») : lus
  // après des écritures de style, ils forceraient un recalcul de la mise en page.
  let scrollY = window.scrollY
  let vh = window.innerHeight || 1
  const visible = new Set<HTMLElement>()
  const geo = new WeakMap<HTMLElement, { top: number; height: number }>()
  const last = new WeakMap<HTMLElement, string>()
  const io =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          for (const e of entries) {
            const el = e.target as HTMLElement
            if (e.isIntersecting) visible.add(el)
            else visible.delete(el)
          }
          stale = true
          schedule()
        })
      : null

  const measure = () => {
    const y = window.scrollY
    scrollY = y
    visible.forEach((el) => {
      const r = el.getBoundingClientRect()
      geo.set(el, { top: r.top + y, height: r.height })
    })
    stale = false
  }
  const frame = () => {
    raf = 0
    if (reduce.matches) return
    if (stale) measure()
    visible.forEach((el) => {
      const g = geo.get(el)
      if (!g) return
      const p = Math.min(1, Math.max(0, (vh - (g.top - scrollY)) / (vh + g.height)))
      const v = p.toFixed(3)
      if (last.get(el) === v) return
      last.set(el, v)
      el.style.setProperty("--sp", v)
    })
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }
  const remeasure = () => {
    stale = true
    schedule()
  }
  const onScroll = () => {
    if (!visible.size) return
    scrollY = window.scrollY
    schedule()
  }
  const onResize = () => {
    vh = window.innerHeight || 1
    remeasure()
  }
  // Les pages changent sans rechargement : les scènes ajoutées ou retirées sont suivies au fil de l'eau.
  const watched = new WeakSet<Element>()
  const scan = () => {
    let changed = false
    document.querySelectorAll<HTMLElement>("[data-depth]").forEach((el) => {
      if (watched.has(el)) return
      watched.add(el)
      changed = true
      if (io) io.observe(el)
      else visible.add(el)
    })
    visible.forEach((el) => {
      if (!el.isConnected) {
        visible.delete(el)
        changed = true
      }
    })
    if (changed) remeasure()
  }
  const mo = new MutationObserver(scan)
  mo.observe(document.body, { childList: true, subtree: true })
  // Hauteur de la page modifiée (images chargées, section dépliée) : les scènes ont pu se déplacer.
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(remeasure) : null
  ro?.observe(document.body)
  scan()
  remeasure()
  window.addEventListener("scroll", onScroll, { passive: true })
  window.addEventListener("resize", onResize)
  return () => {
    mo.disconnect()
    ro?.disconnect()
    io?.disconnect()
    window.removeEventListener("scroll", onScroll)
    window.removeEventListener("resize", onResize)
    cancelAnimationFrame(raf)
  }
}
