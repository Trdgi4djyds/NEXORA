import type { CSSProperties, ReactNode } from "react"
import { Reveal } from "../lib/motion"

/** Titre découpé en mots qui montent l'un après l'autre quand la section apparaît. */
export function Words({ text, from = 0 }: { text: string; from?: number }) {
  const words = text.split(" ")
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span className="w" style={{ "--wi": from + i } as CSSProperties}>
            <span>{w}</span>
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  )
}

/**
 * En-tête de section éditorial (#069) : repère (numéro et nom de la section) sur un filet qui se trace à
 * l'apparition, titre mot à mot, chapeau à droite du titre (`split`), dessous (`left`) ou centré (`center`).
 * Le second ton du titre (comme la carte « Bonjour » de NEXORA) est réservé aux titres de page (h1).
 */
export function SectionHead({
  index,
  eyebrow,
  title,
  lead,
  align = "split",
  as = "h2",
  children,
}: {
  index?: string
  eyebrow: string
  title: [string, string]
  lead?: ReactNode
  align?: "split" | "left" | "center"
  as?: "h1" | "h2"
  children?: ReactNode
}) {
  const H = as
  const n = title[0].split(" ").length
  return (
    <Reveal className={`section-head sh-${align}${as === "h1" ? " sh-page" : ""}`}>
      <span className="sh-mark">
        {index && <span className="sh-index">{index}</span>}
        <span className="sh-label">{eyebrow}</span>
        <i className="sh-rule" aria-hidden="true" />
      </span>
      <H className={`${as === "h1" ? "h-1" : "h-2"} words`}>
        <Words text={title[0]} />{" "}
        {/* #074 : second ton des titres de page en dégradé vert, rose, violet (un seul bloc : le dégradé ne
            traverse pas les mots animés séparément). */}
        {as === "h1" ? (
          <span className="tone grad-text">{title[1]}</span>
        ) : (
          <span className="tone">
            <Words text={title[1]} from={n} />
          </span>
        )}
      </H>
      {(lead || children) && (
        <div className="sh-side">
          {lead && <p className="lead">{lead}</p>}
          {children}
        </div>
      )}
    </Reveal>
  )
}
