// NEXORA #100 : rendus 3D du site, faits avec three.js et react-3d-mockups (MIT) à partir des vraies captures de
// NEXORA (scripts/rendus-3d/, voir son README), et icônes en verre des espaces (tracés des icônes de NEXORA en tubes).
import type { SpaceId } from "../data/spaces"
import macbookIphone from "../assets/rendus/macbook-iphone.webp"
import deuxMacbook from "../assets/rendus/deux-macbook.webp"
import studioDisplay from "../assets/rendus/studio-display.webp"
import ipadPro from "../assets/rendus/ipad-pro.webp"
import home from "../assets/rendus/verre-home.webp"
import preview from "../assets/rendus/verre-preview.webp"
import browser from "../assets/rendus/verre-browser.webp"
import dev from "../assets/rendus/verre-dev.webp"
import android from "../assets/rendus/verre-android.webp"
import studio from "../assets/rendus/verre-studio.webp"
import design from "../assets/rendus/verre-design.webp"
import security from "../assets/rendus/verre-security.webp"
import desktop from "../assets/rendus/verre-desktop.webp"

/** Rendus d'appareils : adresse, taille réelle du fichier (pour réserver la place) et texte de remplacement. */
export const RENDUS = {
  macbookIphone: { src: macbookIphone, w: 1622, h: 1017, alt: "MacBook Pro affichant le Dev Lab de NEXORA, et iPhone affichant le site de NEXORA" },
  deuxMacbook: { src: deuxMacbook, w: 1800, h: 832, alt: "Deux MacBook Pro face à face, l’un sur l’Accueil de NEXORA, l’autre sur l’App Builder" },
  studioDisplay: { src: studioDisplay, w: 1400, h: 1300, alt: "Studio Display affichant NEX-DESIGN, l’espace de design de NEXORA" },
  ipadPro: { src: ipadPro, w: 1200, h: 1108, alt: "iPad Pro affichant le Studio 3D & Motion de NEXORA" },
} as const

/** Icône en verre de chaque espace. */
export const GLASS: Record<SpaceId, string> = { home, preview, browser, dev, android, studio, design, security, desktop }
