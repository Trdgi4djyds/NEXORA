// Routes après # (comme le back office) : le site fonctionne sur tout hébergement statique, sans réécriture.
import { useEffect, useState } from "react"
import { flushSync } from "react-dom"

export type Route = { path: string; parts: string[]; query: string }

function parse(): Route {
  let raw = location.hash.replace(/^#/, "")
  // NEXORA #076 : retour d'un lien de confirmation du compte (jetons ajoutés après #) : page « Ma licence ».
  if (/access_token=|error_description=/.test(raw)) return { path: "/licence", parts: ["licence"], query: "" }
  // NEXORA #076 : paramètres après « ? » (#/licence?paiement=ok), hors du chemin.
  const q = raw.indexOf("?")
  const query = q >= 0 ? raw.slice(q + 1) : ""
  if (q >= 0) raw = raw.slice(0, q)
  try {
    raw = decodeURIComponent(raw)
  } catch {
    /* adresse mal formée : gardée telle quelle */
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`
  return { path, parts: path.split("/").filter(Boolean), query }
}

/** Page affichée (#/tarifs et #/tarifs/comparatif sont la même page : pas de transition entre elles). */
const pageOf = (r: Route) => (r.parts[0] === "espaces" ? r.parts.slice(0, 2).join("/") : r.parts[0] || "")

type VTDocument = Document & { startViewTransition?: (update: () => void) => unknown }

/**
 * NEXORA #074 : transition de page en 3D. L'ancienne page pivote et recule, la nouvelle arrive de l'autre côté
 * (API View Transitions, keyframes `vt-out` / `vt-in` de prisme.css) ; l'en-tête reste en place. Sans l'API,
 * la page entre seule en 3D (`.page-in`) ; rien avec « Réduire les animations ».
 */
function transition(update: () => void, from: Route, to: Route) {
  const doc = document as VTDocument
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  if (!doc.startViewTransition || reduce || pageOf(from) === pageOf(to)) return update()
  // Sens du pivot : vers l'avant quand on va plus loin dans le site, vers l'arrière quand on revient à l'accueil.
  document.documentElement.dataset.vt = to.parts.length >= from.parts.length && to.parts.length ? "next" : "back"
  doc.startViewTransition(() => flushSync(update))
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    let current = parse()
    const on = () => {
      const next = parse()
      const prev = current
      current = next
      transition(() => setRoute(next), prev, next)
    }
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return route
}

export const to = (path: string) => `#${path}`

/** Fait défiler jusqu'à un élément de la page en tenant compte de l'en-tête fixe. */
export function scrollToId(id: string, smooth = true) {
  const el = document.getElementById(id)
  if (!el) return false
  const top = el.getBoundingClientRect().top + window.scrollY - 84
  window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" })
  return true
}
