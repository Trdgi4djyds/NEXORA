import { useMemo, type CSSProperties } from "react"
import { cn } from "../lib/utils"

/** Générateur pseudo-aléatoire déterministe (même dessin à chaque rendu). */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Trace = { d: string; len: number; end: [number, number]; delay: number; dur: number }

/** Pistes de circuit imprimé : départ d'un bord, segments droits et coudes à 45°, pastille au bout. */
function traces(seed: number, count: number, W: number, H: number): Trace[] {
  const r = rng(seed)
  const out: Trace[] = []
  for (let i = 0; i < count; i += 1) {
    const left = i % 2 === 0
    let x = left ? -10 : W + 10
    let y = 40 + r() * (H - 80)
    const dir = left ? 1 : -1
    let d = `M${x.toFixed(0)} ${y.toFixed(0)}`
    let len = 0
    const steps = 2 + Math.floor(r() * 3)
    for (let s = 0; s < steps; s += 1) {
      const run = 60 + r() * 200
      x += dir * run
      len += run
      d += ` H${x.toFixed(0)}`
      if (s < steps - 1) {
        const k = (r() < 0.5 ? -1 : 1) * (20 + r() * 60)
        x += dir * Math.abs(k)
        y += k
        len += Math.abs(k) * 1.414
        d += ` L${x.toFixed(0)} ${y.toFixed(0)}`
      }
    }
    out.push({ d, len, end: [x, y], delay: r() * 6, dur: 3.5 + r() * 4 })
  }
  return out
}

/** Circuit imprimé discret, impulsions roses et bleues (couleurs du logo) qui parcourent les pistes (coupées par « Réduire les animations »). */
export function Circuit({ seed = 7, count = 18, className = "" }: { seed?: number; count?: number; className?: string }) {
  const W = 1440
  const H = 800
  const list = useMemo(() => traces(seed, count, W, H), [seed, count])
  return (
    <svg className={cn("circuit", className)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {list.map((t, i) => (
        <g key={i}>
          <path d={t.d} className="trace" />
          <path d={t.d} className="pulse" style={{ "--len": t.len, "--delay": `${t.delay}s`, "--dur": `${t.dur}s` } as CSSProperties} pathLength={t.len} />
          <circle cx={t.end[0]} cy={t.end[1]} r="3.5" className="pad" />
        </g>
      ))}
    </svg>
  )
}

const CODE = [
  "import { createProject } from \"@nexora/core\"",
  "",
  "const site = await createProject({",
  "  name: \"boutique\",",
  "  framework: \"next\",",
  "  devices: [\"iphone-17-pro\", \"galaxy-s21\", \"ipad-pro\"],",
  "})",
  "",
  "await site.preview({ watch: true })",
  "await site.audit([\"performance\", \"a11y\", \"seo\"])",
  "await site.build({ android: \"aab\", windows: \"msi\" })",
  "",
  "export default defineConfig({",
  "  monitor: { interval: \"1m\", regions: 2 },",
  "  publish: [\"web\", \"play-store\", \"winget\"],",
  "})",
  "",
  "$ nexora deploy --prod",
  "  ✓ build      2.1 s",
  "  ✓ tests      48 passed",
  "  ✓ en ligne   https://boutique.example",
]

/** Lignes de code qui défilent lentement, très estompées (illustration « développeur »). */
export function CodeLines({ className = "" }: { className?: string }) {
  return (
    <div className={cn("code-lines", className)} aria-hidden="true">
      <pre>
        {[...CODE, "", ...CODE].map((l, i) => (
          <span key={i}>{l || " "}</span>
        ))}
      </pre>
    </div>
  )
}

/** Halos flous (rose et bleu du logo, #088) qui dérivent lentement. */
export function Blobs({ className = "" }: { className?: string }) {
  return (
    <div className={cn("blobs", className)} aria-hidden="true">
      <i className="b1" />
      <i className="b2" />
      <i className="b3" />
    </div>
  )
}

/** Fond complet d'une section : quadrillage éclairé par le pointeur, halos, circuit et code selon la variante. */
export function Backdrop({ variant = "page", className = "" }: { variant?: "hero" | "page" | "cta" | "soft"; className?: string }) {
  return (
    <div className={cn("backdrop", `bd-${variant}`, className)} aria-hidden="true">
      <i className="grid-bg" />
      <i className="grid-lit" />
      <Blobs />
      {variant !== "soft" && <Circuit seed={variant === "hero" ? 11 : variant === "cta" ? 23 : 5} count={variant === "hero" ? 22 : 14} />}
      {variant === "hero" && <CodeLines />}
    </div>
  )
}
