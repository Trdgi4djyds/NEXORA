import type { CSSProperties, ReactNode } from "react"
import type { SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { DEVICE_COUNT } from "../lib/product"
import { cn } from "../lib/utils"
import { NeonIcon } from "./Neon"
import { Screen } from "./Screen"

/** Panneau de verre posé devant l'écran, à une profondeur donnée (--z) et décalé par la parallaxe (--d). */
function Panel({ className = "", z, d = 1, children }: { className?: string; z: number; d?: number; children: ReactNode }) {
  return (
    <div className={cn("fs-panel", className)} style={{ "--z": `${z}px`, "--d": d } as CSSProperties}>
      {children}
    </div>
  )
}

const Head = ({ icon, title, right }: { icon: string; title: string; right?: ReactNode }) => (
  <span className="fs-head">
    <NeonIcon name={icon} size={15} />
    <b>{title}</b>
    {right && <span className="ml-auto">{right}</span>}
  </span>
)

// Courbe de temps de réponse (décor : forme d'une journée calme, sans chiffre inventé sur le service réel).
const SPARK = "0,26 12,22 24,24 36,15 48,18 60,9 72,13 84,7 96,11 108,5 120,8"

/**
 * #101 : scène flottante, d'après la cinquième image de référence de l'utilisateur (écran incliné, panneaux de
 * verre qui en sortent à plusieurs profondeurs, lumières diffuses) : vraie capture de NEXORA dans un écran fin dessiné
 * en CSS, panneaux d'interface en verre (texte réel des espaces), parallaxe au pointeur ([data-tilt], lib/glow.ts).
 * Aucun modèle 3D ni rendu photographique. Panneaux : terminal du Dev Lab, supervision, App Builder, agent IA, nombre
 * de modèles d'appareils.
 */
export function FloatScene({ space = "dev", className = "", eager = false }: { space?: SpaceId; className?: string; eager?: boolean }) {
  return (
    <div className={cn("fs", className)} data-tilt>
      <i className="fs-bokeh b1" aria-hidden="true" />
      <i className="fs-bokeh b2" aria-hidden="true" />
      <i className="fs-bokeh b3" aria-hidden="true" />
      <div className="fs-stage">
        <div className="fs-screen">
          <span className="fs-bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>NEXORA</span>
          </span>
          <Screen space={space} eager={eager} />
          <i className="fs-glare" aria-hidden="true" />
        </div>
        <div aria-hidden="true">
            <Panel className="p-term" z={120} d={1.4}>
              <Head icon="terminal" title="Terminal · Dev Lab" />
              <code>
                <span className="c-dim">$</span> pnpm build
                <br />
                <span className="c-ok">✓</span> compilé en 4,2 s
                <br />
                <span className="c-ok">✓</span> aperçu sur le port 5173
              </code>
            </Panel>
            <Panel className="p-mon" z={160} d={1.8}>
              <Head icon="nxiPulse" title="Supervision" right={<span className="c-live"><i />En ligne</span>} />
              <svg viewBox="0 0 120 30" className="fs-spark" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="fs-sg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.55" />
                    <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={`0,30 ${SPARK} 120,30`} fill="url(#fs-sg)" />
                <polyline points={SPARK} fill="none" stroke="#c4b5fd" strokeWidth="1.6" />
              </svg>
              <small>Temps de réponse, vérifié 24 h/24</small>
            </Panel>
            <Panel className="p-build" z={90} d={1.2}>
              <Head icon="rocket" title="App Builder" />
              {["APK signé", "AAB pour le Play Store", "Fiche Play Store"].map((t, i) => (
                <span key={t} className="fs-row">
                  <i className={i < 2 ? "ok" : "run"}>{i < 2 ? <Icon name="check" size={11} stroke={3} /> : null}</i>
                  {t}
                </span>
              ))}
              <span className="fs-progress"><i /></span>
            </Panel>
            <Panel className="p-agent" z={200} d={2.1}>
              <Head icon="sparkle" title="Agent IA" />
              <p>3 fichiers modifiés, prêts à relire.</p>
              <span className="fs-actions">
                <span>Voir</span>
                <span className="on">Accepter</span>
              </span>
            </Panel>
            <Panel className="p-dev" z={140} d={1.6}>
              <b>{DEVICE_COUNT}</b>
              <span>modèles d’appareils</span>
            </Panel>
          </div>
      </div>
    </div>
  )
}
