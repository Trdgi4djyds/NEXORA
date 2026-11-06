// Mode démonstration de la supervision (NEXORA #015), pour les captures et les essais dans l'aperçu.
//
// Le pont (preview/bridge.js) n'imite qu'un PC neuf : aucun site surveillé, donc des tableaux de bord
// vides. Quand le réglage `nexora-preview:demo` vaut « supervision » (option `--demo` de
// `pnpm captures`), le pont envoie les canaux `mon:` et `tel:` ici : le vrai code du processus principal
// (src/monitor.js, src/loadtest.js, src/telemetry.js) tourne dans Node avec un faux Electron, sur un
// dossier temporaire rempli d'un mois de mesures simulées pour des sites fictifs (domaines .example).
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { APP_DIR } from "./server.mjs"
import { seedSecurity } from "./demo-securite.mjs"

const require = createRequire(import.meta.url)
const MIN = 60e3
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// Bruit pseudo-aléatoire reproductible (mêmes courbes à chaque démarrage).
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// Sites fictifs : profil de temps de réponse et épisodes (pannes, lenteurs) relatifs à maintenant.
function profiles(now) {
  return [
    {
      e: {
        id: "demo-boutique",
        name: "Boutique",
        url: "https://boutique.monsite.example/",
        intervalSec: 60,
        thresholdMs: 900,
        keyword: "Panier",
        enabled: true,
        watchErrors: true,
      },
      base: 210,
      jitter: 70,
      tls: true,
      certDays: 62,
      outages: [
        [now - 2 * DAY - 5 * HOUR, 18 * MIN, 503],
        [now - 11 * DAY - 2 * HOUR, 42 * MIN, 0],
      ],
      slow: [
        [now - 6 * HOUR, 25 * MIN, 1500],
        [now - 4 * DAY, 50 * MIN, 1300],
      ],
    },
    {
      e: {
        id: "demo-blog",
        name: "Blog",
        url: "https://blog.monsite.example/",
        intervalSec: 300,
        thresholdMs: 1200,
        enabled: true,
      },
      base: 95,
      jitter: 30,
      tls: true,
      certDays: 9,
      outages: [[now - 19 * DAY, 9 * MIN, 502]],
      slow: [],
    },
    {
      e: {
        id: "demo-api",
        name: "API",
        url: "https://api.monsite.example/sante",
        intervalSec: 30,
        thresholdMs: 500,
        expectStatus: 200,
        enabled: true,
      },
      base: 68,
      jitter: 22,
      tls: true,
      certDays: 47,
      outages: [
        [now - 14 * MIN, 30 * DAY, 503],
        [now - 6 * DAY - 3 * HOUR, 7 * MIN, 0],
      ],
      slow: [[now - 26 * HOUR, 40 * MIN, 720]],
    },
    {
      e: {
        id: "demo-portfolio",
        name: "Portfolio",
        url: "https://portfolio.monsite.example/",
        intervalSec: 300,
        thresholdMs: 800,
        enabled: true,
      },
      base: 380,
      jitter: 160,
      tls: true,
      certDays: 120,
      outages: [],
      slow: [
        [now - 3 * DAY - 7 * HOUR, 2 * HOUR, 950],
        [now - 9 * DAY, 3 * HOUR, 900],
      ],
    },
    {
      e: {
        id: "demo-ancien",
        name: "Ancien site",
        url: "http://ancien.monsite.example/",
        intervalSec: 900,
        thresholdMs: 2000,
        enabled: false,
      },
      base: 420,
      jitter: 90,
      tls: false,
      outages: [],
      slow: [],
    },
  ]
}

function measure(p, t, rand) {
  const inWin = (list) =>
    list.find(([start, len]) => t >= start && t < start + len)
  const out = inWin(p.outages)
  // Rythme de la journée : plus lent aux heures de pointe.
  const hour = new Date(t).getHours()
  const daily =
    1 + 0.35 * Math.max(0, Math.sin(((hour - 8) / 24) * Math.PI * 2))
  const sl = inWin(p.slow)
  let ms =
    p.base * daily +
    (rand() - 0.5) * 2 * p.jitter +
    (rand() < 0.02 ? p.base * 2.5 : 0)
  if (sl) ms = sl[2] * (0.85 + rand() * 0.35)
  ms = Math.max(12, Math.round(ms))
  if (out && !out[2]) {
    const e = new Error("timeout")
    e.code = "ETIMEDOUT"
    e.reason = "délai dépassé"
    throw e
  }
  const dns = Math.round(4 + rand() * 18)
  const tcp = Math.round(8 + rand() * 14)
  const tls = p.tls ? Math.round(18 + rand() * 22) : 0
  const dl = Math.round(ms * 0.12 * rand())
  const ttfb = Math.max(3, ms - dns - tcp - tls - dl)
  return {
    status: out ? out[2] : 200,
    ms,
    dns,
    tcp,
    tls,
    ttfb,
    dl,
    size: out ? 512 : Math.round(38000 + rand() * 9000),
    ip: "203.0.113.24",
    http: "1.1",
    cert: p.tls
      ? {
          days: p.certDays,
          issuer: "Let's Encrypt",
          validTo: Date.now() + p.certDays * DAY,
        }
      : null,
    body: out ? "Service indisponible" : "<html>Panier Bienvenue</html>",
  }
}

