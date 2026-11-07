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

/** En-tête de section : sur-titre, titre en deux tons (comme la carte « Bonjour » de NEXORA) et chapeau. */
export function SectionHead({
  eyebrow,
  title,
  lead,
  align = "center",
  as = "h2",
  children,
}: {
  eyebrow: string
  title: [string, string]
  lead?: ReactNode
  align?: "center" | "left"
  as?: "h1" | "h2"
  children?: ReactNode
}) {
  const H = as
  const n = title[0].split(" ").length
  return (
    <Reveal className={`section-head${align === "left" ? " left" : ""}`}>
      <span className="eyebrow">{eyebrow}</span>
      <H className={`${as === "h1" ? "h-1" : "h-2"} words`}>
        <Words text={title[0]} />{" "}
        <span className="tone">
          <Words text={title[1]} from={n} />
        </span>
      </H>
      {lead && <p className="lead">{lead}</p>}
      {children}
    </Reveal>
  )
}
