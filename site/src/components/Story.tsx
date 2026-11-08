import { useEffect, useRef, useState } from "react"
import { STORY } from "../data/content"
import { SPACE_BY_ID, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { useMedia } from "../lib/motion"
import { cn } from "../lib/utils"
import { Screen, Screens, Window } from "./Screen"
import { SectionHead } from "./SectionHead"

/**
 * Récit « De l'idée à la publication » : les étapes défilent à gauche, la fenêtre de NEXORA reste à l'écran à
 * droite (de face, #086) et passe à l'espace de l'étape lue. Sur petit écran, chaque étape a sa
 * propre fenêtre.
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
    <section className="section light" id="parcours" data-capture="parcours">
      <div className="wrap">
        <SectionHead
          index="03"
          eyebrow="De l’idée à la publication"
          title={["Du premier écran", "au logiciel installé."]}
          lead="Conçois, code, teste, sécurise, publie et présente sans changer d’outil : chaque espace reprend là où le précédent s’est arrêté."
        />
      </div>
      <div className="wrap-wide">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <ol className="relative">
            {!narrow && (
              <li className="story-rail" aria-hidden="true">
                <i style={{ transform: `scaleY(${(active + 1) / STORY.length})` }} />
              </li>
            )}
            {STORY.map((s, i) => {
              const sp = SPACE_BY_ID[s.space]
              const on = i === active || narrow
              return (
                <li
                  key={s.space}
                  ref={(el) => {
                    steps.current[i] = el
                  }}
                  data-i={i}
                  className={cn("relative grid grid-cols-[40px_1fr] gap-5 py-10 transition-opacity duration-500 lg:min-h-[52vh] lg:py-14", on ? "opacity-100" : "opacity-35")}
                >
                  <span className={cn("relative z-[1] grid size-10 place-items-center rounded-full border text-[13px] font-semibold tabular-nums transition-all duration-500", on ? "border-primary bg-primary text-primary-foreground" : "border-foreground/15 bg-background text-muted-foreground")}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <span className="eyebrow bare" data-space={s.space}>
                      <span className="sp-ic sm solid">
                        <Icon name={sp.icon} size={14} />
                      </span>
                      {s.verb} · {sp.name}
                    </span>
                    <h3 className="display mt-4 text-[clamp(28px,2.6vw,40px)] leading-[0.98] font-bold tracking-[-0.035em]">{s.title}</h3>
                    <p className="mt-3 max-w-[48ch] text-[15.5px] leading-relaxed text-muted-foreground">{s.text}</p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {s.points.map((p) => (
                        <li key={p} className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1 text-[13px] text-foreground/85">
                          <Icon name="check" size={13} stroke={2.6} className="text-primary" />
                          {p}
                        </li>
                      ))}
                    </ul>
                    <a className="link-arrow mt-6" href={spaceHref(sp)}>
                      Découvrir {sp.name} <Icon name="nxArrowRight" size={15} stroke={2} />
                    </a>
                    {narrow && (
                      <div className="mt-8">
                        <Window compact>
                          <Screen space={s.space} />
                        </Window>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          {!narrow && (
            <div className="relative">
              <div className="sticky top-[calc(50vh-280px)]">
                <Window title={`NEXORA — ${SPACE_BY_ID[step.space].name}`}>
                  <Screens spaces={STORY.map((s) => s.space)} current={step.space} />
                </Window>
                <div className="mt-6 flex justify-center gap-2" aria-hidden="true">
                  {STORY.map((s, i) => (
                    <i key={s.space} className={cn("h-1.5 rounded-full transition-all duration-500", i === active ? "w-8 bg-primary" : "w-1.5 bg-foreground/20")} />
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
