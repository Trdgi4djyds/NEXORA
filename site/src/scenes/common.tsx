// Éléments partagés des scènes : le projet fictif « Kora » (boulangerie en ligne) suivi d'un espace à l'autre,
// son site à toutes les largeurs et son application. Ce sont des contenus : ils gardent leurs propres couleurs.
import type { CSSProperties } from "react"
import { Icon } from "../lib/icons"

/** Délai d'animation (en secondes) passé aux classes .a-* des scènes. */
export const d = (s: number, extra?: CSSProperties): CSSProperties => ({ ...extra, "--dl": `${s}s` }) as CSSProperties

export function KoraArt({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="200" height="140" fill="#ffe4d1" />
      <circle cx="146" cy="46" r="26" fill="#ffb648" />
      <path d="M-6 140 C 18 78, 78 70, 108 140 Z" fill="#ef6a3a" />
      <path d="M70 140 C 96 92, 150 86, 186 140 Z" fill="#c2410c" />
      <path d="M150 140 C 164 112, 196 104, 212 116 V140 Z" fill="#7c2d12" />
      <circle cx="42" cy="36" r="5" fill="#fff" opacity=".85" />
      <circle cx="60" cy="24" r="3" fill="#fff" opacity=".7" />
    </svg>
  )
}

const PRODUCTS = [
  ["Croissant", "1,20 €"],
  ["Pain de campagne", "3,40 €"],
  ["Tarte aux fruits", "4,90 €"],
  ["Brioche", "2,80 €"],
  ["Baguette", "1,10 €"],
  ["Chausson", "1,60 €"],
]

/** Site de Kora à sa largeur réelle (téléphone, pliable, tablette, ordinateur), mis à l'échelle par l'appareil. */
export function KoraSite({ layout, scroll = true }: { layout: "phone" | "fold" | "tablet" | "desktop"; scroll?: boolean }) {
  return (
    <div className={`ks ks-${layout}`}>
      <div className={`ks-scroll${scroll ? " on" : ""}`}>
        <div className="ks-nav">
          <span className="ks-logo">
            <i>k</i>kora
          </span>
          {layout === "phone" ? (
            <span className="ks-burger">
              <Icon name="menu" size={26} stroke={2.2} />
            </span>
          ) : (
            <span className="ks-links">
              <span>Boutique</span>
              <span>Nos pains</span>
              <span>Contact</span>
              <b>Commander</b>
            </span>
          )}
        </div>
        <div className="ks-hero">
          <div className="ks-copy">
            <small>Boulangerie artisanale</small>
            <h4>Le goût du fait maison</h4>
            <p>Pains, viennoiseries et douceurs du jour, à retirer en boutique ou livrés chez toi.</p>
            <span className="ks-btn">Commander</span>
          </div>
          <KoraArt className="ks-art" />
        </div>
        <div className="ks-title">Les incontournables</div>
        <div className="ks-cards">
          {PRODUCTS.map(([name, price], i) => (
            <div className="ks-card" key={name}>
              <span className={`ks-thumb t${i % 3}`} />
              <b>{name}</b>
              <span>{price}</span>
            </div>
          ))}
        </div>
        <div className="ks-band">
          <b>Livraison offerte dès 20 €</b>
          <span>Commande avant 11 h, reçois avant midi.</span>
        </div>
      </div>
    </div>
  )
}

/** Application Kora (écran de téléphone) : barre du haut, contenu, onglets du bas. */
export function KoraApp({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`kapp${dark ? " dark" : ""}`}>
      <div className="kapp-status">
        <b>9:41</b>
        <span className="kapp-sig">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="kapp-top">
        <span className="kapp-logo">
          <i>k</i>Kora
        </span>
        <Icon name="cart" size={16} />
      </div>
      <div className="kapp-body">
        <KoraArt className="kapp-art" />
        <b className="kapp-h">Le goût du fait maison</b>
        <span className="kapp-p">Commande avant 11 h, reçois avant midi.</span>
        <div className="kapp-row">
          {PRODUCTS.slice(0, 3).map(([name, price], i) => (
            <div className="kapp-item" key={name}>
              <span className={`ks-thumb t${i}`} />
              <b>{name}</b>
              <span>{price}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="kapp-tabs">
        {[
          ["home", "Accueil"],
          ["grid", "Boutique"],
          ["cart", "Panier"],
          ["user", "Profil"],
        ].map(([icon, label], i) => (
          <span key={label} className={i === 0 ? "on" : ""}>
            <Icon name={icon} size={15} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Petit indicateur d'étape : roue qui tourne, puis coche à l'instant `done` (secondes). */
export function StepMark({ done }: { done: number }) {
  return (
    <span className="stp-mark">
      <i className="stp-spin" style={d(done)} />
      <i className="stp-ok a-pop" style={d(done)}>
        <Icon name="check" size={12} stroke={3} />
      </i>
    </span>
  )
}

/** Nombre animé en CSS (propriété --n enregistrée) de 0 à `to`, à partir de `at` secondes. */
export function Num({ to, at = 0, dur = 1.4, suffix = "" }: { to: number; at?: number; dur?: number; suffix?: string }) {
  return (
    <span className="num" data-suffix={suffix} style={{ "--to": to, "--dl": `${at}s`, "--dur": `${dur}s` } as CSSProperties} />
  )
}

/** Anneau de progression animé (conique : un anneau de progression, pas un dégradé décoratif). */
export function Ring({ to, at = 0, size = 64, stroke = 7, label }: { to: number; at?: number; size?: number; stroke?: number; label?: string }) {
  return (
    <span
      className="ring"
      style={{ "--to": to, "--dl": `${at}s`, width: size, height: size, "--rs": `${stroke}px` } as CSSProperties}
    >
      <span className="ring-v">
        <Num to={to} at={at} dur={1.6} />
        {label && <small>{label}</small>}
      </span>
    </span>
  )
}
