// NEXORA #096 : rendu côté serveur des pages du site vitrine, utilisé seulement à la publication
// (scripts/build-web.mjs) pour écrire une page HTML complète par adresse : chaque robot reçoit le contenu de la page
// demandée, et non une coquille vide commune à toutes les pages.
import { renderToString } from "react-dom/server"
import { App } from "./App"
import { setServerPath } from "./router"

export { headFor, PAGES, SITE_URL, STUDIO_URL, OG_IMAGE, LOCALE, SITE_NAME } from "./seo"
export { SPACES } from "./data/spaces"
export { FAQ } from "./data/content"
export { PERSONAS } from "./data/personas"
export { APP_VERSION, DEVICE_COUNT, RELEASES } from "./lib/product"

export function render(path: string): string {
  setServerPath(path)
  return renderToString(<App />)
}
