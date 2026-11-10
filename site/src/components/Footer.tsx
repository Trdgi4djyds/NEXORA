import type { MouseEvent } from "react"
import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { APP_VERSION, WEB_URL } from "../lib/product"
import { useRemote } from "../lib/remote"
import { BASE, navigate, scrollToId } from "../router"
import { Brand } from "./Brand"

/** « Questions fréquentes » : la FAQ de l'accueil, atteinte depuis n'importe quelle page. */
function goFaq(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault()
  if (location.pathname === `${BASE}/` || location.pathname === BASE) scrollToId("faq")
  else {
    navigate("/#faq")
    window.setTimeout(() => scrollToId("faq"), 160)
  }
}

const col = "flex flex-col gap-2.5 text-[14px]"
const head = "mb-1.5 text-[13px] font-medium text-foreground/60"
const link = "text-muted-foreground transition-colors hover:text-foreground"

export function Footer() {
  const { supportEmail } = useRemote()
  return (
    <footer className="relative overflow-hidden border-t border-foreground/[0.08] pt-20" data-capture="pied">
      <div className="wrap-wide grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="max-w-sm">
          <a href="/" aria-label="NEXORA, accueil du site">
            <Brand size={34} />
          </a>
          <p className="mt-5 text-[14.5px] leading-relaxed text-muted-foreground">L’atelier tout-en-un pour concevoir, coder, tester, sécuriser et publier sur le web, sur Android et sur Windows.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-3 py-1.5 text-[12.5px] text-muted-foreground">
              <Icon name="display" size={14} /> Windows 10 et 11
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium text-black">
              <i className="dot live bg-black" /> Version {APP_VERSION}
            </span>
          </div>
        </div>
        <nav className={col} aria-label="Espaces">
          <h2 className={head}>Espaces</h2>
          {SPACES.map((s) => (
            <a key={s.id} href={spaceHref(s)} className={link}>
              {s.name}
            </a>
          ))}
        </nav>
        <nav className={col} aria-label="Produit">
          <h2 className={head}>Produit</h2>
          <a href="/espaces" className={link}>
            Tous les espaces
          </a>
          <a href="/tarifs" className={link}>
            Tarifs
          </a>
          <a href="/tarifs/comparatif" className={link}>
            Comparer les offres
          </a>
          <a href="/nouveautes" className={link}>
            Nouveautés
          </a>
        </nav>
        <nav className={col} aria-label="Commencer">
          <h2 className={head}>Commencer</h2>
          <a href="/telecharger" className={link}>
            Télécharger pour Windows
          </a>
          <a href="/licence" className={link}>
            Ma licence
          </a>
          <a href="/licence/verifier" className={link}>
            Vérifier une clé
          </a>
        </nav>
        <div className={col}>
          <h2 className={head}>Aide</h2>
          <a href="/#faq" onClick={(e) => goFaq(e)} className={link}>
            Questions fréquentes
          </a>
          <a href={supportEmail ? `mailto:${supportEmail}` : WEB_URL} className={link}>
            Écrire à l’équipe
          </a>
          {/* #087 : adresse de contact de NEXORA Devs Toolbox, lisible. */}
          {supportEmail && <span className="text-[12.5px] break-all text-muted-foreground">{supportEmail}</span>}
          <span className="text-[12.5px] text-muted-foreground/70">Dans NEXORA : Mon compte → Support</span>
        </div>
      </div>
      <div className="wrap-wide mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-foreground/[0.06] py-6 text-[13px] text-muted-foreground">
        <span>© {new Date().getFullYear()} NEXORA. Tous droits réservés.</span>
        <span>Photos : Unsplash · Cadres d’appareils : Meta (via fastlane) et Android Open Source Project · Logos : SVG Logos, marques de leurs titulaires</span>
      </div>
      {/* Logotype en très grand et fin (#099), coupé par le bas de la page (décoratif). */}
      <div className="ftr-word" aria-hidden="true">
        NEXORA
      </div>
    </footer>
  )
}
