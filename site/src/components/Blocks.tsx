import type { ReactNode } from "react"
import { SCREENS } from "../lib/screens"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { cn } from "../lib/utils"
import type { SpaceId } from "../data/spaces"
import { Device } from "./Screen"

/*
 * NEXORA #105 : blocs des pages intérieures du site (la page d'accueil n'en utilise aucun), d'après les références de
 * l'utilisateur (jeux de sections : bloc plein blanc à grand titre, bandeau de mots qui défile, chiffres géants en
 * rangées, étapes en grandes cartes numérotées, section partagée entre une vraie maquette et un panneau noir).
 * Chaque section et chaque bloc porte une illustration informatique en filigrane (Watermark) : grand pictogramme au
 * trait, très transparent, sans lueur. Les maquettes sont les vrais cadres photographiques (Device, lib/devices.ts).
 */

/** Pictogramme informatique en filigrane : grand, au trait fin, presque transparent, derrière le contenu. */
export function Watermark({ icon, className = "", size = 360 }: { icon: string; className?: string; size?: number }) {
  return (
    <span className={cn("wm", className)} style={{ width: size, height: size }} aria-hidden="true">
      <Icon name={icon} size={size} stroke={0.6} />
    </span>
  )
}

/** Bandeau de mots qui défile (blanc par défaut, comme la bande de services de la référence). */
export function WordStrip({ words, dark = false }: { words: string[]; dark?: boolean }) {
  const row = [...words, ...words]
  return (
    <div className={cn("wstrip", dark ? "dark" : "lime")} aria-hidden="true">
      <div className="marquee">
        <ul className="marquee-track">
          {row.map((w, i) => (
            <li key={i}>
              <span className="wstrip-slash">/</span>
              {w}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** En-tête de bloc : repère « /tag » et grand titre fin en deux tons. */
export function BlockHead({ eyebrow, title, lead, className = "" }: { eyebrow: string; title: [string, string]; lead?: ReactNode; className?: string }) {
  return (
    <Reveal className={cn("bhead", className)}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="bhead-title">
        {title[0]}
        <br />
        <span className="tone">{title[1]}</span>
      </h2>
      {lead && <p className="bhead-lead">{lead}</p>}
    </Reveal>
  )
}

export type NumberRow = { value: string; label: string; text: ReactNode }

/** Chiffres géants en rangées : numéro, chiffre, explication à droite (« About us in numbers » de la référence). */
export function NumberRows({ eyebrow, title, rows, icon = "nxiChart", className = "" }: { eyebrow: string; title: [string, string]; rows: NumberRow[]; icon?: string; className?: string }) {
  return (
    <section className={cn("section relative overflow-hidden", className)} data-capture="chiffres">
      <Watermark icon={icon} className="wm-tr" size={520} />
      <div className="wrap relative">
        <BlockHead eyebrow={eyebrow} title={title} />
        <ol className="nrows">
          {rows.map((r, i) => (
            <Reveal as="li" className="nrow" key={r.label} delay={i * 70}>
              <span className="nrow-i">{String(i + 1).padStart(2, "0")}</span>
              <span className="nrow-v">
                {r.value}
                <small>{r.label}</small>
              </span>
              <span className="nrow-t">{r.text}</span>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

export type Step = { title: string; text: string; icon: string }

/** Étapes en grandes cartes, numéro géant coupé par le bas de la carte (« How it works » de la référence). */
export function StepCards({ eyebrow, title, steps, note, className = "" }: { eyebrow: string; title: [string, string]; steps: Step[]; note?: ReactNode; className?: string }) {
  // Cartes contrastées : noires sur une section blanche, blanches sur une section sombre (comme la référence).
  const card = /\blime\b/.test(className) ? "dark" : "lime"
  return (
    <section className={cn("section relative overflow-hidden", className)} data-capture="etapes">
      <Watermark icon="nxNodes" className="wm-bl" size={460} />
      <div className="wrap relative">
        <BlockHead eyebrow={eyebrow} title={title} />
        <ol className={cn("scards", steps.length === 3 && "three")}>
          {steps.map((s, i) => (
            <Reveal as="li" className={cn("scard", card)} key={s.title} delay={i * 90}>
              <Watermark icon={s.icon} className="wm-card" size={150} />
              <span className="scard-n" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="scard-txt">
                <b>{s.title}</b>
                <span>{s.text}</span>
              </span>
            </Reveal>
          ))}
        </ol>
        {note && <Reveal className="snote">{note}</Reveal>}
      </div>
    </section>
  )
}

/** Vrai MacBook Pro 16 pouces (cadre photographique) avec la capture d'un espace de NEXORA. */
export function MacBook({ space, eager = false, className = "" }: { space: SpaceId; eager?: boolean; className?: string }) {
  return (
    <div className={cn("mac-shot", className)}>
      <Device kind="macbook" screen={SCREENS[space]} eager={eager} alt="NEXORA sur un MacBook Pro 16 pouces" />
      <i className="mac-shot-floor" aria-hidden="true" />
    </div>
  )
}

/** Section partagée : vraie maquette sur fond relevé à gauche, panneau noir à grand titre à droite (référence Endure). */
export function SplitPanel({ media, eyebrow, title, text, action, icon = "laptop", reverse = false }: { media: ReactNode; eyebrow: string; title: [string, string]; text: ReactNode; action?: ReactNode; icon?: string; reverse?: boolean }) {
  return (
    <section className={cn("split", reverse && "rev")} data-capture="maquette">
      <div className="split-media">
        <Watermark icon={icon} className="wm-tl" size={420} />
        <Reveal className="relative w-full">{media}</Reveal>
      </div>
      <div className="split-panel dark">
        <Watermark icon="terminal" className="wm-br" size={300} />
        <Reveal className="relative">
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="split-title">
            {title[0]} <span className="tone">{title[1]}</span>
          </h2>
          <p className="split-text">{text}</p>
          {action && <div className="mt-8 flex flex-wrap gap-3">{action}</div>}
        </Reveal>
      </div>
    </section>
  )
}
