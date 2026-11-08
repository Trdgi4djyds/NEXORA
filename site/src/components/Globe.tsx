import { useEffect, useRef } from "react"
import { MAP_BITS, MAP_H, MAP_W } from "../lib/worldmap"
import { cn } from "../lib/utils"

export type LatLon = [number, number]
export type GlobeMarker = { at: LatLon; size?: number }
export type GlobeArc = { from: LatLon; to: LatLon }

/** Villes de démonstration (décoratives) : Afrique de l'Ouest, Europe, Amériques, Asie, Océanie. */
export const CITIES = {
  cotonou: [6.37, 2.39],
  abidjan: [5.36, -4.01],
  dakar: [14.69, -17.44],
  lagos: [6.52, 3.38],
  paris: [48.86, 2.35],
  francfort: [50.11, 8.68],
  montreal: [45.5, -73.57],
  newyork: [40.71, -74.0],
  sanfrancisco: [37.77, -122.42],
  saopaulo: [-23.55, -46.63],
  johannesburg: [-26.2, 28.05],
  mumbai: [19.08, 72.88],
  singapour: [1.35, 103.82],
  tokyo: [35.68, 139.69],
  sydney: [-33.87, 151.21],
} satisfies Record<string, LatLon>

let LAND: Uint8Array | null = null
function land() {
  if (!LAND) {
    const bin = atob(MAP_BITS)
    LAND = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) LAND[i] = bin.charCodeAt(i)
  }
  return LAND
}
function isLand(lat: number, lon: number) {
  const x = Math.min(MAP_W - 1, Math.floor(((lon + 180) / 360) * MAP_W))
  const y = Math.min(MAP_H - 1, Math.floor(((90 - lat) / 180) * MAP_H))
  const i = y * MAP_W + x
  return (land()[i >> 3] >> (7 - (i & 7))) & 1
}

type Pts = { cl: Float32Array; sl: Float32Array; lon: Float32Array; n: number }
const rad = Math.PI / 180
/** Points répartis régulièrement sur la sphère (spirale de Fibonacci), terres et océans séparés. */
function sphere(count: number): { land: Pts; sea: Pts } {
  const l: number[][] = []
  const s: number[][] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2
    const lat = Math.asin(y) / rad
    const lon = ((((i * golden) / rad) % 360) + 540) % 360 - 180
    if (lat > 74 || lat < -58) continue
    if (isLand(lat, lon)) l.push([lat, lon])
    else if (i % 3 === 0) s.push([lat, lon])
  }
  const pack = (arr: number[][]): Pts => ({
    cl: Float32Array.from(arr, (p) => Math.cos(p[0] * rad)),
    sl: Float32Array.from(arr, (p) => Math.sin(p[0] * rad)),
    lon: Float32Array.from(arr, (p) => p[1] * rad),
    n: arr.length,
  })
  return { land: pack(l), sea: pack(s) }
}

/** Point sur le grand cercle entre a et b (t de 0 à 1), avec l'altitude de l'arc. */
function arcPoints(a: LatLon, b: LatLon, steps = 56) {
  const v = (p: LatLon) => [Math.cos(p[0] * rad) * Math.sin(p[1] * rad), Math.sin(p[0] * rad), Math.cos(p[0] * rad) * Math.cos(p[1] * rad)]
  const A = v(a)
  const B = v(b)
  const dot = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]))
  const om = Math.acos(dot)
  const lift = 0.08 + om * 0.12
  const out: number[][] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const k1 = om ? Math.sin((1 - t) * om) / Math.sin(om) : 1 - t
    const k2 = om ? Math.sin(t * om) / Math.sin(om) : t
    const h = 1 + lift * Math.sin(Math.PI * t)
    out.push([(A[0] * k1 + B[0] * k2) * h, (A[1] * k1 + B[1] * k2) * h, (A[2] * k1 + B[2] * k2) * h])
  }
  return out
}

