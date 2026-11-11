// Envois Brevo depuis le back office (#031) : la base renvoie l'identifiant de la requête pg_net ; la réponse
// de Brevo arrive dans net._http_response quelques secondes plus tard (lue par public.nx_email_result).
import { must, sb } from "../supabase"

type BrevoResult = { status: number | null; error: string | null; content: string | null } | null

export async function waitBrevo(id: number): Promise<{ ok: boolean; text: string }> {
  for (let i = 0; i < 8; i++) {
    await new Promise((ok) => setTimeout(ok, 1500))
    const r = must(await sb.rpc("nx_email_result", { p_id: id })) as BrevoResult
    if (!r || r.status == null && !r.error) continue
    if (r.status && r.status < 300) return { ok: true, text: `Brevo a accepté l’e-mail (HTTP ${r.status}).` }
    let detail = r.error || r.content || ""
    try {
      detail = (JSON.parse(r.content || "") as { message?: string }).message || detail
    } catch {
      /* texte brut */
    }
    return {
      ok: false,
      text: r.status === 401
        ? "Brevo refuse la clé API (401) : enregistre une nouvelle clé dans Supabase → E-mails (Brevo)."
        : `Brevo a refusé l’e-mail (HTTP ${r.status ?? "?"}) : ${detail}`,
    }
  }
  return { ok: true, text: "Envoi transmis à Brevo ; sa réponse n’est pas encore arrivée (voir le journal des envois dans un instant)." }
}

/** « Bonjour Camille, » d'après un nom complet (« Bonjour, » sans nom). */
export const hello = (fullName?: string | null) => {
  const first = String(fullName || "").trim().split(/\s+/)[0]
  return first ? `Bonjour ${first},` : "Bonjour,"
}
