import { useEffect, useMemo, useRef, useState } from "react"
import { SPACES, spaceHref } from "../data/spaces"
import { navigate } from "../router"
import { Icon } from "../lib/icons"
import { cn } from "../lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog"

type Item = { id: string; group: string; label: string; hint?: string; icon: string; space?: string; href?: string; words?: string }

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

/**
 * Recherche Ctrl K, comme dans NEXORA (« Aller à une section, une fenêtre ou un projet ») : pages du site, les
 * 9 espaces et quelques actions. Clavier : flèches, Entrée, Échap. #085 : fenêtre Dialog de shadcn/ui (Radix).
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)

  const items = useMemo<Item[]>(
    () => [
      { id: "accueil", group: "Pages", label: "Accueil du site", icon: "home", href: "/" },
      { id: "espaces", group: "Pages", label: "Les 9 espaces", icon: "grid", href: "/espaces" },
      { id: "tarifs", group: "Pages", label: "Tarifs", hint: "Gratuit et Pro", icon: "star", href: "/tarifs", words: "prix offres abonnement" },
      { id: "comparatif", group: "Pages", label: "Comparer les offres", icon: "nxTable", href: "/tarifs/comparatif", words: "fonctions limites" },
      { id: "telecharger", group: "Pages", label: "Télécharger NEXORA", hint: "Windows 10 et 11", icon: "download", href: "/telecharger", words: "installer zip portable" },
      { id: "nouveautes", group: "Pages", label: "Nouveautés", icon: "sparkle", href: "/nouveautes", words: "version" },
      ...SPACES.map((s) => ({ id: s.id, group: "Espaces", label: s.name, hint: s.subtitle, icon: s.icon, space: s.id, href: spaceHref(s), words: s.tagline })),
      { id: "licence", group: "Actions", label: "Ma licence", icon: "key", href: "/licence", words: "licence clé compte connexion abonnement paiement" },
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
    // Défilement de la page bloqué pendant la recherche (fenêtre non modale : voir ui/dialog.tsx).
    document.body.classList.add("menu-open")
    return () => document.body.classList.remove("menu-open")
  }, [open])
  useEffect(() => setActive(0), [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  const choose = (it: Item | undefined) => {
    if (!it) return
    onClose()
    if (it.href) navigate(it.href)
  }
  let lastGroup = ""
  return (
    <Dialog open={open} modal={false} onOpenChange={(v) => !v && onClose()}>
      <DialogContent aria-describedby="cmdk-desc">
        <DialogTitle className="sr-only">Rechercher dans le site</DialogTitle>
        <DialogDescription id="cmdk-desc" className="sr-only">
          Tape pour filtrer les pages, les espaces et les actions, puis Entrée pour ouvrir.
        </DialogDescription>
        <div className="flex items-center gap-3 border-b border-foreground/[0.08] px-5">
          <Icon name="search" size={18} className="text-primary" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher ou aller à…"
            aria-label="Rechercher ou aller à"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-${results[active].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
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
              }
            }}
          />
          <kbd className="kbd">Échap</kbd>
        </div>
        <ul className="max-h-[min(460px,60vh)] overflow-y-auto p-2" id="cmdk-list" role="listbox" ref={list}>
          {results.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun résultat pour « {query} ».</li>}
          {results.map((it, i) => {
            const headLabel = it.group !== lastGroup ? it.group : ""
            lastGroup = it.group
            const on = i === active
            return (
              <li key={it.id} role="presentation">
                {headLabel && <span className="block px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{headLabel}</span>}
                <button
                  type="button"
                  id={`cmdk-${it.id}`}
                  role="option"
                  aria-selected={on}
                  data-i={i}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", on ? "bg-primary/10 text-foreground" : "text-muted-foreground")}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(it)}
                >
                  <span className={cn("sp-ic sm", on && "solid")}>
                    <Icon name={it.icon} size={15} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="text-[14.5px] font-medium text-foreground">{it.label}</b>
                    {it.hint && <small className="truncate text-[12.5px]">{it.hint}</small>}
                  </span>
                  <Icon name="nxArrowRight" size={15} className={cn("transition", on ? "text-primary opacity-100" : "opacity-0")} />
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex gap-5 border-t border-foreground/[0.08] px-5 py-3 text-[12px] text-muted-foreground">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> pour choisir
          </span>
          <span>
            <kbd className="kbd">Entrée</kbd> pour ouvrir
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
