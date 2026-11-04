// Worker Cloudflare de NEXORA web (NEXORA #026) : le site reste servi tel quel depuis dist/ (assets) ;
// seules les adresses /__supabase-api/* passent par ce script (run_worker_first dans wrangler.jsonc)
// pour relayer l'API de gestion de Supabase vers le back office (voir worker/supabase-relay.js).
import setup from "../supabase/nexora.json"
import { RELAY_PREFIX, relaySupabaseApi } from "./supabase-relay.js"

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith(`${RELAY_PREFIX}/`))
      return relaySupabaseApi(request, {
        project: setup.projectRef,
        path: url.pathname.slice(RELAY_PREFIX.length),
      })
    return env.ASSETS.fetch(request)
  },
}
