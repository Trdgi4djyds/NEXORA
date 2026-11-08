import { Faq } from "../components/Faq"
import { SectionHead } from "../components/SectionHead"
import { FAQ } from "../data/content"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { APP_VERSION } from "../lib/product"
import { useRemote } from "../lib/remote"
import { logo } from "../components/Brand"

// #069 : étapes numérotées et configuration en fiche technique (plus de pastilles d'icône).
// #076 : NEXORA Devs Toolbox s'installe par un lanceur léger qui télécharge, vérifie et met à jour l'application.
const STEPS: [string, string][] = [
  ["Télécharge le lanceur", "NEXORA Devs Toolbox : un petit programme de quelques mégaoctets."],
  ["Lance-le", "Il télécharge NEXORA, vérifie sa signature et l’installe, sans droits d’administrateur."],
  ["Connecte-toi", "Ta licence gratuite s’active : ton premier jour est un essai complet de Pro."],
]
const REQUIREMENTS: [string, string][] = [
  ["Système", "Windows 10 ou Windows 11, 64 bits"],
  ["Mémoire", "8 Go conseillés pour le Studio 3D et les constructions"],
  ["Espace disque", "Environ 450 Mo, plus tes projets et ta bibliothèque"],
  ["Internet", "Obligatoire au démarrage : ta licence est vérifiée par nos serveurs"],
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
            title={["NEXORA Devs Toolbox,", downloadUrl || !ready ? "prêt en trois clics." : "bientôt disponible."]}
            lead={
              downloadUrl || !ready
                ? "Un lanceur léger installe NEXORA, vérifie chaque fichier et le tient à jour. Tes réglages, tes projets et ton compte sont gardés d’une version à l’autre."
                : "Le lanceur pour Windows n’est pas encore publié. Crée dès maintenant ton compte et ta licence gratuite : ils t’attendront au premier démarrage."
            }
          />
          <Reveal className="dl-card glow" data-glow>
            <div className="dl-main">
              <img src={logo} alt="" width={84} height={84} />
              <div>
                <b>NEXORA Devs Toolbox</b>
                <span>Windows 10 et 11 · 64 bits · lanceur de 5 à 10 Mo · NEXORA {APP_VERSION} téléchargé et vérifié à l’installation</span>
              </div>
            </div>
            <div className="dl-actions">
              {downloadUrl ? (
                <a className="btn btn-primary btn-lg" href={downloadUrl} rel="noopener">
                  <Icon name="download" size={18} stroke={2} /> Télécharger le lanceur
                </a>
              ) : (
                <>
                  {/* #076 : sans version publiée, l'action possible (créer sa licence) passe avant le bouton inactif. */}
                  <a className="btn btn-primary btn-lg" href="#/licence">
                    <Icon name="key" size={18} stroke={2} /> Créer ma licence gratuite
                  </a>
                  <span className="btn btn-lg" aria-disabled="true">
                    <Icon name="clock" size={18} stroke={2} /> {ready ? "Téléchargement bientôt disponible" : "Recherche de la dernière version…"}
                  </span>
                </>
              )}
              {downloadUrl && (
                <a className="btn btn-ghost btn-lg" href="#/licence">
                  <Icon name="key" size={18} stroke={2} /> Ma licence
                </a>
              )}
            </div>
            {!downloadUrl && ready && (
              <p className="dl-wait">
                <Icon name="info" size={15} /> Le lanceur public arrive très bientôt. En attendant, crée ton compte et ta licence
                gratuite&nbsp;: ils seront reconnus au premier démarrage.
              </p>
            )}
          </Reveal>
        </div>
      </section>

      <section className="section tight" data-capture="etapes">
        <div className="container">
          {!downloadUrl && ready && <p className="steps-when">Dès sa publication, l’installation se fera en trois étapes :</p>}
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
              <h3>Des mises à jour vérifiées</h3>
              <p>Le lanceur télécharge chaque nouvelle version depuis nos publications officielles, contrôle sa signature et l’empreinte de chaque fichier, puis l’installe. En cas de souci, il revient à la version précédente.</p>
            </Reveal>
            <Reveal className="duo-card glow" data-space="preview" delay={80}>
              <h3>Désinstallation propre</h3>
              <p>Depuis les Paramètres de Windows : tu choisis de garder ou de supprimer tes documents, projets, réglages et la bibliothèque téléchargée.</p>
              <a className="link-arrow" href="#/licence">
                Gérer ma licence <Icon name="nxArrowRight" size={15} stroke={2} />
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
