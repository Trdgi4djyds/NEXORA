// Petites animations des cartes d'espaces (accueil du site et page « Espaces ») : dessinées en CSS, à plat,
// à la couleur de l'espace ; elles s'arrêtent hors de l'écran.
import { useRef, type ComponentType, type CSSProperties } from "react"
import { SPACES, type SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { useInView } from "../lib/motion"
import { logo } from "./Brand"

const v = (n: number): CSSProperties => ({ "--i": n }) as CSSProperties

function Skeleton() {
  return (
    <span className="mk-sk">
      <i className="b" />
      <i />
      <i className="s" />
      <i className="c" />
      <i className="c" />
    </span>
  )
}

function MiniResponsive() {
  return (
    <div className="mk-resp">
      {(["phone", "fold", "tablet", "laptop", "tv"] as const).map((k, i) => (
        <span key={k} className={`mk-dev mk-${k}`} style={v(i)}>
          <span className="mk-scr">
            <Skeleton />
          </span>
        </span>
      ))}
    </div>
  )
}

function MiniDev() {
  const lines: [number, number, string][] = [
    [0, 46, "k"],
    [1, 30, "g"],
    [2, 64, "t"],
    [2, 52, "s"],
    [2, 40, "t"],
    [1, 22, "g"],
  ]
  return (
    <div className="mk-dev-ed">
      <div className="mk-ed-bar">
        <i />
        <i />
        <i />
        <span>Accueil.jsx</span>
      </div>
      <div className="mk-code">
        {lines.map(([indent, w, k], i) => (
          <span key={i} className="mk-line" style={{ ...v(i), paddingLeft: indent * 14 }}>
            <i className={`mk-tok t-${k}`} style={{ width: `${w}%` }} />
          </span>
        ))}
      </div>
      <div className="mk-term">
        <span className="mk-ps">&gt;</span> pnpm dev
        <span className="mk-ok">
          <Icon name="check" size={11} stroke={3} /> Serveur prêt
        </span>
      </div>
    </div>
  )
}

function MiniApp() {
  return (
    <div className="mk-app">
      <span className="mk-phone">
        <span className="mk-scr">
          <i className="mk-app-top" />
          <i className="mk-app-hero" />
          <i className="mk-app-l" />
          <i className="mk-app-l s" />
          <span className="mk-app-row">
            <i />
            <i />
            <i />
          </span>
          <span className="mk-app-push">
            <i />
            Kora · −20 % ce matin
          </span>
        </span>
      </span>
      <span className="mk-build">
        <span className="mk-ring">
          <b>APK</b>
          <Icon name="check" size={20} stroke={3} className="mk-ring-ok" />
        </span>
        <small>Construction de l’application</small>
      </span>
    </div>
  )
}

function MiniDesktop() {
  return (
    <div className="mk-desk">
      <span className="mk-mon">
        <span className="mk-scr">
          <span className="mk-setup">
            <i className="mk-setup-t" />
            <span className="mk-bar">
              <i />
            </span>
          </span>
          <span className="mk-win">
            <i className="mk-win-bar" />
            <Skeleton />
          </span>
          <span className="mk-task">
            <i />
            <i />
            <i className="k" />
          </span>
        </span>
      </span>
      <span className="mk-stand" />
    </div>
  )
}

function MiniBrowser() {
  const rows: [number, number][] = [
    [0, 22],
    [18, 14],
    [22, 30],
    [28, 20],
    [44, 24],
    [52, 12],
  ]
  return (
    <div className="mk-browser">
      <div className="mk-br-bar">
        <i />
        <span />
      </div>
      <div className="mk-fall">
        {rows.map(([s, w], i) => (
          <span key={i} className="mk-fall-row">
            <em />
            <i style={{ ...v(i), left: `${s}%`, width: `${w}%` }} />
          </span>
        ))}
      </div>
      <span className="mk-score">
        <b>98</b>
        Performance
      </span>
    </div>
  )
}

function MiniStudio() {
  return (
    <div className="mk-studio">
      <span className="mk-floor" />
      <span className="mk-pod">
        <i className="side" />
        <i className="top" />
      </span>
      <span className="mk-3d">
        <span className="mk-3d-phone">
          <i className="f" />
          <i className="b" />
          <i className="l" />
          <i className="r" />
        </span>
      </span>
      <span className="mk-tl">
        <i className="mk-tl-head" />
      </span>
    </div>
  )
}

function MiniDesign() {
  return (
    <div className="mk-design">
      <span className="mk-board">
        <i className="mk-d-title" />
        <i className="mk-d-title s" />
        <i className="mk-d-img" />
        <i className="mk-d-btn" />
        <span className="mk-sel">
          <i />
          <i />
          <i />
          <i />
        </span>
      </span>
      <span className="mk-swatches">
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}

function MiniSecurity() {
  return (
    <div className="mk-sec">
      <span className="mk-sec-ring">
        <b>92</b>
        <small>sur 100</small>
      </span>
      <span className="mk-up">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={v(i)} className={i === 9 ? "w" : ""} />
        ))}
      </span>
    </div>
  )
}

/** Schéma de l'Accueil : un projet au centre, relié aux 8 autres espaces. */
function MiniHub() {
  const others = SPACES.filter((s) => s.id !== "home")
  const pos = others.map((_, i) => {
    const a = Math.PI * (1.08 + (0.84 * i) / (others.length - 1))
    return { x: 300 + Math.cos(a) * 255, y: 214 + Math.sin(a) * 170 }
  })
  return (
    <div className="mk-hub">
      <svg viewBox="0 0 600 240" aria-hidden="true">
        {pos.map((p, i) => (
          <g key={i} data-space={others[i].id}>
            <path className="mk-hub-line" d={`M300 196 Q ${p.x} 196 ${p.x} ${p.y + 22}`} />
            <path className="mk-hub-flow" d={`M300 196 Q ${p.x} 196 ${p.x} ${p.y + 22}`} style={v(i)} />
          </g>
        ))}
      </svg>
      {others.map((s, i) => (
        <span key={s.id} className="mk-hub-node" data-space={s.id} style={{ ...v(i), left: `${(pos[i].x / 600) * 100}%`, top: `${(pos[i].y / 240) * 100}%` }}>
          <span className="sp-ic solid sm">
            <Icon name={s.icon} size={15} />
          </span>
          <small>{s.rail}</small>
        </span>
      ))}
      <span className="mk-hub-core">
        <img src={logo} alt="" />
        <b>Projet Kora</b>
      </span>
    </div>
  )
}

const MINIS: Record<SpaceId, ComponentType> = {
  home: MiniHub,
  preview: MiniResponsive,
  browser: MiniBrowser,
  dev: MiniDev,
  android: MiniApp,
  studio: MiniStudio,
  design: MiniDesign,
  security: MiniSecurity,
  desktop: MiniDesktop,
}

export function Mini({ id }: { id: SpaceId }) {
  const ref = useRef<HTMLDivElement>(null)
  const run = useInView(ref, { margin: "60px 0px" })
  const Art = MINIS[id]
  return (
    <div className="mini" ref={ref} data-run={run ? "1" : "0"} aria-hidden="true">
      <Art />
    </div>
  )
}
