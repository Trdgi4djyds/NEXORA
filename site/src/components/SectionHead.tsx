import type { CSSProperties, ReactNode } from "react"
import { Reveal } from "../lib/motion"
import { cn } from "../lib/utils"
import { Backdrop } from "./Backdrop"

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
 * En-tête de section. #085 (« Néon ») : repère à la couleur d'accent (numéro, nom, filet qui se trace), titre mot à
 * mot dont le second ton est gris pour les h2 et à la couleur d'accent pour les titres de page (h1 ; #088 : rose du logo) ; chapeau à droite (`split`),
 * dessous (`left`) ou centré (`center`).
 */
export function SectionHead({
  index,
  eyebrow,
  title,
  lead,
  align = "split",
  as = "h2",
  className = "",
  children,
}: {
  index?: string
  eyebrow: string
  title: [string, string]
  lead?: ReactNode
  align?: "split" | "left" | "center"
  as?: "h1" | "h2"
  className?: string
  children?: ReactNode
}) {
  const H = as
  const n = title[0].split(" ").length
  const split = align === "split"
  return (
    <Reveal
      className={cn(
        "mb-10 sm:mb-14 md:mb-20",
        split && "grid items-end gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]",
        align === "center" && "mx-auto max-w-3xl text-center",
        align === "left" && "max-w-3xl",
        className,
      )}
    >
      <div>
        <span className={cn("eyebrow mb-5", align === "center" && "justify-center")}>
          {index && <span className="idx">{index} /</span>}
          {eyebrow}
          <i className="rule" aria-hidden="true" />
        </span>
        <H className={cn(as === "h1" ? "title-1" : "title-2", "words")}>
          <Words text={title[0]} />{" "}
          <span className={as === "h1" ? "tone-neon" : "tone"}>
            <Words text={title[1]} from={n} />
          </span>
        </H>
      </div>
      {(lead || children) && (
        <div className={cn(!split && "mt-6", align === "center" && "flex flex-col items-center")}>
          {lead && <p className={cn("lead", align === "center" && "mx-auto max-w-2xl")}>{lead}</p>}
          {children && <div className={cn(lead && "mt-5")}>{children}</div>}
        </div>
      )}
    </Reveal>
  )
}

/** En-tête des pages intérieures (#086) : décor technique (quadrillage éclairé, halos qui dérivent, circuit), titre de page. */
export function PageHero({ children, className = "", capture = "haut" }: { children: ReactNode; className?: string; capture?: string }) {
  return (
    <section className={cn("relative overflow-hidden pt-16 pb-14 md:pt-24 md:pb-20", className)} data-capture={capture} data-light>
      <Backdrop variant="page" />
      <div className="wrap relative">{children}</div>
    </section>
  )
}
