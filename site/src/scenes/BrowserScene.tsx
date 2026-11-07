import type { CSSProperties } from "react"
import { Icon } from "../lib/icons"
import { d, KoraSite, Ring } from "./common"

// Requêtes de la page (nom, type, taille, temps, début et durée dans la cascade, en %).
const ROWS: [string, string, string, string, number, number][] = [
  ["kora-boutique.fr", "document", "14 Ko", "120 ms", 0, 16],
  ["styles.css", "feuille de style", "22 Ko", "64 ms", 15, 9],
  ["app.js", "script", "96 Ko", "180 ms", 17, 22],
  ["inter.woff2", "police", "72 Ko", "90 ms", 20, 12],
  ["hero.webp", "image", "148 Ko", "210 ms", 24, 26],
  ["produits", "données", "6 Ko", "140 ms", 40, 17],
  ["icones.svg", "image", "9 Ko", "40 ms", 42, 6],
  ["panier.js", "script", "18 Ko", "70 ms", 48, 10],
]
const SCORES: [string, number][] = [
  ["Performance", 98],
  ["Accessibilité", 100],
  ["Référencement", 100],
  ["Responsive", 100],
  ["Bonnes pratiques", 96],
]
const TABS = ["Éléments", "Réseau", "Console", "Tests", "Audit"]

/** Browser Lab : la page inspectée à gauche, la cascade du réseau puis l'audit à droite. */
export function BrowserScene() {
  return (
    <div className="sc sc-browser">
      <div className="br-page ui-card a-up" style={d(0)}>
        <div className="br-chrome">
          <Icon name="back" size={14} />
          <Icon name="forward" size={14} />
          <Icon name="reload" size={14} />
          <span className="br-url">
            <Icon name="lock" size={12} />
            https://kora-boutique.fr
          </span>
          <Icon name="inspector" size={15} className="br-insp" />
        </div>
        <div className="br-view">
          <div className="br-site">
            <KoraSite layout="desktop" scroll={false} />
          </div>
          <div className="br-hl" style={d(0.6)}>
            <span className="l1">section.hero · 1326 × 440</span>
            <span className="l2">div.ks-card · 426 × 295</span>
          </div>
        </div>
      </div>
      <div className="br-tools ui-card a-up" style={d(0.12)}>
        <div className="br-tabs">
          {TABS.map((t) => (
            <span key={t} className={`br-tab br-tab-${t === "Réseau" ? "net" : t === "Audit" ? "audit" : "x"}`} data-pointer={t === "Audit" ? "" : undefined}>
              {t}
            </span>
          ))}
          <i className="br-tab-line" />
        </div>
        <div className="br-net">
          <div className="br-row br-head">
            <span>Nom</span>
            <span>Type</span>
            <span>Taille</span>
            <span>Cascade</span>
          </div>
          {ROWS.map(([name, type, size, time, start, len], i) => (
            <div className="br-row a-in" key={name} style={d(0.35 + i * 0.16)}>
              <span className="br-name">{name}</span>
              <span>{type}</span>
              <span>{size}</span>
              <span className="br-fall">
                <i
                  className={`br-bar k${i % 4}`}
                  style={{ left: `${start * 1.3}%`, width: `${len * 1.3}%`, ...d(0.4 + i * 0.16) } as CSSProperties}
                />
                <em>{time}</em>
              </span>
            </div>
          ))}
          <div className="br-sum a-in" style={d(1.9)}>
            8 requêtes · 385 Ko transférés · page chargée en 0,62 s
          </div>
        </div>
        <div className="br-audit">
          <div className="br-audit-head">
            <b>Rapport d’audit</b>
            <span>kora-boutique.fr · ordinateur</span>
          </div>
          <div className="br-rings">
            {SCORES.map(([label, score], i) => (
              <div className="br-score" key={label}>
                <Ring to={score} at={4.0 + i * 0.12} size={70} stroke={7} />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="br-findings">
            <span className="a-in" style={d(4.9)}>
              <Icon name="pass" size={14} /> Aperçu dans les résultats et sur les réseaux
            </span>
            <span className="a-in" style={d(5.1)}>
              <Icon name="warn" size={14} /> Code inutilisé au chargement : 12 Ko
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
