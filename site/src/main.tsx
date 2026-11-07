// NEXORA #060 : site vitrine de NEXORA, servi par Vite sous /site/ dans l'aperçu et publié dans dist/site/
// (scripts/build-web.mjs). Interface plate (#045) : ni ombre portée, ni dégradé décoratif, ni effet lumineux.
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./styles/base.css"
import "./styles/sections.css"
import "./styles/window.css"
import "./styles/scenes.css"
import "./styles/minis.css"
import "./styles/motion.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
