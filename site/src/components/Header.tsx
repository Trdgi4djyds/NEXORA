import { useEffect, useRef, useState } from "react"
import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { APP_VERSION } from "../lib/product"
import { useTheme } from "../lib/theme"
import type { Route } from "../router"
import { Brand } from "./Brand"
import { DownloadButton } from "./Download"

export function Header({ route, onSearch }: { route: Route; onSearch: () => void }) {
  const [mega, setMega] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [menuTop, setMenuTop] = useState(70)
  const [theme, toggleTheme] = useTheme()
  const ref = useRef<HTMLElement>(null)

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
    <header ref={ref} className={`hdr${scrolled || mega || mobile ? " solid" : ""}`}>
      <div className="container wide hdr-in">
        <a href="#/" className="hdr-brand" aria-label="NEXORA, accueil du site">
          <Brand />
        </a>
        <nav className="hdr-nav" aria-label="Navigation principale">
          <button
            type="button"
            className={`nav-link${mega || at === "espaces" ? " on" : ""}`}
            aria-expanded={mega}
            aria-controls="mega-espaces"
            onClick={() => setMega((v) => !v)}
          >
            Espaces
            <Icon name="chevronDown" size={15} stroke={2} className={`nav-chev${mega ? " up" : ""}`} />
          </button>
          <a className={`nav-link${at === "tarifs" ? " on" : ""}`} href="#/tarifs" aria-current={current("tarifs")}>
            Tarifs
          </a>
          <a className={`nav-link${at === "nouveautes" ? " on" : ""}`} href="#/nouveautes" aria-current={current("nouveautes")}>
            Nouveautés
          </a>
          <a className={`nav-link${at === "telecharger" ? " on" : ""}`} href="#/telecharger" aria-current={current("telecharger")}>
            Télécharger
          </a>
        </nav>
        <div className="hdr-actions">
          <button type="button" className="hdr-search" onClick={onSearch} aria-label="Rechercher dans le site (Ctrl K)">
            <Icon name="search" size={16} />
            <span>Rechercher</span>
            <kbd className="kbd">Ctrl K</kbd>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}
            title={theme === "dark" ? "Thème clair" : "Thème sombre"}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
          </button>
          <a className="btn btn-ghost btn-sm hdr-web" href="../">
            Ouvrir NEXORA web
          </a>
          <DownloadButton size="sm" label="Télécharger" className="hdr-dl" />
          <button
            type="button"
            className="icon-btn hdr-burger"
            aria-expanded={mobile}
            aria-controls="menu-mobile"
            aria-label={mobile ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setMobile((v) => !v)}
          >
            <Icon name={mobile ? "close" : "menu"} size={20} />
          </button>
        </div>
      </div>

      <i className="hdr-progress" ref={bar} aria-hidden="true" />
      {mega && (
        <div className="mega" id="mega-espaces">
          <div className="container wide">
            <div className="mega-grid">
              {SPACES.map((s, i) => (
                <a key={s.id} href={spaceHref(s)} className="mega-item" data-space={s.id} style={{ animationDelay: `${i * 22}ms` }}>
                  <span className="sp-ic">
                    <Icon name={s.icon} size={19} />
                  </span>
                  <span className="mega-txt">
                    <b>{s.name}</b>
                    <small>{s.subtitle}</small>
                  </span>
                </a>
              ))}
            </div>
            <div className="mega-foot">
              <a href="#/espaces" className="link-arrow">
                Voir les 9 espaces <Icon name="nxArrowRight" size={15} stroke={2} />
              </a>
              <a href="#/nouveautes" className="mega-new">
                <Icon name="sparkle" size={15} /> Nouveautés de la version {APP_VERSION}
              </a>
            </div>
          </div>
        </div>
      )}

      {mobile && (
        <div className="mobile-menu" id="menu-mobile" style={{ top: menuTop }}>
          <div className="container">
            <p className="mobile-label">Espaces</p>
            <div className="mobile-spaces">
              {SPACES.map((s) => (
                <a key={s.id} href={spaceHref(s)} data-space={s.id} className="mobile-space">
                  <span className="sp-ic sm">
                    <Icon name={s.icon} size={16} />
                  </span>
                  {s.name}
                </a>
              ))}
            </div>
            <div className="mobile-links">
              <a href="#/tarifs">Tarifs</a>
              <a href="#/nouveautes">Nouveautés</a>
              <a href="#/telecharger">Télécharger</a>
              <a href="../">Ouvrir NEXORA web</a>
            </div>
            <DownloadButton size="lg" className="mobile-cta" />
          </div>
        </div>
      )}
    </header>
  )
}
