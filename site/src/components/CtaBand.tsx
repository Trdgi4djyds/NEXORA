import { SPACES } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { DownloadButton, WebButton } from "./Download"

/** Bandeau final aux couleurs de NEXORA : pictogrammes des espaces au trait, qui s'effacent en transparence. */
export function CtaBand({
  title = "Prêt à créer ton prochain projet ?",
  text = "Télécharge NEXORA et ouvre ton premier projet. C’est gratuit, et tu passes à Standard ou à Pro le jour où tu en as besoin.",
}: {
  title?: string
  text?: string
}) {
  return (
    <section className="section tight cta-sec" data-capture="appel">
      <div className="container">
        <Reveal className="cta">
          <div className="cta-art" aria-hidden="true">
            {SPACES.map((s, i) => (
              <span key={s.id} style={{ animationDelay: `${i * -1.1}s` }}>
                <Icon name={s.icon} size={44} stroke={1.4} />
              </span>
            ))}
          </div>
          <h2 className="h-2">{title}</h2>
          <p>{text}</p>
          <div className="btn-stack center">
            <DownloadButton size="lg" variant="white" />
            <WebButton size="lg" variant="outline-white" />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
