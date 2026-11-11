// Aperçu d'un e-mail dans le back office (#031) : iframe isolée à la hauteur du contenu, thème clair ou
// sombre forcé (le mode sombre de l'e-mail dépend sinon du système), logo et police Inter servis par le
// back office (l'aperçu ne dépend d'aucune ressource extérieure).
import { useEffect, useMemo, useRef, useState } from "react"
import logo from "../../../nexora/app/renderer/logo.png"
import inter from "../../../nexora/app/renderer/fonts/inter-latin-opsz-normal.woff2"
import { LOGO_URL } from "./templates"

const DARK_QUERY = "@media (prefers-color-scheme:dark){"

export function previewDoc(html: string, dark: boolean) {
  return html
    .split(LOGO_URL)
    .join(logo)
    .replace(
      /<link href="https:\/\/fonts\.googleapis\.com[^>]*>/,
      `<style>@font-face{font-family:Inter;src:url(${inter}) format("woff2");font-weight:100 900}</style><base target="_blank">`,
    )
    .replace(DARK_QUERY, dark ? "@media all{" : "@media not all{")
}

export function EmailFrame({ html, dark = false, width = 660, title = "Aperçu de l’e-mail" }: { html: string; dark?: boolean; width?: number; title?: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(640)
  const doc = useMemo(() => previewDoc(html, dark), [html, dark])
  const fit = () => {
    const el = ref.current?.contentDocument?.documentElement
    if (el) setHeight(el.scrollHeight)
  }
  // La police arrive parfois après le chargement : nouvelle mesure un peu plus tard.
  useEffect(() => {
    const t = setTimeout(fit, 400)
    return () => clearTimeout(t)
  }, [doc, width])
  return (
    <div className={`email-frame${dark ? " dark" : ""}`} style={{ maxWidth: width }}>
      <iframe ref={ref} title={title} srcDoc={doc} onLoad={fit} style={{ height }} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
    </div>
  )
}
