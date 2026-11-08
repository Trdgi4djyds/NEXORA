// NEXORA #060 : site vitrine de NEXORA, servi par Vite sous /site/ dans l'aperçu et publié dans dist/site/
// (scripts/build-web.mjs). #074 : direction « Prisme » (thème blanc, vert tech, rose et violet, 3D), styles/prisme.css.
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./styles/prisme.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
