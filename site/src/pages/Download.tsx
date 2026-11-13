import { MacBook, SplitPanel, StepCards, Watermark } from "../components/Blocks"
import { CtaBand } from "../components/CtaBand"
import { MainButton } from "../components/Download"
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
  ["download", "Téléchargez le lanceur", "NEXORA Devs Toolbox : un petit programme de quelques mégaoctets."],
  ["shield", "Lancez-le", "Il télécharge NEXORA, vérifie sa signature et l’installe, sans droits d’administrateur."],
  ["key", "Connectez-vous", "Votre licence s’active, liée à votre compte : vos réglages et vos projets vous suivent d’une version à l’autre."],
]
const REQUIREMENTS: [string, string][] = [
  ["Système", "Windows 10 ou Windows 11, 64 bits"],
  ["Mémoire", "8 Go conseillés pour le Studio 3D et les constructions"],
  ["Espace disque", "Environ 450 Mo, plus vos projets et votre bibliothèque"],
  ["Internet", "Obligatoire au démarrage : votre licence est vérifiée par nos serveurs"],
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
              ? "Un lanceur léger installe NEXORA, vérifie chaque fichier et le tient à jour. Vos réglages, vos projets et votre compte sont gardés d’une version à l’autre."
              : "Le lanceur pour Windows n’est pas encore publié. Créez dès maintenant votre compte et votre licence : ils vous attendront au premier démarrage."
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
            {/* #089 : sur téléphone, boutons empilés en pleine largeur (« Téléchargement bientôt disponible » sortait de la carte). */}
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap [&>*]:max-sm:h-auto [&>*]:max-sm:min-h-12 [&>*]:max-sm:w-full [&>*]:max-sm:py-3 [&>*]:max-sm:whitespace-normal">
              {downloadUrl ? (
                <>
                  <Button asChild size="lg">
                    <a href={downloadUrl} rel="noopener">
                      <Icon name="download" size={18} stroke={2} /> Télécharger le lanceur
                    </a>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <a href="/licence">
                      <Icon name="key" size={18} stroke={2} /> Ma licence
                    </a>
                  </Button>
                </>
              ) : (
                <>
                  {/* #076 : sans version publiée, l'action possible (créer sa licence) passe avant le bouton inactif. */}
                  <Button asChild size="lg">
                    <a href="/licence">
                      <Icon name="key" size={18} stroke={2} /> Créer ma licence
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
            <p className="relative mt-6 flex items-start gap-2.5 border-t border-foreground/[0.08] pt-5 text-[13.5px] text-muted-foreground">
              <Icon name="info" size={15} className="mt-0.5 shrink-0 text-primary" /> Le lanceur public arrive très bientôt. En attendant, créez votre compte et votre licence&nbsp;: ils seront reconnus au premier démarrage.
            </p>
          )}
        </Reveal>
      </PageHero>

      {/* #105 : étapes en grandes cartes numérotées (référence de l'utilisateur), filigranes informatiques. */}
      <StepCards
        className="light"
        eyebrow={!downloadUrl && ready ? "Dès sa publication" : "Installer"}
        title={["Trois étapes,", "et NEXORA est prêt."]}
        steps={STEPS.map(([icon, title, text]) => ({ icon, title, text }))}
        note={
          <div className="hud has-wm flex items-start gap-4 p-5">
            <Watermark icon="shield" className="wm-br" size={150} />
            <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-[14px] text-muted-foreground">
              Au premier lancement, Windows peut afficher « Windows a protégé votre ordinateur ». Cliquez sur « Informations complémentaires », puis sur « Exécuter quand même » : c’est le message habituel des logiciels récemment publiés.
            </p>
          </div>
        }
      />

      <SplitPanel
        media={<MacBook space="home" />}
        eyebrow="Une seule fenêtre"
        title={["Tout NEXORA,", "à portée de main."]}
        text="Neuf espaces autour de vos projets : tester, inspecter, coder, publier sur Android et Windows, présenter en 3D, créer des visuels et surveiller vos sites. Le lanceur garde tout à jour."
        action={<MainButton />}
        icon="laptop"
      />

      <section className="section relative overflow-hidden" data-capture="configuration">
        <Watermark icon="laptop" className="wm-tr" size={460} />
        <div className="wrap relative">
          <SectionHead eyebrow="Configuration" title={["Ce qu’il vous faut", "pour bien démarrer."]} />
          <ul className="panel divide-y divide-foreground/[0.08]">
            {REQUIREMENTS.map(([title, text], i) => (
              <Reveal as="li" className="grid gap-2 px-6 py-5 md:grid-cols-[220px_1fr] md:px-8" key={title} delay={i * 70}>
                <span className="text-[13px] font-medium text-primary">{title}</span>
                <b className="text-[15.5px] font-medium">{text}</b>
              </Reveal>
            ))}
          </ul>
          <div className="mt-6 grid gap-6 md:grid-cols-2" data-glow>
            <Reveal className="glow surface has-wm p-7">
              <Watermark icon="sync" className="wm-br" size={170} />
              <h3 className="text-[18px] font-semibold">Des mises à jour vérifiées</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">Le lanceur télécharge chaque nouvelle version depuis nos publications officielles, contrôle sa signature et l’empreinte de chaque fichier, puis l’installe. En cas de souci, il revient à la version précédente.</p>
            </Reveal>
            <Reveal className="glow surface has-wm p-7" delay={80}>
              <Watermark icon="trash" className="wm-br" size={170} />
              <h3 className="text-[18px] font-semibold">Désinstallation propre</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">Depuis les Paramètres de Windows : vous choisissez de garder ou de supprimer vos documents, projets, réglages et la bibliothèque téléchargée.</p>
              <a className="link-arrow mt-4" href="/licence">
                Gérer ma licence <Icon name="nxArrowRight" size={15} stroke={2} />
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section light relative overflow-hidden" data-capture="questions">
        <Watermark icon="chat" className="wm-bl" size={420} />
        <div className="wrap relative grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <SectionHead align="left" eyebrow="Questions fréquentes" title={["Avant de", "télécharger."]} />
          <Faq items={WEB_FAQ} idPrefix="faq-dl" />
        </div>
      </section>
      <CtaBand bright />
    </>
  )
}
