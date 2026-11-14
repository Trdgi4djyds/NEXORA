// NEXORA #039 : validation avant mise en production (`pnpm valider`), partie automatisable de
// CHECKLIST-PRODUCTION.md. Écrit un rapport dans validations/AAAA-MM-JJ-<label>.md.
//   Local : processus principal (pnpm check), essais des offres (pnpm test:offres), types du back office,
//   publication web (pnpm build), secrets absents des fichiers envoyés sur GitHub, textes visibles sans
//   détail technique.
//   En ligne : site et back office publiés (codes, compression, en-têtes de sécurité, version en ligne
//   comparée à dist/), relais Supabase, Supabase (santé, authentification, sauvegardes, conseillers de
//   sécurité et de performance, schéma comparé aux migrations, offres, droits d'un visiteur anonyme,
//   fonctions Edge), compte d'essai non administrateur (NX_TEST_EMAIL et NX_TEST_PASSWORD).
//   Charge (--charge [100,500,1000]) : visiteurs simultanés sur le site statique, jamais sur Supabase.
// Options : --label NNN-sujet, --hors-ligne, --sans-build, --charge [niveaux], --url <site>.
// Dans le bac à sable de Figma Make, Supabase n'accepte que les lectures (GET) : les contrôles qui
// écrivent (connexion du compte d'essai, requêtes SQL) sont marqués « externe » et se lancent depuis un
// terminal ordinaire. Aucun secret n'est affiché ni écrit dans le rapport. Code de sortie 1 si un
// contrôle est en échec.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { supabaseToken, SECRETS_FILES, SECRETS_FILE } from "./local-secrets.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const argv = process.argv.slice(2).filter((a) => a !== "--")
const opt = (name) => {
  const i = argv.indexOf(name)
  if (i < 0) return undefined
  const v = argv[i + 1]
  return v && !v.startsWith("--") ? v : true
}
const LABEL = typeof opt("--label") === "string" ? opt("--label") : "validation"
const OFFLINE = argv.includes("--hors-ligne")
const NO_BUILD = argv.includes("--sans-build")
const chargeOpt = opt("--charge")
const LOAD =
  chargeOpt === undefined
    ? null
    : chargeOpt === true
      ? [100, 500, 1000]
      : String(chargeOpt)
          .split(",")
          .map(Number)
          .filter((n) => n > 0 && n <= 2000)
const setup = JSON.parse(
  fs.readFileSync(path.join(ROOT, "supabase", "nexora.json"), "utf8"),
)
const SITE = (
  typeof opt("--url") === "string" ? opt("--url") : setup.siteUrl
).replace(/\/?$/, "/")
const SB_URL = `https://${setup.projectRef}.supabase.co`
const MGMT = `https://api.supabase.com/v1/projects/${setup.projectRef}`

// ---------- Résultats ----------
const results = []
const LABELS = {
  ok: "VALIDÉ",
  echec: "BLOQUANT",
  alerte: "ALERTE",
  externe: "EXTERNE",
}
const mask = (s) =>
  String(s).replace(
    /\b(eyJ[\w-]{10,}\.[\w-]+\.[\w-]+|sbp_\w{6,}|gh[pousr]_\w{6,}|github_pat_\w+|xkeysib-[\w-]{6,}|xsmtpsib-[\w-]{6,})/g,
    "[masqué]",
  )
function rec(rubrique, controle, statut, detail = "") {
  const d = mask(detail)
  results.push({ rubrique, controle, statut, detail: d })
  console.log(
    `${LABELS[statut].padEnd(9)} ${rubrique} · ${controle}${
      d ? ` — ${d}` : ""
    }`,
  )
}
async function guard(rubrique, controle, fn) {
  try {
    await fn()
  } catch (e) {
    if (e && e.egress)
      rec(
        rubrique,
        controle,
        "externe",
        "requête bloquée par le bac à sable (écriture) : à lancer depuis un terminal ordinaire",
      )
    else rec(rubrique, controle, "echec", `erreur inattendue : ${e.message}`)
  }
}
const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`

// ---------- Outils ----------
function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 256 << 20,
  })
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` }
}
const lastLine = (s, re) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && (!re || re.test(l)))
    .pop() || ""

async function http(url, init = {}) {
  const t0 = performance.now()
  const res = await fetch(url, {
    redirect: "manual",
    ...init,
    headers: { "Accept-Encoding": "br, gzip", ...(init.headers || {}) },
  })
  const buf = Buffer.from(await res.arrayBuffer())
  const ms = Math.round(performance.now() - t0)
  const text = buf.toString("utf8")
  if (res.status === 403 && /Blocked by egress policy/.test(text)) {
    const e = new Error("bloqué par le bac à sable")
    e.egress = true
    throw e
  }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { status: res.status, headers: res.headers, buf, text, json, ms }
}

function anonKey() {
  const src = fs.readFileSync(
    path.join(ROOT, "admin", "src", "supabase.ts"),
    "utf8",
  )
  const at = src.indexOf("SUPABASE_ANON =")
  const block = src.slice(at, src.indexOf("/**", at))
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join("")
}
const jwtRole = (t) => {
  try {
    return JSON.parse(
      Buffer.from(t.split(".")[1], "base64url").toString("utf8"),
    ).role
  } catch {
    return null
  }
}

// Objets attendus d'après les migrations (tables et fonctions appelables, hors déclencheurs).
function expectedSchema() {
  const dir = path.join(ROOT, "supabase", "migrations")
  const out = []
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8")
    const tables = [
      ...sql.matchAll(/create table if not exists public\.(\w+)/gi),
    ].map((m) => m[1])
    const fns = [
      ...sql.matchAll(
        /create or replace function public\.(\w+)\s*\([^)]*\)\s*returns\s+(\w+)/gi,
      ),
    ]
      .filter((m) => m[2].toLowerCase() !== "trigger")
      .map((m) => m[1])
    out.push({ file: f, tables: [...new Set(tables)], fns: [...new Set(fns)] })
  }
  return out
}

