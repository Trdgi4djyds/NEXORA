// Données lues dans les sources de NEXORA, pour que le site reste à jour sans recopie : version de l'application,
// catalogue des appareils du Responsive Lab, offres de repli. NEXORA #127 : plus de nouveautés ni de notes de version
// sur le site (exigence de l'utilisateur) ; elles restent dans l'application (nx/version/notes.js).
import { version } from "../../../nexora/app/package.json"
import { a as CATEGORIES, b as DEVICES } from "../../../nexora/app/renderer/dist/chunks/chunk-ZAWUH4BJ.js"

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

/**
 * NEXORA web : /studio/ du domaine depuis le #096 (racine du site publié jusqu'au #095). Dans l'aperçu Figma Make,
 * l'application est à « /?app ».
 */
export const WEB_URL: string = import.meta.env.VITE_NEXORA_WEB ?? (import.meta.env.DEV ? "/?app" : "/studio/")
