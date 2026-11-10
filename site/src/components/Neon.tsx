import { useId, type CSSProperties } from "react"
import { SPACE_BY_ID, type SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { cn } from "../lib/utils"

// Tracés des icônes de NEXORA (même module que l'application), lus par Icon : on les reprend tels quels.
const ICON_SVG = (name: string, size: number) => <Icon name={name} size={size} />

/**
 * #101 : icône néon : le tracé de l'icône de NEXORA en dégradé violet → bleu → cyan, doublé d'un halo flou.
 * Dessin vectoriel net à toutes les tailles (aucune image, aucun modèle 3D).
 */
export function NeonIcon({ name, size = 40, className = "" }: { name: string; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "")
  return (
    <span className={cn("neon-ic", className)} style={{ "--s": `${size}px`, "--g": `url(#ng${id})` } as CSSProperties} aria-hidden="true">
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id={`ng${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e9d5ff" />
            <stop offset="0.45" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#67e8f9" />
          </linearGradient>
        </defs>
      </svg>
      <span className="neon-blur">{ICON_SVG(name, size)}</span>
      <span className="neon-line">{ICON_SVG(name, size)}</span>
    </span>
  )
}

/**
 * #101 : tuile de verre d'un espace (première image de référence de l'utilisateur) : verre translucide à reflet,
 * lueur intérieure violette et cyan, icône néon au centre, nom de l'espace en pilule.
 */
export function GlassTile({ space, label = true, size = "md", className = "" }: { space: SpaceId; label?: boolean; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = SPACE_BY_ID[space]
  const px = size === "sm" ? 26 : size === "lg" ? 64 : 44
  return (
    <span className={cn("glass-tile", `gt-${size}`, className)}>
      <i className="gt-glow" aria-hidden="true" />
      <NeonIcon name={s.icon} size={px} />
      {label && <span className="gt-pill">{s.rail}</span>}
    </span>
  )
}
