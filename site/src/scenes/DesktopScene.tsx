import { Icon } from "../lib/icons"
import { d, KoraSite } from "./common"

const OPTIONS: [string, boolean][] = [
  ["Installateur (.exe)", true],
  ["Version portable", true],
  ["Paquet MSI", true],
  ["Mises à jour automatiques", true],
  ["Signature", true],
  ["Lancement au démarrage", false],
]
const OUTPUTS = ["Kora Setup 1.0.0.exe", "Kora 1.0.0 portable.zip", "Kora 1.0.0.msi"]

/** Desktop Builder : construction, installation sur un PC Windows 11, puis le logiciel s'ouvre et notifie. */
export function DesktopScene() {
  return (
    <div className="sc sc-desk">
      <div className="dk-side ui-card a-up" style={d(0)}>
        <div className="dk-id">
          <span className="dk-icon">k</span>
          <span>
            <b>Kora</b>
            <small>Logiciel Windows · 1.0.0</small>
          </span>
        </div>
        <b className="dk-h">Formats et options</b>
        {OPTIONS.map(([label, on]) => (
          <span key={label} className="dk-opt">
            <i className={`dk-sw${on ? " on" : ""}`} />
            {label}
          </span>
        ))}
        <span className="ui-btn primary dk-build a-press" style={d(0.85)} data-pointer>
          <Icon name="wrench" size={13} /> Construire
        </span>
        <span className="dk-prog">
          <i style={d(0.95)} />
        </span>
        <div className="dk-outputs">
          {OUTPUTS.map((f, i) => (
            <span key={f} className="a-in" style={d(2.35 + i * 0.12)}>
              <Icon name="check" size={12} stroke={2.6} />
              {f}
            </span>
          ))}
        </div>
      </div>
      <div className="dk-pc a-up" style={d(0.1)}>
        <div className="dk-monitor">
          <div className="dk-screen">
            <svg className="dk-wall" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <rect width="800" height="450" fill="#0b3a8c" />
              <path d="M400 470 C 300 360, 300 230, 400 120 C 500 230, 500 360, 400 470 Z" fill="#1d5fd1" />
              <path d="M400 470 C 250 400, 190 280, 230 170 C 330 220, 390 330, 400 470 Z" fill="#1650b8" />
              <path d="M400 470 C 550 400, 610 280, 570 170 C 470 220, 410 330, 400 470 Z" fill="#1650b8" />
              <path d="M400 470 C 220 450, 120 360, 110 260 C 230 270, 340 360, 400 470 Z" fill="#11449f" />
              <path d="M400 470 C 580 450, 680 360, 690 260 C 570 270, 460 360, 400 470 Z" fill="#11449f" />
              <path d="M400 300 C 370 250, 370 200, 400 160 C 430 200, 430 250, 400 300 Z" fill="#4f8ff0" />
            </svg>
            <div className="dk-icons">
              <span>
                <i className="ic-bin">
                  <Icon name="trash" size={17} />
                </i>
                Corbeille
              </span>
              <span>
                <i className="ic-pc">
                  <Icon name="display" size={17} />
                </i>
                Ce PC
              </span>
              <span className="dk-new a-pop" style={d(4.35)}>
                <i className="ic-kora">k</i>
                Kora
              </span>
            </div>
            <div className="dk-setup" style={d(2.6)}>
              <div className="dk-win-bar">
                <span className="dk-mini">k</span> Installation de Kora
                <span className="dk-x" />
              </div>
              <div className="dk-setup-body">
                <b>Installation en cours…</b>
                <span className="dk-setup-txt">Copie des fichiers et création des raccourcis</span>
                <span className="dk-setup-bar">
                  <i style={d(2.8)} />
                </span>
              </div>
            </div>
            <div className="dk-app" style={d(4.55)}>
              <div className="dk-win-bar light">
                <span className="dk-mini">k</span> Kora
                <span className="dk-ctl">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="dk-app-site">
                <KoraSite layout="desktop" scroll={false} />
              </div>
            </div>
            <div className="dk-toast" style={d(5.6)}>
              <span className="dk-mini big">k</span>
              <span>
                <b>Kora</b>
                <small>Ta commande est prête à retirer.</small>
              </span>
            </div>
            <div className="dk-taskbar">
              <span className="dk-start">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="dk-search">
                <Icon name="search" size={10} /> Rechercher
              </span>
              <span className="dk-tb">
                <Icon name="folder" size={13} />
              </span>
              <span className="dk-tb">
                <Icon name="globe" size={13} />
              </span>
              <span className="dk-tb dk-tb-kora a-pop" style={d(4.45)}>
                <i>k</i>
              </span>
              <span className="dk-clock">
                <b>14:32</b>
                <small>07/11/2026</small>
              </span>
            </div>
          </div>
        </div>
        <div className="dk-stand">
          <i />
          <i />
        </div>
      </div>
    </div>
  )
}
