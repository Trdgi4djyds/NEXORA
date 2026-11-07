// Thème clair ou sombre du site : choix gardé dans le navigateur, sinon celui du système (voir index.html).
import { useEffect, useState } from "react"

const KEY = "nexora-site-theme"
const EVENT = "nexora-site-theme"
export type Theme = "light" | "dark"

const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light")

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(current)
  useEffect(() => {
    // Plusieurs boutons (en-tête, recherche Ctrl K) : tous suivent le même thème.
    const sync = () => setTheme(current())
    window.addEventListener(EVENT, sync)
    const q = matchMedia("(prefers-color-scheme: dark)")
    const follow = () => {
      let saved: string | null = null
      try {
        saved = localStorage.getItem(KEY)
      } catch {
        /* stockage indisponible */
      }
      if (saved !== "light" && saved !== "dark") apply(q.matches ? "dark" : "light")
    }
    q.addEventListener("change", follow)
    return () => {
      q.removeEventListener("change", follow)
      window.removeEventListener(EVENT, sync)
    }
  }, [])
  function apply(t: Theme) {
    document.documentElement.dataset.theme = t
    setTheme(t)
    window.dispatchEvent(new Event(EVENT))
  }
  function toggle() {
    const next: Theme = current() === "dark" ? "light" : "dark"
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* stockage indisponible : le choix vaut pour cette visite */
    }
    apply(next)
  }
  return [theme, toggle]
}
