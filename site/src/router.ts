// Routes après # (comme le back office) : le site fonctionne sur tout hébergement statique, sans réécriture.
// #070 : chaque changement de page passe par une transition de page (`lib/transitions.ts`).
import { useEffect, useState } from "react"
import { withPageTransition } from "./lib/transitions"

export type Route = { path: string; parts: string[] }

function parse(): Route {
  let raw = location.hash.replace(/^#/, "")
  try {
    raw = decodeURIComponent(raw)
  } catch {
    /* adresse mal formée : gardée telle quelle */
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`
  return { path, parts: path.split("/").filter(Boolean) }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => {
      const next = parse()
      withPageTransition(() => setRoute(next))
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
