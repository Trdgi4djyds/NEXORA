// NEXORA #060 : site vitrine de NEXORA, servi par Vite sous /site/ dans l'aperçu et publié dans dist/site/
// (scripts/build-web.mjs). #085 : direction « Néon » (sombre, Poppins, 3D ; Tailwind CSS 4 et
// shadcn/ui), styles/neon.css ; #088 : couleurs du logo (rose et bleu) à la place du vert électrique.
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./styles/neon.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
