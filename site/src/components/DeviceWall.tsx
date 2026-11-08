import type { CSSProperties, ReactNode } from "react"
import { DEVICES, type DeviceKind } from "../lib/devices"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { DEVICE_CATEGORIES } from "../lib/product"
import { cn } from "../lib/utils"
import { Device } from "./Screen"

/** Cadran de la montre : disponibilité surveillée par NEXORA (contenu de démonstration). */
export function WatchFace() {
  return (
    <span className="watch-face">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="5" />
        <circle cx="50" cy="50" r="46" fill="none" className="stroke-brand-blue" strokeWidth="5" strokeLinecap="round" strokeDasharray="289" strokeDashoffset="20" />
      </svg>
      <span className="relative text-center">
        <span className="wt block">10:09</span>
        <span className="ws block">En ligne · 99,9 %</span>
      </span>
    </span>
  )
}

/**
 * Disposition de la vitrine (pourcentages de la scène de 1200 × 700). #087 : plus aucun appareil ne se chevauche : le
 * téléviseur est au mur, au-dessus de la rangée posée sur le sol (MacBook, iPad, pliable, Galaxy, iPhone, montre).
 */
const LINEUP: { kind: DeviceKind; style: CSSProperties; screen?: ReactNode; z: number }[] = [
  { kind: "tv", style: { left: "28%", width: "44%", bottom: "53%" }, z: 1 },
  { kind: "macbook", style: { left: "7%", width: "40%", bottom: "2%" }, z: 2 },
  { kind: "ipad", style: { left: "49.5%", width: "13.5%", bottom: "2%" }, z: 3 },
  { kind: "fold", style: { left: "65%", width: "14.5%", bottom: "2%" }, z: 3 },
  { kind: "galaxy", style: { left: "81.5%", width: "6.4%", bottom: "2%" }, z: 4 },
  { kind: "iphoneBlue", style: { left: "90%", width: "6.6%", bottom: "2%" }, z: 4 },
  { kind: "watch", style: { left: "0%", width: "5.2%", bottom: "2%" }, z: 5, screen: <WatchFace /> },
]

/**
 * Vitrine du Responsive Lab (#086) : les vrais cadres posés sur un sol lumineux, de face, chacun affichant ce site à sa
 * taille d'écran ; puis les familles du catalogue avec leur nombre de modèles (lu dans NEXORA).
 */
export function DeviceWall({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <Reveal className="relative mx-auto hidden max-w-[1180px] md:block">
        <i className="halo inset-x-[15%] top-[5%] bottom-[25%] opacity-[0.1]" aria-hidden="true" />
        <div className="wall">
          <i className="wall-floor" aria-hidden="true" />
          {LINEUP.map((d) => (
            <div key={d.kind} className="on-floor" style={{ ...d.style, zIndex: d.z }}>
              <Device kind={d.kind} screen={d.screen} low />
            </div>
          ))}
        </div>
      </Reveal>
      {/* Téléphone et petite tablette : grille de cartes, chaque appareil entier dans sa carte. */}
      <div className="grid grid-cols-2 gap-4 md:hidden">
        {(["iphone", "galaxy", "fold", "ipad", "macbook", "tv"] as DeviceKind[]).map((k) => (
          <div key={k} className="surface flex flex-col items-center gap-3 p-4">
            <div className="flex h-[150px] w-full items-end justify-center">
              <Device kind={k} className={cn(DEVICES[k].w > DEVICES[k].h ? "w-full" : "h-full w-auto")} />
            </div>
            <span className="text-center text-[12.5px] leading-tight">
              <b className="block font-medium">{DEVICES[k].name}</b>
              <small className="text-muted-foreground">{DEVICES[k].css}</small>
            </span>
          </div>
        ))}
      </div>
      {!compact && (
        <Reveal className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" data-glow>
          {DEVICE_CATEGORIES.slice(0, 10).map((c) => (
            <div key={c.id} className="glow surface flex items-center gap-3 px-4 py-3.5">
              <span className="sp-ic sm">
                <Icon name={GLYPH[c.glyph] ?? "phone"} size={15} />
              </span>
              <span className="min-w-0">
                <b className="block truncate text-[14px] font-medium">{c.label}</b>
                <small className="text-[12.5px] text-muted-foreground">
                  {c.count} modèle{c.count > 1 ? "s" : ""}
                </small>
              </span>
            </div>
          ))}
        </Reveal>
      )}
    </div>
  )
}

export const GLYPH: Record<string, string> = { phone: "phone", fold: "fold", tablet: "tablet", laptop: "laptop", display: "display", watch: "watch", tv: "tv", xr: "xr", gamepad: "gamepad", car: "car", kiosk: "kiosk" }

/** Galerie défilante : chaque cadre seul, avec son modèle et sa taille d'écran. */
export function DeviceGallery() {
  const kinds: DeviceKind[] = ["iphone", "galaxy", "pixel", "fold", "ipad", "tablet", "macbook", "surface", "tv", "car", "watch"]
  const card = (k: DeviceKind, copy: number) => (
    <div key={`${k}-${copy}`} className="surface w-[230px] shrink-0">
      <div className="device-card">
        <div className="stage">
          <Device kind={k} screen={k === "watch" ? <WatchFace /> : undefined} className={DEVICES[k].w > DEVICES[k].h * 1.05 ? "w-full" : "h-full"} />
        </div>
        <span className="text-center leading-tight">
          <b className="block text-[14px] font-medium">{DEVICES[k].name}</b>
          <small className="text-[12px] text-muted-foreground">
            {DEVICES[k].family} · {DEVICES[k].css}
          </small>
        </span>
      </div>
    </div>
  )
  return (
    <div className="marquee slow" aria-hidden="true">
      <div className="marquee-track">
        {kinds.map((k) => card(k, 0))}
        {kinds.map((k) => card(k, 1))}
      </div>
    </div>
  )
}
