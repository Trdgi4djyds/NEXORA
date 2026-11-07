import { memo, useLayoutEffect, useRef, useState } from "react"
import { SPACES, SPACE_BY_ID, type SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { useCycle } from "../lib/motion"
import { SCENES } from "../scenes"
import { logo } from "./Brand"
import { Stage } from "./Stage"

export const WIN_W = 1200
export const WIN_H = 740

type Point = { x: number; y: number; delay: number; key: string }

/** Position d'un élément dans la fenêtre, en pixels logiques (insensible à la mise à l'échelle). */
function offsetWithin(el: HTMLElement, root: HTMLElement) {
  let x = 0
  let y = 0
  let cur: HTMLElement | null = el
  while (cur && cur !== root) {
    x += cur.offsetLeft
    y += cur.offsetTop
    cur = cur.offsetParent as HTMLElement | null
  }
  return { x, y }
}

/**
 * Fenêtre de NEXORA reproduite en HTML : barre de titre Windows, rail des 9 espaces, barre d'outils et scène
 * animée de l'espace ouvert. `pointer` : un curseur se déplace vers l'espace suivant (`next`) ou vers le bouton
 * que la scène utilise, et clique au bon moment.
 */
// Mémorisée : le minuteur de l'accueil (barres de progression des onglets) ne redessine pas la scène à chaque pas.
export const AppWindow = memo(function AppWindow({
  space,
  cycle = 0,
  pointer = false,
  next = null,
}: {
  space: SpaceId
  cycle?: number
  pointer?: boolean
  next?: SpaceId | null
}) {
  const s = SPACE_BY_ID[space]
  const scene = SCENES[space]
  const Scene = scene.Component
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const rail = useRef<Partial<Record<SpaceId, HTMLDivElement | null>>>({})
  const [pt, setPt] = useState<Point | null>(null)

  useLayoutEffect(() => {
    if (!pointer || !root.current || !stage.current) return
    if (next) {
      const item = rail.current[next]
      if (!item) return
      const p = offsetWithin(item, root.current)
      setPt({ x: p.x + item.offsetWidth / 2 + 4, y: p.y + 20, delay: 760, key: `rail-${next}-${cycle}` })
    } else {
      // Élément que la scène fait « cliquer » (data-pointer), sinon le centre de la zone de contenu.
      const target = stage.current.querySelector<HTMLElement>("[data-pointer]")
      const p = offsetWithin(target ?? stage.current, root.current)
      const w = (target ?? stage.current).offsetWidth
      const h = (target ?? stage.current).offsetHeight
      setPt({ x: p.x + w / 2, y: p.y + h / 2, delay: scene.click, key: `scene-${space}-${cycle}` })
    }
  }, [pointer, next, space, cycle, scene])

  return (
    <div className="nxw" data-space={space} ref={root}>
      <div className="nxw-title">
        <img src={logo} alt="" />
        <span>NEXORA</span>
        <span className="nxw-ctl">
          <i className="min" />
          <i className="max" />
          <i className="cls" />
        </span>
      </div>
      <div className="nxw-body">
        <aside className="nxw-rail">
          <img className="nxw-logo" src={logo} alt="" />
          <div className="nxw-spaces">
            {SPACES.map((sp) => (
              <div
                key={sp.id}
                ref={(el) => {
                  rail.current[sp.id] = el
                }}
                className={`nxw-ri${sp.id === space ? " on" : ""}`}
                data-space={sp.id}
              >
                <span className="nxw-rt">
                  <Icon name={sp.icon} size={16} />
                </span>
                <span className="nxw-rl">{sp.rail}</span>
              </div>
            ))}
          </div>
          <div className="nxw-rfoot">
            {[
              ["plus", "Nouveau"],
              ["sparkle", "IA"],
              ["appearance", "Réglages"],
            ].map(([icon, label]) => (
              <div className="nxw-rf" key={label}>
                <span>
                  <Icon name={icon} size={15} />
                </span>
                {label}
              </div>
            ))}
          </div>
        </aside>
        <div className="nxw-main">
          <div className="nxw-bar">
            <span className="nxw-bar-ic">
              <Icon name={s.icon} size={16} />
            </span>
            <span className="nxw-bar-t" key={space}>
              <b>{s.name}</b>
              <small>{s.subtitle}</small>
            </span>
            <span className="nxw-search">
              <Icon name="search" size={14} />
              Rechercher ou aller à…
              <kbd>Ctrl K</kbd>
            </span>
            <span className="nxw-grow" />
            <span className="nxw-bar-btn">
              <Icon name="sync" size={15} />
            </span>
            <span className="nxw-bar-btn on">
              <Icon name="sidebarRight" size={15} />
            </span>
          </div>
          <div className="nxw-stage" ref={stage}>
            <Scene key={`${space}-${cycle}`} />
          </div>
        </div>
      </div>
      {pointer && pt && (
        <div className="nxw-pointer" style={{ transform: `translate(${pt.x}px, ${pt.y}px)` }}>
          <span className="nxw-click" key={`c-${pt.key}`} style={{ animationDelay: `${pt.delay}ms` }} />
          <svg key={`p-${pt.key}`} viewBox="0 0 24 24" width="24" height="24" style={{ animationDelay: `${pt.delay}ms` }}>
            <path d="M3 2.5l7.6 18.2 2.6-7.4 7.5-2.7z" fill="#15131d" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  )
})

/** Fenêtre qui rejoue la scène d'un espace tant qu'elle est visible (pages des espaces, récit de l'Accueil). */
export function LiveWindow({ space, label, className = "" }: { space: SpaceId; label?: string; className?: string }) {
  return (
    <Stage width={WIN_W} height={WIN_H} className={`win-stage ${className}`} label={label ?? `Aperçu animé de NEXORA : ${SPACE_BY_ID[space].name}`}>
      {(run) => <Looping space={space} run={run} />}
    </Stage>
  )
}

function Looping({ space, run }: { space: SpaceId; run: boolean }) {
  const cycle = useCycle(SCENES[space].duration + 2200, run)
  return <AppWindow space={space} cycle={cycle} />
}
