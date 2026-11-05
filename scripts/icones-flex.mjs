#!/usr/bin/env node
// NEXORA #043 : génère nexora/app/renderer/nx/icons/flex.js, les icônes « Streamline Flex » (jeu gratuit,
// licence CC BY 4.0, © Streamline) utilisées par l'application, la version web et le back office à la place
// des pictogrammes d'origine qui ont un équivalent.
//
// Les données viennent du paquet Iconify @iconify-json/streamline-flex, installé HORS du dépôt :
//   mkdir -p /tmp/flex && cd /tmp/flex && pnpm add @iconify-json/streamline-flex svgpath
// puis, depuis la racine : FLEX_DIR=/tmp/flex pnpm icones:flex
//
// Les icônes Flex sont dessinées au trait sur une grille de 14 (trait de 1). Les tracés sont recalculés sur
// la grille de 24 de NEXORA : l'épaisseur du trait reste celle du gabarit qui les affiche (1,7 par défaut,
// soit le trait Flex d'origine), y compris pour les appelants qui choisissent une autre épaisseur.
import { createRequire } from "node:module"
import { writeFileSync } from "node:fs"
import path from "node:path"

const FLEX_DIR = process.env.FLEX_DIR || "/tmp/flex"
const require = createRequire(path.join(FLEX_DIR, "package.json"))
const SET = require("@iconify-json/streamline-flex/icons.json")
const svgpath = require("svgpath")
const OUT = new URL("../nexora/app/renderer/nx/icons/flex.js", import.meta.url)

// Nom NEXORA -> icône Flex (Line). « <nom>|flip » : icône retournée horizontalement.
// Les noms absents gardent leur dessin d'origine (flèches, chevrons, plus, moins, lecture…), déjà au trait
// rond de même épaisseur.
const MAP = {
  heart: "heart",
  bolt: "flash-3",
  cart: "shopping-cart-2",
  chat: "chat-bubble-text-square",
  music: "music-note-circle",
  gift: "gift-2",
  clock: "search-history-browser",
  cloud: "cloud",
  rocket: "rocket",
  mail: "mail-send-envelope",
  user: "user-circle-single",
  home: "home-2",
  unlock: "padlock-square-2",
  group: "align-back-1",
  bulb: "lightbulb",
  spot: "table-lamp-2",
  wand: "magic-wand-2",
  watch: "watch-2",
  gamepad: "controller-wireless",
  car: "car-taxi-1",
  sidebar: "layout-right-sidebar|flip",
  sidebarRight: "layout-right-sidebar",
  inspector: "browser-dashboard",
  sun: "sun",
  moon: "dark-dislay-mode",
  auto: "flip-horizontal-circle-2",
  link: "link-chain",
  paste: "empty-clipboard",
  folder: "new-folder",
  globe: "earth-1",
  lock: "padlock-square-1",
  camera: "camera-1",
  video: "camera-video",
  record: "button-record-1",
  present: "presentation",
  search: "magnifying-glass",
  code: "code-monitor-1",
  audit: "dashboard-gauge-1",
  info: "information-circle",
  warn: "warning-diamond",
  error: "block-2",
  pass: "check-square",
  external: "expand-window-1",
  copy: "copy-2",
  wrench: "screwdriver-wrench",
  frame: "focus-frame",
  file: "new-file",
  phone: "iphone",
  laptop: "laptop",
  display: "screen-curve",
  palette: "color-swatches",
  tv: "screen-broadcast",
  layers: "layers-1",
  cube: "cube",
  film: "film",
  download: "download-tray",
  upload: "upload-box-1",
  trash: "recycle-bin-3",
  grid: "dashboard-3",
  multi: "ios-ipados",
  image: "landscape-2",
  pdf: "pdf-reader-application",
  move: "arrow-move",
  wave: "tidal-wave",
  rotate3d: "3d-rotate-1",
  scale: "arrow-expand",
  target: "location-target-2",
  light: "brightness-1",
  text: "text-style",
  keyframe: "key-frame",
  bell: "bell",
  shield: "shield-1",
  phoneSettings: "phone-notification",
  pen: "pen-tool",
  pencil: "pen-1",
  usb: "usb-port",
  // Icônes ajoutées par les modules (nx/core.js, nx/offres, nx/profil).
  nxLasso: "polygonal-lasso-tool",
  nxWand: "magic-wand-1",
  nxBrush: "paintbrush-2",
  nxCrop: "expand-crop-resize",
  nxScissors: "scissors",
  nxCut: "scissors",
  nxCurve: "curves-levels-graph",
  nxComment: "chat-bubble-typing-oval",
  nxHistory: "search-history-browser",
  nxComponent: "module-puzzle-2",
  nxChart: "graph-bar-increase-square",
  nxTable: "table",
  nxQr: "qr-code",
  nxSticker: "new-sticky-note",
  nxPhysics: "ball",
  nxSpeed: "dashboard-gauge-1",
  nxBeat: "music-equalizer",
  nxSubs: "video-close-captioning",
  nxInteract: "cursor-click",
  nxSun: "sun",
  nxPalette: "color-picker",
  nxBrand: "star-badge",
  nxZip: "zip-folder",
  nxPresent: "projector-board",
  nxCloud2: "cloud-data-transfer",
  nxUsers: "user-collaborate-group",
  nxPointer: "arrow-cursor-2",
  nxTee: "shirt",
  nxMug: "tea-cup",
  nxBox: "shipping-box-2",
  nxCard: "credit-card-4",
  nxDev: "code-monitor-1",
  nxWorld: "earth-1",
  nxQuality: "warranty-badge-highlight",
  nxFolder2: "new-folder",
  nxMarker: "location-pin-3",
  nxTag: "tag",
  nxSend: "mail-send-email-message-circle",
  nxCrown: "crown",
  nxCalendar: "blank-calendar",
  nxType: "text-square",
  nxGrade: "horizontal-slider-2",
  nxMaterial: "texture",
  nxGridCols: "rectangle-split-thirds",
}

