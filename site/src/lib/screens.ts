// NEXORA #066 : écrans réels de NEXORA (captures de l'application, scripts/ecrans-vitrine.mjs) et site de
// démonstration « Kora » (photos Unsplash) affiché dans les appareils. Plus aucune interface reproduite.
// NEXORA #068 : direction « Nocturne » : les écrans dans le thème sombre de NEXORA
// (`node scripts/ecrans-vitrine.mjs --sombre`), et le site de démonstration dans un vrai Pixel 10 Pro.
import type { SpaceId } from "../data/spaces"
import pixel10Pro from "../assets/appareils/pixel-10-pro.webp"
import accueilS from "../assets/ecrans/accueil-sombre.webp"
import appsS from "../assets/ecrans/apps-sombre.webp"
import browserS from "../assets/ecrans/browser-sombre.webp"
import designS from "../assets/ecrans/design-sombre.webp"
import desktopS from "../assets/ecrans/desktop-sombre.webp"
import devS from "../assets/ecrans/dev-sombre.webp"
import koraDesktop from "../assets/ecrans/kora-bureau.webp"
import koraPixel from "../assets/ecrans/kora-pixel.webp"
import responsiveS from "../assets/ecrans/responsive-sombre.webp"
import securiteS from "../assets/ecrans/securite-sombre.webp"
import studioS from "../assets/ecrans/studio-sombre.webp"

/** Taille des captures de NEXORA (pixels), pour réserver la place avant le chargement. */
export const SCREEN_W = 1600
export const SCREEN_H = 1000

export const SCREENS_DARK: Record<SpaceId, string> = {
  home: accueilS,
  preview: responsiveS,
  browser: browserS,
  dev: devS,
  android: appsS,
  studio: studioS,
  design: designS,
  security: securiteS,
  desktop: desktopS,
}
/** Site de démonstration Kora en bureau (navigateur de « Publie partout ») et en mobile (Pixel). */
export const KORA_DESKTOP = koraDesktop
export const KORA_PIXEL = koraPixel
export const PIXEL_10_PRO = pixel10Pro
