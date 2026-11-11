import { Watermark, WordStrip } from "../components/Blocks"
import { CtaBand } from "../components/CtaBand"
import { NewsCards } from "../components/NewsCards"
import { PageHero, SectionHead } from "../components/SectionHead"
import { Badge } from "../components/ui/badge"
import { Reveal } from "../lib/motion"
import { RELEASES } from "../lib/product"
import { cn } from "../lib/utils"

/** #105 : filigranes informatiques des versions, en alternance. */
const WM = ["sparkle", "code", "rocket", "terminal", "layers", "nxNodes"]

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
      <WordStrip words={RELEASES.map(([version, note]) => `${version} · ${note.title.replace(/^NEXORA\s*[\d.]+\s*[:·—-]?\s*/, "") || "NEXORA " + version}`)} />
      {RELEASES.map(([version, note], i) => (
        <section id={`v${version}`} className={cn("section-tight relative overflow-hidden", i === 0 ? "lime" : i % 2 ? "" : "light")} key={version}>
          <Watermark icon={WM[i % WM.length]} className={i % 2 ? "wm-bl" : "wm-tr"} size={420} />
          <div className="wrap relative">
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
      <CtaBand bright />
    </>
  )
}
