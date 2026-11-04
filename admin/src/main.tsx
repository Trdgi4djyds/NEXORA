import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { AuthGate } from "./auth"
import { UiProvider } from "./ui"
// NEXORA #033 : teintes et calque des illustrations de fond des cartes, partagés avec l'application.
import "../../nexora/app/renderer/nx/cards/cards.css"
import "./styles.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UiProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </UiProvider>
  </StrictMode>,
)