// ---------- 1. Contrôles locaux ----------
function localChecks() {
  const R = "0. Code et publication"
  let r = run("pnpm", ["-s", "check"])
  rec(
    R,
    "Processus principal (pnpm check)",
    r.code === 0 ? "ok" : "echec",
    lastLine(r.out) || `code ${r.code}`,
  )

  const pglite = process.env.PGLITE_DIR || "/tmp/pgtest"
  r = run("pnpm", ["-s", "test:offres"], { PGLITE_DIR: pglite })
  const summary = lastLine(r.out, /vérifications/)
  const skipped = /PGlite introuvable|partie 2 sautée|sautée/i.test(r.out)
  rec(
    "4. Offres et règles",
    "Essais des offres : canaux, quotas atomiques, essais, limites (pnpm test:offres)",
    r.code !== 0 ? "echec" : skipped ? "alerte" : "ok",
    `${summary || `code ${r.code}`}${
      skipped
        ? " ; partie SQL sautée (PGlite absent, voir l'en-tête de scripts/test-offres.mjs)"
        : ""
    }`,
  )

  // NEXORA #090 : parrainage (NEXORA REFERRAL) : migration rejouée sur PGlite, paiement du Worker avec la remise.
  r = run("pnpm", ["-s", "test:parrainage"], { PGLITE_DIR: pglite })
  const refMissing = /PGlite introuvable/i.test(r.out)
  rec(
    "4. Offres et règles",
    "Essais du parrainage : parrains, code du mois, filleuls, commissions, retraits (pnpm test:parrainage)",
    refMissing ? "alerte" : r.code !== 0 ? "echec" : "ok",
    refMissing ? "sautés (PGlite absent, voir l'en-tête de scripts/test-parrainage.mjs)" : lastLine(r.out, /vérifications/) || `code ${r.code}`,
  )

  const tsc = path.join(ROOT, "node_modules", ".bin", "tsc")
  r = fs.existsSync(tsc)
    ? run(tsc, ["--noEmit", "-p", "admin"])
    : { code: null, out: "tsc introuvable" }
  rec(
    R,
    "Types du back office (tsc --noEmit)",
    r.code === 0 ? "ok" : "echec",
    r.code === 0 ? "aucune erreur" : lastLine(r.out),
  )
  // NEXORA #060 : site vitrine (site/, React).
  r = fs.existsSync(tsc)
    ? run(tsc, ["--noEmit", "-p", "site"])
    : { code: null, out: "tsc introuvable" }
  rec(
    R,
    "Types du site vitrine (tsc --noEmit)",
    r.code === 0 ? "ok" : "echec",
    r.code === 0 ? "aucune erreur" : lastLine(r.out),
  )
  // NEXORA #090 : espace des parrains (referral/, React).
  r = fs.existsSync(tsc)
    ? run(tsc, ["--noEmit", "-p", "referral"])
    : { code: null, out: "tsc introuvable" }
  rec(
    R,
    "Types de l’espace des parrains (tsc --noEmit)",
    r.code === 0 ? "ok" : "echec",
    r.code === 0 ? "aucune erreur" : lastLine(r.out),
  )

  if (!NO_BUILD) {
    r = run("pnpm", ["-s", "build"])
    rec(
      R,
      "Publication web (pnpm build)",
      r.code === 0 ? "ok" : "echec",
      lastLine(r.out, /dist|rror/) || `code ${r.code}`,
    )
  }
  const dist = path.join(ROOT, "dist")
  const need = [
    // NEXORA #096 : site vitrine pré-généré à la racine, NEXORA web sous studio/.
    "index.html",
    "tarifs.html",
    "404.html",
    "admin/index.html",
    // NEXORA #090 : espace des parrains.
    "referral/index.html",
    "_headers",
    "_redirects",
    "robots.txt",
    "sitemap.xml",
    "llms.txt",
    "manifest.webmanifest",
    "sw.js",
    "studio/index.html",
    "studio/nx/boot.js",
  ]
  const missing = need.filter((f) => !fs.existsSync(path.join(dist, f)))
  rec(
    R,
    "Fichiers indispensables de dist/",
    missing.length ? "echec" : "ok",
    missing.length ? `manquants : ${missing.join(", ")}` : need.join(", "),
  )
}

// ---------- 2. Secrets et textes visibles ----------
function secretChecks() {
  const R = "10. Sécurité"
  const exclude = [
    ...SECRETS_FILES,
    ".env",
    ".env.local",
    ".env.production",
  ].map((f) => `:(exclude,literal)${f}`)
  // Valeurs exactes du fichier local de jetons (jamais affichées), clé publique (anon) exceptée.
  let values = []
  try {
    const raw = fs.readFileSync(path.join(ROOT, SECRETS_FILE), "utf8")
    values = [
      ...raw.matchAll(
        /\b(gh[pousr]_\w{20,}|github_pat_\w{20,}|sbp_\w{20,}|xkeysib-[\w-]{20,}|xsmtpsib-[\w-]{20,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})/g,
      ),
    ]
      .map((m) => m[1])
      .filter((v) => !(v.startsWith("eyJ") && jwtRole(v) === "anon"))
    values = [...new Set(values)]
  } catch {
    /* pas de fichier de jetons : seuls les motifs génériques sont cherchés */
  }
  const grep = (args, input) => {
    const r = spawnSync(
      "git",
      ["grep", "--untracked", "-I", "-l", ...args, "--", ".", ...exclude],
      { cwd: ROOT, encoding: "utf8", input, maxBuffer: 64 << 20 },
    )
    if (r.status === 1) return []
    if (r.status !== 0) throw new Error(lastLine(r.stderr) || "git grep")
    return r.stdout.split("\n").filter(Boolean)
  }
  const exact = values.length ? grep(["-F", "-f", "-"], values.join("\n")) : []
  const generic = grep([
    "-E",
    "-e",
    "sbp_[0-9a-f]{40}",
    "-e",
    "gh[pousr]_[A-Za-z0-9]{36}",
    "-e",
    "github_pat_[A-Za-z0-9_]{60,}",
    "-e",
    "xkeysib-[0-9a-f]{64}",
    "-e",
    "xsmtpsib-[0-9a-f]{64}",
  ])
  const hits = [...new Set([...exact, ...generic])]
  rec(
    R,
    "Aucun secret dans les fichiers envoyés sur GitHub",
    hits.length ? "echec" : "ok",
    hits.length
      ? `secret trouvé dans : ${hits.join(", ")}`
      : `${plural(values.length, "jeton local cherché", "jetons locaux cherchés")} et motifs génériques (GitHub, Supabase, Brevo) : aucun résultat`,
  )

  // Textes visibles par les utilisateurs : aucun prestataire, migration ni ancien nom (#038).
  const files = []
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), {
      withFileTypes: true,
    })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(js|tsx?|html)$/.test(e.name)) files.push(p)
    }
  }
  walk("nexora/app/renderer/nx")
  walk("nexora/app/renderer/supervision")
  walk("site/src")
  files.push(
    "admin/src/auth.tsx",
    "admin/src/emails/templates.ts",
    "admin/src/emails/layout.ts",
    "nexora/app/renderer/index.html",
  )
  const words =
    /\b(IPPOO|Brevo|Supabase|PostgREST|pg_cron|service_role|back office|migrations?)\b/i
  const found = []
  for (const f of files) {
    if (!fs.existsSync(path.join(ROOT, f))) continue
    fs.readFileSync(path.join(ROOT, f), "utf8")
      .split("\n")
      .forEach((line, i) => {
        const t = line.trim()
        if (/^(\/\/|\*|\/\*|<!--)/.test(t) || /techLog\(|console\./.test(t))
          return
        // Réservé aux administrateurs : descriptions du catalogue des e-mails, exemples d'alerte, titre de la connexion au back office.
        if (
          /^(when|desc|group|label):|alertVariant\(|kicker="Back office"/.test(
            t,
          )
        )
          return
        for (const m of t.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g)) {
          const s = m[2]
          if (
            /\s/.test(s) &&
            words.test(s) &&
            !/^https?:|supabase\.co/.test(s)
          ) {
            found.push(`${f}:${i + 1}`)
            break
          }
        }
      })
  }
  const ippoo = spawnSync(
    "git",
    [
      "grep",
      "--untracked",
      "-I",
      "-l",
      "-i",
      "ippoo",
      "--",
      "nexora/app/renderer",
      "nexora/app/src",
      "admin/src",
      "worker",
      "preview",
    ],
    { cwd: ROOT, encoding: "utf8" },
  )
    .stdout.split("\n")
    .filter(Boolean)
  rec(
    R,
    "Textes visibles sans détail technique ni ancien nom",
    ippoo.length ? "echec" : found.length ? "alerte" : "ok",
    ippoo.length
      ? `ancien nom dans : ${ippoo.join(", ")}`
      : found.length
        ? `à relire (texte affiché ou interne ?) : ${found.slice(0, 12).join(", ")}${
            found.length > 12 ? ` et ${found.length - 12} autres` : ""
          }`
        : `${files.length} fichiers relus`,
  )
}

