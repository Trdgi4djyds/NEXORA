import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { AuthGate } from "./auth"
import { UiProvider } from "./ui"
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
