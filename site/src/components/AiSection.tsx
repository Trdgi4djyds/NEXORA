import { useRef } from "react"
import { AI_PROVIDERS, AI_USES } from "../data/content"
import { Icon } from "../lib/icons"
import { Reveal, useInView, useReducedMotion, useSteps } from "../lib/motion"
import { SectionHead } from "./SectionHead"

const DURATIONS = [900, 900, 1400, 2200, 3600]

/** Conversation de démonstration : demande, réflexion, réponse, changements proposés, puis acceptés. */
function AiChat() {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref)
  const reduced = useReducedMotion()
  const live = useSteps(DURATIONS, visible && !reduced)
  const step = reduced ? 4 : live
  return (
    <div className="ai-chat" ref={ref} aria-hidden="true">
      <div className="ai-head">
        <span className="sp-ic sm solid" data-space="home">
          <Icon name="sparkle" size={15} />
        </span>
        <b>Assistant IA</b>
        <span className="ai-model">
          <i /> Claude · ta clé
        </span>
      </div>
      <div className="ai-msgs">
        <div className="ai-msg me" key={`me-${step === 0}`}>
          Ajoute un mode sombre à la page d’accueil, en gardant les couleurs de Kora.
        </div>
        {step >= 1 && (
          <div className="ai-msg bot">
            {step === 1 ? (
              <span className="ai-dots">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <>Je modifie 2 fichiers : les couleurs passent en variables et un bouton bascule le thème.</>
            )}
          </div>
        )}
        {step >= 3 && (
          <div className="ai-diff">
            <div className="ai-file">
              <span>
                <Icon name="file" size={13} /> styles.css
              </span>
              <em>
                <b>+24</b> <s>−3</s>
              </em>
            </div>
            <code className="del">--fond: #fffaf5;</code>
            <code className="add">--fond: var(--clair, #fffaf5);</code>
            <code className="add">@media (prefers-color-scheme: dark) {"{ … }"}</code>
            <div className="ai-file">
              <span>
                <Icon name="code" size={13} /> Accueil.jsx
              </span>
              <em>
                <b>+6</b> <s>−1</s>
              </em>
            </div>
            <div className="ai-actions">
              <span className={`ai-accept${step >= 4 ? " done" : ""}`}>
                <Icon name="check" size={13} stroke={2.6} /> {step >= 4 ? "Accepté" : "Accepter"}
              </span>
              <span className="ai-reject">Refuser</span>
            </div>
          </div>
        )}
        {step >= 4 && (
          <div className="ai-done">
            <Icon name="nxCheckCircle" size={15} /> Changements appliqués à ton projet · <u>Annuler</u>
          </div>
        )}
      </div>
      <div className="ai-input">
        Demande quelque chose à l’assistant…
        <span className="ai-send">
          <Icon name="nxSend" size={15} />
        </span>
      </div>
    </div>
  )
}

export function AiSection() {
  return (
    <section className="section alt ai-sec" data-space="home" data-capture="ia">
      <div className="container ai-grid">
        <div className="ai-copy">
          <SectionHead
            align="left"
            eyebrow="Assistant IA"
            title={["Ton IA, ta clé,", "sans limite."]}
            lead="Branche ton propre compte Claude, GPT, Gemini ou Mistral, ou fais tourner Ollama sur ton PC. NEXORA ne compte pas tes requêtes et ne facture rien pour l’IA."
          />
          <Reveal className="ai-providers" delay={80}>
            {AI_PROVIDERS.map((p) => (
              <span className="chip" key={p}>
                <Icon name="sparkle" size={14} /> {p}
              </span>
            ))}
          </Reveal>
          <ul className="ai-uses">
            {AI_USES.map((u, i) => (
              <Reveal as="li" key={u.title} data-space={u.space} delay={120 + i * 70}>
                <span className="sp-ic sm">
                  <Icon name={u.icon} size={15} />
                </span>
                <span>
                  <b>{u.title}</b>
                  {u.text}
                </span>
              </Reveal>
            ))}
          </ul>
        </div>
        <Reveal className="ai-visual" delay={120}>
          <AiChat />
        </Reveal>
      </div>
    </section>
  )
}
