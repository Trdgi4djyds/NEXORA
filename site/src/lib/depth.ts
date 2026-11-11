// NEXORA #074 : profondeur liée au défilement, sans bibliothèque, avec un seul écouteur pour tout le site.
//   [data-depth]  scène en perspective : reçoit --sp, position de l'élément dans la fenêtre entre 0 (son haut
//                 touche le bas de la fenêtre) et 1 (son bas quitte le haut). Le CSS en tire les rotations 3D
//                 (écrans du hero qui se redressent, anneau des espaces qui pivote, cartes qui se posent).
// Calcul seulement pour les scènes visibles, une fois par image ; rien avec « Réduire les animations » (le CSS
// garde alors sa valeur de repos).
export function installDepth(): () => void {
  if (typeof window === "undefined" || typeof matchMedia !== "function") return () => {}
  const reduce = matchMedia("(prefers-reduced-motion: reduce)")
  let raf = 0
  const visible = new Set<HTMLElement>()
  const io =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          for (const e of entries) {
            const el = e.target as HTMLElement
            if (e.isIntersecting) visible.add(el)
            else visible.delete(el)
          }
          schedule()
        })
      : null

  const frame = () => {
    raf = 0
    if (reduce.matches) return
    const vh = window.innerHeight || 1
    visible.forEach((el) => {
      const r = el.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)))
      el.style.setProperty("--sp", p.toFixed(4))
    })
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }
  // Les pages changent sans rechargement : les scènes ajoutées ou retirées sont suivies au fil de l'eau.
  const watched = new WeakSet<Element>()
  const scan = () => {
    document.querySelectorAll<HTMLElement>("[data-depth]").forEach((el) => {
      if (watched.has(el)) return
      watched.add(el)
      if (io) io.observe(el)
      else visible.add(el)
    })
    visible.forEach((el) => {
      if (!el.isConnected) visible.delete(el)
    })
    schedule()
  }
  const mo = new MutationObserver(scan)
  mo.observe(document.body, { childList: true, subtree: true })
  scan()
  window.addEventListener("scroll", schedule, { passive: true })
  window.addEventListener("resize", schedule)
  return () => {
    mo.disconnect()
    io?.disconnect()
    window.removeEventListener("scroll", schedule)
    window.removeEventListener("resize", schedule)
    cancelAnimationFrame(raf)
  }
}
