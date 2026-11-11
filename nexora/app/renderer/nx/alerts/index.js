// NEXORA #030 : transmet la session du compte NEXORA au processus principal, dès le démarrage et à chaque
// connexion, déconnexion ou renouvellement du jeton : les alertes e-mail de la supervision (src/monitor.js)
// partent par les serveurs NEXORA (fonction nx_alert_email) vers l'adresse du compte. Gardée en mémoire seulement.
import { b as sb } from '../../dist/chunks/chunk-EZKHFSAB.js';

const api = window.vitrine;

function push(session) {
  const value = session && session.access_token
    ? { url: sb.supabaseUrl, key: sb.supabaseKey, token: session.access_token, email: (session.user && session.user.email) || '' }
    : null;
  return Promise.resolve(api.invoke('mon:cloud-session', value)).catch(() => {});
}

export async function install() {
  // Pas d'appel à Supabase dans le rappel (conseil de supabase-js) : la session reçue suffit.
  sb.auth.onAuthStateChange((_event, session) => { push(session || null); });
  const { data } = await sb.auth.getSession();
  await push(data && data.session);
}
