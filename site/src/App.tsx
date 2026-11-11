import { useEffect, useRef, useState, type ReactNode } from "react"
import { CommandPalette } from "./components/CommandPalette"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { Announcement } from "./components/Announcement"
import { Home } from "./pages/Home"
import { SpacePage } from "./pages/SpacePage"
import { SpacesIndex } from "./pages/SpacesIndex"
import { Pricing } from "./pages/Pricing"
import { Download } from "./pages/Download"
import { News } from "./pages/News"
import { Licence } from "./pages/Licence"
import { NotFound } from "./pages/NotFound"
import { spaceBySlug } from "./data/spaces"
import { installGlow } from "./lib/glow"
import { installDepth } from "./lib/depth"
import { captureFromUrl } from "./lib/referral"
import { loadRemote } from "./lib/remote"
import { installLinks, scrollToId, useRoute, type Route } from "./router"
import { headFor, SITE_URL } from "./seo"

function page(route: Route): { key: string; node: ReactNode } {
  const [a, b] = route.parts
  if (!a) return { key: "accueil", node: <Home /> }
  if (a === "espaces" && !b) return { key: "espaces", node: <SpacesIndex /> }
  if (a === "espaces" && b) {
    const space = spaceBySlug(b)
    if (space) return { key: `espace-${space.slug}`, node: <SpacePage space={space} /> }
  }
  if (a === "tarifs") return { key: "tarifs", node: <Pricing /> }
  if (a === "telecharger") return { key: "telecharger", node: <Download /> }
  // NEXORA #076 : licence (compte, clé, appareils, abonnement) et vérification publique d'une clé.
  if (a === "licence") return { key: "licence", node: <Licence query={route.query} /> }
  if (a === "nouveautes") return { key: "nouveautes", node: <News /> }
  return { key: "introuvable", node: <NotFound /> }
}

export function App() {
  const route = useRoute()
  const current = page(route)
  const main = useRef<HTMLElement>(null)
  const first = useRef(true)
  const [palette, setPalette] = useState(false)

  // Lumière qui suit la souris sur les cartes, les grilles et les captures (#069).
  useEffect(() => installGlow(), [])
  // Profondeur liée au défilement des scènes en 3D (#074).
  useEffect(() => installDepth(), [])
  // NEXORA #090 : lien d'un parrain (?parrain=CODE), gardé le temps réglé dans le back office.
  useEffect(() => {
    captureFromUrl(() => loadRemote().then((r) => r.referral.cookie_days))
  }, [])

  // Ctrl K (ou Cmd K) ouvre la recherche, comme dans NEXORA.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPalette((v) => !v)
      }
    }
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [])

  // NEXORA #096 : liens internes sans rechargement (adresses réelles, History API).
  useEffect(() => installLinks(), [])

  useEffect(() => {
    applyHead(route.path)
    // Section demandée dans l'adresse (#/tarifs/comparatif) : on y va après l'affichage, sinon en haut de page.
    // #096 : ancre dans l'adresse (« /#faq ») au premier affichage.
    const anchor = first.current && location.hash.length > 1 && !location.hash.includes("=") ? decodeURIComponent(location.hash.slice(1)) : undefined
    const target = route.parts[0] === "tarifs" || route.parts[0] === "licence" ? route.parts[1] : anchor
    // #074 : sans section, retour en haut tout de suite, avant que la transition 3D ne saisisse la nouvelle page.
    if (!target) {
      window.scrollTo({ top: 0 })
      first.current = false
      return
    }
    const t = window.setTimeout(() => {
      if (!scrollToId(target, !first.current)) window.scrollTo({ top: 0 })
      first.current = false
    }, 30)
    return () => window.clearTimeout(t)
  }, [route.path])

  return (
    <>
      <button type="button" className="skip" onClick={() => main.current?.focus()}>
        Aller au contenu
      </button>
      <Announcement home={route.parts.length === 0} />
      <Header route={route} onSearch={() => setPalette(true)} />
      <main ref={main} id="contenu" className="page-in" tabIndex={-1} key={current.key}>
        {current.node}
      </main>
      <Footer />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </>
  )
}

/** NEXORA #096 : titre, description, adresse canonique, consigne aux robots et partage mis à jour à chaque navigation. */
function applyHead(path: string) {
  const h = headFor(path)
  document.title = h.title
  const meta = (attr: "name" | "property", key: string, value: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    if (!el) {
      el = document.createElement("meta")
      el.setAttribute(attr, key)
      document.head.appendChild(el)
    }
    el.content = value
  }
  meta("name", "description", h.description)
  meta("name", "robots", h.robots)
  meta("property", "og:title", h.title)
  meta("property", "og:description", h.description)
  meta("property", "og:url", h.canonical)
  meta("property", "og:type", h.ogType)
  meta("name", "twitter:title", h.title)
  meta("name", "twitter:description", h.description)
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!link) {
    link = document.createElement("link")
    link.rel = "canonical"
    document.head.appendChild(link)
  }
  link.href = h.canonical.startsWith(SITE_URL) ? h.canonical : `${SITE_URL}${path}`
}
