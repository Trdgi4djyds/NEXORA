// Mode démonstration de l'espace Sécurité (NEXORA #048), pour les captures et les essais dans l'aperçu.
//
// Le vrai module du processus principal (nexora/app/src/securite/) tourne dans Node avec le faux Electron de
// preview/demo-main.mjs ; l'historique est rempli d'audits fictifs pour les sites de démonstration
// (domaines .example) : deux audits du site de la boutique (comparaison), domaine, code, application,
// un risque accepté et un audit programmé. Les analyses relancées renvoient ces mêmes résultats.
import path from "node:path"

const H = 3600e3
const D = 24 * H

const f = (sev, cat, title, detail, fix, extra = {}) => ({
  sev,
  cat,
  title,
  detail,
  fix,
  ...extra,
})

function siteFindings(variant) {
  const list = [
    f(
      "high",
      "En-têtes",
      "Content-Security-Policy absente",
      "Aucune politique ne limite les scripts autorisés : un script injecté s’exécute sans obstacle.",
      "Ajoute un en-tête Content-Security-Policy (commence en Report-Only).",
    ),
    f(
      "medium",
      "En-têtes",
      "HSTS absent (Strict-Transport-Security)",
      "Le navigateur peut encore tenter une première connexion en HTTP.",
      "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    ),
    f(
      "medium",
      "En-têtes",
      "Pas de protection contre le cadrage (clickjacking)",
      "Ta page peut être affichée dans le cadre d’un faux site.",
      "X-Frame-Options: SAMEORIGIN ou CSP frame-ancestors 'self'.",
    ),
    f(
      "low",
      "En-têtes",
      "Referrer-Policy absente",
      "L’adresse complète des pages part vers les autres sites.",
      "Referrer-Policy: strict-origin-when-cross-origin",
    ),
    f(
      "low",
      "Divulgation",
      "Version du serveur révélée (nginx/1.18.0)",
      "La version exacte du serveur est affichée dans les en-têtes.",
      "server_tokens off; dans la configuration nginx.",
    ),
    f(
      "low",
      "Cookies",
      "Cookie « panier » sans SameSite",
      "Il est envoyé avec les requêtes venues d’autres sites.",
      "Ajoute SameSite=Lax au cookie.",
    ),
    f(
      "info",
      "Contenu",
      "3 fournisseur(s) de scripts externes",
      "cdn.jsdelivr.net, www.googletagmanager.com, js.stripe.com",
      "",
    ),
  ]
  if (variant === "ancien")
    list.push(
      f(
        "high",
        "Fichiers exposés",
        "Fichier .env accessible (/.env)",
        "Le fichier de configuration est lisible par tous.",
        "Bloque l’accès à /.env et retire ce fichier de la racine publique.",
      ),
      f(
        "medium",
        "Transport",
        "Le site reste accessible en HTTP",
        "Les visiteurs qui tapent l’adresse sans https:// restent en clair.",
        "Redirige tout le HTTP vers HTTPS (301).",
      ),
    )
  return list
}

function score(findings) {
  const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const x of findings) c[x.sev] += 1
  return {
    counts: c,
    score: Math.max(
      0,
      100 - (c.critical * 25 + c.high * 12 + c.medium * 6 + c.low * 2),
    ),
  }
}

export function demoSiteReport(url, variant = "", at = Date.now()) {
  const u = new URL(url)
  const findings = siteFindings(variant)
  return {
    url: u.href,
    host: u.hostname,
    isLocal: false,
    https: true,
    ...score(findings),
    findings,
    at,
    headers: { server: "nginx/1.18.0" },
    kind: "site",
    target: u.hostname,
  }
}

function domainReport(at) {
  const findings = [
    f(
      "medium",
      "Messagerie",
      "DMARC en observation seulement (p=none)",
      "Les faux e-mails à ton nom sont encore livrés : la politique ne fait que les compter.",
      "Après quelques semaines de rapports, passe à « p=quarantine » puis « p=reject ».",
      { who: "dns" },
    ),
    f(
      "high",
      "Sous-domaines",
      "ancien-blog.monsite.example pointe vers une adresse qui n’existe plus",
      "L’alias monsite-blog.herokuapp.com n’existe plus : si ce nom se libère, quelqu’un peut le réserver.",
      "Supprime l’enregistrement CNAME de ancien-blog.monsite.example s’il ne sert plus.",
      { who: "dns" },
    ),
    f(
      "low",
      "DNS",
      "DNSSEC non activé",
      "Les réponses DNS de ton domaine ne sont pas signées.",
      "Active DNSSEC chez ton registraire.",
      { who: "registraire" },
    ),
    f(
      "info",
      "Bonnes pratiques",
      "Fichier security.txt absent",
      "Ce fichier indique comment te signaler une faille.",
      "Crée /.well-known/security.txt.",
      { who: "toi" },
    ),
  ]
  return {
    ...score(findings),
    findings,
    at,
    kind: "domain",
    target: "monsite.example",
    host: "boutique.monsite.example",
    domain: "monsite.example",
    records: {
      domain: "monsite.example",
      spf: "v=spf1 include:spf.brevo.com include:_spf.google.com -all",
      dmarc: "v=DMARC1; p=none; rua=mailto:dmarc@monsite.example",
      dkim: ["google", "brevo"],
      mx: ["aspmx.l.google.com", "alt1.aspmx.l.google.com"],
      caa: ['0 issue "letsencrypt.org"'],
      dnssec: false,
      expiry: { days: 47, registrar: "OVHcloud", date: at + 47 * D },
      subdomains: [
        {
          name: "www.monsite.example",
          cname: "monsite.example",
          service: "",
          state: "ok",
        },
        {
          name: "boutique.monsite.example",
          cname: "shops.myshopify.com",
          service: "Shopify",
          state: "ok",
        },
        {
          name: "ancien-blog.monsite.example",
          cname: "monsite-blog.herokuapp.com",
          service: "Heroku",
          state: "orphan",
        },
      ],
      subChecked: 31,
      ctOk: true,
    },
  }
}

