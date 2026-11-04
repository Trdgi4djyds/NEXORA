// Relais de l'API de gestion de Supabase pour le back office (NEXORA #026).
//
// https://api.supabase.com n'accepte les appels de navigateur (CORS) que depuis https://supabase.com :
// depuis le back office publié, le navigateur bloque la réponse (« Failed to fetch »). Le back office
// appelle donc /__supabase-api/v1/projects/<projet>/… sur sa propre adresse, et ce relais transmet la
// requête à Supabase côté serveur. Utilisé par le Worker Cloudflare (worker/index.js) et par l'aperçu
// Figma Make (preview/server.mjs).
//
// Garde-fous : seul le projet Supabase de NEXORA passe, seulement avec un jeton d'accès personnel
// (Bearer sbp_…) envoyé par le navigateur ; rien n'est gardé ni journalisé ; pas de réponse CORS, donc
// les autres sites ne peuvent pas s'en servir depuis un navigateur.
export const RELAY_PREFIX = "/__supabase-api"

const API = "https://api.supabase.com"
const METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"])

const json = (status, message) =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })

/**
 * @param {Request} request requête reçue
 * @param {{ project: string, path: string }} options identifiant du projet autorisé, chemin après RELAY_PREFIX
 * @returns {Promise<Response>}
 */
export async function relaySupabaseApi(request, { project, path }) {
  const match = /^\/v1\/projects\/([a-z0-9]+)(?:\/|$)/.exec(path)
  if (!match || match[1] !== project)
    return json(403, "Seul le projet Supabase de NEXORA passe par ce relais.")
  const method = request.method.toUpperCase()
  if (!METHODS.has(method)) return json(405, "Méthode non autorisée.")
  const auth = request.headers.get("Authorization") || ""
  if (!/^Bearer sbp_[\w-]+$/.test(auth))
    return json(401, "Jeton d’accès Supabase (sbp_…) attendu.")

  const headers = { Authorization: auth }
  let body
  if (method !== "GET") {
    body = await request.arrayBuffer()
    if (body.byteLength)
      headers["Content-Type"] =
        request.headers.get("Content-Type") || "application/json"
    else body = undefined
  }
  const search = new URL(request.url).search
  let res
  try {
    res = await fetch(`${API}${path}${search}`, { method, headers, body })
  } catch (err) {
    return json(502, `Supabase injoignable : ${(err && err.message) || err}`)
  }
  const out = new Headers({ "Cache-Control": "no-store" })
  const type = res.headers.get("Content-Type")
  if (type) out.set("Content-Type", type)
  return new Response(res.body, { status: res.status, headers: out })
}
