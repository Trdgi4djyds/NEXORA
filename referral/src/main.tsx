// NEXORA #090 : NEXORA REFERRAL, espace des parrains (servi sous /referral/, publié dans dist/referral/).
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { ToastHost } from "./ui"
import "./styles.css"

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ToastHost>
      <App />
    </ToastHost>
  </StrictMode>,
)
