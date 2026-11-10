// NEXORA #060 : site vitrine de NEXORA, servi par Vite sous /site/ dans l'aperçu et publié dans dist/site/
// (scripts/build-web.mjs). #085 : direction « Néon » (sombre, Poppins, 3D ; Tailwind CSS 4 et
// shadcn/ui), styles/neon.css ; #088 : couleurs du logo. #092 : direction « Signal », styles/signal.css (sombre et clair alternés,
// une couleur par espace, accent citron vert, grotesque serrée).
import { StrictMode } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { App } from "./App"
import { BASE, migrateHashRoute } from "./router"
import "./styles/signal.css"

// NEXORA #096 : anciennes adresses « #/… » converties (ou envoyées vers NEXORA web, /studio/) avant le premier rendu.
const before = location.pathname
if (!migrateHashRoute()) {
  const el = document.getElementById("root")!
  // Adresse convertie (« /#/tarifs » → « /tarifs ») : la page reçue n'est pas celle à afficher, rendu complet.
  const converted = location.pathname !== before
  const tree = (
    <StrictMode>
      <App />
    </StrictMode>
  )
  // Page pré-générée (publication) : React reprend le HTML déjà affiché ; aperçu de développement : rendu complet.
  if (el.firstElementChild && !converted) hydrateRoot(el, tree)
  else createRoot(el).render(tree)

  // PWA (#096) : service worker du site (hors ligne, mise en cache des fichiers), en production à la racine seulement.
  if (import.meta.env.PROD && !BASE && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined)
    })
  }
}
