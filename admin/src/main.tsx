import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { AuthGate } from "./auth"
import { UiProvider } from "./ui"
// NEXORA #033 : teintes et calque des illustrations de fond des cartes, partagés avec l'application.
import "../../nexora/app/renderer/nx/cards/cards.css"
import "./styles.css"
// NEXORA #045 : interface plate (ombres, lueurs et reliefs retirés des feuilles de style), comme l'application.
import "../../nexora/app/renderer/nx/look/plat.js"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UiProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </UiProvider>
  </StrictMode>,
)
