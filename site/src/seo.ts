// NEXORA #096 : référencement du site vitrine. Une seule source pour les pages pré-générées (scripts/build-web.mjs) et
// pour le navigateur (titre et méta mis à jour à chaque navigation, App.tsx) : titre, description, adresse canonique,
// consigne aux robots, image de partage et données structurées schema.org (JSON-LD) de chaque page.
import { CONTACT_EMAIL, FALLBACK } from "../../nexora/app/renderer/nx/offres/catalog.js"
import { FAQ, PRICING_FAQ } from "./data/content"
import { PERSONAS, personaBySlug } from "./data/personas"
import { SPACES, spaceBySlug } from "./data/spaces"
import { APP_VERSION, DEVICE_COUNT, RELEASES } from "./lib/product"

/** Domaine principal (fichier de configuration de l'utilisateur, #096) : site vitrine à la racine, NEXORA web à /studio/. */
export const SITE_URL = "https://nexoradevs.online"
export const STUDIO_URL = `${SITE_URL}/studio/`
export const SITE_NAME = "NEXORA"
export const OG_IMAGE = `${SITE_URL}/og/nexora-1200x630.png`
export const LOCALE = "fr_FR"

type Plan = { name: string; price_month_cents: number; price_year_cents: number; description?: string }
const PLANS = FALLBACK as Record<string, Plan>
const PRO = PLANS.pro
const usd = (cents: number) => (cents / 100).toFixed(2)

export type Head = {
  path: string
  title: string
  description: string
  canonical: string
  robots: string
  ogType: "website" | "article"
  image: string
  imageAlt: string
  jsonLd: Record<string, unknown>[]
}

/** Pages pré-générées ; `sitemap` faux : servie mais absente du plan du site (doublon ou page de compte). */
export type PageEntry = { path: string; sitemap: boolean; priority: number; changefreq: "weekly" | "monthly" }
export const PAGES: PageEntry[] = [
  { path: "/", sitemap: true, priority: 1, changefreq: "weekly" },
  { path: "/espaces", sitemap: true, priority: 0.9, changefreq: "monthly" },
  ...SPACES.map((s) => ({ path: `/espaces/${s.slug}`, sitemap: true, priority: 0.8, changefreq: "monthly" as const })),
  // #117 : profils « Pour qui ? ».
  { path: "/pour-qui", sitemap: true, priority: 0.8, changefreq: "monthly" },
  ...PERSONAS.map((p) => ({ path: `/pour-qui/${p.slug}`, sitemap: true, priority: 0.7, changefreq: "monthly" as const })),
  { path: "/tarifs", sitemap: true, priority: 0.9, changefreq: "monthly" },
  { path: "/tarifs/comparatif", sitemap: false, priority: 0.5, changefreq: "monthly" },
  { path: "/telecharger", sitemap: true, priority: 0.9, changefreq: "monthly" },
  { path: "/nouveautes", sitemap: true, priority: 0.7, changefreq: "weekly" },
  { path: "/licence", sitemap: false, priority: 0.3, changefreq: "monthly" },
  { path: "/licence/verifier", sitemap: false, priority: 0.3, changefreq: "monthly" },
]

const INDEX = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
const NOINDEX = "noindex, follow"
const cut = (s: string, n = 158) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`)

const ORG_ID = `${SITE_URL}/#organisation`
const SITE_ID = `${SITE_URL}/#site`
const APP_ID = `${SITE_URL}/#application`