function fakePageErrors(url) {
  return Promise.resolve({
    at: Date.now(),
    loadMs: 1840,
    url,
    errors: url.includes("boutique")
      ? [
          {
            message:
              "TypeError: Cannot read properties of undefined (reading 'prix')",
            source: `${url}assets/app.js`,
            line: 214,
            count: 3,
          },
        ]
      : [],
    failed: url.includes("boutique")
      ? [
          {
            url: `${url}images/banniere-hiver.webp`,
            status: 404,
            type: "image",
          },
        ]
      : [],
    warnings: [],
    mainFail: null,
    crashed: null,
  })
}

function loadRuns(now) {
  const runs = []
  const mk = (id, name, scenario, label, at, vus, total, base, errAt) => {
    const r = rng(id.length * 97)
    const series = []
    for (let s = 0; s < total; s += 1) {
      const ramp = Math.min(1, s / (total * 0.2))
      const v =
        scenario === "stress"
          ? Math.round(vus * 0.5 * (1 + Math.floor((s / total) * 4) * 0.5))
          : Math.round(vus * ramp)
      const sat = Math.max(0, v - errAt) / Math.max(1, errAt)
      const p50 = Math.round(base * (1 + sat * 1.8) + r() * 20)
      series.push({
        t: at + s * 1000,
        vus: v,
        rps: Math.round(v * 0.9 * (1 - Math.min(0.4, sat * 0.3)) + r() * 3),
        err: Math.round(Math.min(30, sat * 9) * 10) / 10,
        avg: p50 + 25,
        p50,
        p95: Math.round(p50 * 2.1),
        p99: Math.round(p50 * 3),
        max: Math.round(p50 * 4),
        recv: 380000,
      })
    }
    const rps =
      Math.round((series.reduce((a, p) => a + p.rps, 0) / total) * 10) / 10
    const sorted = series.map((p) => p.p95).sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.9)]
    const failRate =
      Math.round(
        (series.reduce((a, p) => a + p.err * p.rps, 0) /
          Math.max(
            1,
            series.reduce((a, p) => a + p.rps, 0),
          )) *
          10,
      ) / 10
    runs.push({
      ok: true,
      id,
      at,
      name,
      scenario,
      scenarioLabel: label,
      urls: [
        "https://boutique.monsite.example/",
        "https://boutique.monsite.example/catalogue",
      ],
      url: "https://boutique.monsite.example/",
      vus: Math.max(...series.map((p) => p.vus)),
      duration: `${total}s`,
      stages: [],
      total,
      thinkSec: 1,
      thresholds: { p95Ms: 800, errPct: 1 },
      requests: Math.round(rps * total),
      rps,
      failRate,
      avg: Math.round(base * 1.2),
      med: Math.round(base * 1.1),
      p90: Math.round(p95 * 0.9),
      p95,
      p99: Math.round(p95 * 1.4),
      max: Math.round(p95 * 2.2),
      min: Math.round(base * 0.4),
      checks: Math.round((100 - failRate) * 10) / 10,
      dataRecv: 380000 * total,
      peakRps: Math.max(...series.map((p) => p.rps)),
      stopped: false,
      series,
      perUrl: [
        {
          url: "https://boutique.monsite.example/",
          n: Math.round(rps * total * 0.5),
          failRate: Math.round(failRate * 0.4 * 10) / 10,
          avg: Math.round(base),
          p95: Math.round(p95 * 0.8),
        },
        {
          url: "https://boutique.monsite.example/catalogue",
          n: Math.round(rps * total * 0.5),
          failRate: Math.round(failRate * 1.6 * 10) / 10,
          avg: Math.round(base * 1.5),
          p95: Math.round(p95 * 1.2),
        },
      ],
      pass: { p95: p95 < 800, err: failRate < 1 },
    })
  }
  mk(
    "demo-lt-3",
    "Après mise en cache",
    "load",
    "Charge",
    now - 2 * HOUR,
    60,
    150,
    140,
    90,
  )
  mk(
    "demo-lt-2",
    "Avant mise en cache",
    "load",
    "Charge",
    now - DAY - 3 * HOUR,
    60,
    150,
    260,
    40,
  )
  mk(
    "demo-lt-1",
    "Recherche de la limite",
    "stress",
    "Stress",
    now - 3 * DAY,
    80,
    180,
    180,
    70,
  )
  return runs
}

