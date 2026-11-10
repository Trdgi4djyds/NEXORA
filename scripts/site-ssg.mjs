// NEXORA #096 : publication du site vitrine à la racine du domaine, page par page (génération statique, SSG).
// 1. Le site est assemblé par Vite (adresses absolues « / », fichiers publics de site/public/).
// 2. Une version serveur (site/src/entry-server.tsx) rend chaque page en HTML complet : un robot (moteur de recherche,
//    assistant IA, aperçu de lien) reçoit le contenu et les balises propres à l'adresse demandée, sans exécuter de
//    JavaScript ; dans le navigateur, React reprend la page affichée (hydratation).
// 3. Fichiers du référencement et de la PWA : robots.txt (robots des moteurs et des IA, Content-Signal), sitemap.xml,
//    llms.txt et llms-full.txt (résumé et texte complet pour les assistants IA), manifest.webmanifest (critères de
//    PWABuilder), sw.js (hors ligne), offline.html, clé IndexNow, page 404.
// Pages écrites en « chemin.html » (/tarifs → tarifs.html) : Cloudflare les sert sans barre finale ni redirection.
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import react from "@vitejs/plugin-react"
import { build } from "vite"
import { siteTailwind } from "../site/tailwind.mjs"

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const xml = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
/** JSON-LD dans une balise script : « < » échappé, pour qu'aucun texte ne puisse fermer la balise. */
const ld = (o) => JSON.stringify(o).replaceAll("<", "\\u003c")

