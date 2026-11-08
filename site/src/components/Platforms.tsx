import { useEffect, useRef, useState, type CSSProperties } from "react"
import type { SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal, useInView, useMedia, usePageVisible, useReducedMotion } from "../lib/motion"
import { KORA_DESKTOP } from "../lib/screens"
import { Pixel } from "./Screen"
import { SectionHead } from "./SectionHead"

const PERIOD = 5200

const PLATFORMS: { id: string; space: SpaceId; icon: string; title: string; text: string; points: string[] }[] = [
  {
    id: "web",
    space: "dev",
    icon: "globe",
    title: "Sur le web",
    text: "Partage ton projet par une adresse publique, puis mets-le en ligne chez les principaux hébergeurs, contrôlé sur trois appareils avant chaque publication.",
    points: ["Partage en ligne (Standard)", "Cloudflare, Vercel, Netlify, GitHub Pages (Pro)", "Contrôles avant mise en ligne"],
  },
  {
    id: "android",
    space: "android",
    icon: "android",
    title: "Sur Android",
    text: "Le même site devient une application signée, avec ses notifications push et une fiche prête pour le Play Store.",
    points: ["APK et AAB signés", "Notifications push", "Tests fermés et Play Store"],
  },
  {
    id: "windows",
    space: "desktop",
    icon: "display",
    title: "Sur Windows",
    text: "Et le même site devient un logiciel installable, avec mises à jour automatiques et distribution par winget ou le Microsoft Store.",
    points: ["Installateur, portable, ZIP et MSI", "Mises à jour automatiques", "winget et Microsoft Store"],
  },
]

/**
 * « Un projet, trois plateformes » : le projet Kora publié sur le web, sur Android et sur Windows, en carrousel.
 * #069 : onglets à bordure lumineuse et scène éclairée par le pointeur (`lib/glow.ts`), appareils qui flottent.
 */
export function Platforms() {
  const [active, setActive] = useState(0)
  const [hover, setHover] = useState(false)
  const [round, setRound] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { margin: "-60px 0px" })
  const page = usePageVisible()
  const reduced = useReducedMotion()
  // #072 : sous 960 px, les onglets s'ouvrent en accordéon au-dessus de la scène : l'avance automatique changeait
  // leur hauteur toutes les 5 s et faisait sauter la page. On n'y avance qu'au toucher.
  const narrow = useMedia("(max-width: 959px)")
  const playing = !reduced && !narrow && visible && page && !hover

  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(() => setActive((a) => (a + 1) % PLATFORMS.length), PERIOD)
    return () => window.clearTimeout(id)
  }, [playing, active, round])

  const pick = (i: number) => {
    setActive(i)
    setRound((r) => r + 1)
  }
  return (
    <section className="section platforms" id="plateformes" data-capture="plateformes">
      <div className="container">
        <SectionHead
          index="03"
          eyebrow="Un projet, trois plateformes"
          title={["Publie partout,", "sans tout refaire."]}
          lead="Ton site reste la source. NEXORA en tire une adresse web, une application Android et un logiciel Windows, chacun prêt à distribuer."
        />
      </div>
      <div className="container wide">
        <div className="pf-grid" ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <div className="pf-tabs" role="tablist" aria-label="Plateformes" data-glow>
            {PLATFORMS.map((p, i) => {
              const on = i === active
              return (
                <Reveal key={p.id} delay={i * 90}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls="pf-stage"
                    className={`pf-tab glow${on ? " on" : ""}`}
                    data-space={p.space}
                    onClick={() => pick(i)}
                  >
                    <span className={`sp-ic${on ? " solid" : ""}`}>
                      <Icon name={p.icon} size={19} />
                    </span>
                    <span className="pf-tab-txt">
                      <b>{p.title}</b>
                      <span className="pf-tab-more">
                        <span>
                          <span className="pf-tab-p">{p.text}</span>
                          <span className="pf-points">
                            {p.points.map((t) => (
                              <span key={t}>
                                <Icon name="check" size={13} stroke={2.6} />
                                {t}
                              </span>
                            ))}
                          </span>
                        </span>
                      </span>
                    </span>
                    <i className="pf-tab-bar">
                      <i key={`${active}-${round}`} className={on && playing ? "run" : on ? "full" : ""} style={{ "--t": `${PERIOD}ms` } as CSSProperties} />
                    </i>
                  </button>
                </Reveal>
              )
            })}
          </div>
          <Reveal className="pf-visual" delay={120}>
            <div className="pf-stage" id="pf-stage" role="tabpanel" aria-label={PLATFORMS[active].title} data-light>
              <div className={`pf-v pf-web${active === 0 ? " on" : ""}`}>
                <div className="browser">
                  <div className="browser-bar">
                    <i />
                    <i />
                    <i />
                    {/* #072 : domaine réservé aux exemples (RFC 2606) : Kora est fictive, aucune vraie boutique visée. */}
                    <span>kora.example</span>
                  </div>
                  <img src={KORA_DESKTOP} alt="Kora, boulangerie fictive : site de démonstration dans un navigateur" width={1440} height={900} loading="lazy" />
                </div>
              </div>
              <div className={`pf-v pf-android${active === 1 ? " on" : ""}`}>
                <Pixel />
              </div>
              {/* #072 : Kora en logiciel Windows (fenêtre Windows 11), comme le web et Android montrent Kora, au lieu de
                  l'écran du Desktop Builder qui ne montrait pas le résultat. */}
              <div className={`pf-v pf-windows${active === 2 ? " on" : ""}`}>
                <div className="win-desk">
                <div className="win11">
                  <div className="win11-bar">
                    <span className="win11-app">
                      <i className="win11-ico">k</i>
                      Kora
                    </span>
                    <span className="win11-ctl" aria-hidden="true">
                      <svg viewBox="0 0 10 10" width="10" height="10">
                        <path d="M0 5h10" />
                      </svg>
                      <svg viewBox="0 0 10 10" width="10" height="10">
                        <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" />
                      </svg>
                      <svg viewBox="0 0 10 10" width="10" height="10">
                        <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
                      </svg>
                    </span>
                  </div>
                  <img src={KORA_DESKTOP} alt="Kora, boulangerie fictive, en logiciel Windows" width={1440} height={900} loading="lazy" />
                </div>
                <div className="win-task" aria-hidden="true">
                  <i className="win-start">
                    <b />
                    <b />
                    <b />
                    <b />
                  </i>
                  <i className="win-app on">k</i>
                </div>
                </div>
              </div>
            </div>
            <p className="ai-caption pf-caption">Kora est une boulangerie fictive : un site de démonstration, publié ici sur trois plateformes.</p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