// ---------- 3. Site, back office et relais publiés ----------
async function siteChecks() {
  const R = "18. Publication"
  const home = await http(SITE)
  rec(
    R,
    "NEXORA web répond",
    home.status === 200 ? "ok" : "echec",
    `${home.status} en ${home.ms} ms`,
  )
  const admin = await http(`${SITE}admin/`)
  rec(
    R,
    "Back office répond",
    admin.status === 200 ? "ok" : "echec",
    `${admin.status} en ${admin.ms} ms`,
  )
  // NEXORA #096 : site vitrine à la racine, NEXORA web à /studio/.
  const studio = await http(`${SITE}studio/`)
  rec(
    R,
    "NEXORA web répond (/studio/)",
    studio.status === 200 ? "ok" : "echec",
    `${studio.status} en ${studio.ms} ms`,
  )
  // NEXORA #096 : référencement (robots.txt ouvert, plan du site, llms.txt, manifeste, pages pré-générées).
  const SEO = "19. Référencement et PWA"
  const robots = await fetch(`${SITE}robots.txt`).then(async (r) => ({ status: r.status, text: await r.text() })).catch(() => ({ status: 0, text: "" }))
  const blocked = /User-agent:\s*\*\s*\nDisallow:\s*\/\s*$/im.test(robots.text) && !/Allow:\s*\/\s*$/im.test(robots.text)
  rec(SEO, "robots.txt ouvert aux moteurs et aux IA, plan du site déclaré", robots.status === 200 && !blocked && /Sitemap:/i.test(robots.text) ? "ok" : "echec", blocked ? "tout le site est bloqué (Disallow: /)" : `${robots.status}${/Sitemap:/i.test(robots.text) ? "" : ", sans ligne Sitemap"}`)
  const sitemap = await fetch(`${SITE}sitemap.xml`).then(async (r) => ({ status: r.status, n: ((await r.text()).match(/<loc>/g) || []).length })).catch(() => ({ status: 0, n: 0 }))
  rec(SEO, "sitemap.xml publié", sitemap.status === 200 && sitemap.n > 5 ? "ok" : "echec", `${sitemap.status}, ${sitemap.n} adresses`)
  for (const [file, label] of [["llms.txt", "llms.txt (assistants IA)"], ["manifest.webmanifest", "Manifeste de la PWA"], ["sw.js", "Service worker de la PWA"]]) {
    const r = await http(`${SITE}${file}`)
    rec(SEO, label, r.status === 200 ? "ok" : "echec", `${r.status}`)
  }
  const tarifs = await fetch(`${SITE}tarifs`).then(async (r) => ({ status: r.status, html: await r.text() })).catch(() => ({ status: 0, html: "" }))
  const ssg = /<title>Tarifs/.test(tarifs.html) && /rel="canonical" href="[^"]*\/tarifs"/.test(tarifs.html) && /application\/ld\+json/.test(tarifs.html)
  rec(SEO, "Pages pré-générées (titre, canonique et données structurées propres à /tarifs)", tarifs.status === 200 && ssg ? "ok" : "echec", `${tarifs.status}${ssg ? "" : ", HTML commun ou incomplet"}`)
  const missing = await http(`${SITE}introuvable-${Date.now()}`)
  rec(
    "3. API et erreurs",
    "Adresse inconnue : erreur propre",
    missing.status === 404 ? "ok" : "alerte",
    `${missing.status}`,
  )

  const P = "11. Performance"
  const assets = ["studio/styles.css", "studio/dist/main.js", "studio/nx/boot.js"]
  const rows = []
  for (const a of assets) rows.push([a, await http(`${SITE}${a}`)])
  const enc = [home, ...rows.map((r) => r[1])].map(
    (r) => r.headers.get("content-encoding") || "aucune",
  )
  rec(
    P,
    "Compression des fichiers",
    enc.every((e) => /br|gzip/.test(e)) ? "ok" : "alerte",
    `page et ${assets.length} fichiers : ${[...new Set(enc)].join(", ")}`,
  )
  const etags = rows.filter((r) => r[1].headers.get("etag")).length
  rec(
    P,
    "Cache validé (ETag, revalidation)",
    etags === rows.length ? "ok" : "alerte",
    `${etags}/${rows.length} fichiers avec ETag ; Cache-Control : ${rows[0][1].headers.get("cache-control") || "absent"}`,
  )
  const slow = [home, admin, ...rows.map((r) => r[1])]
  const worst = Math.max(...slow.map((r) => r.ms))
  rec(
    P,
    "Temps de réponse du site",
    worst < 1500 ? "ok" : "alerte",
    `le plus lent : ${worst} ms (${slow.length} requêtes depuis cet environnement)`,
  )

  const S = "10. Sécurité"
  rec(S, "HTTPS", SITE.startsWith("https://") ? "ok" : "echec", SITE)
  const nosniff = /nosniff/i.test(
    home.headers.get("x-content-type-options") || "",
  )
  const referrer = home.headers.get("referrer-policy")
  rec(
    S,
    "En-têtes de sécurité du site (nosniff, Referrer-Policy)",
    nosniff && referrer ? "ok" : "echec",
    nosniff && referrer
      ? `nosniff, ${referrer}`
      : "absents en ligne : publier la version qui contient dist/_headers (#039)",
  )
  const xfo = admin.headers.get("x-frame-options") || ""
  const fa = /frame-ancestors\s+'none'/.test(
    admin.headers.get("content-security-policy") || "",
  )
  rec(
    S,
    "Back office protégé contre l'affichage dans un cadre (clics détournés)",
    /deny/i.test(xfo) || fa ? "ok" : "echec",
    /deny/i.test(xfo) || fa
      ? `X-Frame-Options ${xfo || "—"}, frame-ancestors ${fa ? "'none'" : "—"}`
      : "en-têtes absents en ligne",
  )
  const csp = /Content-Security-Policy/i.test(home.text)
  rec(
    S,
    "Politique de sécurité (CSP) de NEXORA web",
    csp ? "ok" : "echec",
    csp ? "présente dans la page" : "absente",
  )

  // Relais Supabase du back office : jeton exigé, projet de NEXORA seulement.
  const A = "3. API et erreurs"
  const relay = await http(
    `${SITE}__supabase-api/v1/projects/${setup.projectRef}/config/auth`,
  )
  rec(
    A,
    "Relais Supabase : refus sans jeton",
    relay.status === 401 ? "ok" : "echec",
    `${relay.status}`,
  )
  const other = await http(
    `${SITE}__supabase-api/v1/projects/autre-projet/config/auth`,
  )
  rec(
    A,
    "Relais Supabase : autres projets refusés",
    other.status === 403 ? "ok" : "echec",
    `${other.status}`,
  )

  // Version en ligne comparée à dist/ (back office exclu : sa date de publication change à chaque build).
  const dist = path.join(ROOT, "dist")
  if (!fs.existsSync(dist)) return
  const list = []
  for (const e of fs.readdirSync(dist, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!e.isFile()) continue
    const rel = path
      .relative(dist, path.join(e.parentPath, e.name))
      .split(path.sep)
      .join("/")
    // NEXORA #096 : sw.js porte l'heure de sa construction (version du cache) : différent à chaque construction.
    if (/^(admin|vendor)\//.test(rel) || rel === "_headers" || rel === "_redirects" || rel === "sw.js") continue
    if (fs.statSync(path.join(dist, rel)).size > 3 << 20) continue
    list.push(rel)
  }
  const diff = []
  let i = 0
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (i < list.length) {
        const rel = list[i++]
        // Cloudflare redirige …/index.html vers …/ : on compare l'adresse servie.
        // NEXORA #096 : Cloudflare sert « page.html » à l'adresse « /page » (et redirige /page.html vers /page).
        const url = rel.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "")
        try {
          const r = await http(
            SITE + url.split("/").map(encodeURIComponent).join("/"),
          )
          const local = fs.readFileSync(path.join(dist, rel))
          const h = (b) => crypto.createHash("sha256").update(b).digest("hex")
          if (r.status !== 200 || h(r.buf) !== h(local)) diff.push(rel)
        } catch {
          diff.push(rel)
        }
      }
    }),
  )
  rec(
    R,
    "Version en ligne identique à dist/",
    diff.length ? "alerte" : "ok",
    diff.length
      ? `${plural(diff.length, "fichier différent")} sur ${list.length} (publication en attente ?) : ${diff.slice(0, 8).join(", ")}${
          diff.length > 8 ? "…" : ""
        }`
      : `${list.length} fichiers comparés (back office et bibliothèques exclus)`,
  )
}

