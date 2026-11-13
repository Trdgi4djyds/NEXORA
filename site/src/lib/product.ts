// Données lues dans les sources de NEXORA, pour que le site reste à jour sans recopie : version de l'application,
// catalogue des appareils du Responsive Lab, nouveautés de chaque version, offres de repli.
import { version } from "../../../nexora/app/package.json"
import { a as CATEGORIES, b as DEVICES } from "../../../nexora/app/renderer/dist/chunks/chunk-ZAWUH4BJ.js"
import { NOTES } from "../../../nexora/app/renderer/nx/version/notes.js"

export const APP_VERSION: string = version

export type Device = { id: string; name: string; category: string; w?: number; h?: number; states?: { id: string; w: number; h: number }[] }
export const DEVICE_LIST = DEVICES as Device[]
export const DEVICE_COUNT = DEVICE_LIST.length

export type DeviceCategory = { id: string; label: string; color: string; glyph: string; count: number }
export const DEVICE_CATEGORIES: DeviceCategory[] = (CATEGORIES as Omit<DeviceCategory, "count">[])
  .map((c) => ({ ...c, count: DEVICE_LIST.filter((d) => d.category === c.id).length }))
  .filter((c) => c.count > 0)

/** Taille d'affichage d'un appareil du catalogue (état « ouvert » pour les pliables). */
export function deviceSize(id: string) {
  const d = DEVICE_LIST.find((x) => x.id === id)
  if (!d) return null
  const s = d.states?.find((x) => x.id === "open") || d.states?.[0]
  const w = s?.w ?? d.w
  const h = s?.h ?? d.h
  return w && h ? { name: d.name, w, h } : null
}

export type NoteItem = { icon: string; space: string; title: string; text: string }
export type Note = { title: string; intro: string; items: NoteItem[] }
const cmp = (a: string, b: string) => {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < 3; i += 1) if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0)
  return 0
}
/**
 * NEXORA #117 : sur le site, les nouveautés ne parlent ni des offres ni des prix (réservés à /tarifs, /tarifs/comparatif
 * et /licence) : un élément dont le titre en cite un est retiré, une phrase qui en cite un est retirée du texte. Les
 * notes de l'application (nx/version/notes.js) restent intactes.
 */
const OFFER = /\b(pro|gratuite?s?|offertes?|offres?|essai|abonnements?)\b|\$/i
/** Chapeau propre au site quand celui de l'application cite une offre. */
const SITE_INTRO: Record<string, string> = {
  "1.2.0": "NEXORA Devs Toolbox : une installation vérifiée à chaque démarrage, un assistant IA sans limite, et l’App Builder comme le Desktop Builder prêts pour la distribution.",
}
function withoutOffers(version: string, note: Note): Note {
  const items = note.items
    .filter((it) => !OFFER.test(it.title))
    .map((it) => ({ ...it, text: it.text.split(/(?<=[.!?])\s+/).filter((x) => !OFFER.test(x)).join(" ") }))
    .filter((it) => it.text)
  const intro = !OFFER.test(note.intro) ? note.intro : SITE_INTRO[version] || `${items.slice(0, 3).map((it) => it.title).join(", ")}.`
  return { ...note, intro, items }
}
export const RELEASES: [string, Note][] = (Object.entries(NOTES) as [string, Note][])
  .sort((a, b) => cmp(a[0], b[0]))
  .map(([v, n]) => [v, withoutOffers(v, n)] as [string, Note])

/**
 * NEXORA web : /studio/ du domaine depuis le #096 (racine du site publié jusqu'au #095). Dans l'aperçu Figma Make,
 * l'application est à « /?app ».
 */
export const WEB_URL: string = import.meta.env.VITE_NEXORA_WEB ?? (import.meta.env.DEV ? "/?app" : "/studio/")
