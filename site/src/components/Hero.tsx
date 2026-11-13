import { useEffect, useRef, useState } from "react"
import { Icon } from "../lib/icons"
import { APP_VERSION, DEVICE_COUNT } from "../lib/product"
import { useRemote } from "../lib/remote"

/**
 * Hero. #101 : composition de l'image de référence de l'utilisateur (outil de design « secret ingredient ») : fond
 * noir à colonnes de lumière verticales, halo bleu et violet en haut et en bas ; titre géant centré sur deux lignes,
 * tout entier dans un cadre de sélection (poignées, poignée de rotation, taille mesurée en direct), début surligné,
 * pastille de couleur, étoile et curseur « Agent IA » ; barre d'outils dessous, dont le bouton bleu est le vrai bouton
 * de téléchargement ; version en bas à gauche, pilule de verre en bas à droite. Plus aucun rendu 3D ni photo.
 */
export function Hero() {
  const { downloadUrl } = useRemote()
  const box = useRef<HTMLDivElement>(null)
  // Taille du cadre en pixels, mesurée après l'affichage (la page pré-générée montre une valeur fixe).
  const [size, setSize] = useState("1180 × 360")
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setSize(`${Math.round(el.offsetWidth)} × ${Math.round(el.offsetHeight)}`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <section className="hero hx" data-capture="haut">
      <div className="hx-bg" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="wrap-wide hx-inner">
        <span className="eyebrow rise border-white/45 text-white/90">NEXORA Devs Toolbox · Windows 10 et 11</span>
        <div className="hx-sel rise" ref={box} style={{ animationDelay: "120ms" }}>
          <span className="hx-chip" aria-hidden="true">
            <i />
            4898F7
            <em>100 %</em>
          </span>
          <svg className="hx-rot" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M8 22c-2-6 2-13 9-14" />
            <path d="M13 5l4 3-4 3M5 18l3 4 4-3" />
          </svg>
          <i className="hx-h tl" aria-hidden="true" />
          <i className="hx-h tr" aria-hidden="true" />
          <i className="hx-h bl" aria-hidden="true" />
          <i className="hx-h br" aria-hidden="true" />
          <i className="hx-h tc" aria-hidden="true" />
          <svg className="hx-star" viewBox="0 0 48 48" aria-hidden="true">
            <path d="M20 6c1.6 9.6 4.4 12.4 14 14-9.6 1.6-12.4 4.4-14 14-1.6-9.6-4.4-12.4-14-14 9.6-1.6 12.4-4.4 14-14z" />
            <path d="M38 4v10M33 9h10M42 16v6M39 19h6" />
          </svg>
          <span className="hx-agent" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M1 1l13 5-5.5 2L6 14z" />
            </svg>
            <b>Agent IA</b>
          </span>
          <h1 className="hx-title">
            <span className="hx-line">
              <mark>L’atelier</mark> web
            </span>
            <span className="hx-line">tout-en-un</span>
          </h1>
          <span className="hx-size" aria-hidden="true">
            {size}
          </span>
        </div>
        <div className="hx-tools rise" style={{ animationDelay: "260ms" }}>
          <span className="hx-tool-set" aria-hidden="true">
            <span className="hx-tool">
              <Icon name="nxPointer" size={19} />
              <Icon name="chevronDown" size={12} stroke={2} />
            </span>
            <span className="hx-tool">
              <Icon name="pen" size={19} />
              <Icon name="chevronDown" size={12} stroke={2} />
            </span>
            <span className="hx-tool">
              <Icon name="frame" size={19} />
              <Icon name="chevronDown" size={12} stroke={2} />
            </span>
            <span className="hx-tool">
              <Icon name="nxType" size={19} />
            </span>
          </span>
          <a className="hx-gen" href={downloadUrl || "/telecharger"} rel={downloadUrl ? "noopener" : undefined}>
            <span className="hx-gen-ic">
              <Icon name="sparkle" size={16} stroke={2} />
            </span>
            Télécharger pour Windows
          </a>
        </div>
        <p className="hx-lead rise" style={{ animationDelay: "360ms" }}>
          Une idée, un site, un projet d’école ou une boutique : concevez, codez, testez sur {DEVICE_COUNT} modèles d’appareils, publiez sur le web, Android et Windows, puis surveillez. Une seule application sur votre PC, au lieu de dix outils à relier.
        </p>
        {/* #117 : le lien du hero mène aux profils (plus aucune offre citée hors des tarifs et de la licence). */}
        <a className="link-arrow rise mt-6 text-white" href="/pour-qui" style={{ animationDelay: "440ms" }}>
          Trouver le parcours fait pour vous <Icon name="nxArrowUpRight" size={13} stroke={2} />
        </a>
      </div>
      <div className="wrap-wide hx-foot">
        <span className="hx-brand">
          <span>
            NEXORA<i>.</i>
          </span>
          <small>Version {APP_VERSION}</small>
        </span>
        <span className="hx-pill">Design × Code × Supervision</span>
      </div>
    </section>
  )
}
