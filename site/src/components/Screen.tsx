import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { SPACE_BY_ID, type SpaceId } from "../data/spaces"
import { DEVICES, type DeviceKind } from "../lib/devices"
import { cn } from "../lib/utils"
import { SCREEN_H, SCREEN_W, SCREENS } from "../lib/screens"
import { logo } from "./Brand"

/** Capture réelle d'un espace de NEXORA, dans son thème sombre. */
export function Screen({ space, eager = false, className = "" }: { space: SpaceId; eager?: boolean; className?: string }) {
  return (
    <img
      className={cn("shot", className)}
      src={SCREENS[space]}
      width={SCREEN_W}
      height={SCREEN_H}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      alt={`Capture de NEXORA : ${SPACE_BY_ID[space].name}`}
    />
  )
}

/** Captures superposées, une seule visible (fondu au changement). */
export function Screens({ spaces, current, eager = false }: { spaces: SpaceId[]; current: SpaceId; eager?: boolean }) {
  return (
    <div className="shots">
      {spaces.map((id, i) => (
        <Screen key={id} space={id} eager={eager && i === 0} className={id === current ? "on" : ""} />
      ))}
    </div>
  )
}

const ctl = (
  <span className="win-ctl" aria-hidden="true">
    <span>
      <svg viewBox="0 0 10 10" width="10" height="10">
        <path d="M0 5h10" />
      </svg>
    </span>
    <span>
      <svg viewBox="0 0 10 10" width="10" height="10">
        <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" />
      </svg>
    </span>
    <span>
      <svg viewBox="0 0 10 10" width="10" height="10">
        <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
      </svg>
    </span>
  </span>
)

/** Fenêtre Windows 11 : NEXORA est un logiciel Windows, ses captures sont montrées dans sa vraie fenêtre. */
export function Window({ title = "NEXORA", icon = logo, compact = false, className = "", children }: { title?: string; icon?: string | null; compact?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("win", compact && "compact", className)}>
      <div className="win-bar">
        <span className="win-title">
          {icon ? <img src={icon} alt="" /> : <i className="grid size-4 place-items-center rounded bg-primary text-[9px] font-bold not-italic text-primary-foreground">N</i>}
          {title}
        </span>
        {ctl}
      </div>
      <div className="win-body">{children}</div>
    </div>
  )
}

/** Navigateur (publication sur le web). */
export function Browser({ url, className = "", children }: { url: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("win", className)}>
      <div className="browser-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span className="browser-url">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          {url}
        </span>
      </div>
      <div className="win-body">{children}</div>
    </div>
  )
}

const pct = (a: number, b: number) => `${(a / b) * 100}%`

/**
 * Appareil photoréaliste (#086) : cadre officiel et écran placé aux mesures exactes de sa dalle, reflet du verre et
 * ombre portée. Toujours de face : un cadre plat incliné en 3D perd son épaisseur et paraît faux.
 * `screen` : image (par défaut le site vitrine capturé à la taille de l'appareil) ou contenu React (montre).
 */
export function Device({ kind, screen, alt, eager = false, low = false, className = "", style }: { kind: DeviceKind; screen?: ReactNode | string; alt?: string; eager?: boolean; low?: boolean; className?: string; style?: CSSProperties }) {
  const d = DEVICES[kind]
  // `low` : chargé dès l'ouverture de la page, après le reste (vitrine prête quand on y arrive).
  const loading = eager || low ? "eager" : "lazy"
  const priority = low ? "low" : undefined
  // L'appareil apparaît en fondu une fois son cadre chargé (jamais de dalle noire sans cadre pendant le chargement).
  const img = useRef<HTMLImageElement>(null)
  const shot = useRef<HTMLImageElement>(null)
  const [frameOk, setFrameOk] = useState(false)
  const [shotOk, setShotOk] = useState(false)
  // Prêt une fois l'image chargée ET décodée (sinon l'écran s'affiche un instant en noir).
  const done = (el: HTMLImageElement | null, ok: () => void) => {
    if (!el) return
    el.decode().then(ok, ok)
  }
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth) done(img.current, () => setFrameOk(true))
    if (shot.current?.complete && shot.current.naturalWidth) done(shot.current, () => setShotOk(true))
  }, [])
  const r = "r" in d && d.r ? `${pct(d.r, d.sw)} / ${pct(d.r, d.sh)}` : "round" in d && d.round ? "50%" : undefined
  const box: CSSProperties = { left: pct(d.x, d.w), top: pct(d.y, d.h), width: pct(d.sw, d.w), height: pct(d.sh, d.h), borderRadius: r }
  const content = screen ?? ("screen" in d ? d.screen : undefined)
  const ready = frameOk && (typeof content !== "string" || shotOk)
  const frame = <img ref={img} className="device-frame" src={d.frame} alt="" width={d.w} height={d.h} loading={loading} fetchPriority={priority} decoding="async" draggable={false} onLoad={(e) => done(e.currentTarget, () => setFrameOk(true))} />
  return (
    <figure className={cn("device", `device-${kind}`, ready && "ready", className)} style={{ aspectRatio: `${d.w} / ${d.h}`, ...style }}>
      {d.layer === "over" && frame}
      <span className="device-screen" style={box}>
        {typeof content === "string" ? <img ref={shot} src={content} alt={alt ?? `Le site NEXORA sur ${d.name}`} loading={loading} fetchPriority={priority} decoding="async" draggable={false} onLoad={(e) => done(e.currentTarget, () => setShotOk(true))} /> : content}
      </span>
      {d.layer === "under" && frame}
      {"cam" in d && d.cam && <i className="device-cam" />}
    </figure>
  )
}