/**
 * Globe animé (#086) : terres en points, océan en pointillé discret, arcs lumineux qui voyagent d'une ville à l'autre,
 * villes qui pulsent. Canevas 2D sans bibliothèque (aucun style injecté : compatible avec la politique de sécurité du
 * site). Tourne seul, se fait glisser à la souris, s'arrête hors de l'écran ; immobile avec « Réduire les animations ».
 * Décoratif (`aria-hidden`). #088 : couleurs du logo, lues dans les jetons du site : globe bleu, arcs et villes roses.
 */
export function Globe({
  markers = [],
  arcs = [],
  className = "",
  speed = 0.0016,
  tilt = -0.32,
  start = 0.6,
  density = 15000,
}: {
  markers?: GlobeMarker[]
  arcs?: GlobeArc[]
  className?: string
  speed?: number
  tilt?: number
  start?: number
  density?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const { land: L, sea: S } = sphere(density)
    const paths = arcs.map((a) => arcPoints(a.from, a.to))
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    // Triplets « r g b » de neon.css (--neon : rose, --neon-blue : bleu), valeurs de repli si la feuille manque.
    const css = getComputedStyle(canvas)
    const tone = (name: string, fallback: string) => (css.getPropertyValue(name).trim() || fallback).split(/[\s,]+/).join(", ")
    const PINK = tone("--neon", "255 90 140")
    const BLUE = tone("--neon-blue", "91 140 255")
    let w = 0
    let h = 0
    let dpr = 1
    let phi = start
    let vel = 0
    let drag: { x: number; phi: number } | null = null
    let raf = 0
    let visible = false
    const t0 = performance.now()
    const ct = Math.cos(tilt)
    const st = Math.sin(tilt)

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = Math.max(1, Math.round(r.width * dpr))
      h = Math.max(1, Math.round(r.height * dpr))
      canvas.width = w
      canvas.height = h
      if (reduce || !visible) draw(performance.now())
    }

    const draw = (now: number) => {
      const R = Math.min(w, h) * 0.46
      const cx = w / 2
      const cy = h / 2
      const time = (now - t0) / 1000
      ctx.clearRect(0, 0, w, h)
      // Disque et liseré lumineux.
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(8, 8, 20, 0.9)"
      ctx.fill()
      ctx.shadowColor = `rgba(${BLUE}, 0.55)`
      ctx.shadowBlur = 38 * dpr
      ctx.lineWidth = 1.2 * dpr
      ctx.strokeStyle = `rgba(${BLUE}, 0.5)`
      ctx.stroke()
      ctx.restore()

      const cp = Math.cos(phi)
      const sp = Math.sin(phi)
      const dot = (P: Pts, size: number, alpha: number) => {
        for (let i = 0; i < P.n; i += 1) {
          const lon = P.lon[i]
          // Rotation autour de l'axe des pôles (phi) puis inclinaison (tilt).
          const sl = Math.sin(lon) * cp + Math.cos(lon) * sp
          const clo = Math.cos(lon) * cp - Math.sin(lon) * sp
          const x = P.cl[i] * sl
          const y0 = P.sl[i]
          const z0 = P.cl[i] * clo
          const z = y0 * st + z0 * ct
          if (z <= 0) continue
          const y = y0 * ct - z0 * st
          ctx.globalAlpha = alpha * (0.18 + 0.82 * z)
          ctx.fillRect(cx + x * R - size / 2, cy - y * R - size / 2, size, size)
        }
      }
      ctx.fillStyle = `rgb(${BLUE})`
      dot(S, 1.1 * dpr, 0.26)
      ctx.fillStyle = "#dbe3ff"
      dot(L, 1.75 * dpr, 0.95)
      ctx.globalAlpha = 1

      const project = (p: number[]) => {
        const x = p[0] * cp + p[2] * sp
        const z0 = -p[0] * sp + p[2] * cp
        const y = p[1] * ct - z0 * st
        const z = p[1] * st + z0 * ct
        return [cx + x * R, cy - y * R, z]
      }

      // Arcs : un trait lumineux qui part de la ville d'origine, traverse l'arc et s'efface.
      ctx.lineCap = "round"
      paths.forEach((pts, k) => {
        const period = 3.6
        const t = ((time + k * 0.9) % period) / period
        const head = Math.min(1, t * 1.6)
        const tail = Math.max(0, t * 1.6 - 0.55)
        const n = pts.length - 1
        // Arc complet très discret.
        ctx.lineWidth = 1 * dpr
        ctx.strokeStyle = `rgba(${PINK}, 0.12)`
        ctx.beginPath()
        let pen = false
        for (let i = 0; i <= n; i += 1) {
          const [x, y, z] = project(pts[i])
          if (z < -0.08) {
            pen = false
            continue
          }
          if (pen) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
          pen = true
        }
        ctx.stroke()
        // Trait lumineux.
        const a = Math.floor(tail * n)
        const b = Math.ceil(head * n)
        for (let i = a; i < b; i += 1) {
          const p = project(pts[i])
          const q = project(pts[i + 1])
          if (p[2] < -0.08 || q[2] < -0.08) continue
          const f = (i - a) / Math.max(1, b - a)
          ctx.strokeStyle = `rgba(${PINK}, ${0.15 + 0.85 * f})`
          ctx.lineWidth = (1 + 1.4 * f) * dpr
          ctx.beginPath()
          ctx.moveTo(p[0], p[1])
          ctx.lineTo(q[0], q[1])
          ctx.stroke()
        }
        if (head < 1) {
          const p = project(pts[b])
          if (p[2] > -0.08) {
            ctx.fillStyle = "#ffe4ee"
            ctx.beginPath()
            ctx.arc(p[0], p[1], 2.2 * dpr, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      })

      // Villes : point et onde.
      markers.forEach((m, k) => {
        const lat = m.at[0] * rad
        const lon = m.at[1] * rad
        const [x, y, z] = project([Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)])
        if (z <= 0.02) return
        const s = (m.size ?? 1) * dpr
        const pulse = ((time * 0.7 + k * 0.37) % 1 + 1) % 1
        ctx.globalAlpha = (1 - pulse) * z
        ctx.strokeStyle = `rgb(${PINK})`
        ctx.lineWidth = 1.2 * dpr
        ctx.beginPath()
        ctx.arc(x, y, (3 + pulse * 11) * s, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = z
        ctx.fillStyle = `rgb(${PINK})`
        ctx.beginPath()
        ctx.arc(x, y, 2.6 * s, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      })
    }

    const loop = (now: number) => {
      raf = 0
      if (!visible) return
      if (!drag) {
        vel *= 0.94
        phi += speed + vel
      }
      draw(now)
      raf = requestAnimationFrame(loop)
    }
    const play = () => {
      if (!reduce && visible && !raf) raf = requestAnimationFrame(loop)
    }

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) play()
      else draw(performance.now())
    })
    io.observe(canvas)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const down = (e: PointerEvent) => {
      if (reduce) return
      drag = { x: e.clientX, phi }
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const next = drag.phi + ((e.clientX - drag.x) / Math.max(1, canvas.clientWidth)) * 3
      vel = (next - phi) * 0.25
      phi = next
    }
    const up = () => {
      drag = null
    }
    canvas.addEventListener("pointerdown", down)
    canvas.addEventListener("pointermove", move)
    canvas.addEventListener("pointerup", up)
    canvas.addEventListener("pointercancel", up)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      canvas.removeEventListener("pointerdown", down)
      canvas.removeEventListener("pointermove", move)
      canvas.removeEventListener("pointerup", up)
      canvas.removeEventListener("pointercancel", up)
    }
  }, [markers, arcs, speed, tilt, start, density])
  return <canvas ref={ref} className={cn("globe", className)} aria-hidden="true" />
}
