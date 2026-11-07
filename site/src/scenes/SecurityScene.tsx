import { Icon } from "../lib/icons"
import { d, Num, Ring } from "./common"

const METRICS: [string, string, number, string, string][] = [
  ["shield", "Sécurité du site", 95, "", "En-têtes complets"],
  ["mail", "Domaine et e-mail", 86, "", "DMARC à renforcer"],
  ["code", "Code", 91, "", "2 dépendances à mettre à jour"],
  ["nxiPulse", "Disponibilité", 99, ",98 %", "90 derniers jours"],
  ["bolt", "Rapidité", 312, " ms", "Temps de réponse médian"],
  ["bell", "Incidents", 0, "", "Aucun sur 30 jours"],
]
const TASKS: [boolean, string, string][] = [
  [false, "Renforcer la politique DMARC", "Domaine et e-mail"],
  [false, "Mettre à jour 2 dépendances", "Code"],
  [true, "Certificat HTTPS valide (74 jours)", "Site"],
  [true, "En-têtes de sécurité complets", "Site"],
]
// 60 jours de disponibilité : deux journées incomplètes.
const BARS = Array.from({ length: 60 }, (_, i) => (i === 17 ? "w" : i === 41 ? "w" : "o"))
// Temps de réponse (ms) des 21 derniers relevés, tracé à la largeur réelle du graphique.
const LATENCY = [46, 44, 48, 40, 42, 38, 44, 30, 36, 34, 41, 37, 39, 28, 33, 31, 36, 30, 34, 29, 32]
const CHART = LATENCY.map((v, i) => `${i ? "L" : "M"}${Math.round((i * 760) / (LATENCY.length - 1))} ${v}`).join(" ")

/** Sécurité : la note de fiabilité monte, les mesures se remplissent, la disponibilité défile. */
export function SecurityScene() {
  return (
    <div className="sc sc-sec">
      <div className="se-head a-up" style={d(0)}>
        <b>Vue d’ensemble</b>
        <span className="ui-chip">
          <Icon name="globe" size={12} /> kora-boutique.fr
        </span>
        <span className="se-when">Supervision active 24 h/24</span>
        <span className="nxw-grow" />
        <span className="ui-btn primary a-press" style={d(0.95)} data-pointer>
          <Icon name="audit" size={13} /> Lancer l’audit
        </span>
      </div>
      <div className="se-score ui-card a-up" style={d(0.08)}>
        <b className="se-h">Note de fiabilité</b>
        <div className="se-ring-wrap">
          <Ring to={92} at={1.2} size={168} stroke={14} label="sur 100" />
        </div>
        <span className="se-grade a-pop" style={d(2.5)}>
          Excellent · +6 cette semaine
        </span>
      </div>
      <div className="se-metrics">
        {METRICS.map(([icon, label, value, suffix, note], i) => (
          <div className="se-metric ui-card a-up" key={label} style={d(0.2 + i * 0.07)}>
            <span className="se-m-top">
              <Icon name={icon} size={14} />
              {label}
            </span>
            <strong>
              <Num to={value} at={1.3 + i * 0.08} dur={1.3} />
              <small>{suffix}</small>
            </strong>
            <span className="se-m-note">{note}</span>
            {i < 3 && (
              <span className="se-m-bar">
                <i style={{ width: `${value}%`, ...d(1.3 + i * 0.08) }} />
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="se-tasks ui-card a-up" style={d(0.5)}>
        <b className="se-h">Tâches de la semaine</b>
        {TASKS.map(([ok, text, area], i) => (
          <span key={text} className={`se-task a-in${ok ? " ok" : ""}`} style={d(2.0 + i * 0.25)}>
            <Icon name={ok ? "pass" : "warn"} size={15} />
            <span>
              <b>{text}</b>
              <small>{area}</small>
            </span>
          </span>
        ))}
      </div>
      <div className="se-uptime ui-card a-up" style={d(0.58)}>
        <div className="se-up-head">
          <b className="se-h">Disponibilité · 60 jours</b>
          <span>
            <Num to={99} at={1.6} />
            ,98 %
          </span>
        </div>
        <div className="se-bars">
          {BARS.map((k, i) => (
            <i key={i} className={k} style={d(1.4 + i * 0.022)} />
          ))}
        </div>
        <div className="se-chart">
          <svg viewBox="0 0 760 64" preserveAspectRatio="none" aria-hidden="true">
            <path className="se-line" d={CHART} pathLength={1} style={d(2.2)} />
          </svg>
          <span className="se-chart-l">Temps de réponse</span>
        </div>
      </div>
    </div>
  )
}
