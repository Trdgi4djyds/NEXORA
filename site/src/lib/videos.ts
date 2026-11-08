// NEXORA #070 : maquettes animées, produites par `node scripts/videos-vitrine.mjs`. Vraies captures de NEXORA et
// du site de démonstration Kora, enchaînées avec leurs transitions de page, placées dans de vrais appareils
// (Surface Laptop 15, iPhone 18 Pro) par le moteur des Maquettes de NEXORA, image par image. Boucles de 12 s
// (H.264), chacune avec son image d'attente, seule montrée avec « Réduire les animations ».
import appareils from "../assets/videos/appareils.mp4"
import appareilsPoster from "../assets/videos/appareils.webp"
import chapitres from "../assets/videos/chapitres.json"
import koraMobile from "../assets/videos/kora-mobile.mp4"
import koraMobilePoster from "../assets/videos/kora-mobile.webp"
import koraWeb from "../assets/videos/kora-web.mp4"
import koraWebPoster from "../assets/videos/kora-web.webp"
import windows from "../assets/videos/windows.mp4"
import windowsPoster from "../assets/videos/windows.webp"

export type Clip = { src: string; poster: string; width: number; height: number }

export const CLIPS = {
  /** NEXORA sur un Surface Laptop 15 (Windows 11) et Kora sur un iPhone 18 Pro. */
  appareils: { src: appareils, poster: appareilsPoster, width: 1600, height: 900 },
  /** Kora sur téléphone (402 points de large) : accueil, fiche produit, commande. */
  koraMobile: { src: koraMobile, poster: koraMobilePoster, width: 540, height: 1174 },
  /** Kora dans un navigateur de bureau (1440 × 900), avec le pointeur. */
  koraWeb: { src: koraWeb, poster: koraWebPoster, width: 1152, height: 720 },
  /** Kora installé comme logiciel Windows, sur un Surface Laptop 15. */
  windows: { src: windows, poster: windowsPoster, width: 1200, height: 900 },
} satisfies Record<string, Clip>

/** Chapitre d'une boucle : identifiant, instant où l'écran est en place, instant où il cède la place (s). */
export type Chapter = [id: string, from: number, to: number]

export const LOOP: number = chapitres.loop
export const CHAPTERS = chapitres as unknown as { loop: number; nexora: Chapter[]; koraMobile: Chapter[]; koraWeb: Chapter[] }

/**
 * Chapitre en cours à l'instant t : celui qui cède la place le prochain. La transition vers un écran compte
 * déjà pour lui, comme dans l'application, où l'espace change au clic.
 */
export function chapterAt(list: Chapter[], t: number): number {
  const at = ((t % LOOP) + LOOP) % LOOP
  let best = 0
  let gap = Infinity
  list.forEach(([, , to], i) => {
    const d = (to - at + LOOP) % LOOP || LOOP
    if (d < gap) {
      gap = d
      best = i
    }
  })
  return best
}

/** Avancement (0 à 1) du chapitre i à l'instant t, de la fin du chapitre précédent à sa propre fin. */
export function progressIn(list: Chapter[], i: number, t: number): number {
  const start = list[(i - 1 + list.length) % list.length][2]
  const end = list[i][2]
  const len = (end - start + LOOP) % LOOP || LOOP
  const at = ((t % LOOP) + LOOP) % LOOP
  return Math.min(1, Math.max(0, ((at - start + LOOP) % LOOP) / len))
}

/** Instant où amener la vidéo pour montrer le chapitre i (écran en place, juste après sa transition). */
export function seekTime(list: Chapter[], i: number): number {
  return (list[i][1] + 0.05) % LOOP
}
