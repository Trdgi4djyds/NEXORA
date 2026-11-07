import { Icon } from "../lib/icons"
import { d, KoraArt } from "./common"

const LAYERS: [string, string, string][] = [
  ["frame", "Affiche Kora", "frame"],
  ["text", "Titre", "title"],
  ["text", "Sous-titre", "sub"],
  ["image", "Photo", "photo"],
  ["shapes", "Bouton", "button"],
  ["layers", "Fond", "bg"],
]
const SWATCHES = ["#1f2a44", "#5b3df5", "#ef6a3a", "#0f8a7e", "#f4efe6"]

/** NEX-DESIGN : la sélection passe du titre à la photo puis au bouton, le fond change, le client valide. */
export function DesignScene() {
  return (
    <div className="sc sc-design">
      <div className="dz-layers ui-card a-up" style={d(0)}>
        <div className="dz-tabs">
          <span className="on">Calques</span>
          <span>Pages</span>
          <span>Ressources</span>
        </div>
        <span className="dz-page">
          <Icon name="file" size={13} /> Lancement
        </span>
        {LAYERS.map(([icon, label, key], i) => (
          <span key={key} className={`dz-layer dz-l-${key}`} style={{ paddingLeft: i === 0 ? 10 : 26 }}>
            <Icon name={icon} size={13} />
            {label}
          </span>
        ))}
      </div>
      <div className="dz-canvas ui-card dots-w a-up" style={d(0.08)}>
        <div className="dz-toolbar">
          {["nxPointer", "frame", "shapes", "pen", "text", "image", "nxComment"].map((ic, i) => (
            <span key={ic} className={i === 0 ? "on" : ""}>
              <Icon name={ic} size={14} />
            </span>
          ))}
          <em>100 %</em>
        </div>
        <div className="dz-board-wrap">
          <span className="dz-board-name">Affiche Kora · 1080 × 1350</span>
          <div className="dz-board">
            <div className="dz-bg" style={d(2.95)} />
            <span className="dz-kicker">Nouveau chez Kora</span>
            <b className="dz-title">Nouvelle collection</b>
            <span className="dz-sub">Viennoiseries d’automne, dès ce matin.</span>
            <div className="dz-photo">
              <KoraArt />
            </div>
            <span className="dz-btn">Commander</span>
            <div className="dz-sel" style={d(0.6)}>
              <i className="h1" />
              <i className="h2" />
              <i className="h3" />
              <i className="h4" />
              <span className="dz-size" />
            </div>
            <div className="dz-measure" style={d(4.0)}>
              <span>24</span>
            </div>
            <div className="dz-pin" style={d(5.3)}>
              <span className="dz-av">AM</span>
              <span className="dz-bubble">
                <b>Validé, on lance !</b>
                <small>Avis client · il y a un instant</small>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="dz-props ui-card a-up" style={d(0.16)}>
        <b className="dz-h">Mise en page automatique</b>
        <div className="dz-auto">
          <span className="dz-toggle on" />
          <span className="dz-field">
            <Icon name="alignV" size={12} /> 24
          </span>
          <span className="dz-field">
            <Icon name="frame" size={12} /> 32
          </span>
        </div>
        <b className="dz-h">Remplissage</b>
        <div className="dz-swatches">
          {SWATCHES.map((c, i) => (
            <i key={c} style={{ background: c }} className={i === 0 ? "s-a" : i === 2 ? "s-b" : ""} data-pointer={i === 2 ? "" : undefined} />
          ))}
        </div>
        <b className="dz-h">Texte</b>
        <div className="dz-text">
          <span>Inter</span>
          <span>800</span>
          <span>64</span>
        </div>
        <b className="dz-h">Contraste</b>
        <div className="dz-contrast">
          <Icon name="pass" size={14} /> 7,2 : 1 · conforme AA et AAA
        </div>
        <b className="dz-h">Exporter</b>
        <div className="dz-export">
          <span className="ui-chip">PNG</span>
          <span className="ui-chip">PDF</span>
          <span className="ui-chip on">
            <Icon name="code" size={12} /> Code
          </span>
        </div>
      </div>
    </div>
  )
}
