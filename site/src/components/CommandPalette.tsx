import { useEffect, useMemo, useRef, useState } from "react"
import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"

type Item = { id: string; group: string; label: string; hint?: string; icon: string; space?: string; href?: string; run?: () => void; words?: string }

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

/**
 * Recherche Ctrl K, comme dans NEXORA (« Aller à une section, une fenêtre ou un projet ») : pages du site, les
 * 9 espaces et quelques actions. Clavier : flèches, Entrée, Échap.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const items = useMemo<Item[]>(
    () => [
      { id: "accueil", group: "Pages", label: "Accueil du site", icon: "home", href: "#/" },
      { id: "espaces", group: "Pages", label: "Les 9 espaces", icon: "grid", href: "#/espaces" },
      { id: "tarifs", group: "Pages", label: "Tarifs", hint: "Gratuit et Pro", icon: "star", href: "#/tarifs", words: "prix offres abonnement" },
      { id: "comparatif", group: "Pages", label: "Comparer les offres", icon: "nxTable", href: "#/tarifs/comparatif", words: "fonctions limites" },
      { id: "telecharger", group: "Pages", label: "Télécharger NEXORA", hint: "Windows 10 et 11", icon: "download", href: "#/telecharger", words: "installer zip portable" },
      { id: "nouveautes", group: "Pages", label: "Nouveautés", icon: "sparkle", href: "#/nouveautes", words: "version" },
      ...SPACES.map((s) => ({ id: s.id, group: "Espaces", label: s.name, hint: s.subtitle, icon: s.icon, space: s.id, href: spaceHref(s), words: s.tagline })),
      { id: "licence", group: "Actions", label: "Ma licence", icon: "key", href: "#/licence", words: "licence clé compte connexion abonnement paiement" },
    ],
    [],
  )

  const results = useMemo(() => {
    const q = norm(query).split(/\s+/).filter(Boolean)
    if (!q.length) return items
    return items.filter((it) => {
      const hay = norm(`${it.label} ${it.hint ?? ""} ${it.group} ${it.words ?? ""}`)
      return q.every((w) => hay.includes(w))
    })
  }, [items, query])

  useEffect(() => {
    if (!open) return
    setQuery("")
    setActive(0)
    const t = window.setTimeout(() => input.current?.focus(), 20)
    document.body.classList.add("menu-open")
    return () => {
      window.clearTimeout(t)
      document.body.classList.remove("menu-open")
    }
  }, [open])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  if (!open) return null
  const choose = (it: Item | undefined) => {
    if (!it) return
    onClose()
    if (it.run) it.run()
    else if (it.href) location.href = it.href
  }
  let lastGroup = ""
  return (
    <div className="cmdk-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Rechercher dans le site">
        <div className="cmdk-input">
          <Icon name="search" size={18} />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher ou aller à…"
            aria-label="Rechercher ou aller à"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-${results[active].id}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setActive((a) => Math.min(results.length - 1, a + 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === "Enter") {
                e.preventDefault()
                choose(results[active])
              } else if (e.key === "Escape") onClose()
            }}
          />
          <kbd className="kbd">Échap</kbd>
        </div>
        <ul className="cmdk-list" id="cmdk-list" role="listbox" ref={list}>
          {results.length === 0 && <li className="cmdk-empty">Aucun résultat pour « {query} ».</li>}
          {results.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : ""
            lastGroup = it.group
            return (
              <li key={it.id} role="presentation">
                {head && <span className="cmdk-group">{head}</span>}
                <button
                  type="button"
                  id={`cmdk-${it.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-i={i}
                  data-space={it.space ?? "home"}
                  className={`cmdk-item${i === active ? " on" : ""}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(it)}
                >
                  <span className={`sp-ic sm${it.space ? "" : " plain"}`}>
                    <Icon name={it.icon} size={15} />
                  </span>
                  <span className="cmdk-txt">
                    <b>{it.label}</b>
                    {it.hint && <small>{it.hint}</small>}
                  </span>
                  <Icon name="nxArrowRight" size={15} className="cmdk-go" />
                </button>
              </li>
            )
          })}
        </ul>
        <div className="cmdk-foot">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> pour choisir
          </span>
          <span>
            <kbd className="kbd">Entrée</kbd> pour ouvrir
          </span>
        </div>
      </div>
    </div>
  )
}
