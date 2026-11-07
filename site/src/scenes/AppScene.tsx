import { Icon } from "../lib/icons"
import { d, KoraApp, Num, Ring, StepMark } from "./common"

const SECTIONS: [string, string][] = [
  ["android", "Application"],
  ["palette", "Apparence"],
  ["image", "Icône et démarrage"],
  ["grid", "Navigation"],
  ["bell", "Notifications"],
  ["star", "Fiche Play Store"],
  ["group", "Tests fermés"],
  ["nxCheckCircle", "Prêt pour le Play Store"],
  ["wrench", "Construire"],
]

/** App Builder : l'application Kora se construit (APK et AAB signés), puis reçoit sa première notification. */
export function AppScene() {
  return (
    <div className="sc sc-app">
      <div className="ap-nav ui-card a-up" style={d(0)}>
        <div className="ap-id">
          <span className="ap-icon">k</span>
          <span>
            <b>Kora</b>
            <small>com.kora.boutique</small>
          </span>
        </div>
        {SECTIONS.map(([icon, label]) => (
          <span key={label} className={`ap-sec${label === "Construire" ? " on" : ""}`}>
            <Icon name={icon} size={14} />
            {label}
          </span>
        ))}
      </div>
      <div className="ap-center ui-card dots-w a-up" style={d(0.08)}>
        <div className="ap-os">
          <span className="on">
            <Icon name="android" size={13} /> Android
          </span>
          <span>
            <Icon name="phone" size={13} /> iPhone
          </span>
        </div>
        <div className="ap-phone">
          <div className="ap-screen">
            <KoraApp />
            <div className="ap-splash">
              <span>k</span>
            </div>
            <div className="ap-push" style={d(5.3)}>
              <span className="ap-push-ic">k</span>
              <span>
                <b>Kora · maintenant</b>
                <small>−20 % sur les croissants ce matin !</small>
              </span>
            </div>
          </div>
          <i className="ap-cam" />
        </div>
      </div>
      <div className="ap-build ui-card a-up" style={d(0.16)}>
        <div className="ap-build-head">
          <span>
            <b>Construire l’application</b>
            <small>Android · APK et AAB signés</small>
          </span>
          <span className="ui-btn primary a-press" style={d(0.95)} data-pointer>
            <Icon name="play" size={12} stroke={2.4} /> Construire
          </span>
        </div>
        <ul className="ap-steps">
          <li className="a-in" style={d(1.0)}>
            <StepMark done={1.5} /> Analyse du site
          </li>
          <li className="a-in" style={d(1.5)}>
            <StepMark done={2.05} /> Icône et écran de démarrage
          </li>
          <li className="a-in ap-progress-step" style={d(2.05)}>
            <StepMark done={4.35} />
            <span className="ap-prog-txt">
              Construction de l’application
              <em>
                <Num to={100} at={2.1} dur={2.2} suffix=" %" />
              </em>
            </span>
            <span className="ap-prog">
              <i style={d(2.1)} />
            </span>
          </li>
          <li className="a-in" style={d(4.35)}>
            <StepMark done={4.7} /> Signature avec ta clé
          </li>
        </ul>
        <div className="ap-files a-pop" style={d(4.9)}>
          <span className="ap-file">
            <Icon name="android" size={16} />
            <span>
              <b>kora-1.0.0.apk</b>
              <small>À installer et à partager</small>
            </span>
            <em>4,8 Mo</em>
          </span>
          <span className="ap-file">
            <Icon name="upload" size={16} />
            <span>
              <b>kora-1.0.0.aab</b>
              <small>Pour le Play Store</small>
            </span>
            <em>3,9 Mo</em>
          </span>
        </div>
        <div className="ap-ready a-up" style={d(5.25)}>
          <Ring to={94} at={5.3} size={48} stroke={5} />
          <span>
            <b>Prêt pour le Play Store</b>
            <small>1 conseil : ajoute une capture de tablette</small>
          </span>
        </div>
      </div>
    </div>
  )
}