export async function buildSite({ ROOT, OUT_DIR, csp, noIndex = false, define = {} }) {
  const siteDir = path.join(ROOT, "site")
  const settings = JSON.parse(fs.readFileSync(path.join(siteDir, "seo.json"), "utf8"))

  // 1. Navigateur.
  await build({
    configFile: false,
    mode: "production",
    root: siteDir,
    base: "/",
    publicDir: path.join(siteDir, "public"),
    logLevel: "warn",
    plugins: [react(), ...siteTailwind()],
    define,
    // Aucune image incrustée en base64 : les logos répétés alourdissaient chaque page (fichiers mis en cache à la place).
    build: { outDir: OUT_DIR, emptyOutDir: false, chunkSizeWarningLimit: 1000, assetsInlineLimit: 0 },
  })
  const templateFile = path.join(OUT_DIR, "index.html")
  const template = fs.readFileSync(templateFile, "utf8")

  // 2. Serveur (hors de dist/ : jamais publié).
  const ssrDir = path.join(ROOT, "node_modules", ".cache", "nexora-ssr")
  await build({
    configFile: false,
    mode: "production",
    root: siteDir,
    base: "/",
    publicDir: false,
    logLevel: "warn",
    plugins: [react()],
    define,
    build: {
      ssr: "src/entry-server.tsx",
      // Mêmes adresses de fichiers que le navigateur (sinon l'hydratation ne correspondrait pas).
      assetsInlineLimit: 0,
      outDir: ssrDir,
      emptyOutDir: true,
      rollupOptions: { output: { format: "esm", entryFileNames: "entry-server.mjs" } },
    },
  })
  const m = await import(`${pathToFileURL(path.join(ssrDir, "entry-server.mjs")).href}?t=${Date.now()}`)
  const SITE = m.SITE_URL

  // Polices du titre et du texte préchargées (premier affichage plus rapide, moins de décalage de mise en page).
  const assets = fs.readdirSync(path.join(OUT_DIR, "assets"))
  const fonts = ["urbanist-var"].map((n) => assets.find((f) => f.startsWith(`${n}-`) && f.endsWith(".woff2"))).filter(Boolean)
  const preloads = fonts.map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`)
  const verify = [
    settings.googleSiteVerification && `<meta name="google-site-verification" content="${esc(settings.googleSiteVerification)}" />`,
    settings.bingSiteVerification && `<meta name="msvalidate.01" content="${esc(settings.bingSiteVerification)}" />`,
  ].filter(Boolean)

  const headTags = (h) => {
    const robots = noIndex ? "noindex, nofollow" : h.robots
    return [
      `<title>${esc(h.title)}</title>`,
      `<meta name="description" content="${esc(h.description)}" />`,
      `<meta name="robots" content="${esc(robots)}" />`,
      `<link rel="canonical" href="${esc(h.canonical)}" />`,
      `<link rel="alternate" hreflang="fr" href="${esc(h.canonical)}" />`,
      `<link rel="alternate" hreflang="x-default" href="${esc(h.canonical)}" />`,
      `<meta property="og:site_name" content="${esc(m.SITE_NAME)}" />`,
      `<meta property="og:locale" content="${m.LOCALE}" />`,
      `<meta property="og:type" content="${h.ogType}" />`,
      `<meta property="og:title" content="${esc(h.title)}" />`,
      `<meta property="og:description" content="${esc(h.description)}" />`,
      `<meta property="og:url" content="${esc(h.canonical)}" />`,
      `<meta property="og:image" content="${esc(h.image)}" />`,
      `<meta property="og:image:secure_url" content="${esc(h.image)}" />`,
      `<meta property="og:image:type" content="image/png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${esc(h.imageAlt)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(h.title)}" />`,
      `<meta name="twitter:description" content="${esc(h.description)}" />`,
      `<meta name="twitter:image" content="${esc(h.image)}" />`,
      `<meta name="twitter:image:alt" content="${esc(h.imageAlt)}" />`,
      ...verify,
      ...preloads,
      ...h.jsonLd.map((o) => `<script type="application/ld+json">${ld(o)}</script>`),
    ].join("\n    ")
  }

  if (!template.includes("<!--seo-head-->") || !template.includes("<!--/seo-head-->") || !template.includes('<div id="root"></div>'))
    throw new Error("site/index.html : repères <!--seo-head--> ou <div id=\"root\"> introuvables.")
  if (!template.includes('<meta charset="UTF-8" />')) throw new Error("site/index.html : balise meta charset introuvable.")
  const page = (h, body) =>
    template
      .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
      .replace(/<!--seo-head-->[\s\S]*?<!--\/seo-head-->/, headTags(h))
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
  const fileFor = (p) => (p === "/" ? "index.html" : `${p.slice(1)}.html`)

  const written = []
  for (const { path: p } of m.PAGES) {
    const file = path.join(OUT_DIR, fileFor(p))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, page(m.headFor(p), m.render(p)))
    written.push(p)
  }
  // Page 404 (servie par Cloudflare avec le code 404 : not_found_handling « 404-page »).
  fs.writeFileSync(path.join(OUT_DIR, "404.html"), page(m.headFor("/404"), m.render("/404")))

  // Fichiers du navigateur à garder hors ligne : feuille de style et script d'entrée du site.
  const entryAssets = [...template.matchAll(/(?:href|src)="(\/assets\/[^"]+\.(?:css|js))"/g)].map((x) => x[1])
  const stamp = new Date().toISOString()
  const today = stamp.slice(0, 10)

  // Page hors ligne (sans script : servie par le service worker quand le réseau manque).
  const css = entryAssets.filter((a) => a.endsWith(".css")).map((a) => `<link rel="stylesheet" href="${a}" />`).join("\n    ")
  fs.writeFileSync(
    path.join(OUT_DIR, "offline.html"),
    `<!doctype html>
<html lang="fr" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="theme-color" content="#050505" />
    <title>Hors ligne — NEXORA</title>
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    ${css}
  </head>
  <body>
    <main class="wrap section">
      <span class="eyebrow">Hors ligne</span>
      <h1 class="title-1 mt-6">Pas de connexion pour l’instant.</h1>
      <p class="lead mt-6">Les pages déjà ouvertes restent disponibles. Reconnecte-toi pour retrouver tout le site de NEXORA.</p>
      <p class="mt-8"><a class="link-arrow" href="/">Réessayer</a></p>
    </main>
  </body>
</html>
`,
  )

  // Plan du site : pages indexables, date de publication, image de partage.
  const urls = m.PAGES.filter((x) => x.sitemap)
  fs.writeFileSync(
    path.join(OUT_DIR, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls
  .map((x) => {
    const loc = `${SITE}${x.path === "/" ? "/" : x.path}`
    return `  <url>
    <loc>${xml(loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${x.changefreq}</changefreq>
    <priority>${x.priority.toFixed(1)}</priority>
    <xhtml:link rel="alternate" hreflang="fr" href="${xml(loc)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${xml(loc)}" />${
      x.path === "/" ? `\n    <image:image><image:loc>${xml(m.OG_IMAGE)}</image:loc></image:image>` : ""
    }
  </url>`
  })
  .join("\n")}
</urlset>
`,
  )

  // robots.txt : tout le site public ouvert aux moteurs de recherche et aux assistants IA (exploration, citation,
  // résumé ; entraînement selon site/seo.json), espaces privés et adresses techniques exclus. Un robot qui a son
  // propre groupe ignore le groupe « * » : les mêmes règles y sont donc répétées.
  const rules = ["Allow: /", "Disallow: /admin/", "Disallow: /referral/", "Disallow: /__supabase-api/", "Disallow: /license/", "Disallow: /pay/", "Disallow: /security/", "Disallow: /hb/", "Disallow: /hook/", "Disallow: /rum"]
  const signal = `Content-Signal: search=yes, ai-input=yes, ai-train=${settings.aiTraining ? "yes" : "no"}`
  const aiBots = [
    "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", "PerplexityBot", "Perplexity-User",
    "Google-Extended", "Applebot", "Applebot-Extended", "Bingbot", "Googlebot", "DuckDuckBot", "DuckAssistBot", "meta-externalagent", "Amazonbot",
    "MistralAI-User", "CCBot", "YandexBot", "cohere-ai",
  ]
  fs.writeFileSync(
    path.join(OUT_DIR, "robots.txt"),
    noIndex
      ? "User-agent: *\nDisallow: /\n"
      : [
          "# NEXORA — " + SITE,
          "# Moteurs de recherche et assistants IA bienvenus : le site public peut être exploré, cité et résumé.",
          "# Résumé pour les assistants IA : " + SITE + "/llms.txt",
          "",
          "User-agent: *",
          signal,
          ...rules,
          "",
          ...aiBots.map((b) => `User-agent: ${b}`),
          signal,
          ...rules,
          "",
          `Sitemap: ${SITE}/sitemap.xml`,
          "",
        ].join("\n"),
  )

  // llms.txt (llmstxt.org) et texte complet pour les assistants IA.
  const space = (s) => `${SITE}/espaces/${s.slug}`
  const plans = `- Gratuit : 0 $, sans limite de durée. Responsive Lab et Browser Lab complets, 2 applications Android ou Windows.\n- Pro : 25 $ par mois ou 250 $ par an. Tout NEXORA : Dev Lab, jusqu’à 50 applications, Studio 3D & Motion et NEX-DESIGN complets. Premier jour : essai complet de 24 h.`
  fs.writeFileSync(
    path.join(OUT_DIR, "llms.txt"),
    `# NEXORA

> NEXORA (aussi « NEXORA Devs Toolbox ») est une application pour Windows 10 et 11, en français, qui réunit en un seul logiciel tout ce qu’il faut pour concevoir, coder, tester sur ${m.DEVICE_COUNT} modèles d’appareils, sécuriser et publier un site sur le web, sur Android (APK, AAB, PWA, Play Store) et sur Windows (installateur, MSI, winget, Microsoft Store). Version actuelle : ${m.APP_VERSION}. Offre Gratuite sans limite de durée, offre Pro à 25 $ par mois.

- Site officiel : ${SITE}/
- NEXORA dans le navigateur (NEXORA web) : ${m.STUDIO_URL}
- Contact : nexoradevstoolbox@gmail.com
- L’assistant IA de NEXORA utilise la clé de l’utilisateur (Claude, GPT, Gemini, Mistral) ou Ollama en local ; NEXORA ne facture pas l’IA.

## Pages principales

- [Accueil](${SITE}/) : présentation, les 9 espaces, chiffres clés, tarifs, questions fréquentes.
- [Les 9 espaces](${SITE}/espaces) : un espace par métier, tous reliés au même projet.
- [Tarifs](${SITE}/tarifs) : offres Gratuit et Pro, comparatif complet des fonctions.
- [Télécharger](${SITE}/telecharger) : installation sur Windows 10 et 11, configuration requise.
- [Nouveautés](${SITE}/nouveautes) : notes de version.

## Espaces

${m.SPACES.map((s) => `- [${s.name}](${space(s)}) : ${s.card}. ${s.tagline}`).join("\n")}

## Offres

${plans}

## Optional

- [Texte complet du site pour les assistants IA](${SITE}/llms-full.txt)
- [Plan du site](${SITE}/sitemap.xml)
`,
  )
  const latest = m.RELEASES[0]
  fs.writeFileSync(
    path.join(OUT_DIR, "llms-full.txt"),
    `# NEXORA — texte complet du site (${SITE})

NEXORA est une application pour Windows 10 et 11 (version ${m.APP_VERSION}), en français. Elle réunit 9 espaces qui partagent les mêmes projets : concevoir, coder, tester sur ${m.DEVICE_COUNT} modèles d’appareils, sécuriser et publier un site sur le web, sur Android et sur Windows. Mise à jour : ${today}.

## Offres

${plans}

${m.SPACES.map(
  (s) => `## ${s.name} — ${s.card}

Adresse : ${space(s)}
${s.lead}
Offre : ${s.planNote}.

${s.features.map((f) => `- ${f.title}${f.plan ? ` (offre ${f.plan === "pro" ? "Pro" : f.plan})` : ""} : ${f.text}`).join("\n")}
${s.details ? `\n${s.details.title} : ${s.details.items.join(" ; ")}.\n` : ""}`,
).join("\n")}
## Questions fréquentes

${m.FAQ.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}
${
  latest
    ? `
## Nouveautés de la version ${latest[0]} : ${latest[1].title}

${latest[1].intro}

${latest[1].items.map((it) => `- ${it.title} : ${it.text}`).join("\n")}
`
    : ""
}`,
  )

  // Manifeste de l'application web (critères de PWABuilder et de Chromium, 2026).
  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.webmanifest"),
    JSON.stringify(
      {
        id: "/",
        name: "NEXORA — L’atelier complet du web",
        short_name: "NEXORA",
        description: `Conçois, code, teste sur ${m.DEVICE_COUNT} modèles d’appareils, sécurise et publie ton site sur le web, Android et Windows depuis une seule application.`,
        lang: "fr",
        dir: "ltr",
        start_url: "/?source=pwa",
        scope: "/",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        orientation: "any",
        theme_color: "#050505",
        background_color: "#050505",
        categories: ["developer", "productivity", "utilities"],
        prefer_related_applications: false,
        launch_handler: { client_mode: ["navigate-existing", "auto"] },
        handle_links: "preferred",
        edge_side_panel: { preferred_width: 480 },
        icons: [
          ...[48, 72, 96, 144, 192, 256, 384, 512].map((s) => ({ src: `/icons/icon-${s}.png`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" })),
          ...[192, 512].map((s) => ({ src: `/icons/icon-maskable-${s}.png`, sizes: `${s}x${s}`, type: "image/png", purpose: "maskable" })),
        ],
        screenshots: [
          { src: "/screenshots/accueil-1280x800.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Accueil du site de NEXORA" },
          { src: "/screenshots/espaces-1280x800.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Les 9 espaces de NEXORA" },
          { src: "/screenshots/app-builder-1280x800.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "App Builder : ton site devient une application" },
          { src: "/screenshots/mobile-accueil-780x1688.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "NEXORA sur téléphone" },
          { src: "/screenshots/mobile-espaces-780x1688.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Les espaces sur téléphone" },
        ],
        shortcuts: [
          { name: "Les 9 espaces", short_name: "Espaces", url: "/espaces?source=pwa", icons: [{ src: "/icons/icon-96.png", sizes: "96x96", type: "image/png" }] },
          { name: "Tarifs", short_name: "Tarifs", url: "/tarifs?source=pwa", icons: [{ src: "/icons/icon-96.png", sizes: "96x96", type: "image/png" }] },
          { name: "Télécharger pour Windows", short_name: "Télécharger", url: "/telecharger?source=pwa", icons: [{ src: "/icons/icon-96.png", sizes: "96x96", type: "image/png" }] },
          { name: "Ma licence", short_name: "Licence", url: "/licence?source=pwa", icons: [{ src: "/icons/icon-96.png", sizes: "96x96", type: "image/png" }] },
        ],
        related_applications: [],
      },
      null,
      2,
    ),
  )

  // Service worker : pages en réseau d'abord (copie hors ligne), fichiers à empreinte en cache d'abord. Jamais les
  // autres applications du domaine (NEXORA web, back office, parrains, statut) ni les adresses du Worker.
  const precache = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", ...entryAssets]
  fs.writeFileSync(
    path.join(OUT_DIR, "sw.js"),
    `// NEXORA #096 : service worker du site vitrine (généré par scripts/site-ssg.mjs le ${stamp}).
const VERSION = "nexora-site-${stamp.replace(/[^0-9]/g, "")}"
const PRECACHE = ${JSON.stringify(precache)}
const SKIP = /^\\/(studio|admin|referral|status|__supabase-api|license|pay|security|hb|hook|rum)(\\/|$)/
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k)
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
      await self.clients.claim()
    })(),
  )
})
self.addEventListener("fetch", (e) => {
  const req = e.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const res = (await e.preloadResponse) || (await fetch(req))
          if (res.ok) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(req, copy))
          }
          return res
        } catch {
          return (await caches.match(req)) || (await caches.match("/offline.html")) || Response.error()
        }
      })(),
    )
    return
  }
  if (url.pathname.startsWith("/assets/") || /\\.(?:png|webp|jpg|svg|ico|woff2)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(VERSION).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
`,
  )

  // IndexNow : la clé publiée à la racine prouve que les soumissions viennent du propriétaire du site.
  if (settings.indexNowKey) fs.writeFileSync(path.join(OUT_DIR, `${settings.indexNowKey}.txt`), settings.indexNowKey)

  return { pages: written, urls: urls.map((x) => `${SITE}${x.path === "/" ? "/" : x.path}`), indexNowKey: settings.indexNowKey, site: SITE }
}
