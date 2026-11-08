// NEXORA #086 : logos officiels des technologies citées par le site (« SVG Logos », gilbarbara/logos, CC0 ; variantes
// claires des logos noirs : `node scripts/ressources-vitrine.mjs logos`). Les marques appartiennent à leurs titulaires :
// elles indiquent seulement ce que NEXORA reconnaît, installe ou sait publier.
const FILES = import.meta.glob("../assets/logos/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>

export const LOGO: Record<string, string> = Object.fromEntries(Object.entries(FILES).map(([file, url]) => [file.replace(/^.*\/|\.svg$/g, ""), url]))

export type Tech = { name: string; logo: string }
const t = (name: string, logo: string): Tech => ({ name, logo })

/** Frameworks reconnus à l'ouverture d'un projet (Responsive Lab, Dev Lab). */
export const FRAMEWORKS: Tech[] = [
  t("React", "react"),
  t("Next.js", "nextjs"),
  t("Vue", "vue"),
  t("Angular", "angular"),
  t("Svelte", "svelte"),
  t("Astro", "astro"),
  t("Expo", "expo"),
  t("Flutter", "flutter"),
  t("Laravel", "laravel"),
  t("Django", "django"),
  t("Rails", "rails"),
  t("Hugo", "hugo"),
  t(".NET", "dotnet"),
  t("Express", "express"),
]
/** Outils installés depuis leurs sources officielles (src/tools.js), langages et formats. */
export const TOOLS: Tech[] = [
  t("Node.js", "nodejs"),
  t("pnpm", "pnpm"),
  t("Yarn", "yarn"),
  t("Bun", "bun"),
  t("Deno", "deno"),
  t("Python", "python"),
  t("PHP", "php"),
  t("Composer", "composer"),
  t("Ruby", "ruby"),
  t("Go", "go"),
  t("Git", "git"),
  t("TypeScript", "typescript"),
  t("PWA", "pwa"),
  t("HTML", "html5"),
  t("CSS", "css"),
]
/** Assistants IA branchés avec la clé de l'utilisateur. */
export const AI: Tech[] = [t("Claude", "claude"), t("GPT", "openai"), t("Gemini", "gemini"), t("Mistral", "mistral"), t("Ollama", "ollama")]
/** Hébergeurs de la mise en ligne du Dev Lab. */
export const HOSTS: Tech[] = [t("Cloudflare", "cloudflare"), t("Vercel", "vercel"), t("Netlify", "netlify"), t("GitHub Pages", "github")]