function codeReport(dir, at) {
  const vuln = [
    {
      name: "axios",
      version: "1.6.0",
      eco: "npm",
      file: "package-lock.json",
      worst: "high",
      fixed: "1.7.4",
      command: "npm install axios@^1.7.4",
      vulns: [
        {
          id: "GHSA-8hc4-vh64-cxmj",
          cve: "CVE-2024-39338",
          severity: "high",
          fixed: "1.7.4",
          summary: "Server-Side Request Forgery dans axios",
          url: "https://osv.dev/vulnerability/GHSA-8hc4-vh64-cxmj",
        },
      ],
    },
    {
      name: "braces",
      version: "3.0.2",
      eco: "npm",
      file: "package-lock.json",
      worst: "high",
      fixed: "3.0.3",
      command: "npm install braces@^3.0.3",
      vulns: [
        {
          id: "GHSA-grv7-fg5c-xmjg",
          cve: "CVE-2024-4068",
          severity: "high",
          fixed: "3.0.3",
          summary: "Consommation excessive de mémoire dans braces",
          url: "https://osv.dev/vulnerability/GHSA-grv7-fg5c-xmjg",
        },
      ],
    },
    {
      name: "postcss",
      version: "8.4.24",
      eco: "npm",
      file: "package-lock.json",
      worst: "medium",
      fixed: "8.4.31",
      command: "npm install postcss@^8.4.31",
      vulns: [
        {
          id: "GHSA-7fh5-64p2-3v2j",
          cve: "CVE-2023-44270",
          severity: "medium",
          fixed: "8.4.31",
          summary: "Erreur d’analyse des retours à la ligne dans postcss",
          url: "https://osv.dev/vulnerability/GHSA-7fh5-64p2-3v2j",
        },
      ],
    },
  ]
  const findings = [
    f(
      "critical",
      "Secrets",
      "Clé secrète Stripe dans src/paiement.js (ligne 12)",
      "Valeur : sk_l…9Q. Un secret écrit dans le code finit sur GitHub ou dans l’application publiée.",
      "Révoque cette clé chez Stripe, crée-en une nouvelle et range-la dans une variable d’environnement.",
      { who: "toi", file: "src/paiement.js", line: 12 },
    ),
    f(
      "high",
      "Secrets",
      "Fichier .env suivi par Git (.env)",
      "Ce fichier contient en général des mots de passe et des clés.",
      "Ajoute « .env » à .gitignore, puis : git rm --cached .env",
      { who: "toi" },
    ),
    ...vuln.map((v) =>
      f(
        v.worst,
        "Dépendances",
        `${v.name} ${v.version} : ${v.vulns.length} faille(s) connue(s)`,
        `${v.vulns[0].cve} : ${v.vulns[0].summary}. Fichier : ${v.file}.`,
        `Mets à jour vers ${v.fixed} ou plus : ${v.command}`,
        { who: "toi", url: v.vulns[0].url },
      ),
    ),
  ]
  return {
    ...score(findings),
    findings,
    at,
    kind: "code",
    target: dir,
    dir,
    name: path.basename(dir),
    files: 214,
    deps: {
      files: [{ file: "package-lock.json", ecosystem: "npm", packages: 412 }],
      packages: 412,
      vulnerable: vuln,
      error: "",
    },
    secrets: 1,
    git: { repo: true, git: true, tracked: 198, env: [".env"], history: 0 },
  }
}

function appReport(at) {
  const findings = [
    f(
      "high",
      "Réseau",
      "Trafic non chiffré autorisé (HTTP)",
      "L’application peut échanger des données en clair.",
      "Passe toutes les adresses en HTTPS et retire usesCleartextTraffic.",
      { who: "toi" },
    ),
    f(
      "low",
      "Données",
      "Sauvegarde des données autorisée",
      "Les données de l’application peuvent être copiées par une sauvegarde ADB.",
      'Mets android:allowBackup="false".',
      { who: "toi" },
    ),
    f(
      "info",
      "Permissions",
      "Permission sensible : CAMERA",
      "Elle permet d’utiliser l’appareil photo.",
      "Retire-la si l’application n’en a pas un besoin essentiel.",
      { who: "toi" },
    ),
  ]
  return {
    ...score(findings),
    findings,
    at,
    kind: "app",
    target:
      "C:\\Users\\demo\\Documents\\NEXORA\\Applications\\Boutique\\Boutique 1.2.0.apk",
    name: "Boutique 1.2.0.apk",
    app: "android",
    info: {
      package: "com.monsite.boutique",
      versionName: "1.2.0",
      versionCode: 12,
      minSdk: 24,
      targetSdk: 34,
      permissions: ["android.permission.INTERNET", "android.permission.CAMERA"],
      components: 6,
      signature: { v1: true, v2: true },
      abis: ["arm64-v8a", "armeabi-v7a"],
    },
  }
}

