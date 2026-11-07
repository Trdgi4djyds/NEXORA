import { TECH_ROWS } from "../data/content"
import { SPACES } from "../data/spaces"

/** Bandeau défilant des frameworks et outils reconnus (deux rangées en sens contraire, pause au survol). */
export function Marquee() {
  return (
    <section className="marquee-sec" aria-labelledby="tech-title">
      <p className="marquee-title" id="tech-title">
        NEXORA reconnaît ton framework et installe les outils qui manquent
      </p>
      {TECH_ROWS.map((row, r) => (
        <div className={`marquee${r % 2 ? " rev" : ""}`} key={r}>
          <ul className="marquee-track">
            {[...row, ...row].map((t, i) => (
              <li key={i} className="chip" aria-hidden={i >= row.length || undefined} data-space={SPACES[(i + r * 4) % SPACES.length].id}>
                <i className="dot" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