// ---------- 4. Supabase (API de gestion, lectures seulement) ----------
async function supabaseChecks() {
  const token = supabaseToken()
  if (!token) {
    rec(
      "16. Surveillance",
      "Supabase (API de gestion)",
      "externe",
      "jeton Supabase absent (SUPABASE_ACCESS_TOKEN)",
    )
    return null
  }
  const get = async (p) => {
    const r = await http(MGMT + p, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.status !== 200) throw new Error(`${p} : ${r.status}`)
    return r.json
  }
  let types = null
  await guard("16. Surveillance", "Santé des services Supabase", async () => {
    const [project, health] = await Promise.all([
      get(""),
      get("/health?services=auth,db,rest,realtime,storage"),
    ])
    const bad = health.filter((s) => !s.healthy).map((s) => s.name)
    rec(
      "16. Surveillance",
      "Santé des services Supabase",
      project.status === "ACTIVE_HEALTHY" && !bad.length ? "ok" : "echec",
      `${project.status} ; ${health.length - bad.length}/${health.length} services sains${
        bad.length ? ` (en panne : ${bad.join(", ")})` : ""
      }`,
    )
  })

  await guard(
    "1. Authentification",
    "Configuration de l'authentification",
    async () => {
      const a = await get("/config/auth")
      const R = "1. Authentification"
      rec(
        R,
        "Vérification de l'e-mail exigée à l'inscription",
        a.mailer_autoconfirm ? "echec" : "ok",
        a.mailer_autoconfirm
          ? "comptes confirmés sans e-mail"
          : "confirmation par e-mail obligatoire",
      )
      rec(
        R,
        "Mots de passe : longueur minimale",
        (a.password_min_length || 0) >= 8 ? "ok" : "echec",
        `${a.password_min_length} caractères`,
      )
      // NEXORA #120 : le serveur refuse aussi un changement de mot de passe sans connexion récente et un changement
      // d'adresse non confirmé depuis l'ancienne adresse (NEXORA demande déjà le mot de passe actuel).
      rec(
        R,
        "Changement de mot de passe : connexion récente exigée par Supabase",
        a.security_update_password_require_reauthentication ? "ok" : "alerte",
        a.security_update_password_require_reauthentication
          ? "activé"
          : "désactivé : back office → Supabase → Authentification, « Connexion récente exigée pour changer le mot de passe »",
      )
      rec(
        R,
        "Changement d'adresse e-mail confirmé sur les deux adresses",
        a.mailer_secure_email_change_enabled !== false ? "ok" : "alerte",
        a.mailer_secure_email_change_enabled !== false
          ? "activé"
          : "désactivé : back office → Supabase → Authentification, « Changement d’adresse confirmé sur les deux adresses »",
      )
      rec(
        R,
        "Mots de passe divulgués refusés",
        a.password_hibp_enabled ? "ok" : "alerte",
        a.password_hibp_enabled
          ? "activé"
          : "désactivé (option des offres payantes de Supabase)",
      )
      rec(
        R,
        "Sessions : expiration et rotation des jetons",
        a.refresh_token_rotation_enabled && a.jwt_exp <= 3600 ? "ok" : "alerte",
        `jeton d'accès ${Math.round(a.jwt_exp / 60)} min, rotation ${
          a.refresh_token_rotation_enabled ? "active" : "inactive"
        }`,
      )
      rec(
        R,
        "Inscriptions protégées contre les robots",
        a.disable_signup || a.security_captcha_enabled ? "ok" : "alerte",
        a.disable_signup
          ? "inscriptions fermées"
          : a.security_captcha_enabled
            ? "captcha actif"
            : "inscriptions ouvertes sans captcha",
      )
      const allow = (a.uri_allow_list || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const wanted = [...setup.redirectUrls, `${SITE}admin/**`]
      const miss = wanted.filter((u) => !allow.includes(u))
      const local = /localhost|127\.0\.0\.1/.test(a.site_url)
      rec(
        R,
        "Liens des e-mails (adresse du site, redirections)",
        local || miss.length ? "echec" : "ok",
        local
          ? `adresse du site locale : ${a.site_url}`
          : miss.length
            ? `redirections manquantes : ${miss.join(", ")}`
            : `${a.site_url}, ${allow.length} redirections`,
      )
      rec(
        R,
        "Limites anti-abus de l'authentification",
        a.rate_limit_verify && a.rate_limit_token_refresh ? "ok" : "alerte",
        `vérifications ${a.rate_limit_verify}/5 min, renouvellements ${a.rate_limit_token_refresh}/5 min, codes ${a.rate_limit_otp}/5 min`,
      )
      const E = "8. Notifications et e-mails"
      rec(
        E,
        "Envoi des e-mails des comptes par Brevo",
        a.smtp_host === setup.email.smtpHost ? "ok" : "echec",
        a.smtp_host
          ? `SMTP ${a.smtp_host}`
          : "serveur d'envoi de Supabase (quelques e-mails par heure)",
      )
      // NEXORA #110 : compte Brevo et expéditeur attendus (supabase/nexora.json, d'après token_proj_nexora.txt).
      if (a.smtp_host === setup.email.smtpHost) {
        const stale = a.smtp_user !== setup.email.smtpUser || a.smtp_admin_email !== setup.email.senderEmail
        rec(
          E,
          "Compte Brevo et expéditeur des e-mails des comptes",
          stale ? "alerte" : "ok",
          stale
            ? `en place : ${a.smtp_user || "?"} <${a.smtp_admin_email}> ; attendu : ${setup.email.smtpUser} <${setup.email.senderEmail}> (back office → Supabase → E-mails (Brevo) → clé SMTP du compte, « Enregistrer le SMTP Brevo »)`
            : `${a.smtp_user} <${a.smtp_admin_email}>`,
        )
      }
      const rate = Number(a.rate_limit_email_sent || 0)
      rec(
        E,
        "Limite horaire des e-mails des comptes",
        rate >= setup.email.authRateLimitPerHour ? "ok" : "echec",
        `${rate} par heure${
          rate < setup.email.authRateLimitPerHour
            ? ` : au-delà, inscriptions et mots de passe oubliés sans e-mail ; back office → Supabase → « Appliquer la configuration recommandée » (${setup.email.authRateLimitPerHour} par heure)`
            : ""
        }`,
      )
      const subj = String(a.mailer_subjects_confirmation || "")
      const fr = /NEXORA|[éèàêç]|Confirme|Bienvenue/i.test(subj)
      rec(
        E,
        "E-mails des comptes en français (modèles appliqués)",
        fr ? "ok" : "echec",
        fr
          ? `objet de confirmation : « ${subj} »`
          : `objet par défaut en anglais (« ${subj} ») : back office → E-mails → « Appliquer les modèles »`,
      )
    },
  )

  await guard("2. Base de données", "Sauvegardes", async () => {
    const b = await get("/database/backups")
    const n = (b.backups || []).length
    rec(
      "2. Base de données",
      "Sauvegardes restaurables",
      b.pitr_enabled || n ? "ok" : "echec",
      b.pitr_enabled
        ? "restauration à la seconde (PITR) active"
        : n
          ? `${plural(n, "sauvegarde")} disponible${
              n > 1 ? "s" : ""
            }, la plus récente du ${(b.backups[0].inserted_at || "").slice(0, 10)}`
          : "aucune sauvegarde restaurable (offre gratuite de Supabase) : faire une sauvegarde manuelle avant toute migration (CHECKLIST-PRODUCTION.md, section 2)",
    )
  })
  await guard("10. Sécurité", "Connexions à la base", async () => {
    const [ssl, net] = await Promise.all([
      get("/ssl-enforcement"),
      get("/network-restrictions"),
    ])
    const open = (net.config?.dbAllowedCidrs || []).includes("0.0.0.0/0")
    rec(
      "10. Sécurité",
      "Connexions directes à la base : SSL imposé",
      ssl.currentConfig?.database ? "ok" : "alerte",
      ssl.currentConfig?.database
        ? "imposé"
        : "non imposé (tableau de bord Supabase → Database → SSL)",
    )
    rec(
      "10. Sécurité",
      "Connexions directes à la base : adresses autorisées",
      open ? "alerte" : "ok",
      open
        ? "toutes les adresses (mot de passe de la base seul rempart)"
        : "liste restreinte",
    )
  })
  await guard("3. API et erreurs", "Fonctions Edge", async () => {
    const fns = await get("/functions")
    const bad = setup.functions.filter(
      (f) => !fns.some((x) => x.slug === f && x.status === "ACTIVE"),
    )
    rec(
      "3. API et erreurs",
      "Fonctions Edge actives",
      bad.length ? "echec" : "ok",
      bad.length
        ? `absentes ou inactives : ${bad.join(", ")}`
        : setup.functions.join(", "),
    )
  })

  await guard(
    "10. Sécurité",
    "Conseiller de sécurité de Supabase",
    async () => {
      const { lints } = await get("/advisors/security")
      const err = lints.filter((l) => l.level === "ERROR")
      // Fonctions publiques voulues : statistiques des applications (clé), liens de partage, droits d'organisation, incidents (droits contrôlés dans la fonction).
      // NEXORA #059 (A-033) : supervision publique, chacune protégée par un jeton, un secret ou un lien, avec débit
      // limité : signal de vie et repère de déploiement (jeton), seconde région (secret partagé avec Cloudflare),
      // visiteurs réels (clé du site), page de statut et abonnés (jetons de confirmation), liens de validation.
      // nx_monitor_hook_token, nx_org_perm et rum_summary n'en font pas partie (réservées aux comptes, migration 06).
      // NEXORA #093 : parrainage (migration 07, « Lectures publiques ») : code d'un parrain lu par le site vitrine
      // (valide ou non, prénom, prix avec la remise), lien d'invitation (adresse masquée), parrainage du compte
      // (réponse neutre sans compte). Aucune donnée privée.
      const anonOk = new Set([
        "nx_referral_resolve",
        "nx_partner_invite_info",
        "nx_referral_mine",
        "app_track",
        "get_shared",
        "nx_can_read_org",
        "nx_can_edit_org",
        "monitor_incident_action",
        "nx_heartbeat_ping",
        "nx_deploy_mark",
        "nx_probe_jobs",
        "nx_probe_report",
        "nx_rum_collect",
        "nx_status_page",
        "nx_status_subscribe",
        "nx_status_confirm",
        "nx_status_unsubscribe",
        "nx_review_get",
        "nx_review_post",
        // NEXORA #079 : licences (#076) et service de sécurité (#077). Paiements et anomalies du lanceur : secret
        // partagé avec le Worker (nx_worker_secret_ok) ; politique des versions : déjà publique dans la déclaration
        // signée de /security/manifest ; vérification d'une clé : page publique du site, adresse du titulaire masquée.
        "nx_billing_apply",
        "nx_security_report",
        "nx_release_policy",
        "nx_license_verify",
        "nx_release_seen", // #084 : secret partagé avec le Worker
        // NEXORA #107/#109 : paiement SasPay, appelé par le Worker avec la clé publique et le secret partagé
        // (nx_worker_secret_ok vérifié en tête de chaque fonction, refus essayé par pnpm test:parrainage).
        "nx_pay_session_open",
        "nx_pay_session_find",
        "nx_pay_sessions_pending",
        "nx_pay_session_fail",
        "nx_pay_apply",
      ])
      const anon = lints.filter(
        (l) =>
          l.name === "anon_security_definer_function_executable" &&
          !anonOk.has(l.metadata?.name),
      )
      const path_ = lints
        .filter((l) => l.name === "function_search_path_mutable")
        .map((l) => l.metadata?.name)
      const noRls = lints
        .filter((l) => /rls_disabled|policy_exists_rls_disabled/.test(l.name))
        .map((l) => l.metadata?.name)
      const definer = lints.filter(
        (l) => l.name === "authenticated_security_definer_function_executable",
      ).length
      rec(
        "10. Sécurité",
        "Conseiller de sécurité : aucune erreur",
        err.length ? "echec" : "ok",
        err.length
          ? err.map((l) => `${l.name} (${l.metadata?.name || ""})`).join(", ")
          : `${plural(lints.length, "remarque")}, aucune de niveau erreur`,
      )
      rec(
        "2. Base de données",
        "Sécurité des lignes (RLS) sur toutes les tables",
        noRls.length ? "echec" : "ok",
        noRls.length ? `sans RLS : ${noRls.join(", ")}` : "RLS active partout",
      )
      rec(
        "10. Sécurité",
        "Fonctions privilégiées appelables sans compte",
        anon.length ? "echec" : "ok",
        anon.length
          ? anon.map((l) => l.metadata?.name).join(", ")
          : `seulement les fonctions publiques prévues (${[...anonOk].join(", ")}) ; ${definer} fonctions réservées aux comptes connectés, qui contrôlent elles-mêmes les droits (refus vérifiés par l'essai avec un compte simple)`,
      )
      rec(
        "10. Sécurité",
        "Fonctions au chemin de recherche fixé",
        path_.length ? "alerte" : "ok",
        path_.length
          ? `${path_.join(", ")} : corrigé dans les migrations (#039), à réappliquer (back office → Supabase → « Tout appliquer »)`
          : "toutes",
      )
    },
  )
  await guard(
    "11. Performance",
    "Conseiller de performance de Supabase",
    async () => {
      const { lints } = await get("/advisors/performance")
      const by = {}
      for (const l of lints)
        by[`${l.level}:${l.name}`] = (by[`${l.level}:${l.name}`] || 0) + 1
      const warn = Object.entries(by).filter(([k]) => k.startsWith("WARN"))
      rec(
        "11. Performance",
        "Conseiller de performance de la base",
        warn.length ? "alerte" : "ok",
        Object.entries(by)
          .map(
            ([k, n]) =>
              `${k.split(":")[1]} ${n}${
                k.startsWith("WARN") ? " (avertissement)" : ""
              }`,
          )
          .join(", ") || "aucune remarque",
      )
    },
  )

  await guard(
    "2. Base de données",
    "Schéma comparé aux migrations",
    async () => {
      const t = (await get("/types/typescript")).types
      const section = (name) => {
        const at = t.indexOf(`    ${name}: {`)
        if (at < 0) return []
        const body = t.slice(at, t.indexOf("\n    }", at + 5))
        return [...body.matchAll(/^ {6}([a-z_0-9]+): \{/gm)].map((m) => m[1])
      }
      types = { tables: section("Tables"), fns: section("Functions") }
      const late = []
      for (const m of expectedSchema()) {
        const miss = [
          ...m.tables.filter((x) => !types.tables.includes(x)),
          ...m.fns.filter((x) => !types.fns.includes(x)),
        ]
        if (miss.length)
          late.push(
            `${m.file} (${plural(miss.length, "objet")} absent${
              miss.length > 1 ? "s" : ""
            } : ${miss.slice(0, 5).join(", ")}${miss.length > 5 ? "…" : ""})`,
          )
      }
      rec(
        "2. Base de données",
        "Migrations appliquées en ligne",
        late.length ? "echec" : "ok",
        late.length
          ? `non appliquées : ${late.join(" ; ")} — back office → Supabase → « Tout appliquer »`
          : `${types.tables.length} tables, ${types.fns.length} fonctions, toutes les migrations présentes`,
      )
    },
  )
  rec(
    "12. Tâches automatiques",
    "Tâches planifiées (pg_cron) actives",
    "externe",
    "lecture SQL impossible en GET : back office → Supabase → « Vérification de la configuration » (ligne « Tâches planifiées »)",
  )
  return types
}

// ---------- 5. Visiteur anonyme (clé publique) ----------
async function anonChecks(types) {
  const key = anonKey()
  const H = { apikey: key, Authorization: `Bearer ${key}` }
  const R = "2. Base de données"
  const tables = types?.tables || [
    ...new Set(expectedSchema().flatMap((m) => m.tables)),
  ]
  const PUBLIC = new Set(["plans", "feature_flags", "app_config"])
  const leaks = []
  let refused = 0
  for (const t of tables) {
    const r = await http(`${SB_URL}/rest/v1/${t}?select=*&limit=50`, {
      headers: H,
    })
    if (r.status === 401 || r.status === 403 || r.status === 404) refused++
    else if (Array.isArray(r.json) && r.json.length && !PUBLIC.has(t))
      leaks.push(`${t} (${r.json.length})`)
  }
  rec(
    R,
    "Visiteur anonyme : aucune donnée privée lisible",
    leaks.length ? "echec" : "ok",
    leaks.length
      ? `lignes lisibles sans compte : ${leaks.join(", ")}`
      : `${tables.length} tables : ${refused} refusées, les autres vides pour un anonyme ; publiques : ${[...PUBLIC].join(", ")}`,
  )

  const cfg = await http(`${SB_URL}/rest/v1/app_config?select=key`, {
    headers: H,
  })
  const allowed = new Set([
    "signups_enabled",
    "maintenance",
    "support_email",
    "desktop_download_url",
    "web_url",
  ])
  const extra = (cfg.json || [])
    .map((x) => x.key)
    .filter((k) => !allowed.has(k))
  rec(
    "10. Sécurité",
    "Réglages lisibles sans compte",
    extra.length ? "echec" : "ok",
    extra.length
      ? `réglages internes visibles : ${extra.join(", ")}`
      : (cfg.json || []).map((x) => x.key).join(", "),
  )

  // Offres en ligne comparées au catalogue de l'application.
  const plans = await http(
    `${SB_URL}/rest/v1/plans?select=id,price_month_cents,price_year_cents,active,limits,perms&order=sort`,
    { headers: H },
  )
  try {
    process.removeAllListeners("warning")
    const { FALLBACK, CONTACT_EMAIL } = await import(
      pathToFileURL(path.join(ROOT, "nexora/app/renderer/nx/offres/catalog.js"))
        .href
    )
    const online = Object.fromEntries(
      (plans.json || [])
        .filter((p) => p.active !== false)
        .map((p) => [p.id, p]),
    )
    const wrong = Object.entries(FALLBACK)
      // NEXORA #079 : seulement les offres vendues (FALLBACK.standard n'est plus qu'un alias de Pro depuis #076).
      .filter(([id, p]) => p.id === id)
      .filter(
        ([id, p]) =>
          !online[id] ||
          online[id].price_month_cents !== p.price_month_cents ||
          online[id].price_year_cents !== p.price_year_cents,
      )
      .map(([id]) => id)
    const desc = (plans.json || [])
      .map(
        (p) =>
          `${p.id} ${p.price_month_cents / 100} $${
            p.active === false ? " (retirée)" : ""
          }`,
      )
      .join(", ")
    rec(
      "4. Offres et règles",
      "Offres et prix en ligne conformes au catalogue",
      wrong.length ? "echec" : "ok",
      wrong.length
        ? `absentes ou prix différents : ${wrong.join(", ")} ; en ligne : ${desc}`
        : desc,
    )
    // NEXORA #087 : offre Gratuite à 2 applications (migration 20261108000006), adresse de contact.
    const free = online.free || {}
    const lim = free.limits || {}
    const perms = free.perms || {}
    const gaps = ["apps", "apps_lifetime", "builds_per_app_month"]
      .filter((k) => Number(lim[k]) !== FALLBACK.free.limits[k])
      .map((k) => `${k} ${lim[k] ?? "absent"} au lieu de ${FALLBACK.free.limits[k]}`)
      .concat(["apk", "play_publish", "messaging_events", "desktop_builder"].filter((k) => perms[k] !== true).map((k) => `${k} non inclus`))
    rec(
      "4. Offres et règles",
      "Offre Gratuite en ligne : 2 applications, 5 constructions par application (#087)",
      gaps.length ? "echec" : "ok",
      gaps.length
        ? `${gaps.join(", ")} : appliquer la migration 20261108000006 (back office → Supabase → Tout appliquer)`
        : `${lim.apps} applications à vie, ${lim.builds_per_app_month} constructions par application et par mois`,
    )
    const mail = await http(`${SB_URL}/rest/v1/app_config?select=value&key=eq.support_email`, { headers: H })
    const shown = Array.isArray(mail.json) && mail.json[0] ? String(mail.json[0].value || "") : ""
    rec(
      "4. Offres et règles",
      "Adresse de contact en ligne",
      shown === CONTACT_EMAIL ? "ok" : "alerte",
      shown ? shown : `vide (le site et l’application affichent ${CONTACT_EMAIL} par défaut ; la migration 20261108000006 la renseigne)`,
    )
  } catch (e) {
    rec(
      "4. Offres et règles",
      "Offres et prix en ligne conformes au catalogue",
      "echec",
      e.message,
    )
  }

  const A = "3. API et erreurs"
  const rpcs = ["admin_stats", "admin_users", "admin_orgs", "nx_email_quota"]
  const open = []
  for (const f of rpcs) {
    const r = await http(`${SB_URL}/rest/v1/rpc/${f}`, { headers: H })
    if (r.status === 200) open.push(f)
  }
  rec(
    A,
    "Fonctions d'administration refusées sans compte",
    open.length ? "echec" : "ok",
    open.length
      ? `répondent à un anonyme : ${open.join(", ")}`
      : rpcs.join(", "),
  )
  const edge = []
  for (const f of setup.functions) {
    const r = await http(`${SB_URL}/functions/v1/${f}`, { headers: H })
    if (r.status < 400) edge.push(`${f} (${r.status})`)
  }
  rec(
    A,
    "Fonctions Edge : compte exigé",
    edge.length ? "alerte" : "ok",
    edge.length
      ? `répondent sans compte : ${edge.join(", ")}`
      : `${setup.functions.length} fonctions refusent un anonyme`,
  )
  const s = await http(`${SB_URL}/auth/v1/settings`, { headers: H })
  const ext = Object.entries(s.json?.external || {})
    .filter(([, v]) => v)
    .map(([k]) => k)
  rec(
    "1. Authentification",
    "Moyens de connexion ouverts",
    ext.includes("email") ? "ok" : "echec",
    `${ext.join(", ") || "aucun"} ; téléphone ${
      s.json?.external?.phone ? "ouvert" : "fermé (sans objet)"
    }`,
  )
}

// ---------- 6. Compte d'essai non administrateur ----------
async function accountChecks() {
  const R = "1. Authentification"
  const email = process.env.NX_TEST_EMAIL
  const pass = process.env.NX_TEST_PASSWORD
  if (!email || !pass) {
    rec(
      R,
      "Essais avec un compte (connexion, rôles, déconnexion)",
      "externe",
      "définir NX_TEST_EMAIL et NX_TEST_PASSWORD (compte simple réservé aux essais) et lancer depuis un terminal ordinaire",
    )
    return
  }
  const key = anonKey()
  const auth = (p, body, bearer = key) =>
    http(`${SB_URL}/auth/v1/${p}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
  await guard(R, "Essais avec un compte", async () => {
    const bad = await auth("token?grant_type=password", {
      email,
      password: `${pass}#faux`,
    })
    rec(
      R,
      "Mot de passe incorrect refusé",
      bad.status === 400 ? "ok" : "echec",
      `${bad.status}`,
    )
    const ok = await auth("token?grant_type=password", {
      email,
      password: pass,
    })
    if (ok.status !== 200)
      return rec(
        R,
        "Connexion du compte d'essai",
        "echec",
        `${ok.status} ${ok.json?.error_code || ""}`,
      )
    rec(R, "Connexion du compte d'essai", "ok", `${ok.ms} ms`)
    const at = ok.json.access_token
    const uid = ok.json.user.id
    const H = {
      apikey: key,
      Authorization: `Bearer ${at}`,
      "Content-Type": "application/json",
    }
    const rest = (p) => http(`${SB_URL}/rest/v1/${p}`, { headers: H })
    const rpc = (f, body = {}) =>
      http(`${SB_URL}/rest/v1/rpc/${f}`, {
        method: "POST",
        headers: H,
        body: JSON.stringify(body),
      })
    const me = await rest("profiles?select=*")
    const mine = (me.json || []).find((p) => p.id === uid)
    if (mine && /admin/.test(mine.app_role))
      return rec(
        R,
        "Rôles et permissions",
        "externe",
        "le compte d'essai est administrateur : prendre un compte simple",
      )
    const others = (me.json || []).filter((p) => p.id !== uid).length
    rec(
      "2. Base de données",
      "Compte simple : seulement son propre profil",
      others ? "echec" : "ok",
      others
        ? `${others} autres profils lisibles`
        : "1 profil lisible (le sien)",
    )
    const priv = await rest("nx_private_config?select=*")
    rec(
      "10. Sécurité",
      "Compte simple : configuration privée inaccessible",
      Array.isArray(priv.json) && priv.json.length ? "echec" : "ok",
      `${priv.status}`,
    )
    const admin = []
    for (const [f, body] of [
      ["admin_stats", {}],
      ["admin_users", { search: "", page: 1, page_size: 5 }],
      ["admin_set_role", { target: uid, new_role: mine?.app_role || "user" }],
      [
        "admin_set_status",
        { target: uid, new_status: mine?.status || "active" },
      ],
      [
        "nx_email_broadcast",
        {
          p_audience: "all",
          p_subject: "essai",
          p_html: "<p>essai</p>",
          p_text: "essai",
          p_tag: "essai",
          p_dry_run: true,
        },
      ],
    ]) {
      const r = await rpc(f, body)
      if (r.status < 300) admin.push(f)
    }
    rec(
      R,
      "Rôles : fonctions d'administration refusées à un compte simple",
      admin.length ? "echec" : "ok",
      admin.length
        ? `acceptées : ${admin.join(", ")}`
        : "5 fonctions refusées (dont changement de rôle et de statut sans effet)",
    )
    const plan = await rpc("nx_plan_status")
    rec(
      "4. Offres et règles",
      "Offre du compte lue sur le serveur (nx_plan_status)",
      plan.status === 200 ? "ok" : "echec",
      plan.status === 200
        ? `${plan.json?.plan_name || plan.json?.plan}`
        : `${plan.status} (migration des offres non appliquée ?)`,
    )
    const ref = await auth("token?grant_type=refresh_token", {
      refresh_token: ok.json.refresh_token,
    })
    rec(
      R,
      "Session renouvelée (jeton de rafraîchissement)",
      ref.status === 200 ? "ok" : "echec",
      `${ref.status}`,
    )
    const out = await auth("logout", {}, ref.json?.access_token || at)
    rec(R, "Déconnexion", out.status === 204 ? "ok" : "echec", `${out.status}`)
    const after = await auth("token?grant_type=refresh_token", {
      refresh_token: ref.json?.refresh_token,
    })
    rec(
      R,
      "Session fermée côté serveur après déconnexion",
      after.status >= 400 ? "ok" : "echec",
      `${after.status}`,
    )
  })
}

