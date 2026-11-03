// Coquille du back office : navigation, en-tête et routes (#/section/paramètre).
import { createContext, useContext, useEffect, useState, type ComponentType, type ReactNode } from "react"
import { useMe } from "./auth"
import { Icon } from "./icons"
import { sb } from "./supabase"
import { Avatar, ROLE_LABEL } from "./ui"
import logo from "../../nexora/app/renderer/logo.png"
import { Overview } from "./sections/Overview"
import { Users } from "./sections/Users"
import { Orgs } from "./sections/Orgs"
import { Devices } from "./sections/Devices"
import { Invitations } from "./sections/Invitations"
import { Content } from "./sections/Content"
import { Files } from "./sections/Files"
import { Monitors } from "./sections/Monitors"
import { Scans } from "./sections/Scans"
import { Support } from "./sections/Support"
import { Announcements } from "./sections/Announcements"
import { Plans } from "./sections/Plans"
import { Flags } from "./sections/Flags"
import { Config } from "./sections/Config"
import { Audit } from "./sections/Audit"
import { SupabaseSetup } from "./sections/SupabaseSetup"

export type SectionProps = { param?: string }
type Section = {
  id: string
  label: string
  icon: string
  desc: string
  group: string
  view: ComponentType<SectionProps>
  superOnly?: boolean
}

export const SECTIONS: Section[] = [
  { id: "overview", label: "Vue d’ensemble", icon: "grid", group: "Pilotage", view: Overview, desc: "L’activité de NEXORA en un coup d’œil." },
  { id: "users", label: "Utilisateurs", icon: "user", group: "Clients", view: Users, desc: "Comptes, rôles, accès et sécurité." },
  { id: "orgs", label: "Équipes et offres", icon: "group", group: "Clients", view: Orgs, desc: "Espaces, membres et abonnements." },
  { id: "devices", label: "Appareils", icon: "laptop", group: "Clients", view: Devices, desc: "Postes Windows et navigateurs connectés." },
  { id: "invitations", label: "Invitations", icon: "mail", group: "Clients", view: Invitations, desc: "Invitations envoyées aux équipes." },
  { id: "content", label: "Contenus", icon: "layers", group: "Contenus", view: Content, desc: "Projets, designs, Studio, planches, partages et commentaires." },
  { id: "files", label: "Fichiers", icon: "folder", group: "Contenus", view: Files, desc: "Fichiers stockés par les espaces." },
  { id: "monitors", label: "Supervision", icon: "sync", group: "Contenus", view: Monitors, desc: "Sites surveillés et disponibilité." },
  { id: "scans", label: "Audits de sécurité", icon: "shield", group: "Contenus", view: Scans, desc: "Résultats des audits lancés depuis NEXORA." },
  { id: "support", label: "Support", icon: "chat", group: "Relation client", view: Support, desc: "Tickets et conversations avec les utilisateurs." },
  { id: "announce", label: "Annonces et messages", icon: "bell", group: "Relation client", view: Announcements, desc: "Bandeaux d’annonce et messages dans le centre de notifications." },
  { id: "plans", label: "Offres", icon: "star", group: "Produit", view: Plans, desc: "Prix, limites et avantages des offres." },
  { id: "flags", label: "Fonctionnalités", icon: "wand", group: "Produit", view: Flags, desc: "Activation et déploiement progressif des espaces." },
  { id: "config", label: "Configuration", icon: "wrench", group: "Produit", view: Config, desc: "Réglages globaux de l’application." },
  { id: "audit", label: "Journal d’audit", icon: "audit", group: "Système", view: Audit, desc: "Toutes les modifications enregistrées par la base." },
  { id: "supabase", label: "Supabase", icon: "cloud", group: "Système", view: SupabaseSetup, superOnly: true, desc: "Configuration du projet Supabase : authentification, fonctions, base de données." },
]

/* ---------------------------------------------------------------- Routes */

