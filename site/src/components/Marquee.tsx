import { FRAMEWORKS, TOOLS } from "../data/stack"
import { Logo } from "./Logo"

/**
 * Frameworks et outils reconnus. #099 (« Horizon ») : une seule rangée de logos officiels grisés qui défile lentement
 * (pause au survol, logo en couleur au survol), comme la rangée de logos de la référence ; légende discrète dessous.
 */
export function Marquee() {
  const row = [...FRAMEWORKS, ...TOOLS]
  return (
    <section className="relative py-16 lg:py-20" aria-labelledby="tech-title" data-capture="stack">
      <div className="marquee slow">
        <ul className="marquee-track items-center">
          {[...row, ...row].map((t, i) => (
            <li key={i} aria-hidden={i >= row.length || undefined} className="logo-mono mx-7 inline-flex items-center gap-3 text-[17px] font-medium whitespace-nowrap text-white/55 md:mx-10">
              <Logo name={t.logo} size={24} />
              <span>{t.name}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="wrap mt-10 text-center text-[14px] text-muted-foreground" id="tech-title">
        Ton stack, reconnu : NEXORA identifie ton framework à l’ouverture du projet et installe les outils qui manquent, depuis leurs sources officielles.
      </p>
    </section>
  )
}
