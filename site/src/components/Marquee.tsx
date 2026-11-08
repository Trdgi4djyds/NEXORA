import { FRAMEWORKS, TOOLS } from "../data/stack"
import { TechChip } from "./Logo"

/** Bandeau des frameworks et outils reconnus, avec leurs logos officiels (deux rangées en sens contraire, pause au survol). */
export function Marquee() {
  return (
    <section className="relative border-t border-foreground/[0.08] py-16" aria-labelledby="tech-title">
      <div className="wrap mb-10 flex flex-col items-center gap-3 text-center">
        <p className="eyebrow" id="tech-title">
          Ton stack, reconnu
        </p>
        <p className="max-w-[640px] text-[15px] text-muted-foreground">NEXORA reconnaît ton framework à l’ouverture du projet et installe les outils qui manquent, depuis leurs sources officielles.</p>
      </div>
      <div className="flex flex-col gap-4">
        {[FRAMEWORKS, TOOLS].map((row, r) => (
          <div className={`marquee${r % 2 ? " rev" : ""}`} key={r}>
            <ul className="marquee-track">
              {[...row, ...row].map((t, i) => (
                <li key={i} aria-hidden={i >= row.length || undefined}>
                  <TechChip name={t.name} logo={t.logo} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
