// Routes de fiabilité du Worker de NEXORA web (NEXORA #048), appelées sans compte NEXORA :
//   GET|POST|HEAD /hb/<jeton>          signal de vie d'une tâche planifiée (supervision 24 h/24)
//   POST          /hook/deploy/<jeton> repère de déploiement envoyé par une intégration continue (?label=…&url=…)
//   POST          /rum                 mesures des visiteurs réels (script /rum.js, envoi groupé)
// et la tâche planifiée « deuxième région » : chaque minute, le Worker revérifie depuis le réseau de
// Cloudflare les sites que les serveurs NEXORA voient en panne, avant que la panne ne soit confirmée.
// Le Worker n'appelle que des fonctions publiques de la base avec la clé publique (anon) ; la deuxième région
// demande en plus le secret NX_PROBE_SECRET (variable du Worker dans Cloudflare, rien dans le dépôt).
import setup from "../supabase/nexora.json"

const BASE = `https://${setup.projectRef}.supabase.co/rest/v1/rpc/`
const TOKEN = /^[0-9a-f]{16,40}$/

async function rpc(name, args) {
  const r = await fetch(BASE + name, {
    method: "POST",
    headers: {
      apikey: setup.publicKey,
      authorization: `Bearer ${setup.publicKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error(`rpc ${name} : ${r.status}`)
  return r.json()
}

const reply = (status, body, extra = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: {
      "content-type":
        typeof body === "string"
          ? "text/plain; charset=utf-8"
          : "application/json",
      "cache-control": "no-store",
      ...extra,
    },
  })

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
}

export function isFiabiliteRoute(pathname) {
  return (
    pathname.startsWith("/hb/") ||
    pathname.startsWith("/hook/deploy/") ||
    pathname === "/rum"
  )
}

export async function handleFiabilite(request) {
  const url = new URL(request.url)
  try {
    if (url.pathname.startsWith("/hb/")) {
      const token = url.pathname.slice(4).replace(/\/+$/, "")
      if (!TOKEN.test(token)) return reply(404, "Inconnu\n")
      const r = await rpc("nx_heartbeat_ping", { p_token: token })
      return r && r.ok ? reply(200, "OK\n") : reply(404, "Inconnu\n")
    }
    if (url.pathname.startsWith("/hook/deploy/")) {
      if (request.method !== "POST") return reply(405, "POST attendu\n")
      const token = url.pathname.slice(13).replace(/\/+$/, "")
      if (!TOKEN.test(token)) return reply(404, "Inconnu\n")
      let body = {}
      try {
        body = await request.json()
      } catch {
        body = {}
      }
      const label = String(
        url.searchParams.get("label") || body.label || "Déploiement",
      ).slice(0, 140)
      const site = String(url.searchParams.get("url") || body.url || "").slice(
        0,
        300,
      )
      const r = await rpc("nx_deploy_mark", {
        p_token: token,
        p_label: label,
        p_url: site,
      })
      return r && r.ok ? reply(200, "OK\n") : reply(404, "Inconnu\n")
    }
    if (url.pathname === "/rum") {
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers: CORS })
      if (request.method !== "POST") return reply(405, "POST attendu\n", CORS)
      const text = await request.text()
      if (text.length > 20000) return reply(413, "Trop gros\n", CORS)
      let data
      try {
        data = JSON.parse(text)
      } catch {
        return reply(400, "JSON attendu\n", CORS)
      }
      if (!data || !TOKEN.test(String(data.site || "")) || !Array.isArray(data.events))
        return reply(400, "Requête invalide\n", CORS)
      const origin = request.headers.get("origin") || ""
      await rpc("nx_rum_collect", {
        p_key: data.site,
        p_origin: origin,
        p_events: data.events.slice(0, 20),
      })
      return new Response(null, { status: 204, headers: CORS })
    }
  } catch {
    return reply(503, "Service momentanément indisponible\n")
  }
  return reply(404, "Inconnu\n")
}

// Deuxième région : revérifie les sites en échec et rend le résultat (offre Pro, voir la migration 08).
export async function probeRegion(env) {
  const secret = env && env.NX_PROBE_SECRET
  if (!secret) return 0
  const jobs = await rpc("nx_probe_jobs", { p_secret: secret }).catch(() => [])
  if (!Array.isArray(jobs) || !jobs.length) return 0
  let colo = ""
  try {
    const t = await (await fetch("https://cloudflare.com/cdn-cgi/trace")).text()
    colo = (/colo=(\w+)/.exec(t) || [])[1] || ""
  } catch {
    colo = ""
  }
  const results = await Promise.all(
    jobs.slice(0, 50).map(async (j) => {
      const t0 = Date.now()
      try {
        const r = await fetch(j.url, {
          redirect: "follow",
          signal: AbortSignal.timeout(12000),
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; NEXORA-Supervision/1.1; +deuxieme-region)",
          },
        })
        return { id: j.id, ok: r.status < 400, status: r.status, ms: Date.now() - t0, colo }
      } catch (e) {
        return { id: j.id, ok: false, status: 0, ms: Date.now() - t0, colo, error: String(e && e.message) }
      }
    }),
  )
  await rpc("nx_probe_report", { p_secret: secret, p_results: results }).catch(() => 0)
  return results.length
}
