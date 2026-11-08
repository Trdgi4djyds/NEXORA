// NEXORA #066 : écrans réels de NEXORA (captures de l'application, scripts/ecrans-vitrine.mjs) et site de
// démonstration « Kora » (photos Unsplash) affiché dans les appareils. Plus aucune interface reproduite.
// NEXORA #068 : direction « Nocturne » : les écrans dans le thème sombre de NEXORA
// (`node scripts/ecrans-vitrine.mjs --sombre`), et le site de démonstration dans un vrai Pixel 10 Pro.
// NEXORA #074 : direction « Prisme », thème blanc : retour aux captures claires du #066
// (`node scripts/ecrans-vitrine.mjs`, sans `--sombre`) ; les captures sombres restent dans le dossier.
import type { SpaceId } from "../data/spaces"
import pixel10Pro from "../assets/appareils/pixel-10-pro.webp"
import accueil from "../assets/ecrans/accueil.webp"
import apps from "../assets/ecrans/apps.webp"
import browser from "../assets/ecrans/browser.webp"
import design from "../assets/ecrans/design.webp"
import desktop from "../assets/ecrans/desktop.webp"
import dev from "../assets/ecrans/dev.webp"
import koraDesktop from "../assets/ecrans/kora-bureau.webp"
import koraPixel from "../assets/ecrans/kora-pixel.webp"
import responsive from "../assets/ecrans/responsive.webp"
import securite from "../assets/ecrans/securite.webp"
import studio from "../assets/ecrans/studio.webp"

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
/** Site de démonstration Kora en bureau (navigateur de « Publie partout ») et en mobile (Pixel). */
export const KORA_DESKTOP = koraDesktop
export const KORA_PIXEL = koraPixel
export const PIXEL_10_PRO = pixel10Pro
