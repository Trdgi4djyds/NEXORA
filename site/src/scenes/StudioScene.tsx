import { Icon } from "../lib/icons"
import { d, KoraApp } from "./common"

const MOVES = ["Orbite complète", "Spirale", "Plongée", "Effet vertigo"]
const STYLES = ["Réaliste", "Argile", "Dessin animé", "Fil de fer"]

/** Studio 3D & Motion : un téléphone 3D tourne sur son podium pendant que la tête de lecture avance. */
export function StudioScene() {
  return (
    <div className="sc sc-studio">
      <div className="st-view a-up" style={d(0)}>
        <div className="st-tools">
          {["move", "rotate3d", "scale", "globe", "eye", "camera", "film"].map((ic, i) => (
            <span key={ic} className={i === 0 ? "on" : ""}>
              <Icon name={ic} size={14} />
            </span>
          ))}
          <b className="st-render">
            <Icon name="sparkle" size={13} /> Rendu
          </b>
        </div>
        <div className="st-3d">
          <div className="st-floor" />
          <div className="st-podium">
            <i className="st-pod-side" />
            <i className="st-pod-top" />
          </div>
          <div className="st-rig">
            <div className="st-phone">
              <div className="st-face st-front">
                <div className="st-screen">
                  <KoraApp />
                </div>
              </div>
              <div className="st-face st-back">
                <i className="st-lens" />
              </div>
              <div className="st-face st-left" />
              <div className="st-face st-right" />
              <div className="st-face st-top" />
              <div className="st-face st-bottom" />
            </div>
          </div>
        </div>
        <div className="st-axes">
          <i className="x" />
          <i className="y" />
          <i className="z" />
        </div>
        <span className="st-format">9:16 · 1080 × 1920</span>
      </div>
      <div className="st-panel ui-card a-up" style={d(0.1)}>
        <b className="st-h">Mouvements de caméra</b>
        <div className="st-chips">
          {MOVES.map((m, i) => (
            <span key={m} className={`ui-chip${i === 0 ? " on st-pick" : ""}`} style={i === 0 ? d(1.15) : undefined} data-pointer={i === 0 ? "" : undefined}>
              {m}
            </span>
          ))}
        </div>
        <b className="st-h">Rendu avancé</b>
        <div className="st-chips">
          {STYLES.map((m, i) => (
            <span key={m} className={`ui-chip${i === 0 ? " on" : ""}`}>
              {m}
            </span>
          ))}
        </div>
        <b className="st-h">Réseaux sociaux</b>
        <div className="st-formats">
          {[
            ["9:16", "Story, Reels"],
            ["1:1", "Publication"],
            ["16:9", "Vidéo"],
          ].map(([r, l], i) => (
            <span key={r} className={i === 0 ? "on" : ""}>
              <i data-r={r} />
              <b>{r}</b>
              <small>{l}</small>
            </span>
          ))}
        </div>
        <div className="st-export">
          <span className="ui-btn primary a-press" style={d(4.2)}>
            <Icon name="download" size={13} stroke={2.2} /> Exporter la vidéo
          </span>
          <span className="st-exp-bar">
            <i style={d(4.4)} />
          </span>
          <span className="st-exp-ok a-in" style={d(6.0)}>
            <Icon name="check" size={12} stroke={2.6} /> kora-lancement.mp4 prête
          </span>
        </div>
      </div>
      <div className="st-time ui-card a-up" style={d(0.18)}>
        <div className="st-ctrl">
          <span className="st-play">
            <Icon name="play" size={13} stroke={2.4} />
          </span>
          <span className="st-clock" />
          <span className="st-fps">30 i/s</span>
          <span className="nxw-grow" />
          <span className="ui-chip">
            <Icon name="keyframe" size={12} /> Ajouter une clé
          </span>
        </div>
        <div className="st-tracks">
          <div className="st-names">
            <span>
              <Icon name="phone" size={12} /> Téléphone
            </span>
            <span>
              <Icon name="video" size={12} /> Caméra
            </span>
            <span>
              <Icon name="light" size={12} /> Lumière
            </span>
          </div>
          <div className="st-lanes">
            <div className="st-ruler">
              {[0, 1, 2, 3, 4, 5].map((s) => (
                <span key={s} style={{ left: `${s * 20}%` }}>
                  {s} s
                </span>
              ))}
            </div>
            <div className="st-lane">
              {[0, 50, 100].map((p) => (
                <i key={p} style={{ left: `${p}%` }} />
              ))}
            </div>
            <div className="st-lane">
              {[0, 30, 70, 100].map((p) => (
                <i key={p} style={{ left: `${p}%` }} />
              ))}
            </div>
            <div className="st-lane">
              {[10, 85].map((p) => (
                <i key={p} style={{ left: `${p}%` }} />
              ))}
            </div>
            <i className="st-head" />
          </div>
        </div>
      </div>
    </div>
  )
}
