import { CtaBand } from "../components/CtaBand"
import { NewsCards } from "../components/NewsCards"
import { SectionHead } from "../components/SectionHead"
import { Reveal } from "../lib/motion"
import { RELEASES } from "../lib/product"

export function News() {
  return (
    <>
      <section className="page-hero" data-capture="haut" data-light>
        <i className="grid-bg" aria-hidden="true" />
        <i className="grid-lit" aria-hidden="true" />
        <i className="torch" aria-hidden="true" />
        <div className="container">
          <SectionHead
            as="h1"
            align="left"
            eyebrow="Nouveautés"
            title={["Ce qui a changé", "dans NEXORA."]}
            lead="Chaque version apporte de nouvelles fonctions. NEXORA te les présente une fois après la mise à jour ; les voici toutes, de la plus récente à la plus ancienne."
          />
        </div>
      </section>
      {RELEASES.map(([version, note]) => (
        <section className="section tight release" key={version}>
          <div className="container">
            <Reveal className="release-head">
              <span className="release-v">Version {version}</span>
              <h2 className="h-2">{note.title}</h2>
              <p className="lead">{note.intro}</p>
            </Reveal>
            <NewsCards items={note.items} />
          </div>
        </section>
      ))}
      <CtaBand />
    </>
  )
}
