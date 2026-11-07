import { Fragment, type CSSProperties, type ReactNode } from "react"
import { Icon } from "../lib/icons"
import { d } from "./common"

type Tok = [string, string]
// Code de la page d'accueil de Kora ; les lignes 6 à 10 s'écrivent pendant la démonstration.
const LINES: { indent: number; toks: Tok[]; type?: number }[] = [
  { indent: 0, toks: [["k", "import"], ["t", " "], ["s", '"./styles.css"'], ["p", ";"]] },
  { indent: 0, toks: [] },
  { indent: 0, toks: [["k", "export default function"], ["t", " "], ["f", "Accueil"], ["p", "() {"]] },
  { indent: 1, toks: [["k", "return"], ["p", " ("]] },
  { indent: 2, toks: [["p", "<"], ["g", "section"], ["t", " "], ["a", "className"], ["p", "="], ["s", '"hero"'], ["p", ">"]] },
  { indent: 3, toks: [["p", "<"], ["g", "h1"], ["p", ">"], ["t", "Le goût du fait maison"], ["p", "</"], ["g", "h1"], ["p", ">"]], type: 1.0 },
  { indent: 3, toks: [["p", "<"], ["g", "p"], ["p", ">"], ["t", "Pains et douceurs du jour."], ["p", "</"], ["g", "p"], ["p", ">"]], type: 2.0 },
  { indent: 3, toks: [["p", "<"], ["g", "a"], ["t", " "], ["a", "className"], ["p", "="], ["s", '"bouton"'], ["t", " "], ["a", "href"], ["p", "="], ["s", '"/boutique"'], ["p", ">"]], type: 2.9 },
  { indent: 4, toks: [["t", "Commander"]], type: 3.8 },
  { indent: 3, toks: [["p", "</"], ["g", "a"], ["p", ">"]], type: 4.15 },
  { indent: 2, toks: [["p", "</"], ["g", "section"], ["p", ">"]] },
  { indent: 1, toks: [["p", ");"]] },
  { indent: 0, toks: [["p", "}"]] },
]
const FILES: [number, string, string, boolean?][] = [
  [0, "chevronDown", "src"],
  [1, "chevronDown", "pages"],
  [2, "file", "Accueil.jsx", true],
  [2, "file", "Boutique.jsx"],
  [1, "chevronRight", "components"],
  [1, "file", "styles.css"],
  [0, "chevronRight", "public"],
  [0, "file", "package.json"],
  [0, "file", "README.md"],
]
const ACTIVITY = ["file", "search", "sync", "globe", "shapes", "sparkle", "warn", "play", "grid"]

function codeLine(toks: Tok[]): ReactNode {
  return toks.map(([k, v], i) => (
    <span key={i} className={`tk-${k}`}>
      {v}
    </span>
  ))
}

/** Dev Lab : le code s'écrit, le serveur démarre dans le terminal et l'aperçu se met à jour. */
export function DevScene() {
  return (
    <div className="sc sc-dev">
      <div className="dv-act ui-card a-up" style={d(0)}>
        {ACTIVITY.map((ic, i) => (
          <span key={ic} className={i === 0 ? "on" : ""}>
            <Icon name={ic} size={16} />
          </span>
        ))}
      </div>
      <div className="dv-files ui-card a-up" style={d(0.06)}>
        <b className="dv-proj">KORA</b>
        {FILES.map(([depth, icon, name, on]) => (
          <span key={name} className={`dv-file${on ? " on" : ""}`} style={{ paddingLeft: 10 + depth * 14 }}>
            <Icon name={icon} size={13} />
            {name}
          </span>
        ))}
      </div>
      <div className="dv-editor ui-card a-up" style={d(0.12)}>
        <div className="dv-tabs">
          <span className="dv-tab on">
            <Icon name="code" size={13} />
            Accueil.jsx
            <i />
          </span>
          <span className="dv-tab">
            <Icon name="file" size={13} />
            styles.css
          </span>
          <span className="nxw-grow" />
          <span className="dv-git">
            <span className="dv-git-a">
              <Icon name="refreshCw" size={12} /> main · 2 modifications
            </span>
            <span className="dv-git-b" style={d(5.3)}>
              <Icon name="check" size={12} stroke={2.6} /> Enregistré dans Git
            </span>
          </span>
        </div>
        <div className="dv-code">
          {LINES.map((ln, i) => {
            const n = ln.toks.reduce((a, [, v]) => a + v.length, 0)
            const dur = Math.max(0.25, n * 0.026)
            return (
              <Fragment key={i}>
                <span className="dv-ln">{i + 1}</span>
                <span className="dv-line" style={{ paddingLeft: `${ln.indent * 2}ch` }} data-pointer={i === 5 ? "" : undefined}>
                  {ln.type === undefined ? (
                    codeLine(ln.toks)
                  ) : (
                    <span
                      className="dv-typed"
                      style={{ "--w": `${n}ch`, animation: `dv-type ${dur}s steps(${n}) ${ln.type}s both` } as CSSProperties}
                    >
                      {codeLine(ln.toks)}
                    </span>
                  )}
                  {i === 9 && <i className="dv-caret" style={d(4.45)} />}
                </span>
              </Fragment>
            )
          })}
        </div>
        <div className="dv-term">
          <div className="dv-term-head">
            <span className="on">
              <Icon name="terminal" size={13} /> Terminal
            </span>
            <span>Problèmes</span>
            <span>Scripts</span>
          </div>
          <div className="dv-term-body">
            <span className="a-in" style={d(0.3)}>
              <em>PS C:\Projets\kora&gt;</em> pnpm dev
            </span>
            <span className="a-in muted" style={d(0.8)}>
              &gt; kora@1.0.0 dev
            </span>
            <span className="a-in ok" style={d(1.3)}>
              <Icon name="check" size={12} stroke={2.6} /> Serveur prêt en 412 ms
            </span>
            <span className="a-in" style={d(1.5)}>
              Local : <u>http://localhost:5173/</u>
            </span>
            <span className="a-in info" style={d(4.5)}>
              Page mise à jour : src/pages/Accueil.jsx
            </span>
          </div>
        </div>
      </div>
      <div className="dv-preview ui-card a-up" style={d(0.18)}>
        <div className="dv-pv-bar">
          <Icon name="reload" size={13} />
          <span>localhost:5173</span>
          <Icon name="multi" size={14} />
        </div>
        <div className="dv-pv">
          <div className="dv-pv-empty">
            <Icon name="play" size={20} />
            <span>Lance le projet pour le voir ici.</span>
          </div>
          <div className="dv-pv-site a-in" style={d(1.7)}>
            <div className="dv-pv-nav">
              <b>
                <i>k</i>kora
              </b>
              <span />
              <span />
            </div>
            <div className="dv-pv-hero">
              <span className="dv-pv-sk" />
              <span className="dv-pv-sk short" />
              <b className="a-up" style={d(4.55)}>
                Le goût du fait maison
              </b>
              <span className="dv-pv-p a-up" style={d(4.65)}>
                Pains et douceurs du jour.
              </span>
              <span className="dv-pv-btn a-pop" style={d(4.8)}>
                Commander
              </span>
            </div>
            <div className="dv-pv-cards">
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
