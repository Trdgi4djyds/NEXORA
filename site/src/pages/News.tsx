import { CtaBand } from "../components/CtaBand"
import { NewsCards } from "../components/NewsCards"
import { SectionHead } from "../components/SectionHead"
import { Reveal } from "../lib/motion"
import { RELEASES } from "../lib/product"

export function News() {
  return (
    <>
      <section className="page-hero" data-capture="haut">
        <div className="hero-bg dots" aria-hidden="true" />
        <div className="container">
          <SectionHead
            as="h1"
            eyebrow="Nouveautés"
            title={["Ce qui arrive", "dans NEXORA."]}
            lead="Chaque version apporte de nouvelles fonctions. NEXORA te les présente une fois après la mise à jour ; les voici toutes."
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
