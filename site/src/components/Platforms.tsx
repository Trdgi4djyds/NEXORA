import { useEffect, useRef, useState, type CSSProperties } from "react"
import type { SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal, useInView, usePageVisible, useReducedMotion } from "../lib/motion"
import { KoraApp, KoraSite } from "../scenes/common"
import { SectionHead } from "./SectionHead"
import { Stage } from "./Stage"

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

const STAGE_W = 760
const STAGE_H = 500

function Frame({ id }: { id: string }) {
  if (id === "android") {
    return (
      <div className="pf-phone">
        <div className="pf-phone-screen">
          <KoraApp />
        </div>
      </div>
    )
  }
  const win = id === "windows"
  return (
    <div className={win ? "pf-win" : "pf-browser"}>
      <div className="pf-bar">
        {win ? (
          <>
            <span className="pf-app">
              <i>k</i>Kora
            </span>
            <span className="pf-ctl">
              <Icon name="minus" size={13} />
              <i className="pf-max" />
              <Icon name="close" size={13} />
            </span>
          </>
        ) : (
          <>
            <span className="pf-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="pf-url">
              <Icon name="lock" size={11} /> kora-boutique.fr
            </span>
          </>
        )}
      </div>
      <div className="pf-view">
        <KoraSite layout="desktop" scroll={false} />
      </div>
      {win && (
        <div className="pf-task">
          <i className="pf-start" />
          <i className="pf-kora">k</i>
          <i />
          <i />
        </div>
      )}
    </div>
  )
}

/** « Un projet, trois plateformes » : le projet Kora publié sur le web, sur Android et sur Windows, en carrousel. */
export function Platforms() {
  const [active, setActive] = useState(0)
  const [hover, setHover] = useState(false)
  const [round, setRound] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { margin: "-60px 0px" })
  const page = usePageVisible()
  const reduced = useReducedMotion()
  const playing = !reduced && visible && page && !hover

  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(() => setActive((a) => (a + 1) % PLATFORMS.length), PERIOD)
    return () => window.clearTimeout(id)
  }, [playing, active, round])

  const pick = (i: number) => {
    setActive(i)
    setRound((r) => r + 1)
  }
  const n = PLATFORMS.length
  return (
    <section className="section alt platforms" id="plateformes" data-capture="plateformes">
      <div className="container wide">
        <SectionHead
          eyebrow="Un projet, trois plateformes"
          title={["Publie partout,", "sans tout refaire."]}
          lead="Ton site reste la source. NEXORA en tire une adresse web, une application Android et un logiciel Windows, chacun prêt à distribuer."
        />
        <div className="pf-grid" ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <div className="pf-tabs" role="tablist" aria-label="Plateformes">
            {PLATFORMS.map((p, i) => {
              const on = i === active
              return (
                <Reveal key={p.id} delay={i * 90}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls="pf-stage"
                    className={`pf-tab${on ? " on" : ""}`}
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
            <div className="pf-plate" id="pf-stage" data-space={PLATFORMS[active].space} role="tabpanel" aria-label={`Kora ${PLATFORMS[active].title.toLowerCase()}`}>
              <Stage width={STAGE_W} height={STAGE_H} className="pf-stage" label="Le projet Kora sur le web, sur Android et sur Windows">
                {() => (
                  <div className="pf-scene">
                    {PLATFORMS.map((p, i) => {
                      const pos = (i - active + n) % n
                      const cls = pos === 0 ? "is-active" : pos === 1 ? "is-next" : "is-prev"
                      return (
                        <div key={p.id} className={`pf-frame pf-${p.id} ${cls}`} aria-hidden={pos !== 0}>
                          <Frame id={p.id} />
                        </div>
                      )
                    })}
                    <span className="pf-source" key={active}>
                      <span className="pf-source-ic">
                        <Icon name="folder" size={14} />
                      </span>
                      kora-boutique
                      <Icon name="nxArrowRight" size={13} stroke={2.2} />
                      <b data-space={PLATFORMS[active].space}>{PLATFORMS[active].title.replace("Sur ", "").replace("le web", "Web")}</b>
                    </span>
                  </div>
                )}
              </Stage>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
