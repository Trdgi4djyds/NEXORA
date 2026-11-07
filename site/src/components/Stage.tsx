import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useInView, usePageVisible } from "../lib/motion"

/**
 * Scène de taille fixe (en pixels « logiques ») mise à l'échelle de la largeur disponible, comme l'aperçu du
 * Desktop Builder : la mise en page interne reste identique sur tous les écrans. Les animations s'arrêtent quand
 * la scène sort de l'écran ou que l'onglet est masqué (`run`).
 */
export function Stage({
  width,
  height,
  className = "",
  label,
  children,
}: {
  width: number
  height: number
  className?: string
  label?: string
  children: (run: boolean) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  const visible = useInView(ref, { margin: "160px 0px" })
  const page = usePageVisible()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(el.clientWidth / width)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  const run = visible && page
  return (
    <div
      ref={ref}
      className={`stage ${className}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      data-run={run ? "1" : "0"}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <div className="stage-in" style={{ width, height, transform: `scale(${scale || 0.001})` }} aria-hidden="true">
        {scale > 0 && children(run)}
      </div>
    </div>
  )
}
