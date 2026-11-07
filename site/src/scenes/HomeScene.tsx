import { Icon } from "../lib/icons"
import { d, Num } from "./common"

const today = () => {
  const s = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const GOALS = [
  ["android", "android", "Transformer mon site en app Android", "APK, PWA, notifications et Play Store."],
  ["desktop", "display", "Créer un logiciel Windows", "Installateur, version portable et mises à jour."],
  ["preview", "multi", "Tester mon site sur tous les écrans", "Téléphones, tablettes et ordinateurs réels."],
  ["dev", "code", "Coder mon projet", "Éditeur, terminal, Git et aperçu."],
]

const STATS = [
  ["studio", "folder", "Projets", 12, "dont 3 ouverts cette semaine"],
  ["preview", "android", "Applications", 3, "2 publiées sur le Play Store"],
  ["android", "shield", "Sites surveillés", 5, "Tous en ligne"],
  ["desktop", "present", "Présentations", 8, "1 vidéo en cours de validation"],
] as const

/** Accueil de NEXORA : carte « Bonjour », raccourcis, objectifs et compteurs (comme l'application). */
export function HomeScene() {
  return (
    <div className="sc sc-home">
      <div className="hm-hello ui-card a-up" style={d(0.05)}>
        <span className="hm-date">
          <i />
          {today()}
        </span>
        <div className="hm-title">
          <b>Bonjour</b>
          <b className="tone">Que construis-tu aujourd’hui ?</b>
        </div>
        <p>Un projet réunit ton site ou ton code, ses applications, ses visuels et sa surveillance.</p>
        <div className="hm-input">
          <Icon name="link" size={15} />
          <span className="hm-typed" style={d(0.9)}>
            kora-boutique.fr
          </span>
          <span className="hm-caret" style={d(0.9)} />
          <span className="hm-open a-press" style={d(2.1)} data-pointer>
            <Icon name="nxArrowRight" size={14} stroke={2.2} />
            Ouvrir
          </span>
        </div>
      </div>
      <div className="hm-right">
        <div className="hm-new a-up" style={d(0.15)}>
          <b>Nouveau</b>
          <span>Projet, app, scène, présentation</span>
          <i className="hm-go light">
            <Icon name="nxArrowUpRight" size={15} stroke={2.2} />
          </i>
          <Icon name="plus" size={120} stroke={1.2} className="hm-new-art" />
        </div>
        <div className="hm-small">
          <div className="ui-card hm-mini a-up" style={d(0.25)} data-space="dev">
            <b>Dossier de code</b>
            <span>Ouvrir un projet existant</span>
            <i className="hm-go">
              <Icon name="nxArrowUpRight" size={14} stroke={2.2} />
            </i>
            <Icon name="folder" size={78} stroke={1.3} className="hm-mini-art" />
          </div>
          <div className="ui-card hm-mini a-up" style={d(0.32)} data-space="android">
            <b>Application</b>
            <span>Android et iPhone</span>
            <i className="hm-go">
              <Icon name="nxArrowUpRight" size={14} stroke={2.2} />
            </i>
            <Icon name="phone" size={78} stroke={1.3} className="hm-mini-art" />
          </div>
        </div>
      </div>
      <div className="hm-goals ui-card a-up" style={d(0.4)}>
        <div className="hm-goals-head">
          <small>Par quoi commencer ?</small>
          <b>Que veux-tu faire aujourd’hui ?</b>
        </div>
        <div className="hm-goal-grid">
          {GOALS.map(([space, icon, title, text], i) => (
            <div className="hm-goal a-up" key={space} data-space={space} style={d(0.55 + i * 0.07)}>
              <span className="sp-ic solid sm">
                <Icon name={icon} size={15} />
              </span>
              <span>
                <b>{title}</b>
                <small>{text}</small>
              </span>
              {space === "dev" && <em>Gratuit</em>}
            </div>
          ))}
        </div>
      </div>
      <div className="hm-stats">
        {STATS.map(([space, icon, label, value, note], i) => (
          <div className="hm-stat a-up" key={label} data-space={space} style={d(0.7 + i * 0.08)}>
            <b>{label}</b>
            <span className="hm-stat-ic">
              <Icon name={icon} size={15} />
            </span>
            <strong>
              <Num to={value} at={1.1 + i * 0.1} />
            </strong>
            <small>{note}</small>
            <i className="hm-go">
              <Icon name="nxArrowUpRight" size={14} stroke={2.2} />
            </i>
          </div>
        ))}
      </div>
    </div>
  )
}
