// NEXORA #073 : règles de la messagerie des applications Android, sans navigateur (essayées par pnpm test:push) :
// réglages par défaut de cfg.push, réglages envoyés à la construction, contrôles avant construction, exemples de
// messages pour le serveur. Même calcul d'identifiant de catégorie que src/android/push.js et Push.slug (Java).

export const IMPORTANCE = { high: 'Haute : son et bandeau', default: 'Normale : son', low: 'Discrète : sans son' };
export const KINDS = { message: 'Message de conversation', call: 'Appel entrant', cancel: 'Retirer une notification' };

export function slug(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

/** Identifiant Android d'une catégorie de notifications : « Commandes à emporter » → « vt_commandes_a_emporter ». */
export function channelId(name) {
  const s = slug(name);
  return s ? `vt_${s}` : 'vt_default';
}

/** Préfixe des sujets d'une application (comme Push.prefix) : « com.ex.chat » → « com_ex_chat__ ». */
export function topicPrefix(appId) {
  return `${String(appId || 'com.exemple.app').replace(/\./g, '_')}__`;
}

/** Réglages de messagerie dans cfg.push, complétés par leurs valeurs par défaut (modifie et renvoie cfg.push). */
export function defaults(cfg) {
  const p = cfg.push || (cfg.push = {});
  if (p.showWhenOpen === undefined) p.showWhenOpen = true;
  if (!Array.isArray(p.channels)) p.channels = [];
  if (!Number(p.callTimeout)) p.callTimeout = 45;
  if (!p.msgTest || typeof p.msgTest !== 'object') {
    p.msgTest = {
      kind: 'message', sender: 'Awa', conversation: '', tag: 'conv_42', body: 'Salut ! Tu es dispo ce soir ?', avatar: '', channel: '', url: '', target: 'topic', topic: '', token: '',
    };
  }
  return p;
}

/** Catégories valides, sans doublon, au plus 10 (comme builder.js). */
export function channels(p) {
  const seen = new Set(['vt_default', 'vt_calls']);
  const out = [];
  for (const c of Array.isArray(p.channels) ? p.channels : []) {
    const name = String((c && c.name) || '').trim().slice(0, 40);
    const id = name ? channelId(name) : '';
    if (!id || seen.has(id) || out.length >= 10) continue;
    seen.add(id);
    out.push({ id, name, importance: IMPORTANCE[c.importance] ? c.importance : 'default' });
  }
  return out;
}

/** Réglages ajoutés à spec().push : lus par builder.js et écrits dans assets/vitrine/config.json. */
export function pushExtras(cfg) {
  const p = defaults(cfg);
  return {
    messaging: !!p.messaging,
    calls: !!(p.messaging && p.calls),
    callTimeout: Math.max(10, Math.min(120, Number(p.callTimeout) || 45)),
    actionUrl: String(p.actionUrl || '').trim(),
    showWhenOpen: p.showWhenOpen !== false,
    channels: channels(p).map(({ name, importance }) => ({ name, importance })),
  };
}

/** Problèmes qui empêchent de construire : [section, message] (ajoutés à validate() de l'App Builder). */
export function problems(cfg) {
  const p = defaults(cfg);
  const out = [];
  if (!p.enabled) return out;
  const url = String(p.actionUrl || '').trim();
  if (url && !/^https:\/\/[^/\s]+/i.test(url)) out.push(['messaging', 'Messagerie : l’adresse des actions doit commencer par https:// (les cookies de session ne partent qu’en https).']);
  if (p.messaging && p.calls && !(cfg.permissions || []).includes('microphone')) out.push(['messaging', 'Appels entrants : ajoute l’autorisation « Micro » (section Messagerie et appels, bouton « Ajouter le micro et l’appareil photo »).']);
  const names = (p.channels || []).map((c) => String((c && c.name) || '').trim()).filter(Boolean);
  const ids = names.map(channelId);
  if (new Set(ids).size !== ids.length) out.push(['messaging', 'Catégories de notifications : deux catégories portent le même nom.']);
  if (ids.includes('vt_default') || ids.includes('vt_calls')) out.push(['messaging', 'Catégories de notifications : « default » et « calls » sont réservés, choisis un autre nom.']);
  return out;
}

const json = (o) => JSON.stringify(o, null, 2);

/** Exemples de corps pour l'API FCM HTTP v1 (envoi depuis le serveur du site), adaptés à l'application. */
export function serverExamples(cfg) {
  const p = defaults(cfg);
  const app = cfg.appId || 'com.exemple.app';
  const ch = channels(p)[0];
  const android = { priority: 'high', restricted_package_name: app };
  return {
    message: json({
      message: {
        token: '<jeton de l’appareil du destinataire>',
        data: {
          type: 'message', tag: 'conv_42', sender: 'Awa', avatar: 'https://ton-site.com/avatars/awa.jpg', body: 'Salut ! Tu es dispo ce soir ?', url: '/conversations/42', ...(ch ? { channel: ch.name } : {}), badge: '3', key: '<signature facultative, renvoyée avec la réponse>',
        },
        android,
      },
    }),
    group: json({
      message: {
        token: '<jeton>',
        data: {
          type: 'message', tag: 'groupe_7', conversation: 'Famille', sender: 'Marc', body: 'On se voit dimanche ?', url: '/conversations/groupe_7',
        },
        android,
      },
    }),
    call: json({
      message: {
        token: '<jeton>',
        data: {
          type: 'call', tag: 'appel_981', sender: 'Awa', avatar: 'https://ton-site.com/avatars/awa.jpg', body: 'Appel vidéo', url: '/appels/981', timeout: '45',
        },
        android: { ...android, ttl: '45s' },
      },
    }),
    cancel: json({ message: { token: '<jeton>', data: { type: 'cancel', tag: 'conv_42' }, android } }),
    event: json({
      message: {
        topic: `${topicPrefix(app)}all`,
        notification: { title: 'Commande prête', body: 'Ta commande n° 1052 t’attend au comptoir.' },
        data: { url: '/commandes/1052' },
        android: { priority: 'high', restricted_package_name: app, notification: { channel_id: ch ? ch.id : 'vt_default', tag: 'commande_1052' } },
      },
    }),
    register: json({
      event: 'register', token: '<jeton>', platform: 'android', package: app, app: cfg.appName || 'Mon application', model: 'Pixel 9', sdk: 35, locale: 'fr-FR', user: '<champs passés à register({ fields })>',
    }),
    action: json({
      action: 'reply', tag: 'conv_42', text: 'Oui, à 20 h !', key: '<valeur « key » du message>', token: '<jeton>', package: app, app: cfg.appName || 'Mon application', at: 1767225600000, message: { id: '…', type: 'message', sender: 'Awa', body: 'Salut ! Tu es dispo ce soir ?', data: { '…': '…' } },
    }),
  };
}

/** Exemple d'utilisation dans la page d'une messagerie (window.NexoraApp.push). */
export const PAGE_EXAMPLE = `// Après la connexion : le jeton part vers ton serveur avec la session (cookies) ou des en-têtes.
await NexoraApp.push.requestPermission();               // Android 13 et plus
await NexoraApp.push.register({ fields: { user: moi.id } });
NexoraApp.push.onToken(() => NexoraApp.push.register());   // jeton renouvelé par Firebase

// Message reçu : true = déjà affiché par la page, pas de notification (application à l'écran).
NexoraApp.push.onMessage((m) => {
  conversations.ajouter(m);                             // m.queued : reçu pendant l'absence de la page
  return m.tag === conversationOuverte;
});

// Conversation à l'écran : ses notifications sont retirées et ne s'affichent plus.
NexoraApp.push.setActive('conv_42');                    // setActive(null) en la quittant

// Notification touchée (ou appel accepté) : ouvrir le bon écran sans recharger la page.
NexoraApp.push.onOpen((m, action) => ouvrir(m.url, action), { navigate: false });

// Réponse ou « Marquer comme lu » depuis la notification (déjà envoyés à l'adresse des actions).
NexoraApp.push.onAction((a) => conversations.marquer(a.tag, a.action, a.text));
NexoraApp.push.onMissed(() => conversations.toutRelire());   // messages perdus (longtemps hors ligne)

// Déconnexion : jeton supprimé, notifications retirées, désinscription auprès de ton serveur.
await NexoraApp.push.deleteToken();`;
