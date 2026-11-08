// Mouvement du site : apparitions au défilement, compteurs, minuteries des démonstrations. Tout s'arrête quand
// l'élément sort de l'écran et suit « Réduire les animations » du système.
import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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

/**
 * Nombre qui défile de 0 à sa valeur quand il apparaît. `delay` (ms) : démarrage au montage, sans attendre
 * l'observateur de visibilité (#069 : cartes du hero, toujours à l'écran, prises dans la perspective de la scène,
 * dont l'observateur ne se déclenchait pas toujours au premier chargement).
 */
export function CountUp({ value, duration = 1400, delay, format }: { value: number; duration?: number; delay?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [timed, setTimed] = useState(false)
  useEffect(() => {
    if (delay === undefined) return
    const id = window.setTimeout(() => setTimed(true), delay)
    return () => window.clearTimeout(id)
  }, [delay])
  const seen = delay === undefined ? inView : timed
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
