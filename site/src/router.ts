// NEXORA #096 : routage par adresses réelles (/tarifs, /espaces/dev…) au lieu des routes après # (#060 à #095).
// Chaque page existe aussi en HTML pré-généré (scripts/build-web.mjs, entry-server.tsx) : un robot reçoit le contenu
// de la page demandée, et l'application reprend la main dans le navigateur (History API, transitions de page).
//   BASE      "" en production (site à la racine du domaine) ; "/site" dans l'aperçu Figma Make quand la page est
//             ouverte sous /site/ (captures).
//   Anciennes adresses « #/tarifs » (liens de l'application Windows, du lanceur, e-mails) : converties au démarrage
//   (migrateHashRoute). Celles de NEXORA web (#/share/…, #/invite/…, #/revue/…, jetons de connexion) partent vers
//   /studio/.
// #074 : transitions de page par l'API View Transitions (sens html[data-vt=next|back]), aucune entre /tarifs et
// /tarifs/comparatif ni avec « Réduire les animations ».
import { useSyncExternalStore } from "react"
import { flushSync } from "react-dom"

export type Route = { path: string; parts: string[]; query: string }

const HAS_DOM = typeof window !== "undefined" && typeof location !== "undefined"
export const BASE = HAS_DOM && /^\/site(\/|$)/.test(location.pathname) ? "/site" : ""
/** Adresse publique de NEXORA web (logiciel dans le navigateur). */
export const STUDIO_PATH = "/studio/"
/** Préfixes servis par d'autres applications du même domaine : jamais interceptés par le site. */
const FOREIGN = /^\/(studio|admin|referral|status|site\/assets|__supabase-api|license|pay|security|hb|hook|rum)(\/|$)|\.[a-z0-9]{2,5}$/i

/** Chemin normalisé : sans BASE, sans « .html », sans barre finale (sauf la racine). */
export function normalizePath(pathname: string): string {
  let p = pathname
  if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length)
  p = p.replace(/\/index\.html$/, "/").replace(/\.html$/, "")
  if (p.length > 1) p = p.replace(/\/+$/, "")
  return p || "/"
}

function make(path: string, query: string): Route {
  return { path, parts: path.split("/").filter(Boolean), query }
}

let ssrRoute: Route = make("/", "")
/** Rendu côté serveur (pré-génération) : page à rendre. */
export function setServerPath(path: string) {
  ssrRoute = make(normalizePath(path), "")
}

let snapshot: Route = HAS_DOM ? make(normalizePath(location.pathname), location.search.slice(1)) : ssrRoute
const listeners = new Set<() => void>()
function emit() {
  snapshot = make(normalizePath(location.pathname), location.search.slice(1))
  listeners.forEach((l) => l())
}
// Ancienne adresse « #/… » saisie ou cliquée pendant la visite : convertie, puis la page change.
function onHash() {
  if (location.hash.startsWith("#/") && !migrateHashRoute()) emit()
}
function subscribe(l: () => void) {
  listeners.add(l)
  if (listeners.size === 1) {
    window.addEventListener("popstate", emit)
    window.addEventListener("hashchange", onHash)
  }
  return () => {
    listeners.delete(l)
    if (!listeners.size) {
      window.removeEventListener("popstate", emit)
      window.removeEventListener("hashchange", onHash)
    }
  }
}

export function useRoute(): Route {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    // Hydratation : la page pré-générée a été rendue pour l'adresse affichée, donc la même route côté navigateur.
    () => (HAS_DOM ? snapshot : ssrRoute),
  )
}

/** Lien interne : chemin du site (« /tarifs »). Dans l'aperçu sous /site/, le préfixe est ajouté à la navigation. */
export const to = (path: string) => path

const depth = (p: string) => p.split("/").filter(Boolean).length
const quiet = (a: string, b: string) => a.startsWith("/tarifs") && b.startsWith("/tarifs")

/** Navigation interne (History API), avec la transition de page du #074. */
export function navigate(href: string, { replace = false } = {}) {
  const url = new URL(href, location.origin)
  const prev = snapshot.path
  const next = normalizePath(url.pathname)
  const apply = () => {
    const target = `${BASE}${url.pathname}${url.search}${url.hash}`
    if (replace) history.replaceState(null, "", target)
    else history.pushState(null, "", target)
    emit()
  }
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
  if (!doc.startViewTransition || reduce || prev === next || quiet(prev, next)) {
    apply()
    return
  }
  const root = document.documentElement
  root.dataset.vt = depth(next) >= depth(prev) ? "next" : "back"
  const t = doc.startViewTransition(() => flushSync(apply))
  t.finished.finally(() => delete root.dataset.vt)
}

/** Fait défiler jusqu'à un élément de la page ; faux s'il n'existe pas. */
export function scrollToId(id: string, smooth = true) {
  const el = document.getElementById(id)
  if (!el) return false
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
  el.scrollIntoView({ behavior: smooth && !reduce ? "smooth" : "auto", block: "start" })
  return true
}

/** Clics sur les liens internes (« /… ») : navigation sans rechargement. Les autres applications du domaine et les fichiers gardent un vrai lien. */
export function installLinks(): () => void {
  const on = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.("a")
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return
    const href = a.getAttribute("href")
    if (!href || !href.startsWith("/") || href.startsWith("//")) return
    const url = new URL(href, location.origin)
    if (FOREIGN.test(url.pathname)) return
    e.preventDefault()
    if (normalizePath(url.pathname) === snapshot.path && url.hash) {
      history.replaceState(null, "", `${BASE}${url.pathname}${url.search}${url.hash}`)
      scrollToId(decodeURIComponent(url.hash.slice(1)))
      return
    }
    navigate(href)
  }
  document.addEventListener("click", on)
  return () => document.removeEventListener("click", on)
}

/**
 * Anciennes adresses après # : « #/tarifs » devient « /tarifs » (sans rechargement) ; celles de NEXORA web partent vers
 * /studio/. Vrai si la page est redirigée (rien à afficher).
 */
export function migrateHashRoute(): boolean {
  const h = location.hash
  if (!h) return false
  const path = normalizePath(location.pathname)
  const studio = /^#\/(share|invite|revue)\//.test(h) || (path === "/" && /(^#|[#&])(access_token|error_description|error)=/.test(h) && !h.startsWith("#/"))
  if (studio && !BASE) {
    location.replace(`${STUDIO_PATH}${h}`)
    return true
  }
  if (h.startsWith("#/")) {
    const rest = h.slice(1)
    const i = rest.search(/[?#]/)
    const p = i < 0 ? rest : rest.slice(0, i)
    const tail = i < 0 ? "" : rest.slice(i)
    const search = tail.startsWith("?") ? tail.split("#")[0] : ""
    const hash = tail.includes("#") ? `#${tail.split("#").slice(1).join("#")}` : ""
    history.replaceState(null, "", `${BASE}${p === "/" ? "/" : p}${search || location.search}${hash}`)
    snapshot = make(normalizePath(location.pathname), location.search.slice(1))
  }
  return false
}
