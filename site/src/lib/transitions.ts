// NEXORA #070 : transitions de page du site par l'API View Transitions (Chromium, Safari 18, Firefox 144) :
// l'ancienne page s'efface, la nouvelle monte ; l'en-tête reste en place. Sans l'API, ou avec « Réduire les
// animations », la page change directement (fondu `.page-in` sans l'API).
// L'en-tête n'est nommé que pendant la transition (`html.vt-run`) : un nom permanent en ferait une racine
// d'arrière-plan, et son flou (`.hdr::before`, backdrop-filter) ne verrait plus la page derrière lui.
import { flushSync } from "react-dom"

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

/** Applique `update` (rendu React synchrone) dans une transition de page si le navigateur sait la faire. */
export function withPageTransition(update: () => void) {
  if (typeof document === "undefined" || typeof document.startViewTransition !== "function" || reduced()) {
    update()
    return
  }
  // Dès la première transition, le fondu CSS de la page (.page-in) laisse la main à l'API.
  const root = document.documentElement
  root.classList.add("vt", "vt-run")
  try {
    const t = document.startViewTransition(() => {
      flushSync(update)
      // Nouvelle page saisie en haut (sans cela, la remontée se verrait pendant la transition).
      window.scrollTo(0, 0)
    })
    t.finished.finally(() => root.classList.remove("vt-run"))
  } catch {
    root.classList.remove("vt-run")
    update()
  }
}

// Capture d'une carte d'espace qui devient celle de la page de l'espace (élément partagé `space-shot`).
// Un seul élément porte le nom à la fois : posé au clic sur la carte, repris par la page qui s'affiche juste
// après. Lecture sans effet de bord (React appelle deux fois les initialiseurs en mode strict).
let named: HTMLElement | null = null
let sharedAt = -Infinity

/** Au clic sur une carte d'espace (clic simple, sans touche de modification) : nomme sa capture. */
export function shareShot(el: HTMLElement | null) {
  if (named && named !== el) named.style.removeProperty("view-transition-name")
  named = el
  sharedAt = el ? performance.now() : -Infinity
  el?.style.setProperty("view-transition-name", "space-shot")
}

/** Vrai si la page d'espace qui s'affiche vient d'une carte cliquée (dans la seconde). */
export function cameFromCard() {
  return performance.now() - sharedAt < 1000
}
