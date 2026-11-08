import { CtaBand } from "../components/CtaBand"
import { NewsCards } from "../components/NewsCards"
import { PageHero, SectionHead } from "../components/SectionHead"
import { Badge } from "../components/ui/badge"
import { Reveal } from "../lib/motion"
import { RELEASES } from "../lib/product"

export function News() {
  return (
    <>
      <PageHero>
        <SectionHead
          as="h1"
          align="left"
          eyebrow="Nouveautés"
          title={["Ce qui a changé", "dans NEXORA."]}
          lead="Chaque version apporte de nouvelles fonctions. NEXORA te les présente une fois après la mise à jour ; les voici toutes, de la plus récente à la plus ancienne."
          className="mb-0 md:mb-0"
        />
      </PageHero>
      {RELEASES.map(([version, note], i) => (
        <section className="section-tight border-t border-white/[0.06]" key={version}>
          <div className="wrap">
            <Reveal className="mb-10 grid gap-4 md:grid-cols-[200px_1fr]">
              <div>
                <Badge variant={i === 0 ? "solid" : "default"}>Version {version}</Badge>
              </div>
              <div>
                <h2 className="title-2">{note.title}</h2>
                <p className="lead mt-4 max-w-3xl">{note.intro}</p>
              </div>
            </Reveal>
            <NewsCards items={note.items} />
          </div>
        </section>
      ))}
      <CtaBand />
    </>
  )
}