/** Branche le module de sécurité et remplit son historique de démonstration. */
export function seedSecurity({
  require,
  APP_DIR,
  ipcMain,
  handlers,
  app,
  send,
  mon,
}) {
  const { register } = require(
    path.join(APP_DIR, "src", "securite", "index.js"),
  )
  const now = Date.now()
  const sec = register({
    ipcMain,
    app,
    net: null,
    send,
    dialog: null,
    shell: null,
    getWin: () => null,
    BrowserWindow: null,
    runScan: async (url) => demoSiteReport(url, "", Date.now()),
    withPage: null,
    notify: (n) => mon.notify(n),
    planCheck: null,
  })
  sec.stop()
  const shop = "https://boutique.monsite.example/"
  const dir = "C:\\Users\\demo\\Projets\\boutique"
  sec.store.record(demoSiteReport(shop, "ancien", now - 9 * D))
  sec.store.record(demoSiteReport(shop, "ancien", now - 5 * D), {
    scheduled: "week",
  })
  sec.store.record(demoSiteReport(shop, "", now - 2 * H))
  sec.store.record(
    demoSiteReport("https://blog.monsite.example/", "", now - 3 * D),
  )
  sec.store.record(domainReport(now - 1 * D))
  sec.store.record(codeReport(dir, now - 4 * H))
  sec.store.record(appReport(now - 2 * D))
  sec.store.accept({
    target: "boutique.monsite.example",
    key: "Cookies|cookie « panier » sans samesite",
    title: "Cookie « panier » sans SameSite",
    reason: "Cookie sans donnée personnelle, corrigé au prochain lot.",
    days: 90,
  })
  sec.store.data.schedules.push({
    id: "demo-sched",
    url: shop,
    every: "week",
    onDeploy: true,
    minScore: 70,
    enabled: true,
    lastAt: now - 5 * D,
    lastScore: 64,
    lastId: "",
    lastError: "",
  })
  sec.store.flush()
  // Analyses relancées en démonstration : mêmes résultats fictifs (aucun accès réseau).
  handlers.set("sec:scan", async (_e, { url } = {}) =>
    sec.store.record(demoSiteReport(url || shop, "", Date.now())),
  )
  handlers.set("sec:page-errors", async () => null)
  handlers.set("sec:domain", async () =>
    sec.store.record(domainReport(Date.now())),
  )
  handlers.set("sec:code-audit", async (_e, { dir: d } = {}) =>
    sec.store.record(codeReport(d || dir, Date.now())),
  )
  handlers.set("sec:app-audit", async () =>
    sec.store.record(appReport(Date.now())),
  )
  // Maintenance prévue et repères de déploiement.
  mon.setMaintenance([
    {
      id: "demo-maint-1",
      label: "Mise à jour de la base de données",
      siteId: "demo-boutique",
      start: Math.ceil((now + 20 * H) / H) * H,
      end: Math.ceil((now + 20 * H) / H) * H + 2 * H,
      recur: "none",
    },
    {
      id: "demo-maint-2",
      label: "Sauvegarde nocturne",
      siteId: "demo-api",
      start: new Date(new Date(now - 3 * D).setHours(3, 0, 0, 0)).getTime(),
      end: new Date(new Date(now - 3 * D).setHours(3, 30, 0, 0)).getTime(),
      recur: "daily",
    },
  ])
  mon.state.marks = [
    {
      id: "demo-mark-1",
      at: now - 6 * H - 8 * 60e3,
      siteId: "demo-boutique",
      label: "Envoi Git : boutique (version 2.4)",
      source: "git",
    },
    {
      id: "demo-mark-2",
      at: now - 4 * D,
      siteId: "",
      label: "Construction du logiciel : Caisse",
      source: "desktop",
    },
  ]
  mon.state.channels = {
    ...(mon.state.channels || {}),
    webhooks: [
      {
        id: "demo-slack",
        name: "Slack",
        url: "https://hooks.slack.com/services/T000/B000/demo",
        events: "all",
        enabled: true,
      },
      {
        id: "demo-astreinte",
        name: "astreinte.monsite.example",
        url: "https://astreinte.monsite.example/nexora",
        events: "escalation",
        enabled: true,
      },
    ],
  }
  Object.assign(mon.settings, {
    escalateMin: 15,
    quietFrom: 22,
    quietTo: 7,
    groupSec: 60,
  })
  return sec
}
