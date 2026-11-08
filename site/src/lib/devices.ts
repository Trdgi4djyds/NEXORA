// NEXORA #086 : appareils des maquettes du site, cadres photoréalistes et captures du site vitrine lui-même.
// Cadres : ensemble « Devices » de Meta redistribué par fastlane/frameit-frames (iPhone, Galaxy, iPad, MacBook,
// Surface) et habillages officiels d'Android Studio livrés avec NEXORA (Pixel, pliable, tablette, TV, voiture,
// montre ; Apache 2.0), préparés par `node scripts/ressources-vitrine.mjs appareils`.
// Mesures dans l'image d'origine (avant réduction, proportionnelle) : taille du cadre, position et taille de la dalle.
// `layer` : « under » = la dalle passe sous le cadre (son ouverture arrondie la découpe), « over » = la dalle est posée
// sur l'habillage (Android Studio), avec le rayon de ses coins.
// Écrans : le site vitrine capturé à la taille de chaque appareil (`node scripts/ecrans-vitrine.mjs site`).
import galaxyFrame from "../assets/appareils/galaxy-s21-ultra.webp"
import ipadFrame from "../assets/appareils/ipad-pro-12-9.webp"
import iphoneFrame from "../assets/appareils/iphone-17-pro.webp"
import iphoneBlueFrame from "../assets/appareils/iphone-17-pro-bleu.webp"
import macbookFrame from "../assets/appareils/macbook-pro-16.webp"
import watchFrame from "../assets/appareils/montre.webp"
import foldFrame from "../assets/appareils/pixel-10-pro-fold.webp"
import pixelFrame from "../assets/appareils/pixel-10-pro.webp"
import tabletFrame from "../assets/appareils/pixel-tablet.webp"
import surfaceFrame from "../assets/appareils/surface-pro-x.webp"
import tvFrame from "../assets/appareils/tv-4k.webp"
import carFrame from "../assets/appareils/voiture.webp"
import siteDesktop from "../assets/ecrans/site-bureau.webp"
import siteGalaxy from "../assets/ecrans/site-galaxy.webp"
import siteIpad from "../assets/ecrans/site-ipad.webp"
import siteIphone from "../assets/ecrans/site-iphone.webp"
import siteMacbook from "../assets/ecrans/site-macbook.webp"
import sitePixel from "../assets/ecrans/site-pixel.webp"
import siteFold from "../assets/ecrans/site-pliable.webp"
import siteTablet from "../assets/ecrans/site-tablette.webp"
import siteTv from "../assets/ecrans/site-tv.webp"
import siteCar from "../assets/ecrans/site-voiture.webp"

export type DeviceSpec = {
  frame: string
  w: number
  h: number
  x: number
  y: number
  sw: number
  sh: number
  r?: number
  layer: "under" | "over"
  /** Modèle et famille, comme dans le catalogue du Responsive Lab. */
  name: string
  family: string
  /** Taille de l'écran en pixels CSS (affichée sous l'appareil). */
  css: string
  screen?: string
  round?: boolean
  cam?: boolean
}

export const DEVICES = {
  iphone: { frame: iphoneFrame, w: 1350, h: 2760, x: 72, y: 69, sw: 1206, sh: 2622, layer: "under", name: "iPhone 17 Pro", family: "iPhone", css: "402 × 874", screen: siteIphone },
  iphoneBlue: { frame: iphoneBlueFrame, w: 1350, h: 2760, x: 72, y: 69, sw: 1206, sh: 2622, layer: "under", name: "iPhone 17 Pro", family: "iPhone", css: "402 × 874", screen: siteIphone },
  galaxy: { frame: galaxyFrame, w: 1540, h: 3324, x: 44, y: 54, sw: 1440, sh: 3200, layer: "under", name: "Galaxy S21 Ultra", family: "Samsung Galaxy", css: "412 × 915", screen: siteGalaxy },
  pixel: { frame: pixelFrame, w: 1410, h: 2968, x: 59, y: 60, sw: 1280, sh: 2856, r: 99, layer: "over", name: "Pixel 10 Pro", family: "Google Pixel", css: "427 × 952", screen: sitePixel, cam: true },
  fold: { frame: foldFrame, w: 2201, h: 2268, x: 62, y: 58, sw: 2076, sh: 2152, r: 133, layer: "over", name: "Pixel 10 Pro Fold", family: "Pliables", css: "692 × 717", screen: siteFold },
  ipad: { frame: ipadFrame, w: 2245, h: 2930, x: 96, y: 102, sw: 2048, sh: 2732, layer: "under", name: "iPad Pro 12,9 pouces", family: "Tablettes", css: "1024 × 1366", screen: siteIpad },
  tablet: { frame: tabletFrame, w: 2798, h: 1837, x: 119, y: 117, sw: 2560, sh: 1600, r: 31, layer: "over", name: "Pixel Tablet", family: "Tablettes", css: "1280 × 800", screen: siteTablet },
  macbook: { frame: macbookFrame, w: 3910, h: 2241, x: 419, y: 98, sw: 3072, sh: 1920, layer: "under", name: "MacBook Pro 16 pouces", family: "Ordinateurs", css: "1536 × 960", screen: siteMacbook },
  surface: { frame: surfaceFrame, w: 3020, h: 2188, x: 74, y: 134, sw: 2880, sh: 1920, layer: "under", name: "Surface Pro X", family: "Ordinateurs", css: "1440 × 960", screen: siteDesktop },
  tv: { frame: tvFrame, w: 4180, h: 2510, x: 170, y: 118, sw: 3840, sh: 2160, layer: "over", name: "Téléviseur 4K", family: "Téléviseurs", css: "1920 × 1080", screen: siteTv },
  car: { frame: carFrame, w: 1461, h: 1481, x: 218, y: 124, sw: 1024, sh: 768, layer: "over", name: "Écran de voiture", family: "Voitures", css: "1024 × 768", screen: siteCar },
  watch: { frame: watchFrame, w: 539, h: 539, x: 42, y: 42, sw: 454, sh: 454, layer: "under", name: "Montre ronde", family: "Montres", css: "227 × 227", round: true },
} satisfies Record<string, DeviceSpec>

export type DeviceKind = keyof typeof DEVICES
/** Le site vitrine en bureau (navigateur de « Publie partout », fenêtre Windows du Desktop Builder). */
export const SITE_DESKTOP = siteDesktop