function createRuntime(version) {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-demo-"))
  const handlers = new Map()
  const clients = new Set()
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) }
  const send = (channel, data) => {
    const line = `data: ${JSON.stringify({ channel, data })}\n\n`
    for (const res of clients) res.write(line)
  }
  const r = rng(42)
  const metrics = () => [
    {
      pid: 1,
      type: "Browser",
      cpu: { percentCPUUsage: 1.5 + r() * 2 },
      memory: { workingSetSize: 142000 + r() * 6000 },
    },
    {
      pid: 2,
      type: "Tab",
      cpu: { percentCPUUsage: 3 + r() * 6 },
      memory: { workingSetSize: 286000 + r() * 20000 },
    },
    {
      pid: 3,
      type: "Tab",
      cpu: { percentCPUUsage: 1 + r() * 4 },
      memory: { workingSetSize: 174000 + r() * 30000 },
    },
    {
      pid: 4,
      type: "GPU",
      cpu: { percentCPUUsage: 0.8 + r() * 2.5 },
      memory: { workingSetSize: 118000 + r() * 4000 },
    },
    {
      pid: 5,
      type: "Utility",
      cpu: { percentCPUUsage: r() * 0.6 },
      memory: { workingSetSize: 41000 },
    },
  ]
  const app = {
    getPath: () => ud,
    on() {},
    getVersion: () => version,
    getAppMetrics: metrics,
  }
  const webContents = {
    getAllWebContents: () => [
      { getOSProcessId: () => 2, getType: () => "window" },
      { getOSProcessId: () => 3, getType: () => "webview" },
    ],
  }

  const { Monitor, register: registerMonitor } = require(
    path.join(APP_DIR, "src", "monitor.js"),
  )
  const { register: registerLoad } = require(
    path.join(APP_DIR, "src", "loadtest.js"),
  )
  const { register: registerTel } = require(
    path.join(APP_DIR, "src", "telemetry.js"),
  )

  // 1. Un mois de mesures, rejoué par le vrai moteur (incidents, alertes, agrégats horaires).
  const now = Date.now()
  const profs = profiles(now)
  fs.writeFileSync(
    path.join(ud, "monitor.json"),
    JSON.stringify({
      endpoints: profs.map((p) => p.e),
      // NEXORA #030 : seul canal, l'e-mail par Brevo (serveurs NEXORA).
      channels: { email: { enabled: true } },
    }),
  )
  let clock = now - 30 * DAY
  const replay = new Monitor({
    app,
    fetchImpl: null,
    send: () => {},
    pageErrors: null,
    now: () => clock,
  })
  replay.dispatch = async () => [{ channel: "email", ok: true }]
  const steps = profs
    .filter((p) => p.e.enabled !== false)
    .map((p) => ({ p, t: now - 30 * DAY, rand: rng(p.e.id.length * 131) }))
  for (const s of steps) {
    while (s.t < now - 30e3) {
      const iv =
        s.t < now - 7 * DAY
          ? Math.max(900, s.p.e.intervalSec)
          : s.t < now - DAY
            ? Math.max(300, s.p.e.intervalSec)
            : s.p.e.intervalSec
      clock = s.t
      let rec
      try {
        const m = measure(s.p, s.t, s.rand)
        const okStatus = s.p.e.expectStatus
          ? m.status === s.p.e.expectStatus
          : m.status < 400
        rec = {
          at: s.t,
          up: okStatus,
          status: m.status,
          ms: m.ms,
          iv,
          dns: m.dns,
          tcp: m.tcp,
          tls: m.tls,
          ttfb: m.ttfb,
          dl: m.dl,
          size: m.size,
          reason: okStatus ? "" : `statut ${m.status}`,
        }
        if (m.cert) {
          rec.certDays = m.cert.days + Math.floor((now - s.t) / DAY)
          replay.st(s.p.e.id).cert = { ...m.cert, days: rec.certDays }
        }
      } catch (err) {
        rec = {
          at: s.t,
          up: false,
          status: 0,
          ms: 20000,
          iv,
          reason: err.reason,
        }
      }
      if (rec.up && s.p.e.thresholdMs && rec.ms > s.p.e.thresholdMs)
        rec.slow = 1
      if (s.p.e.watchErrors && rec.up) {
        rec.jsErrors = s.t > now - 3 * DAY ? 3 : 0
        rec.failedRes = s.t > now - 3 * DAY ? 1 : 0
      }
      replay.ingest(s.p.e, rec)
      s.t += iv * 1000
    }
  }
  replay.errReports["demo-boutique"] = null
  // Le rejeu se fait site par site : on remet le journal dans l'ordre chronologique, comme en vrai, et
  // on y inscrit l'envoi simulé (les promesses d'envoi ne sont pas encore résolues à ce stade).
  for (const a of replay.alertLog)
    a.results = a.muted ? [] : [{ channel: "email", ok: true }]
  replay.alertLog.sort((a, b) => b.at - a.at)
  replay.incidents.sort((a, b) => b.start - a.start)
  // Une prise en charge et une note sur la panne de la boutique, pour la démonstration.
  const past = replay.incidents.find(
    (i) => i.siteId === "demo-boutique" && i.kind === "down",
  )
  if (past)
    Object.assign(past, {
      ackAt: past.start + 4 * MIN,
      note: "Redémarrage du service de données après une mise à jour.",
    })
  replay.stopAll()
  replay.flush()
  fs.writeFileSync(
    path.join(ud, "loadtests.json"),
    JSON.stringify(loadRuns(now)),
  )

  // 2. Le vrai enregistrement des canaux, avec une sonde simulée qui continue en direct.
  const live = new Map(
    profs.map((p) => [p.e.url, { p, rand: rng(p.e.id.length * 7) }]),
  )
  const probe = async (url) => {
    const x = live.get(url)
    if (!x) {
      const e = new Error("ENOTFOUND")
      e.code = "ENOTFOUND"
      e.reason = "nom de domaine introuvable (DNS)"
      throw e
    }
    return measure(x.p, Date.now(), x.rand)
  }
  const mon = registerMonitor({
    ipcMain,
    app,
    net: { fetch: () => Promise.reject(new Error("hors ligne")) },
    send,
    pageErrors: fakePageErrors,
    probe,
  })
  // Alertes e-mail fictives : aucun message ne part réellement, l'envoi est simulé comme réussi.
  mon.dispatch = async () => [{ channel: "email", ok: true }]
  mon.sendEmail = async () => ({ ok: true, id: 1, to: "demo@nexora.app" })
  mon.testAlert = async () => ({
    ok: true,
    note: "E-mail de test accepté par le service d’envoi pour demo@nexora.app (démonstration).",
  })
  mon.errReports["demo-boutique"] = {
    at: Date.now() - 4 * MIN,
    loadMs: 1840,
    errors: [
      {
        message:
          "TypeError: Cannot read properties of undefined (reading 'prix')",
        source: "https://boutique.monsite.example/assets/app.js",
        line: 214,
        count: 3,
      },
    ],
    failed: [
      {
        url: "https://boutique.monsite.example/images/banniere-hiver.webp",
        status: 404,
        type: "image",
      },
    ],
    warnings: [],
  }
  registerLoad({
    ipcMain,
    app,
    net: null,
    send,
    dialog: {},
    shell: {},
    getWin: () => null,
  })
  const tel = registerTel({
    ipcMain,
    app,
    net: null,
    getWin: () => null,
    webContents,
  })
  // Une heure de relevés des processus, quelques évènements et sessions passées.
  tel.samples = []
  for (let t = now - HOUR; t < now; t += 10e3) {
    const k = Math.sin((t - now) / (9 * MIN)) * 0.5 + 0.5
    tel.samples.push({
      t,
      cpu: Math.round((6 + k * 9 + r() * 3) * 10) / 10,
      mem: Math.round(760 + k * 90 + r() * 20),
      sysCpu: Math.round((18 + k * 14 + r() * 6) * 10) / 10,
      sysMem: 9800,
      procs: 5,
      groups: {
        main: { cpu: Math.round((1.5 + r()) * 10) / 10, mem: 140, n: 1 },
        window: {
          cpu: Math.round((3 + k * 5 + r()) * 10) / 10,
          mem: Math.round(280 + k * 40),
          n: 1,
        },
        webview: {
          cpu: Math.round((1 + k * 3 + r()) * 10) / 10,
          mem: Math.round(175 + k * 45),
          n: 1,
        },
        gpu: { cpu: Math.round((0.8 + r() * 1.5) * 10) / 10, mem: 117, n: 1 },
        other: { cpu: 0.2, mem: 40, n: 1 },
      },
    })
  }
  tel.sessions.unshift(
    {
      start: now - 2 * DAY - 5 * HOUR,
      end: now - 2 * DAY - 1 * HOUR,
      version,
      errors: 0,
      crashes: 0,
    },
    {
      start: now - DAY - 6 * HOUR,
      end: now - DAY - 3 * HOUR - 20 * MIN,
      version,
      errors: 2,
      crashes: 1,
      unexpected: true,
    },
    {
      start: now - 7 * HOUR,
      end: now - 5 * HOUR,
      version,
      errors: 1,
      crashes: 0,
    },
  )
  tel.session.start = now - 46 * MIN
  tel.startedAt = now - 46 * MIN
  tel.events.unshift(
    {
      at: now - 23 * MIN,
      last: now - 21 * MIN,
      kind: "error",
      message:
        "Uncaught TypeError: Cannot read properties of null (reading 'getContext')",
      count: 2,
      source: "studio-IEKUYDCM.js:1",
    },
    {
      at: now - DAY - 3 * HOUR - 20 * MIN,
      last: now - DAY - 3 * HOUR - 20 * MIN,
      kind: "crash",
      message: "Fermeture inattendue de NEXORA lors de la session précédente",
      count: 1,
    },
    {
      at: now - DAY - 4 * HOUR,
      last: now - DAY - 4 * HOUR,
      kind: "crash",
      message: "Un site affiché s’est arrêté(e) : crashed (code 3)",
      count: 1,
    },
  )
  tel.events.sort((a, b) => b.at - a.at)
  // 3. Espace Sécurité (NEXORA #048) : historique d'audits, risque accepté, audit programmé, maintenance,
  // repères de déploiement et webhooks fictifs.
  seedSecurity({ require, APP_DIR, ipcMain, handlers, app, send, mon })
  return {
    handlers,
    clients,
    dir: ud,
    stop() {
      mon.stopAll()
      tel.stop()
      fs.rmSync(ud, { recursive: true, force: true })
    },
  }
}

