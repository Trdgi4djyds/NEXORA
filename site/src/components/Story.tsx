import { useEffect, useRef, useState } from "react"
import { STORY } from "../data/content"
import { SPACE_BY_ID, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { useMedia } from "../lib/motion"
import { Screen, Screens } from "./Screen"
import { SectionHead } from "./SectionHead"

/**
 * Récit « De l'idée à la publication » : les étapes défilent à gauche, la fenêtre de NEXORA reste à l'écran à
 * droite et passe à l'espace de l'étape lue. Sur petit écran, chaque étape a sa propre fenêtre.
 * #069 : tête lumineuse sur la frise, halo de la couleur de l'étape et reflet qui suit la souris.
 */
export function Story() {
  const [active, setActive] = useState(0)
  const steps = useRef<(HTMLLIElement | null)[]>([])
  const narrow = useMedia("(max-width: 959px)")

  useEffect(() => {
    if (narrow) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i))
      },
      { rootMargin: "-45% 0px -45% 0px" },
    )
    steps.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [narrow])

  const step = STORY[active]
  return (
    <section className="section story" id="parcours" data-capture="parcours">
      <div className="container">
        <SectionHead
          index="02"
          eyebrow="De l’idée à la publication"
          title={["Du premier écran", "au logiciel installé."]}
          lead="Conçois, code, teste, sécurise, publie et présente sans changer d’outil : chaque espace reprend là où le précédent s’est arrêté."
        />
      </div>
      <div className="container wide">
        <div className="story-grid">
          <ol className="story-steps">
            {!narrow && (
              <li className="story-rail" aria-hidden="true" data-space={step.space}>
                <i style={{ transform: `scaleY(${(active + 1) / STORY.length})` }} />
                <b className="story-head" style={{ top: `${((active + 1) / STORY.length) * 100}%` }} />
              </li>
            )}
            {STORY.map((s, i) => {
              const sp = SPACE_BY_ID[s.space]
              return (
                <li
                  key={s.space}
                  ref={(el) => {
                    steps.current[i] = el
                  }}
                  data-i={i}
                  data-space={s.space}
                  className={`story-step${i === active || narrow ? " on" : ""}`}
                >
                  <span className="story-num">{String(i + 1).padStart(2, "0")}</span>
                  <div className="story-body">
                    <span className="story-kicker">
                      <span className="sp-ic sm">
                        <Icon name={sp.icon} size={15} />
                      </span>
                      {s.verb} · {sp.name}
                    </span>
                    <h3 className="h-3">{s.title}</h3>
                    <p>{s.text}</p>
                    <ul className="story-points">
                      {s.points.map((p) => (
                        <li key={p}>
                          <Icon name="check" size={14} stroke={2.4} />
                          {p}
                        </li>
                      ))}
                    </ul>
                    <a className="link-arrow" href={spaceHref(sp)}>
                      Découvrir {sp.name} <Icon name="nxArrowRight" size={15} stroke={2} />
                    </a>
                    {narrow && (
                      <div className="story-mobile">
                        <div className="frame">
                          <Screen space={s.space} />
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          {!narrow && (
            <div className="story-visual">
              <div className="story-sticky" data-space={step.space}>
                <div className="story-plate" data-light data-tilt>
                  <div className="frame">
                    <Screens spaces={STORY.map((s) => s.space)} current={step.space} />
                    <i className="glare-spot" aria-hidden="true" />
                  </div>
                </div>
                <div className="story-dots" aria-hidden="true">
                  {STORY.map((s, i) => (
                    <i key={s.space} data-space={s.space} className={i === active ? "on" : ""} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
