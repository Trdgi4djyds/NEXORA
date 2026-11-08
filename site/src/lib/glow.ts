// NEXORA #069 : lumière qui suit la souris, sans bibliothèque, avec un seul écouteur pour tout le site.
//   [data-glow]  groupe de cartes : chaque `.glow` du groupe (le groupe compris s'il porte la classe) reçoit
//                --gx / --gy, position du pointeur dans la carte ; le groupe prend l'attribut `data-lit` tant que le
//                pointeur est dedans. Les reflets et les bordures lumineuses sont dessinés en CSS.
//   [data-light] zone éclairée (grilles du hero, des en-têtes, de l'appel final, image qui suit le pointeur) :
//                --lx / --ly et `data-lit`.
//   [data-tilt]  légère parallaxe : --px / --py entre -1 et 1 (0 au repos), coupée par « Réduire les animations ».
// Un attribut plutôt qu'une classe : React réécrit `className` à chaque rendu et effacerait la classe ajoutée ici.
// Souris ou stylet seulement (le toucher est ignoré : aucun effet qui resterait collé) ; posé dès qu'un appareil
// de pointage peut survoler (`any-hover`, tablettes avec pavé tactile comprises) ou en l'absence de tout pointeur
// (`pointer: none`, rendu automatisé : rien ne peut alors survoler) ; jamais sur un écran tactile seul.
export const HOVER_MEDIA = "(any-hover: hover), (pointer: none)"
export function installGlow(): () => void {
  if (typeof window === "undefined" || typeof matchMedia !== "function") return () => {}
  if (!matchMedia(HOVER_MEDIA).matches) return () => {}
  const reduce = matchMedia("(prefers-reduced-motion: reduce)")
  let x = -1
  let y = -1
  let raf = 0
  let group: HTMLElement | null = null
  let light: HTMLElement | null = null
  let tilt: HTMLElement | null = null

  const swap = (prev: HTMLElement | null, next: HTMLElement | null) => {
    if (prev !== next) {
      if (prev) delete prev.dataset.lit
      if (next) next.dataset.lit = ""
    }
    return next
  }
  const at = (el: HTMLElement, kx: string, ky: string) => {
    const r = el.getBoundingClientRect()
    el.style.setProperty(kx, `${Math.round(x - r.left)}px`)
    el.style.setProperty(ky, `${Math.round(y - r.top)}px`)
    return r
  }
  const frame = () => {
    raf = 0
    const hit = x < 0 ? null : (document.elementFromPoint(x, y) as HTMLElement | null)

    group = swap(group, hit?.closest<HTMLElement>("[data-glow]") ?? null)
    if (group) {
      if (group.classList.contains("glow")) at(group, "--gx", "--gy")
      group.querySelectorAll<HTMLElement>(".glow").forEach((card) => at(card, "--gx", "--gy"))
    }

    light = swap(light, hit?.closest<HTMLElement>("[data-light]") ?? null)
    if (light) at(light, "--lx", "--ly")

    const next = reduce.matches ? null : (hit?.closest<HTMLElement>("[data-tilt]") ?? null)
    if (tilt && tilt !== next) {
      tilt.style.setProperty("--px", "0")
      tilt.style.setProperty("--py", "0")
    }
    tilt = swap(tilt, next)
    if (tilt) {
      const r = tilt.getBoundingClientRect()
      tilt.style.setProperty("--px", (((x - r.left) / r.width) * 2 - 1).toFixed(3))
      tilt.style.setProperty("--py", (((y - r.top) / r.height) * 2 - 1).toFixed(3))
    }
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }
  const move = (e: PointerEvent) => {
    if (e.pointerType === "touch") return
    x = e.clientX
    y = e.clientY
    schedule()
  }
  const out = (e: PointerEvent) => {
    if (e.relatedTarget) return
    x = -1
    schedule()
  }
  const scroll = () => {
    if (x >= 0) schedule()
  }
  window.addEventListener("pointermove", move, { passive: true })
  document.addEventListener("pointerout", out)
  window.addEventListener("scroll", scroll, { passive: true })
  return () => {
    window.removeEventListener("pointermove", move)
    document.removeEventListener("pointerout", out)
    window.removeEventListener("scroll", scroll)
    cancelAnimationFrame(raf)
  }
}
