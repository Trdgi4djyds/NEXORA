// NEXORA #066 : écrans réels de NEXORA (captures de l'application, scripts/ecrans-vitrine.mjs). Plus aucune interface
// reproduite. #085 : captures dans le thème sombre de NEXORA (`node scripts/ecrans-vitrine.mjs --sombre`, après
// `pnpm build`). #086 : les appareils des maquettes affichent le site vitrine lui-même (lib/devices.ts) ; le site de
// démonstration Kora n'est plus importé (ses captures restent dans le dossier).
import type { SpaceId } from "../data/spaces"
import accueil from "../assets/ecrans/accueil-sombre.webp"
import apps from "../assets/ecrans/apps-sombre.webp"
import browser from "../assets/ecrans/browser-sombre.webp"
import design from "../assets/ecrans/design-sombre.webp"
import desktop from "../assets/ecrans/desktop-sombre.webp"
import dev from "../assets/ecrans/dev-sombre.webp"
import responsive from "../assets/ecrans/responsive-sombre.webp"
import securite from "../assets/ecrans/securite-sombre.webp"
import studio from "../assets/ecrans/studio-sombre.webp"

/** Taille des captures de NEXORA (pixels), pour réserver la place avant le chargement. */
export const SCREEN_W = 1600
export const SCREEN_H = 1000

export const SCREENS: Record<SpaceId, string> = {
  home: accueil,
  preview: responsive,
  browser,
  dev,
  android: apps,
  studio,
  design,
  security: securite,
  desktop,
}
