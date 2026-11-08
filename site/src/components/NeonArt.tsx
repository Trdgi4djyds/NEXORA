import { useId } from "react"
import { iconPath } from "../lib/icons"
import { cn } from "../lib/utils"

/**
 * NEXORA #094 : illustration « verre et néon » des cartes d'espace (références de l'utilisateur : objets de verre,
 * effets fluo, fondus en transparence). Halo fluo qui s'efface vers l'extérieur, orbite en pointillés qui tourne, tuile
 * de verre, icône de l'espace dessinée comme un tube néon (cœur blanc, deux halos flous à la couleur --fluo), éclats qui
 * scintillent. Couleur fluo lue dans le CSS (--fluo de l'espace) ; tout en SVG, sans style en ligne (politique de
 * sécurité du site). Décoratif.
 */
export function NeonArt({ icon, className = "" }: { icon: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "")
  const d = iconPath(icon)
  return (
    <svg className={cn("art", className)} viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`h${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" className="art-s1" />
          <stop offset="0.55" className="art-s2" />
          <stop offset="1" className="art-s0" />
        </radialGradient>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.62" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={`e${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.15" />
        </linearGradient>
        <filter id={`b${id}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <filter id={`B${id}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3.6" />
        </filter>
      </defs>
      <circle className="art-halo" cx="120" cy="120" r="118" fill={`url(#h${id})`} />
      <ellipse className="art-orbit" cx="120" cy="124" rx="110" ry="36" transform="rotate(-16 120 124)" />
      <rect className="art-glass" x="58" y="58" width="124" height="124" rx="36" fill={`url(#g${id})`} stroke={`url(#e${id})`} strokeWidth="1.6" />
      <rect x="70" y="66" width="100" height="26" rx="13" fill="#fff" opacity="0.16" />
      <g transform="translate(84 84) scale(3)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <g className="art-glow2" filter={`url(#B${id})`} strokeWidth="2.6" dangerouslySetInnerHTML={{ __html: d }} />
        <g className="art-glow" filter={`url(#b${id})`} strokeWidth="2" dangerouslySetInnerHTML={{ __html: d }} />
        <g className="art-core" strokeWidth="1.25" dangerouslySetInnerHTML={{ __html: d }} />
      </g>
      <path className="art-spark" d="M198 46l3.2 8.8 8.8 3.2-8.8 3.2-3.2 8.8-3.2-8.8-8.8-3.2 8.8-3.2z" />
      <path className="art-spark s2" d="M44 170l2.2 6 6 2.2-6 2.2-2.2 6-2.2-6-6-2.2 6-2.2z" />
      <circle className="art-spark s3" cx="186" cy="186" r="3" />
    </svg>
  )
}