function organisation() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/icon-512.png`, width: 512, height: 512 },
    email: CONTACT_EMAIL,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL, availableLanguage: ["fr"] },
    sameAs: ["https://github.com/Trdgi4djyds/NEXORA-portable"],
  }
}
function website() {
  return { "@type": "WebSite", "@id": SITE_ID, url: `${SITE_URL}/`, name: SITE_NAME, inLanguage: "fr-FR", publisher: { "@id": ORG_ID } }
}
/**
 * Logiciel Windows : version, systèmes et, sur /tarifs seulement (#117 : offres réservées aux tarifs et à la licence),
 * offres (prix du catalogue de repli, mêmes montants que le serveur).
 */
function application(withOffers = false) {
  const app = {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    alternateName: "NEXORA Devs Toolbox",
    description: `Atelier tout-en-un pour concevoir, coder, tester sur ${DEVICE_COUNT} modèles d’appareils, sécuriser et publier un site sur le web, Android et Windows.`,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Web development",
    operatingSystem: "Windows 10, Windows 11",
    softwareVersion: APP_VERSION,
    inLanguage: "fr",
    url: `${SITE_URL}/`,
    downloadUrl: `${SITE_URL}/telecharger`,
    installUrl: `${SITE_URL}/telecharger`,
    image: OG_IMAGE,
    screenshot: `${SITE_URL}/screenshots/accueil-1280x800.png`,
    publisher: { "@id": ORG_ID },
    featureList: SPACES.map((s) => `${s.name} : ${s.card}`),
  }
  if (!withOffers) return app
  return {
    ...app,
    offers: [
      { "@type": "Offer", name: PLANS.free.name, price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock", url: `${SITE_URL}/tarifs` },
      {
        "@type": "Offer",
        name: PRO.name,
        price: usd(PRO.price_month_cents),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/tarifs`,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: usd(PRO.price_month_cents),
          priceCurrency: "USD",
          billingDuration: "P1M",
          unitCode: "MON",
        },
      },
    ],
  }
}
function breadcrumb(items: [string, string][]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE_URL}${path}` })),
  }
}
function faqPage(items: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  }
}
function webPage(path: string, name: string, description: string, extra: Record<string, unknown> = {}) {
  return {
    "@type": "WebPage",
    "@id": `${SITE_URL}${path}#page`,
    url: `${SITE_URL}${path}`,
    name,
    description,
    inLanguage: "fr-FR",
    isPartOf: { "@id": SITE_ID },
    about: { "@id": APP_ID },
    primaryImageOfPage: OG_IMAGE,
    ...extra,
  }
}
const graph = (...nodes: Record<string, unknown>[]) => [{ "@context": "https://schema.org", "@graph": nodes }]

