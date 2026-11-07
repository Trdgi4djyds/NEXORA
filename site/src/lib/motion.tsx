// Mouvement du site : apparitions au défilement, compteurs, minuteries des démonstrations. Tout s'arrête quand
// l'élément sort de l'écran et suit « Réduire les animations » du système.
import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type ReactNode,
  type RefObject,
} from "react"

const reduceQuery = () =>
  typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => !!reduceQuery()?.matches)
  useEffect(() => {
    const q = reduceQuery()
    if (!q) return
    const on = () => setReduced(q.matches)
    q.addEventListener("change", on)
    return () => q.removeEventListener("change", on)
  }, [])
  return reduced
}

/** Vrai tant que l'élément est (au moins en partie) visible ; `once` : reste vrai après la première apparition. */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { once = false, margin = "0px", threshold = 0 }: { once?: boolean; margin?: string; threshold?: number } = {},
) {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver !== "function") {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) setInView(false)
      },
      { rootMargin: margin, threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, once, margin, threshold])
  return inView
}

/** Bloc qui apparaît en glissant quand il entre dans l'écran (délai en ms pour les cascades). */
export function Reveal({
  as = "div",
  delay = 0,
  className = "",
  style,
  children,
  ...rest
}: {
  as?: string
  delay?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
  [key: string]: unknown
}) {
  const ref = useRef<HTMLElement>(null)
  const seen = useInView(ref, { once: true, margin: "0px 0px -8% 0px" })
  return createElement(
    as,
    {
      ref,
      className: `rv${seen ? " in" : ""}${className ? ` ${className}` : ""}`,
      style: { ...style, "--d": `${delay}ms` } as CSSProperties,
      ...rest,
    },
    children,
  )
}

/** Nombre qui défile de 0 à sa valeur quand il apparaît. */
export function CountUp({ value, duration = 1400, format }: { value: number; duration?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useInView(ref, { once: true })
  const reduced = useReducedMotion()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!seen) return
    if (reduced) {
      setN(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setN(Math.round(value * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [seen, reduced, value, duration])
  return <span ref={ref}>{format ? format(n) : n}</span>
}

/**
 * Compteur de cycles : renvoie un numéro qui augmente toutes les `period` ms tant que `active` est vrai.
 * Sert à rejouer une démonstration (la clé React change, l'animation repart du début).
 */
export function useCycle(period: number, active: boolean) {
  const [cycle, setCycle] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setCycle((c) => c + 1), period)
    return () => window.clearInterval(id)
  }, [period, active])
  return cycle
}

/** Étape d'une petite séquence (0, 1, 2… puis retour à 0), cadencée tant que `active` est vrai. */
export function useSteps(durations: number[], active: boolean) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setTimeout(() => setStep((s) => (s + 1) % durations.length), durations[step] ?? 1000)
    return () => window.clearTimeout(id)
  }, [step, active, durations])
  return step
}

/** Vrai si l'onglet du navigateur est affiché (les démonstrations se mettent en pause sinon). */
export function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden)
  useEffect(() => {
    const on = () => setVisible(!document.hidden)
    document.addEventListener("visibilitychange", on)
    return () => document.removeEventListener("visibilitychange", on)
  }, [])
  return visible
}

/** Vrai tant que la requête média correspond (mise en page différente sur petit écran). */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches)
  useEffect(() => {
    const q = matchMedia(query)
    const on = () => setMatch(q.matches)
    on()
    q.addEventListener("change", on)
    return () => q.removeEventListener("change", on)
  }, [query])
  return match
}

/**
 * Inclinaison 3D légère qui suit la souris (variables --rx, --ry, --ty lues par le CSS de la carte). Rien au
 * toucher ni avec « Réduire les animations ».
 */
export function useTilt(max = 5) {
  const reduced = useReducedMotion()
  if (reduced) return {}
  return {
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return
      const el = e.currentTarget
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      el.style.setProperty("--ry", `${(x * max * 2).toFixed(2)}deg`)
      el.style.setProperty("--rx", `${(-y * max * 2).toFixed(2)}deg`)
      el.style.setProperty("--ty", "-4px")
    },
    onPointerLeave: (e: RPointerEvent<HTMLElement>) => {
      const el = e.currentTarget
      el.style.removeProperty("--ry")
      el.style.removeProperty("--rx")
      el.style.removeProperty("--ty")
    },
  }
}

/** Valeur qui glisse de l'ancienne à la nouvelle en `duration` ms (prix mensuel / annuel). */
export function useTween(value: number, duration = 450) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reduced || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const v = a + (value - a) * (1 - Math.pow(1 - t, 3))
      from.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, reduced])
  return shown
}
