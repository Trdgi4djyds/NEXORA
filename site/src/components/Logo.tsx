import { LOGO } from "../data/stack"
import { cn } from "../lib/utils"

/** Logo officiel d'une technologie (image SVG locale) ; `label` : nom lu par les lecteurs d'écran. */
export function Logo({ name, label = "", size = 24, className = "" }: { name: string; label?: string; size?: number; className?: string }) {
  const src = LOGO[name]
  if (!src) return null
  return <img src={src} alt={label} width={size} height={size} className={cn("logo-img", className)} style={{ width: size, height: size }} loading="lazy" decoding="async" draggable={false} />
}

/** Pastille « logo + nom ». */
export function TechChip({ name, logo, className = "" }: { name: string; logo: string; className?: string }) {
  return (
    <span className={cn("tech-chip", className)}>
      <Logo name={logo} size={22} />
      <span>{name}</span>
    </span>
  )
}