// Fichiers dont dépend le mode démonstration : il repart de zéro quand l'un d'eux change.
const WATCHED = [
  path.join(APP_DIR, "src", "monitor.js"),
  path.join(APP_DIR, "src", "loadtest.js"),
  path.join(APP_DIR, "src", "telemetry.js"),
  path.join(APP_DIR, "src", "supervision", "stats.js"),
  path.join(APP_DIR, "src", "supervision", "store.js"),
  path.join(APP_DIR, "src", "supervision", "probe.js"),
  path.join(APP_DIR, "src", "supervision", "checks.js"),
  path.join(APP_DIR, "src", "securite", "index.js"),
]
const signature = () =>
  WATCHED.map((f) => {
    try {
      return fs.statSync(f).mtimeMs
    } catch {
      return 0
    }
  }).join(":")

// État partagé entre les rechargements de ce module (une seule démonstration à la fois dans le serveur).
const STATE = (globalThis.__nexoraDemo = globalThis.__nexoraDemo || {
  runtime: null,
  sig: "",
})

function ensureRuntime(version) {
  const sig = `${signature()}:${import.meta.url}`
  if (STATE.runtime && sig === STATE.sig) return STATE.runtime
  if (STATE.runtime) {
    for (const res of STATE.runtime.clients) res.end()
    STATE.runtime.stop()
  }
  for (const key of Object.keys(require.cache))
    if (key.startsWith(path.join(APP_DIR, "src") + path.sep))
      delete require.cache[key]
  STATE.runtime = createRuntime(version)
  STATE.sig = sig
  return STATE.runtime
}

/** Exécute un canal IPC du mode démonstration (crée le dossier et l'historique au premier appel). */
export async function demoInvoke(channel, args, version) {
  const rt = ensureRuntime(version)
  const fn = rt.handlers.get(channel)
  if (!fn)
    throw new Error(
      "Disponible uniquement dans l’application NEXORA pour Windows.",
    )
  return fn({}, ...(Array.isArray(args) ? args : []))
}

/** Flux d'évènements (Server-Sent Events) du mode démonstration : mon:update, mon:incident… */
export function demoEvents(res, version) {
  const rt = ensureRuntime(version)
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  })
  res.write(": nexora\n\n")
  rt.clients.add(res)
  res.on("close", () => rt.clients.delete(res))
}
