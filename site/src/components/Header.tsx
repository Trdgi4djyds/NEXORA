import { useEffect, useRef, useState, type MouseEvent } from "react"
import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { APP_VERSION } from "../lib/product"
import { cn } from "../lib/utils"
import type { Route } from "../router"
import { Brand } from "./Brand"
import { MainButton } from "./Download"

// #099 (« Horizon ») : navigation en pilule de verre au centre, lien de la page ouverte en blanc (.nav-link).
const navLink = "nav-link"

export function Header({ route, onSearch }: { route: Route; onSearch: () => void }) {
  const [mega, setMega] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [menuTop, setMenuTop] = useState(64)
  // Surbrillance qui glisse jusqu'au lien survolé (#069).
  const [hl, setHl] = useState({ x: 0, w: 0, on: false })
  const ref = useRef<HTMLElement>(null)
  const track = (e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget
    setHl({ x: el.offsetLeft, w: el.offsetWidth, on: true })
  }

  useEffect(() => {
    setMega(false)
    setMobile(false)
  }, [route.path])

  // En-tête qui se range quand on descend et revient quand on remonte ; barre de lecture de la page.
  const bar = useRef<HTMLElement>(null)
  const open = useRef(false)
  open.current = mega || mobile
  useEffect(() => {
    let last = window.scrollY
    let raf = 0
    const update = () => {
      raf = 0
      const y = window.scrollY
      setScrolled(y > 8)
      const el = ref.current
      if (el && !open.current && y > 320 && y > last + 2) el.dataset.tucked = ""
      if (el && (open.current || y < last - 2 || y <= 320)) delete el.dataset.tucked
      last = y
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", on, { passive: true })
    window.addEventListener("resize", on)
    return () => {
      window.removeEventListener("scroll", on)
      window.removeEventListener("resize", on)
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    if (!mega && !mobile) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMega(false)
        setMobile(false)
      }
    }
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMega(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onDown)
    }
  }, [mega, mobile])

  useEffect(() => {
    // Le menu mobile commence sous l'en-tête, bandeau d'annonce compris quand il est encore visible.
    if (mobile && ref.current) setMenuTop(Math.max(0, ref.current.getBoundingClientRect().bottom))
    document.body.classList.toggle("menu-open", mobile)
    return () => document.body.classList.remove("menu-open")
  }, [mobile])

  const at = route.parts[0] || ""
  const current = (name: string) => (at === name ? ("page" as const) : undefined)

  return (
    <header ref={ref} className={cn("hdr", (scrolled || mega || mobile) && "solid")}>
      <div className="wrap-wide grid h-[76px] grid-cols-[1fr_auto] items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <a href="/" className="shrink-0 justify-self-start" aria-label="NEXORA, accueil du site">
          <Brand />
        </a>
        <nav className="nav-pill hidden lg:flex" aria-label="Navigation principale" onMouseLeave={() => setHl((h) => ({ ...h, on: false }))}>
          <i className={cn("nav-hl", hl.on && "on")} style={{ transform: `translateX(${hl.x}px)`, width: hl.w }} aria-hidden="true" />
          <a className={navLink} href="/" aria-current={at === "" ? "page" : undefined} onMouseEnter={track}>
            Accueil
          </a>
          <button type="button" className={cn(navLink, (mega || at === "espaces") && "on")} aria-expanded={mega} aria-controls="mega-espaces" onClick={() => setMega((v) => !v)} onMouseEnter={track}>
            Espaces
            <Icon name="chevronDown" size={14} stroke={2} className={cn("transition-transform duration-300", mega && "rotate-180")} />
          </button>
          <a className={navLink} href="/tarifs" aria-current={current("tarifs")} onMouseEnter={track}>
            Tarifs
          </a>
          <a className={navLink} href="/nouveautes" aria-current={current("nouveautes")} onMouseEnter={track}>
            Nouveautés
          </a>
          <a className={navLink} href="/telecharger" aria-current={current("telecharger")} onMouseEnter={track}>
            Télécharger
          </a>
          <a className={navLink} href="/licence" aria-current={current("licence")} onMouseEnter={track}>
            Licence
          </a>
        </nav>
        <div className="flex items-center gap-2.5 justify-self-end">
          <button
            type="button"
            className="hidden size-10 place-items-center rounded-full border border-white/16 bg-white/[0.07] text-white/85 backdrop-blur-md transition hover:bg-white hover:text-black md:grid"
            onClick={onSearch}
            aria-label="Rechercher dans le site (Ctrl K)"
            title="Rechercher (Ctrl K)"
          >
            <Icon name="search" size={16} />
          </button>
          <MainButton size="sm" className="hidden sm:inline-flex" />
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-white/16 bg-white/[0.07] text-white backdrop-blur-md lg:hidden"
            aria-expanded={mobile}
            aria-controls="menu-mobile"
            aria-label={mobile ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setMobile((v) => !v)}
          >
            <Icon name={mobile ? "close" : "menu"} size={19} />
          </button>
        </div>
      </div>

      <i className="hdr-progress" ref={bar} aria-hidden="true" />
      {mega && (
        <div className="mega" id="mega-espaces">
          <div className="wrap-wide py-7">
            <div className="grid grid-cols-3 gap-2">
              {SPACES.map((s, i) => (
                <a key={s.id} href={spaceHref(s)} data-space={s.id} className="mega-item group flex items-center gap-4 rounded-lg border border-transparent p-3.5 transition hover:border-foreground/10 hover:bg-foreground/[0.04]" style={{ animationDelay: `${i * 25}ms` }}>
                  <span className="sp-ic transition group-hover:bg-foreground group-hover:text-background">
                    <Icon name={s.icon} size={19} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <b className="text-[15px] font-semibold text-foreground">{s.name}</b>
                    <small className="truncate text-[13px] text-muted-foreground">{s.subtitle}</small>
                  </span>
                </a>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-foreground/[0.06] pt-5">
              <a href="/espaces" className="link-arrow">
                Voir les 9 espaces <Icon name="nxArrowRight" size={15} stroke={2} />
              </a>
              <a href="/nouveautes" className="inline-flex items-center gap-2 text-[13px] text-muted-foreground transition hover:text-foreground">
                <Icon name="sparkle" size={15} /> Nouveautés de la version {APP_VERSION}
              </a>
            </div>
          </div>
        </div>
      )}

      {mobile && (
        <div className="mobile-menu" id="menu-mobile" style={{ top: menuTop }}>
          <div className="wrap py-6">
            <p className="eyebrow mb-3">Espaces</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {SPACES.map((s) => (
                <a key={s.id} href={spaceHref(s)} data-space={s.id} className="flex items-center gap-3 rounded-lg border border-foreground/[0.08] bg-card px-3 py-2.5 text-[15px] font-medium">
                  <span className="sp-ic sm">
                    <Icon name={s.icon} size={16} />
                  </span>
                  {s.name}
                </a>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2 text-[15px]">
              {[
                ["/tarifs", "Tarifs"],
                ["/nouveautes", "Nouveautés"],
                ["/telecharger", "Télécharger"],
                ["/licence", "Ma licence"],
              ].map(([href, label]) => (
                <a key={href} href={href} className="rounded-xl px-3 py-2.5 text-muted-foreground hover:text-foreground">
                  {label}
                </a>
              ))}
            </div>
            <MainButton size="lg" className="mt-6 w-full" />
          </div>
        </div>
      )}
    </header>
  )
}
