import { useId } from "react"
import type { SpaceId } from "../data/spaces"
import { cn } from "../lib/utils"

/*
 * NEXORA #095 : illustration de fond plein des cartes d'espace (références de l'utilisateur : rubans épais, boucles et
 * vagues qui remplissent l'aplat). Un ruban principal en volume (dégradé clair → sombre de la couleur de l'espace) et un
 * ruban secondaire clair, chacun avec un reflet ; tracés différents d'un espace à l'autre. Immobile. Couleurs lues dans
 * le CSS (--u de l'espace, classes des arrêts) : aucun style en ligne. Le calque s'efface en transparence vers le haut à
 * gauche, là où se trouve le texte (.tile-art). Décoratif.
 */
const SHAPES: Record<SpaceId, [string, string]> = {
  preview: [
    "M -60 430 C 90 250, 330 360, 330 240 C 330 110, 140 150, 175 260 C 210 370, 420 340, 470 170",
    "M 470 520 C 360 470, 300 520, 230 470",
  ],
  dev: [
    "M 140 -60 C 170 40, 320 20, 315 120 C 310 220, 140 190, 160 290 C 180 390, 350 350, 340 450 C 335 520, 230 540, 210 600",
    "M 470 260 C 400 300, 420 380, 350 410",
  ],
  android: [
    "M 340 160 C 350 40, 170 10, 160 130 C 150 240, 330 250, 340 160 C 350 320, 270 440, 150 580",
    "M 470 40 C 420 90, 450 150, 400 190",
  ],
  desktop: [
    "M 470 60 C 300 40, 200 140, 260 235 C 330 335, 120 365, 85 300 C 35 220, 150 165, 205 225 C 285 305, 230 470, -50 530",
    "M 470 20 C 420 60, 450 110, 400 140",
  ],
  browser: [
    "M -70 310 C 50 150, 390 130, 425 265 C 460 405, 120 475, 45 385 C -15 310, 120 225, 265 255",
    "M 330 -40 C 360 30, 440 40, 470 0",
  ],
  studio: [
    "M -50 570 C 60 390, 160 310, 300 305 C 420 300, 425 185, 335 165 C 245 145, 225 265, 320 305 C 400 335, 455 305, 485 265",
    "M 470 420 C 410 440, 420 500, 360 520",
  ],
  design: [
    "M 160 -60 C 120 60, 330 70, 300 170 C 270 270, 90 230, 110 330 C 130 430, 330 400, 320 500 C 315 560, 260 590, 240 620",
    "M 470 120 C 400 160, 430 230, 360 260",
  ],
  security: [
    "M 470 300 C 360 240, 240 330, 260 420 C 280 510, 420 500, 400 420 C 380 340, 200 380, 120 470 C 60 540, -20 560, -60 540",
    "M 300 560 C 330 480, 420 470, 470 500",
  ],
  home: [
    "M -60 200 C 60 120, 120 260, 210 230 C 300 200, 250 90, 330 80 C 420 70, 430 200, 360 260 C 300 310, 330 420, 470 440",
    "M 470 -20 C 420 40, 460 100, 410 140",
  ],
}

export function TileArt({ space, className = "" }: { space: SpaceId; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "")
  const [main, second] = SHAPES[space]
  return (
    <svg className={cn("tile-art", className)} viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="ta-hi" />
          <stop offset="0.5" className="ta-mid" />
          <stop offset="1" className="ta-lo" />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" className="ta-white" />
          <stop offset="1" className="ta-soft" />
        </linearGradient>
      </defs>
      <path d={second} className="ta-rib" stroke={`url(#s${id})`} strokeWidth="38" />
      <path d={main} className="ta-rib ta-shadow" strokeWidth="78" />
      <path d={main} className="ta-rib" stroke={`url(#m${id})`} strokeWidth="74" />
      <path d={main} className="ta-rib ta-gloss" strokeWidth="18" />
    </svg>
  )
}
