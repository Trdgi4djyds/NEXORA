import { WebButton } from "../components/Download"
import { Faq } from "../components/Faq"
import { SectionHead } from "../components/SectionHead"
import { FAQ } from "../data/content"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { APP_VERSION, WEB_URL } from "../lib/product"
import { useRemote } from "../lib/remote"
import { logo } from "../components/Brand"

// #069 : étapes numérotées et configuration en fiche technique (plus de pastilles d'icône).
const STEPS: [string, string][] = [
  ["Télécharge NEXORA", "La version portable tient dans un seul fichier ZIP."],
  ["Décompresse le dossier", "Où tu veux : Documents, Bureau ou une clé USB."],
  ["Lance NEXORA.exe", "Aucune installation ni droits d’administrateur nécessaires."],
]
const REQUIREMENTS: [string, string][] = [
  ["Système", "Windows 10 ou Windows 11, 64 bits"],
  ["Mémoire", "8 Go conseillés pour le Studio 3D et les constructions"],
  ["Espace disque", "Environ 450 Mo, plus tes projets et tes outils"],
  ["Internet", "Pour ton compte, la synchronisation, l’IA et les mises à jour"],
]
const WEB_FAQ = FAQ.filter((f) => /ordinateurs|mises à jour|sécurité/.test(f.q))

export function Download() {
  const { downloadUrl, ready } = useRemote()
  return (
    <>
      <section className="page-hero dl-hero" data-capture="haut" data-light>
        <i className="grid-bg" aria-hidden="true" />
        <i className="grid-lit" aria-hidden="true" />
        <i className="torch" aria-hidden="true" />
        <div className="container">
          <SectionHead
            as="h1"
            align="left"
            eyebrow="Télécharger"
            title={["NEXORA pour Windows,", "prêt en trois clics."]}
            lead="Une version portable : décompresse, lance, c’est prêt. Tes réglages, tes projets et ton compte sont gardés d’une version à l’autre."
          />
          <Reveal className="dl-card glow" data-glow>
            <div className="dl-main">
              <img src={logo} alt="" width={84} height={84} />
              <div>
                <b>NEXORA {APP_VERSION}</b>
                <span>Windows 10 et 11 · 64 bits · version portable (.zip, environ 175 Mo)</span>
              </div>
            </div>
            <div className="dl-actions">
              {downloadUrl ? (
                <a className="btn btn-primary btn-lg" href={downloadUrl} rel="noopener">
                  <Icon name="download" size={18} stroke={2} /> Télécharger NEXORA {APP_VERSION}
                </a>
              ) : (
                <span className="btn btn-lg" aria-disabled="true">
                  <Icon name="clock" size={18} stroke={2} /> {ready ? "Téléchargement bientôt disponible" : "Recherche de la dernière version…"}
                </span>
              )}
              <WebButton size="lg" label="Ouvrir NEXORA web" />
            </div>
            {!downloadUrl && ready && (
              <p className="dl-wait">
                <Icon name="info" size={15} /> La version Windows publique arrive très bientôt. En attendant, crée ton compte et découvre
                NEXORA dans ton navigateur&nbsp;: tes projets t’attendront dans l’application.
              </p>
            )}
          </Reveal>
        </div>
      </section>

      <section className="section tight" data-capture="etapes">
        <div className="container">
          <ol className="steps" data-glow>
            {STEPS.map(([title, text], i) => (
              <Reveal as="li" className="step glow" key={title} delay={i * 110}>
                <span className="step-n">{String(i + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </ol>
          <Reveal className="dl-note">
            <Icon name="shield" size={18} />
            <p>
              Au premier lancement, Windows peut afficher « Windows a protégé votre ordinateur ». Clique sur « Informations
              complémentaires », puis sur « Exécuter quand même » : c’est le message habituel des logiciels récemment publiés.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <SectionHead eyebrow="Configuration" title={["Ce qu’il te faut", "pour bien démarrer."]} />
          <ul className="spec" data-glow>
            {REQUIREMENTS.map(([title, text], i) => (
              <Reveal as="li" className="spec-row glow" key={title} delay={i * 70}>
                <span className="spec-k">{title}</span>
                <span className="spec-v">
                  <b>{text}</b>
                </span>
              </Reveal>
            ))}
          </ul>
          <div className="dl-duo" data-glow>
            <Reveal className="duo-card glow" data-space="desktop">
              <h3>Des mises à jour sans effort</h3>
              <p>NEXORA te prévient quand une nouvelle version sort, la télécharge dans ton dossier Téléchargements et t’explique comment la remplacer.</p>
            </Reveal>
            <Reveal className="duo-card glow" data-space="preview" delay={80}>
              <h3>Pas sur Windows ?</h3>
              <p>NEXORA web te permet de retrouver ton compte, tes projets synchronisés et une partie des espaces depuis n’importe quel navigateur.</p>
              <a className="link-arrow" href={WEB_URL}>
                Ouvrir NEXORA web <Icon name="nxArrowRight" size={15} stroke={2} />
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container faq-wrap">
          <SectionHead align="left" eyebrow="Questions fréquentes" title={["Avant de", "télécharger."]} />
          <Faq items={WEB_FAQ} idPrefix="faq-dl" />
        </div>
      </section>
    </>
  )
}
