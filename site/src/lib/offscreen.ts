// NEXORA #120 : animations décoratives infinies (colonnes lumineuses du hero, étoile, curseur « Agent IA », bandeau
// de logos, autocollant, aurore, pastilles « en direct ») suspendues tant qu'elles sont hors de l'écran : elles
// étaient recalculées à chaque image, même invisibles, et alourdissaient le défilement. Un seul observateur pour tout
// le site ; l'attribut data-off (et non une classe, que React réécrirait) met l'animation en pause dans le CSS.
const ANIMATED = ".hx-bg, .aurora, .hx-star, .hx-agent, .float, .marquee-track, .glass-sticker, .dot.live, .fs-row i.run"

export function installOffscreen(): () => void {
  if (typeof window === "undefined" || typeof IntersectionObserver !== "function") return () => {}
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement
        if (e.isIntersecting) delete el.dataset.off
        else el.dataset.off = ""
      }
    },
    { rootMargin: "10% 0px" },
  )
  // Les pages changent sans rechargement : les éléments ajoutés sont suivis au fil de l'eau.
  const watched = new WeakSet<Element>()
  const scan = () => {
    document.querySelectorAll<HTMLElement>(ANIMATED).forEach((el) => {
      if (watched.has(el)) return
      watched.add(el)
      io.observe(el)
    })
  }
  const mo = new MutationObserver(scan)
  mo.observe(document.body, { childList: true, subtree: true })
  scan()
  return () => {
    mo.disconnect()
    io.disconnect()
  }
}
