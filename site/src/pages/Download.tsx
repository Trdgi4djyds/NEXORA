import { Faq } from "../components/Faq"
import { PageHero, SectionHead } from "../components/SectionHead"
import { logo } from "../components/Brand"
import { Button } from "../components/ui/button"
import { FAQ } from "../data/content"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { APP_VERSION } from "../lib/product"
import { useRemote } from "../lib/remote"

// #076 : NEXORA Devs Toolbox s'installe par un lanceur léger qui télécharge, vérifie et met à jour l'application.
const STEPS: [string, string, string][] = [
  ["download", "Télécharge le lanceur", "NEXORA Devs Toolbox : un petit programme de quelques mégaoctets."],
  ["shield", "Lance-le", "Il télécharge NEXORA, vérifie sa signature et l’installe, sans droits d’administrateur."],
  ["key", "Connecte-toi", "Ta licence gratuite s’active : ton premier jour est un essai complet de Pro."],
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
      <PageHero>
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
          className="mb-10 md:mb-12"
        />
        <Reveal className="panel-hi glow relative overflow-hidden p-6 md:p-8" data-glow>
          <i className="halo top-[-120px] left-[-60px] h-[260px] w-[320px] opacity-[0.16]" aria-hidden="true" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-5">
              <img src={logo} alt="" width={76} height={76} className="rounded-2xl shadow-[0_0_40px_rgb(var(--neon)/0.35)]" />
              <div>
                <b className="block text-[20px] font-semibold">NEXORA Devs Toolbox</b>
                <span className="mt-1 block text-[13.5px] text-muted-foreground">Windows 10 et 11 · 64 bits · lanceur de 5 à 10 Mo · NEXORA {APP_VERSION} téléchargé et vérifié à l’installation</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              {downloadUrl ? (
                <>
                  <Button asChild size="lg">
                    <a href={downloadUrl} rel="noopener">
                      <Icon name="download" size={18} stroke={2} /> Télécharger le lanceur
                    </a>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <a href="#/licence">
                      <Icon name="key" size={18} stroke={2} /> Ma licence
                    </a>
                  </Button>
                </>
              ) : (
                <>
                  {/* #076 : sans version publiée, l'action possible (créer sa licence) passe avant le bouton inactif. */}
                  <Button asChild size="lg">
                    <a href="#/licence">
                      <Icon name="key" size={18} stroke={2} /> Créer ma licence gratuite
                    </a>
                  </Button>
                  <Button size="lg" variant="outline" aria-disabled="true" tabIndex={-1} type="button">
                    <Icon name="clock" size={18} stroke={2} /> {ready ? "Téléchargement bientôt disponible" : "Recherche de la dernière version…"}
                  </Button>
                </>
              )}
            </div>
          </div>
          {!downloadUrl && ready && (
            <p className="relative mt-6 flex items-start gap-2.5 border-t border-white/[0.08] pt-5 text-[13.5px] text-muted-foreground">
              <Icon name="info" size={15} className="mt-0.5 shrink-0 text-primary" /> Le lanceur public arrive très bientôt. En attendant, crée ton compte et ta licence gratuite&nbsp;: ils seront reconnus au premier démarrage.
            </p>
          )}
        </Reveal>
      </PageHero>

      <section className="section-tight" data-capture="etapes">
        <div className="wrap">
          {!downloadUrl && ready && <p className="mb-6 text-[14px] text-muted-foreground">Dès sa publication, l’installation se fera en trois étapes :</p>}
          <ol className="grid gap-6 md:grid-cols-3" data-glow>
            {STEPS.map(([icon, title, text], i) => (
              <Reveal as="li" className="glow rounded-[22px] border border-white/[0.08] bg-card p-7" key={title} delay={i * 110}>
                <span className="flex items-center justify-between">
                  <span className="sp-ic">
                    <Icon name={icon} size={19} />
                  </span>
                  <span className="text-[40px] leading-none font-semibold tracking-[-0.04em] text-white/10 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                </span>
                <h3 className="mt-6 text-[18px] font-semibold">{title}</h3>
                <p className="mt-2 text-[14.5px] text-muted-foreground">{text}</p>
              </Reveal>
            ))}
          </ol>
          <Reveal className="hud mt-6 flex items-start gap-4 rounded-[4px] p-5">
            <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-[14px] text-muted-foreground">
              Au premier lancement, Windows peut afficher « Windows a protégé votre ordinateur ». Clique sur « Informations complémentaires », puis sur « Exécuter quand même » : c’est le message habituel des logiciels récemment publiés.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section border-y border-white/[0.06] bg-[#08070b]">
        <div className="wrap">
          <SectionHead eyebrow="Configuration" title={["Ce qu’il te faut", "pour bien démarrer."]} />
          <ul className="panel divide-y divide-white/[0.08]">
            {REQUIREMENTS.map(([title, text], i) => (
              <Reveal as="li" className="grid gap-2 px-6 py-5 md:grid-cols-[220px_1fr] md:px-8" key={title} delay={i * 70}>
                <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">{title}</span>
                <b className="text-[15.5px] font-medium">{text}</b>
              </Reveal>
            ))}
          </ul>
          <div className="mt-6 grid gap-6 md:grid-cols-2" data-glow>
            <Reveal className="glow rounded-[22px] border border-white/[0.08] bg-card p-7">
              <h3 className="text-[18px] font-semibold">Des mises à jour vérifiées</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">Le lanceur télécharge chaque nouvelle version depuis nos publications officielles, contrôle sa signature et l’empreinte de chaque fichier, puis l’installe. En cas de souci, il revient à la version précédente.</p>
            </Reveal>
            <Reveal className="glow rounded-[22px] border border-white/[0.08] bg-card p-7" delay={80}>
              <h3 className="text-[18px] font-semibold">Désinstallation propre</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">Depuis les Paramètres de Windows : tu choisis de garder ou de supprimer tes documents, projets, réglages et la bibliothèque téléchargée.</p>
              <a className="link-arrow mt-4" href="#/licence">
                Gérer ma licence <Icon name="nxArrowRight" size={15} stroke={2} />
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <SectionHead align="left" eyebrow="Questions fréquentes" title={["Avant de", "télécharger."]} />
          <Faq items={WEB_FAQ} idPrefix="faq-dl" />
        </div>
      </section>
    </>
  )
}
