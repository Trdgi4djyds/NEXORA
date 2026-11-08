import { Reveal } from "../lib/motion"
import { DownloadButton, WebButton } from "./Download"
import { Words } from "./SectionHead"

/** Appel final (#069) : grille qui s'éclaire autour du pointeur (`data-light`), titre mot à mot. */
export function CtaBand({
  title = "Ouvre ton premier projet aujourd’hui.",
  text = "NEXORA est gratuit, sans limite de durée. Tu passes à Standard ou à Pro le jour où tu publies.",
}: {
  title?: string
  text?: string
}) {
  return (
    <section className="section cta-sec" data-capture="appel" data-light>
      <i className="grid-bg" aria-hidden="true" />
      <i className="grid-lit" aria-hidden="true" />
      <i className="torch" aria-hidden="true" />
      <div className="container">
        <Reveal className="cta">
          <h2 className="h-2 words">
            <Words text={title} />
          </h2>
          <p>{text}</p>
          <div className="btn-stack center" data-glow>
            <DownloadButton size="lg" />
            <WebButton size="lg" />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