// Variante pleine (« Solid ») des icônes des espaces : affichée sur la tuile de l'espace ouvert (rail).
const SOLID = {
  home: "home-2-solid",
  multi: "ios-ipados-solid",
  globe: "earth-1-solid",
  code: "code-monitor-1-solid",
  cube: "cube-solid",
  palette: "color-swatches-solid",
  shield: "shield-1-solid",
  display: "screen-curve-solid",
}

const K = 24 / 14
function convert(name, flip) {
  const icon = SET.icons[name]
  if (!icon) throw new Error(`Icône Flex introuvable : ${name}`)
  const w = icon.width || SET.width || 14
  if (w !== 14) throw new Error(`Grille inattendue pour ${name} : ${w}`)
  return icon.body
    .replace(/ d="([^"]+)"/g, (_, d) => {
      let p = svgpath(d)
      if (flip) p = p.scale(-1, 1).translate(14, 0)
      return ` d="${p.scale(K).round(2).toString()}"`
    })
    .replace(/'/g, '"')
}

const lines = []
const out = (obj, solid) => {
  for (const [k, v] of Object.entries(obj)) {
    const [name, opt] = v.split("|")
    let body = convert(name, opt === "flip")
    if (solid) body = `<g stroke="none">${body}</g>`
    lines.push(`  ${k}: '${body}',`)
  }
}

lines.push(
  "// NEXORA #043 : icônes « Streamline Flex » (Line et Solid), jeu gratuit de Streamline (https://www.streamlinehq.com),",
  "// sous licence Creative Commons Attribution 4.0 (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/).",
  "// Tracés recalculés sur la grille de 24 de NEXORA ; voir LICENCE.md dans ce dossier.",
  "// Fichier généré par scripts/icones-flex.mjs (pnpm icones:flex) : ne pas modifier à la main.",
  "export const FLEX = {",
)
out(MAP, false)
lines.push(
  "};",
  "",
  "// Variante pleine des icônes des espaces (tuile de l'espace ouvert).",
  "export const FLEX_SOLID = {",
)
out(SOLID, true)
lines.push("};", "")
writeFileSync(OUT, lines.join("\n"))
console.log(
  `${Object.keys(MAP).length} icônes Flex et ${Object.keys(SOLID).length} variantes pleines écrites dans ${OUT.pathname}`,
)
