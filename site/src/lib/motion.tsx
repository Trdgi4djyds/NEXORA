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
  // #096 : premier rendu identique à la page pré-générée (hydratation), réglage du système lu juste après.
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const q = reduceQuery()
    if (!q) return
    const on = () => setReduced(q.matches)
    on()
    q.addEventListener("change", on)
    return () => q.removeEventListener("change", on)
  }, [])
  return reduced
}

// #120 : un seul IntersectionObserver par jeu d'options pour tout le site (il y en avait un par bloc animé, soit
// des centaines de calculs d'intersection séparés à chaque image pendant le défilement).
type Watch = (visible: boolean) => void
const pools = new Map<string, { io: IntersectionObserver; watchers: Map<Element, Watch> }>()
function watchVisibility(el: Element, margin: string, threshold: number, cb: Watch) {
  const key = `${margin}|${threshold}`
  let pool = pools.get(key)
  if (!pool) {
    const watchers = new Map<Element, Watch>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) watchers.get(e.target)?.(e.isIntersecting)
      },
      { rootMargin: margin, threshold },
    )
    pool = { io, watchers }
    pools.set(key, pool)
  }
  const p = pool
  p.watchers.set(el, cb)
  p.io.observe(el)
  return () => {
    p.watchers.delete(el)
    p.io.unobserve(el)
  }
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
    let stop = () => {}
    stop = watchVisibility(el, margin, threshold, (visible) => {
      if (visible) {
        setInView(true)
        if (once) stop()
      } else if (!once) setInView(false)
    })
    return () => stop()
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
  // #120 : apparition lancée un peu avant que le bloc entre à l'écran (marge basse positive) : il est déjà en place
  // quand on l'atteint, au lieu d'apparaître après coup (impression de retard au défilement).
  const seen = useInView(ref, { once: true, margin: "0px 0px 15% 0px" })
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
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const on = () => setVisible(!document.hidden)
    on()
    document.addEventListener("visibilitychange", on)
    return () => document.removeEventListener("visibilitychange", on)
  }, [])
  return visible
}

/** Vrai tant que la requête média correspond (mise en page différente sur petit écran). */
export function useMedia(query: string) {
  // #096 : faux au premier rendu (comme la page pré-générée), puis la vraie valeur dès l'affichage.
  const [match, setMatch] = useState(false)
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