// ---------- 7. Charge (site statique) ----------
async function loadChecks() {
  const R = "17. Charge"
  // Fichiers légers (page, script d'entrée, chargeur, back office) : on mesure le site, pas le débit de ce poste.
  const paths = ["", "studio/dist/main.js", "studio/nx/boot.js", "admin/"]
  for (const level of LOAD) {
    const lat = []
    let ok = 0
    let ko = 0
    const t0 = performance.now()
    await Promise.all(
      Array.from({ length: level }, async () => {
        for (const p of paths) {
          const s = performance.now()
          try {
            const r = await fetch(SITE + p, {
              headers: { "Accept-Encoding": "br, gzip" },
            })
            await r.arrayBuffer()
            if (r.ok) ok++
            else ko++
          } catch {
            ko++
          }
          lat.push(performance.now() - s)
        }
      }),
    )
    const dur = (performance.now() - t0) / 1000
    lat.sort((a, b) => a - b)
    const pc = (q) =>
      Math.round(lat[Math.min(lat.length - 1, Math.floor(q * lat.length))])
    const rate = ko / (ok + ko)
    rec(
      R,
      `${level} visiteurs simultanés`,
      rate > 0.05 ? "echec" : rate > 0.01 || pc(0.95) > 3000 ? "alerte" : "ok",
      `${ok + ko} requêtes en ${dur.toFixed(1)} s (${Math.round((ok + ko) / dur)}/s), erreurs ${(rate * 100).toFixed(1)} %, médiane ${pc(0.5)} ms, p95 ${pc(0.95)} ms, p99 ${pc(0.99)} ms`,
    )
  }
}