function readHash() {
  const [, id = "overview", ...rest] = location.hash.replace(/^#/, "").split("/")
  return { id: id || "overview", param: rest.length ? decodeURIComponent(rest.join("/")) : undefined }
}
export function go(id: string, param?: string) {
  location.hash = `#/${id}${param ? `/${encodeURIComponent(param)}` : ""}`
}

type Shell = { refresh: number; openTickets: number; setOpenTickets: (n: number) => void }
const ShellCtx = createContext<Shell>({ refresh: 0, openTickets: 0, setOpenTickets: () => {} })
/** Compteur incrémenté par le bouton « Actualiser » : à mettre dans les dépendances des chargements. */
export const useRefresh = () => useContext(ShellCtx).refresh
export const useShell = () => useContext(ShellCtx)

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"
  document.documentElement.dataset.theme = next
  localStorage.setItem("nexora-admin-theme", next)
}

export function App() {
  const me = useMe()
  const [route, setRoute] = useState(readHash)
  const [refresh, setRefresh] = useState(0)
  const [openTickets, setOpenTickets] = useState(0)
  const [theme, setTheme] = useState(document.documentElement.dataset.theme)

  useEffect(() => {
    const onHash = () => setRoute(readHash())
    addEventListener("hashchange", onHash)
    return () => removeEventListener("hashchange", onHash)
  }, [])

  // Tickets ouverts (pastille du menu), rafraîchis chaque minute.
  useEffect(() => {
    const load = () =>
      sb
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .then(({ count }) => setOpenTickets(count || 0))
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [refresh])

  const visible = SECTIONS.filter((s) => !s.superOnly || me.isSuper)
  const section = visible.find((s) => s.id === route.id) || visible[0]
  const View = section.view
  let lastGroup = ""

  return (
    <ShellCtx.Provider value={{ refresh, openTickets, setOpenTickets }}>
      <div className="shell">
        <nav className="nav" aria-label="Sections">
          <div className="brand">
            <img src={logo} alt="" />
            <div>
              <b>NEXORA</b>
              <small>Administration</small>
            </div>
          </div>
          {visible.map((s) => {
            const head = s.group !== lastGroup ? <div className="nav-group">{s.group}</div> : null
            lastGroup = s.group
            return (
              <NavItem key={s.id} head={head} on={s.id === section.id} s={s} count={s.id === "support" ? openTickets : 0} />
            )
          })}
          <div className="nav-foot">
            <div className="me">
              <Avatar p={me.profile} size={30} />
              <div>
                <b className="ellipsis">{me.profile.full_name || me.profile.email}</b>
                <small>{ROLE_LABEL[me.profile.app_role]}</small>
              </div>
              <button
                className="icon-btn"
                title={theme === "dark" ? "Thème clair" : "Thème sombre"}
                onClick={() => {
                  toggleTheme()
                  setTheme(document.documentElement.dataset.theme)
                }}
              >
                <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
              </button>
              <button className="icon-btn" title="Se déconnecter" onClick={() => sb.auth.signOut()}>
                <Icon name="external" size={15} />
              </button>
            </div>
          </div>
        </nav>
        <main className="main">
          <header className="head">
            <div className="grow" style={{ minWidth: 0 }}>
              <h1>{section.label}</h1>
              <p>{section.desc}</p>
            </div>
            <button className="btn" onClick={() => setRefresh((n) => n + 1)}>
              <Icon name="refreshCw" size={14} />
              Actualiser
            </button>
          </header>
          <div className="body" key={section.id}>
            <View param={route.param} />
          </div>
        </main>
      </div>
    </ShellCtx.Provider>
  )
}

function NavItem({ s, on, count, head }: { s: Section; on: boolean; count: number; head: ReactNode }) {
  return (
    <>
      {head}
      <a href={`#/${s.id}`} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
        <Icon name={s.icon} size={16} />
        <span>{s.label}</span>
        {count > 0 && <em className="count">{count}</em>}
      </a>
    </>
  )
}
