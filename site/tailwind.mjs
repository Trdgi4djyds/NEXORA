// NEXORA #085 : Tailwind CSS 4 pour le site vitrine seulement. Le même serveur Vite sert aussi le back office
// (admin/) et l'aperçu de NEXORA : les greffons de @tailwindcss/vite ne transforment que les feuilles de site/.
// Utilisé par vite.config.ts (aperçu) et scripts/build-web.mjs (publication).
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SITE = path.dirname(fileURLToPath(import.meta.url)).split(path.sep).join("/") + "/"
const inSite = (id) => typeof id === "string" && id.split("?")[0].split(path.sep).join("/").startsWith(SITE)

export function siteTailwind() {
  return tailwindcss().map((plugin) => {
    const hook = plugin.transform
    if (!hook) return plugin
    if (typeof hook === "function") {
      return { ...plugin, transform(code, id, ...rest) { return inSite(id) ? hook.call(this, code, id, ...rest) : undefined } }
    }
    const handler = hook.handler
    return {
      ...plugin,
      transform: { ...hook, handler(code, id, ...rest) { return inSite(id) ? handler.call(this, code, id, ...rest) : undefined } },
    }
  })
}