// ---------- Rapport ----------
function report() {
  const count = (s) => results.filter((r) => r.statut === s).length
  const version = JSON.parse(
    fs.readFileSync(path.join(ROOT, "nexora/app/package.json"), "utf8"),
  ).version
  const head = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout.trim()
  const date = new Date().toISOString().slice(0, 10)
  const verdict = count("echec")
    ? `**Mise en production bloquée** : ${plural(count("echec"), "contrôle bloquant", "contrôles bloquants")}.`
    : count("alerte")
      ? `**Mise en production possible**, avec ${plural(count("alerte"), "alerte")} à examiner.`
      : "**Mise en production possible.**"
  const esc = (s) => String(s).replaceAll("|", "\\|").replaceAll("\n", " ")
  const lines = [
    `# Validation avant mise en production — ${LABEL}`,
    "",
    `- Date : ${new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`,
    `- NEXORA ${version}, espace de travail au commit \`${head}\``,
    `- Site contrôlé : ${OFFLINE ? "aucun (--hors-ligne)" : SITE}`,
    `- Commande : \`pnpm valider${argv.length ? ` ${argv.join(" ")}` : ""}\``,
    `- Verdict : ${verdict}`,
    `- Bilan : ${count("ok")} validés, ${count("echec")} bloquants, ${count("alerte")} alertes, ${count("externe")} externes`,
    "",
    "Légende : VALIDÉ vérifié ici ; BLOQUANT interdit la mise en production (voir la règle R26 de `REGLES.md`) ; ALERTE à corriger ou à accepter explicitement ; EXTERNE dépend d'un autre environnement (procédure dans `CHECKLIST-PRODUCTION.md`). Les contrôles manuels, Windows et Android de la checklist restent « à vérifier » tant qu'ils n'ont pas été menés pour cette mise en production.",
    "",
  ]
  const order = [...new Set(results.map((r) => r.rubrique))].sort(
    (a, b) => (parseInt(a) || 99) - (parseInt(b) || 99),
  )
  for (const rub of order) {
    lines.push(
      `## ${rub}`,
      "",
      "| Statut | Contrôle | Détail |",
      "|---|---|---|",
    )
    for (const r of results.filter((x) => x.rubrique === rub))
      lines.push(
        `| ${LABELS[r.statut]} | ${esc(r.controle)} | ${esc(r.detail)} |`,
      )
    lines.push("")
  }
  const dir = path.join(ROOT, "validations")
  fs.mkdirSync(dir, { recursive: true })
  // Rapports jamais remplacés (R26) : même libellé relancé → suffixe -2, -3…
  let file = path.join(dir, `${date}-${LABEL}.md`)
  for (let n = 2; fs.existsSync(file); n++)
    file = path.join(dir, `${date}-${LABEL}-${n}.md`)
  fs.writeFileSync(file, lines.join("\n"))
  console.log(
    `\n${verdict.replaceAll("**", "")}\nRapport : ${path.relative(ROOT, file)}`,
  )
  return count("echec")
}

// ---------- Déroulé ----------
localChecks()
secretChecks()
if (!OFFLINE) {
  await guard("18. Publication", "Site publié", siteChecks)
  const types = await supabaseChecks()
  await guard("2. Base de données", "Visiteur anonyme", () => anonChecks(types))
  await accountChecks()
  if (LOAD) await guard("17. Charge", "Essai de charge", loadChecks)
}
process.exitCode = report() ? 1 : 0
