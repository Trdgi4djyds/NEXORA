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
  // #120 : toutes les lectures (élément sous le pointeur, positions) avant toute écriture : une lecture après une
  // écriture forçait un recalcul de la mise en page, carte après carte, à chaque image.
  const frame = () => {
    raf = 0
    const hit = x < 0 ? null : (document.elementFromPoint(x, y) as HTMLElement | null)
    const nextGroup = hit?.closest<HTMLElement>("[data-glow]") ?? null
    const nextLight = hit?.closest<HTMLElement>("[data-light]") ?? null
    const nextTilt = reduce.matches ? null : (hit?.closest<HTMLElement>("[data-tilt]") ?? null)
    const cards = nextGroup
      ? [...(nextGroup.classList.contains("glow") ? [nextGroup] : []), ...nextGroup.querySelectorAll<HTMLElement>(".glow")]
      : []
    const rects = cards.map((card) => card.getBoundingClientRect())
    const lightRect = nextLight ? nextLight.getBoundingClientRect() : null
    const tiltRect = nextTilt ? nextTilt.getBoundingClientRect() : null

    group = swap(group, nextGroup)
    cards.forEach((card, i) => {
      card.style.setProperty("--gx", `${Math.round(x - rects[i].left)}px`)
      card.style.setProperty("--gy", `${Math.round(y - rects[i].top)}px`)
    })
    light = swap(light, nextLight)
    if (light && lightRect) {
      light.style.setProperty("--lx", `${Math.round(x - lightRect.left)}px`)
      light.style.setProperty("--ly", `${Math.round(y - lightRect.top)}px`)
    }
    if (tilt && tilt !== nextTilt) {
      tilt.style.setProperty("--px", "0")
      tilt.style.setProperty("--py", "0")
    }
    tilt = swap(tilt, nextTilt)
    if (tilt && tiltRect && tiltRect.width && tiltRect.height) {
      tilt.style.setProperty("--px", (((x - tiltRect.left) / tiltRect.width) * 2 - 1).toFixed(3))
      tilt.style.setProperty("--py", (((y - tiltRect.top) / tiltRect.height) * 2 - 1).toFixed(3))
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
  // #120 : rien pendant le défilement (la lumière n'a pas à suivre la page qui défile) : une seule mise à jour
  // 140 ms après la fin du défilement, si le pointeur est toujours au-dessus de la page.
  let settle = 0
  const scroll = () => {
    if (x < 0) return
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    clearTimeout(settle)
    settle = window.setTimeout(schedule, 140)
  }
  window.addEventListener("pointermove", move, { passive: true })
  document.addEventListener("pointerout", out)
  window.addEventListener("scroll", scroll, { passive: true })
  return () => {
    window.removeEventListener("pointermove", move)
    document.removeEventListener("pointerout", out)
    window.removeEventListener("scroll", scroll)
    clearTimeout(settle)
    cancelAnimationFrame(raf)
  }
}