/** Données de référencement d'une page (chemin normalisé : « / », « /tarifs », « /espaces/dev »…). */
export function headFor(path: string): Head {
  const base = { path, ogType: "website" as const, image: OG_IMAGE, imageAlt: "NEXORA, l’atelier complet du web installé sur votre PC" }
  const canonical = (p: string) => `${SITE_URL}${p === "/" ? "/" : p}`
  const [a, b] = path.split("/").filter(Boolean)

  if (!a) {
    const title = "NEXORA — L’atelier complet du web, installé sur votre PC"
    const description = cut(
      `Concevez, codez, testez sur ${DEVICE_COUNT} modèles d’appareils, publiez sur le web, Android et Windows, puis surveillez votre site, depuis une seule application installée sur votre PC, sans jongler entre dix outils.`,
    )
    return { ...base, title, description, canonical: canonical("/"), robots: INDEX, jsonLd: graph(organisation(), website(), application(), webPage("/", title, description), faqPage(FAQ)) }
  }
  if (a === "espaces" && !b) {
    const title = "Les 9 espaces de NEXORA — Responsive Lab, Dev Lab, App Builder…"
    const description = cut(
      "Responsive Lab, Browser Lab, Dev Lab, App Builder, Desktop Builder, Studio 3D & Motion, NEX-DESIGN, Sécurité et Accueil : chaque espace fait un métier, tous partagent vos projets.",
    )
    return {
      ...base,
      title,
      description,
      canonical: canonical("/espaces"),
      robots: INDEX,
      jsonLd: graph(
        organisation(),
        webPage("/espaces", title, description, { "@type": "CollectionPage" }),
        breadcrumb([["Accueil", "/"], ["Espaces", "/espaces"]]),
        {
          "@type": "ItemList",
          itemListElement: SPACES.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, url: `${SITE_URL}/espaces/${s.slug}` })),
        },
      ),
    }
  }
  if (a === "espaces" && b) {
    const s = spaceBySlug(b)
    if (s) {
      const p = `/espaces/${s.slug}`
      const title = cut(`${s.name} — ${s.card} | NEXORA`, 70)
      const description = cut(s.lead)
      return {
        ...base,
        title,
        description,
        canonical: canonical(p),
        robots: INDEX,
        jsonLd: graph(
          organisation(),
          webPage(p, title, description, { mainEntity: { "@type": "ItemList", name: `Fonctions de ${s.name}`, itemListElement: s.features.map((f, i) => ({ "@type": "ListItem", position: i + 1, name: f.title, description: f.text })) } }),
          breadcrumb([["Accueil", "/"], ["Espaces", "/espaces"], [s.name, p]]),
        ),
      }
    }
  }
  // #117 : profils « Pour qui ? » et parcours de chacun.
  if (a === "pour-qui" && !b) {
    const title = "Pour qui ? — NEXORA pour étudiants, développeurs, vibe codeurs, designers, commerçants…"
    const description = cut(
      "Étudiants en informatique, développeurs juniors, codeurs passionnés, vibe codeurs, entrepreneurs, créateurs de MVP, designers, freelances et agences, commerçants : ce qui vous freine, ce que NEXORA change, et votre parcours.",
    )
    return {
      ...base,
      title: cut(title, 90),
      description,
      canonical: canonical("/pour-qui"),
      robots: INDEX,
      jsonLd: graph(
        organisation(),
        webPage("/pour-qui", title, description, { "@type": "CollectionPage" }),
        breadcrumb([["Accueil", "/"], ["Pour qui ?", "/pour-qui"]]),
        {
          "@type": "ItemList",
          itemListElement: PERSONAS.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, url: `${SITE_URL}/pour-qui/${p.slug}` })),
        },
      ),
    }
  }
  if (a === "pour-qui" && b) {
    const pr = personaBySlug(b)
    if (pr) {
      const p = `/pour-qui/${pr.slug}`
      const title = cut(`NEXORA pour les ${pr.name.charAt(0).toLowerCase()}${pr.name.slice(1)} — ${pr.h1.join(" ")}`, 90)
      const description = cut(pr.lead)
      return {
        ...base,
        title,
        description,
        canonical: canonical(p),
        robots: INDEX,
        jsonLd: graph(
          organisation(),
          webPage(p, title, description, {
            audience: { "@type": "Audience", audienceType: pr.name },
            mainEntity: { "@type": "ItemList", name: `Parcours : ${pr.name}`, itemListElement: pr.steps.map((st, i) => ({ "@type": "ListItem", position: i + 1, name: st.title, description: st.text })) },
          }),
          breadcrumb([["Accueil", "/"], ["Pour qui ?", "/pour-qui"], [pr.name, p]]),
        ),
      }
    }
  }
  if (a === "tarifs") {
    const title = `Tarifs NEXORA — Gratuit, ou Pro à ${usd(PRO.price_month_cents).replace(/\.00$/, "")} $ par mois`
    const description = cut(
      `Offre Gratuite sans limite de durée : Responsive Lab, Browser Lab et 2 applications Android ou Windows. Pro à ${usd(PRO.price_month_cents).replace(/\.00$/, "")} $ par mois ouvre tout NEXORA. Comparatif complet des fonctions.`,
    )
    return {
      ...base,
      title,
      description,
      canonical: canonical("/tarifs"),
      robots: b === "comparatif" ? NOINDEX : INDEX,
      jsonLd: graph(organisation(), application(true), webPage("/tarifs", title, description), breadcrumb([["Accueil", "/"], ["Tarifs", "/tarifs"]]), faqPage(PRICING_FAQ)),
    }
  }
  if (a === "telecharger") {
    const title = "Télécharger NEXORA pour Windows 10 et 11"
    const description = cut(
      `Téléchargez NEXORA ${APP_VERSION} pour Windows 10 et 11 : un lanceur vérifie la signature de chaque fichier, installe et met à jour l’application. Vos réglages et vos projets sont gardés d’une version à l’autre.`,
    )
    return {
      ...base,
      title,
      description,
      canonical: canonical("/telecharger"),
      robots: INDEX,
      jsonLd: graph(organisation(), application(), webPage("/telecharger", title, description), breadcrumb([["Accueil", "/"], ["Télécharger", "/telecharger"]])),
    }
  }
  if (a === "nouveautes") {
    const title = "Nouveautés de NEXORA — notes de version"
    const latest = RELEASES[0]
    const description = cut(latest ? `NEXORA ${latest[0]} : ${latest[1].intro}` : "Toutes les nouveautés de NEXORA, version par version.")
    return {
      ...base,
      title,
      description,
      canonical: canonical("/nouveautes"),
      robots: INDEX,
      ogType: "article",
      jsonLd: graph(
        organisation(),
        webPage("/nouveautes", title, description),
        breadcrumb([["Accueil", "/"], ["Nouveautés", "/nouveautes"]]),
        ...RELEASES.slice(0, 5).map(([version, note]) => ({
          "@type": "TechArticle",
          headline: `NEXORA ${version} : ${note.title}`,
          description: cut(note.intro),
          url: `${SITE_URL}/nouveautes#v${version}`,
          inLanguage: "fr-FR",
          author: { "@id": ORG_ID },
          publisher: { "@id": ORG_ID },
          about: { "@id": APP_ID },
        })),
      ),
    }
  }
  if (a === "licence") {
    const title = b === "verifier" ? "Vérifier une clé de licence NEXORA" : "Ma licence NEXORA — compte, clé et abonnement"
    const description = "Créez votre compte NEXORA, récupérez votre clé de licence gratuite, gérez vos ordinateurs et votre abonnement Pro."
    return { ...base, title, description, canonical: canonical(b === "verifier" ? "/licence/verifier" : "/licence"), robots: NOINDEX, jsonLd: graph(organisation(), webPage(path, title, description)) }
  }
  return {
    ...base,
    title: "Page introuvable — NEXORA",
    description: "Cette page n’existe pas ou a changé d’adresse. Retrouvez les 9 espaces de NEXORA, les tarifs et le téléchargement.",
    canonical: canonical(path),
    robots: "noindex, nofollow",
    jsonLd: [],
  }
}
