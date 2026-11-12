// Client Supabase du back office : même projet et même clé publique (anon) que l'application NEXORA
// (renderer/dist/chunks/chunk-EZKHFSAB.js). La clé de service n'est jamais utilisée ici : tous les
// droits d'administration passent par la session de l'administrateur et les règles RLS.
import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"
export type { Json } from "./database.types"

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://dcwfgnwaxsrtuvomttbp.supabase.co"
export const SUPABASE_ANON =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjd2ZnbndheHNydHV2b210dGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MjE1NzcsImV4cCI6MjEwODk5NzU3N30." +
    "k-LmO2wJecDAi_LJIT7103vDVOAds4-2JFjcv6SStcY"
/** Identifiant du projet Supabase (sous-domaine de l'adresse). */
export const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0]
/** Adresse publique de NEXORA sur le web, utilisée par l'application pour les liens reçus par e-mail. */
export const NEXORA_WEB_URL = "https://nexoradevs.online/studio/"

// Client non typé à l'appel (les jointures de PostgREST sont décrites par des chaînes) ; les lignes
// sont typées avec Row<'table'>.
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "nexora-admin-auth",
  },
  global: { headers: { "x-client-info": "nexora-admin" } },
})

type PublicSchema = Database["public"]
export type Row<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]
export type FnReturn<T extends keyof PublicSchema["Functions"]> =
  PublicSchema["Functions"][T]["Returns"]
export type AppRole = PublicSchema["Enums"]["app_role"]
export type TicketStatus = PublicSchema["Enums"]["ticket_status"]
export type TicketPriority = PublicSchema["Enums"]["ticket_priority"]

/** Message d'erreur en français, mêmes formulations que l'application NEXORA. */
export function errText(error: unknown): string {
  const e = error as { message?: string; error_description?: string; msg?: string } | null
  const m = String((e && (e.message || e.error_description || e.msg)) || error || "")
  if (/Invalid login credentials/i.test(m)) return "Adresse e-mail ou mot de passe incorrect."
  if (/Email not confirmed/i.test(m))
    return "Confirmez d’abord votre adresse e-mail (lien reçu par e-mail)."
  if (/User already registered|already been registered/i.test(m))
    return "Un compte existe déjà avec cette adresse e-mail."
  if (/Password should be at least/i.test(m))
    return "Le mot de passe doit contenir au moins 8 caractères."
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives : patientez quelques minutes."
  if (/Failed to fetch|NetworkError|network/i.test(m))
    return "Connexion impossible : vérifiez votre accès Internet."
  if (/JWT expired/i.test(m)) return "Votre session a expiré : reconnectez-vous."
  if (/row-level security|permission denied/i.test(m))
    return "Vous n’avez pas les droits pour cette action."
  return m.replace(/^Error:\s*/, "") || "Une erreur est survenue."
}

/** Lève l'erreur d'une réponse Supabase et renvoie ses données. */
export function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

/** Appel d'une fonction Edge (même logique que l'application : message d'erreur du corps). */
export async function callFn<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await sb.functions.invoke(name, { body })
  if (error) {
    let message = error.message
    try {
      const j = await (error as { context?: Response }).context?.json()
      if (j && j.error) message = j.error
    } catch {
      /* corps illisible : message d'origine */
    }
    throw new Error(message)
  }
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error)
  return data as T
}
