// NEXORA #073 : section « Messagerie et appels » de l'App Builder, pour les applications de messagerie ou à
// événements internes (commandes, rendez-vous, alertes). Réglages dans cfg.push (showWhenOpen, channels,
// messaging, actionUrl, calls, callTimeout, msgTest), ajoutés à spec().push ; sur le téléphone, le code de
// l'application (Push.java, PushAction.java, bridge.js) s'occupe du reste. Style conversation, réponse depuis la
// notification et appels entrants : offre Pro (« événements de messagerie », vérifiée aussi à la construction) ;
// catégories, application à l'écran, messages remis à la page, jeton par compte : avec les notifications push.
// NEXORA #087 : tout l'App Builder est inclus dans l'offre Gratuite (2 applications au total) : la pastille « Pro »
// ne s'affiche plus que si l'offre du compte ne comprend pas la fonction (serveur sans la migration du #087).
import { api, esc, toast } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { can } from '../offres/status.js';
import * as M from './pushmsg.js';

export const SECTION = ['messaging', 'Messagerie et appels', 'phone', 'Conversations, réponses, appels, API'];

// NEXORA #076 : une seule offre payante (Pro). pro : fonction de la messagerie (« événements de messagerie »),
// sinon des notifications push.
const tag = (pro) => (can(pro ? 'messaging_events' : 'push') ? '' : '<span class="nxm-tag pro">Pro</span>');
const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();
// Combiné de téléphone (tracé de l'icône Lucide « phone », licence ISC) pour l'écran d'appel simulé.
const HANDSET = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>';
const face = (url, name) => (/^https:\/\//.test(url || '') ? `<span class="nxm-av" style="background-image:url('${esc(url)}')"></span>` : `<span class="nxm-av">${esc(initial(name))}</span>`);

// Aperçu dans le téléphone simulé, d'après la carte « Envoyer un test » : conversation ou appel entrant.
function previewHtml(inst, cfg) {
  const p = M.defaults(cfg);
  const t = p.msgTest;
  const os = inst.os === 'ios' ? 'ios' : 'android';
  const app = esc(cfg.appName || 'Mon app');
  const sender = t.sender || 'Awa';
  if (t.kind === 'cancel') return '';
  if (t.kind === 'call' && p.messaging && p.calls) {
    return `<div class="nxm-call ${os}">
      <div class="nxm-call-who">${face(t.avatar, sender)}<b>${esc(sender)}</b><small>${esc(t.body && t.body !== sender ? t.body : 'Appel entrant')} · ${app}</small></div>
      <div class="nxm-call-btns"><span class="no"><i>${HANDSET}</i><small>Refuser</small></span><span class="yes"><i>${HANDSET}</i><small>Répondre</small></span></div></div>`;
  }
  const ic = (inst.iconPrev && (os === 'ios' ? inst.iconPrev.ios : inst.iconPrev.circle)) || '';
  if (!p.messaging) {
    return `<div class="ab-notif ${os}"><img src="${ic}" alt=""><div><span><b>${app}</b><em>maintenant</em></span><strong>${esc(sender)}</strong><p>${esc(t.body || '')}</p></div></div>`;
  }
  const group = t.kind === 'message' && t.conversation;
  const lines = [[group ? 'Marc' : sender, group ? 'Qui vient dimanche ?' : 'Vous avez vu mon message ?'], [sender, t.body || '']];
  return `<div class="ab-notif ${os} nxm-notif">${face(t.avatar, group || sender)}<div>
      <span><b>${app}</b><em>maintenant</em></span><strong>${esc(group || sender)}</strong>
      ${lines.map(([who, text]) => `<p class="nxm-line">${group ? `<b>${esc(who)}</b> ` : ''}${esc(text)}</p>`).join('')}
      ${p.actionUrl ? '<div class="nxm-acts"><span>Répondre</span><span>Marquer comme lu</span></div>' : ''}</div></div>`;
}
const pre = (code) => `<pre class="ab-pre">${esc(code)}</pre>`;

export function install(proto, SECTIONS) {
  const at = SECTIONS.findIndex((s) => s[0] === 'push');
  if (!SECTIONS.some((s) => s[0] === SECTION[0])) SECTIONS.splice(at < 0 ? SECTIONS.length : at + 1, 0, SECTION);

  proto.nxMsgStatus = function nxMsgStatus() {
    if (this.pushSt || this.pushStLoading) return;
    this.pushStLoading = true;
    api.invoke('android:push-status', this.cfg.appId).then((s) => { this.pushSt = s; }).catch(() => { this.pushSt = {}; })
      .finally(() => { this.pushStLoading = false; if (this.section === 'messaging') this.renderForm(); });
  };

  proto.form_messaging = function formMessaging(cfg) {
    const p = M.defaults(cfg);
    const twa = cfg.engine === 'twa' && cfg.source.kind === 'url';
    if (!p.enabled || twa) {
      return this.card('Messagerie et appels', `<p class="ab-hint">${twa
        ? 'Mode Trusted Web Activity : c’est le navigateur qui affiche le site, les notifications push de l’application ne sont pas disponibles. Choisissez le moteur « WebView » (section Source) pour une messagerie.'
        : 'Activez d’abord les notifications push (section précédente) : cette section règle ensuite la messagerie, les catégories, les appels entrants et l’enregistrement des téléphones.'}</p>
        ${twa ? '' : `<div class="ab-row"><button class="btn small primary" data-sec="push">${icon('bell', 13)}<span>Activer les notifications push</span></button></div>`}`) + this.nxMsgDoc(cfg);
    }
    this.nxMsgStatus();
    const pro = can('messaging_events');
    const st = this.pushSt || {};
    const cats = M.channels(p);

    const intro = this.card('Pour une messagerie ou des événements internes', `
      <p class="ab-hint">Votre serveur garde les comptes, les conversations et les événements ; il prévient chaque téléphone par Firebase. L’application s’occupe du reste :</p>
      <ul class="nxm-feats">
        <li>${icon('chat', 15)}<div><b>Messages remis à la page</b><small>Application à l’écran : la page reçoit le message et décide s’il faut une notification. Application fermée : il lui est remis à l’ouverture.</small></div>${tag(false)}</li>
        <li>${icon('layers', 15)}<div><b>Catégories et regroupement</b><small>Messages, commandes, rappels… chacun dans sa catégorie ; une seule notification par conversation.</small></div>${tag(false)}</li>
        <li>${icon('key', 15)}<div><b>Jeton par compte</b><small>Enregistré avec la session après la connexion, supprimé à la déconnexion.</small></div>${tag(false)}</li>
        <li>${icon('nxUsers', 15)}<div><b>Style conversation et réponse directe</b><small>Expéditeur, photo, messages empilés, Répondre et Marquer comme lu depuis la notification.</small></div>${tag(true)}</li>
        <li>${icon('phone', 15)}<div><b>Appels entrants</b><small>Sonnerie et écran d’appel par-dessus l’écran verrouillé, Répondre ou Refuser.</small></div>${tag(true)}</li>
      </ul>`);

    const open = this.card('Application à l’écran', `
      ${this.tog('Afficher les notifications quand l’application est ouverte', 'push.showWhenOpen', 'Désactivé : la page reçoit les messages (NexoraApp.push.onMessage) et les affiche elle-même, aucune notification système tant que l’application est à l’écran.')}
      <p class="ab-hint">Activé, la page peut tout de même éviter une notification : <code>NexoraApp.push.setActive('conv_42')</code> pour la conversation affichée, ou renvoyer <code>true</code> depuis <code>onMessage</code> quand elle a déjà montré le message.</p>`);

    const rows = p.channels.map((c, i) => `<div class="nxm-ch">
        <input class="input" data-k="push.channels.${i}.name" value="${esc(c.name || '')}" placeholder="Ex. : Messages" maxlength="40" spellcheck="false">
        <select class="input" data-k="push.channels.${i}.importance">${Object.entries(M.IMPORTANCE).map(([k, v]) => `<option value="${k}" ${(c.importance || 'default') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <code title="Identifiant à indiquer par votre serveur">${esc(String(c.name || '').trim() ? M.channelId(c.name) : '—')}</code>
        <button class="icon-btn small" data-act="msg-ch-del" data-i="${i}" title="Retirer" aria-label="Retirer cette catégorie">${icon('trash', 12)}</button>
      </div>`).join('');
    const channelsCard = this.card('Catégories de notifications', `
      <p class="ab-hint">Chaque catégorie apparaît dans les réglages Android de l’application : l’utilisateur peut couper les rappels et garder les messages. Sans catégorie, tout va dans « ${esc(p.channel || 'Notifications')} » (section Notifications push).</p>
      ${rows ? `<div class="nxm-chs">${rows}</div>` : ''}
      <div class="ab-row"><button class="btn small" data-act="msg-ch-add" ${p.channels.length >= 10 ? 'disabled' : ''}>${icon('plus', 13)}<span>Ajouter une catégorie</span></button></div>
      <small class="ab-hint">Votre serveur choisit la catégorie de chaque message : <code>"channel": "${esc(cats[0] ? cats[0].name : 'Messages')}"</code> dans les données, ou <code>"channel_id": "${esc(cats[0] ? cats[0].id : 'vt_messages')}"</code> dans le bloc notification. Les notifications locales (<code>NexoraApp.notify(…, { channel })</code>) les utilisent aussi.</small>`);

    const messaging = this.card(`Messagerie ${tag(true)}`, p.messaging ? `
      <p class="nxm-on">${icon('pass', 14)}<span>Activée : style conversation (expéditeur, photo, messages empilés), une notification par conversation (<code>tag</code>), Répondre et Marquer comme lu.</span></p>
      ${pro ? '' : `<div class="ab-note">${icon('warn', 15)}<span>Votre offre actuelle ne comprend pas la messagerie : la construction sera refusée tant qu’elle reste activée.</span><button class="btn small primary" data-act="msg-on">${icon('nxUsers', 13)}<span>Passer à Pro</span></button></div>`}
      ${this.field('Adresse des actions (Répondre, Marquer comme lu, Refuser un appel)', 'push.actionUrl', { type: 'url', placeholder: 'https://votre-site.com/api/notifications/actions' })}
      <small class="ab-hint">L’application y envoie en POST <code>{ action, tag, text, key, token, package, message }</code>, avec les cookies de session du site : votre serveur sait qui répond, même application fermée. Sans adresse, pas de boutons Répondre ni Marquer comme lu.</small>
      <div class="ab-row"><button class="btn small" data-act="msg-off">${icon('close', 13)}<span>Désactiver la messagerie</span></button></div>` : `
      <p class="ab-hint">Pour une application comme WhatsApp : les messages s’affichent en conversation (expéditeur, photo, messages empilés), chaque conversation garde une seule notification, et l’utilisateur répond ou marque comme lu sans ouvrir l’application. Ajoutez les appels entrants si votre site sait passer des appels (WebRTC).</p>
      <div class="ab-row"><button class="btn small primary" data-act="msg-on">${icon('nxUsers', 13)}<span>Activer la messagerie</span></button>${pro ? '' : '<small class="ab-hint">Offre Pro (« événements de messagerie »).</small>'}</div>`);

    const mic = (cfg.permissions || []).includes('microphone');
    const calls = p.messaging ? this.card(`Appels entrants ${tag(true)}`, `
      ${this.tog('Recevoir des appels', 'push.calls', 'Sonnerie insistante, écran d’appel par-dessus l’écran verrouillé, Répondre et Refuser. Votre site gère l’appel lui-même (WebRTC) une fois l’application ouverte.')}
      ${p.calls ? `<div class="ab-grid2">${this.field('Sonnerie pendant (secondes)', 'push.callTimeout', { type: 'number', min: 10, max: 120, step: 5 })}<div></div></div>
        ${mic ? `<p class="nxm-on">${icon('pass', 14)}<span>Autorisation du micro incluse${(cfg.permissions || []).includes('camera') ? ' (et de l’appareil photo pour la vidéo)' : ''}.</span></p>`
    : `<div class="ab-note">${icon('warn', 15)}<span>Un appel a besoin du micro (et de l’appareil photo pour la vidéo).</span><button class="btn small" data-act="msg-perms">${icon('plus', 13)}<span>Ajouter le micro et l’appareil photo</span></button></div>`}
        <p class="ab-hint">Répondre ouvre l’application sur l’adresse de l’appel (<code>url</code>) : <code>NexoraApp.push.onOpen((m, action) => …)</code> reçoit <code>action</code> = <code>"accept"</code> (Répondre) ou <code>"incoming"</code> (écran d’appel, la sonnerie continue jusqu’à <code>NexoraApp.push.clear(m.tag)</code>). Refuser part vers l’adresse des actions (<code>action: "decline"</code>). Un message <code>type: "cancel"</code> arrêtez la sonnerie si l’appelant raccroche.</p>
        <p class="ab-hint">Android 14 et plus : l’écran d’appel plein écran est accordé aux applications d’appel. Déclarez-le dans la Play Console (Contenu de l’application › Intentions plein écran) ; sinon l’appel s’affiche en bandeau, et la page peut ouvrir le réglage avec <code>NexoraApp.push.openSettings('fullscreen')</code>.</p>` : ''}`) : '';

    const reg = this.card('Jeton par compte : connexion et déconnexion', `
      <p class="ab-hint">${cfg.push.registerUrl ? `Adresse d’enregistrement : <code>${esc(cfg.push.registerUrl)}</code>.` : 'Aucune adresse d’enregistrement : indiquez-la dans la section Notifications push pour que l’application y envoie le jeton.'} Après la connexion, <code>NexoraApp.push.register({ fields: { user: id } })</code> l’envoie avec les cookies de session (ou des en-têtes : <code>register({ headers: { Authorization: … } })</code>) : votre serveur relie le téléphone au compte. Un jeton renouvelé par Firebase repart tout seul, avec les mêmes champs.</p>
      <p class="ab-hint">À la déconnexion, <code>NexoraApp.push.deleteToken()</code> prévient votre serveur (<code>event: "unregister"</code>), supprime le jeton chez Firebase, retire les notifications et les messages en attente : le compte suivant sur ce téléphone ne reçoit rien du précédent.</p>
      <div class="ab-row"><button class="btn small" data-sec="push">${icon('link', 13)}<span>Régler l’adresse d’enregistrement</span></button></div>`);

    const t = p.msgTest;
    const topics = (cfg.push.topics && cfg.push.topics.length ? cfg.push.topics : ['all']).filter(Boolean);
    const prefix = M.topicPrefix(cfg.appId);
    const test = this.card('Envoyer un test', `
      ${st.serviceAccount ? '' : `<div class="ab-note">${icon('key', 15)}<span>Importez d’abord la clé du compte de service du projet Firebase (section Notifications push, carte « Envoyer un test »).</span><button class="btn small" data-sec="push">${icon('key', 13)}<span>Importer la clé</span></button></div>`}
      <div class="ab-grid2">${this.field('Type', 'push.msgTest.kind', { type: 'select', options: M.KINDS })}${this.field('Conversation ou appel (tag)', 'push.msgTest.tag', { placeholder: 'conv_42' })}</div>
      ${t.kind === 'cancel' ? '<p class="ab-hint">Retirez la notification de ce tag sur le téléphone (message lu ailleurs, appel terminé).</p>' : `
      <div class="ab-grid2">${this.field(t.kind === 'call' ? 'Appelant' : 'Expéditeur', 'push.msgTest.sender', { placeholder: 'Awa' })}${t.kind === 'call' ? this.field('Texte', 'push.msgTest.body', { placeholder: 'Appel vidéo' }) : this.field('Groupe (facultatif)', 'push.msgTest.conversation', { placeholder: 'Famille' })}</div>
      ${t.kind === 'call' ? '' : this.field('Message', 'push.msgTest.body', { type: 'textarea', rows: 2 })}
      <div class="ab-grid2">${this.field('Photo (adresse https, facultatif)', 'push.msgTest.avatar', { placeholder: 'https://…/awa.jpg' })}${this.field('Page à ouvrir (facultatif)', 'push.msgTest.url', { placeholder: '/conversations/42' })}</div>
      ${t.kind === 'message' && cats.length ? this.field('Catégorie', 'push.msgTest.channel', { type: 'select', options: { '': `Par défaut (${p.channel || 'Notifications'})`, ...Object.fromEntries(cats.map((c) => [c.name, c.name])) } }) : ''}`}
      <div class="ab-grid2">${this.field('Destinataires', 'push.msgTest.target', { type: 'select', options: { topic: 'Les appareils abonnés à un sujet', token: 'Un appareil (jeton)' } })}${t.target === 'token'
    ? this.field('Jeton de l’appareil', 'push.msgTest.token', { placeholder: 'Affiché par NexoraApp.push.getToken()' })
    : this.field('Sujet', 'push.msgTest.topic', { type: 'select', options: Object.fromEntries(topics.map((x) => [x, `${x} (${prefix}${x})`])) })}</div>
      <div class="ab-row"><button class="btn primary small" data-act="msg-send" ${st.serviceAccount ? '' : 'disabled'}>${icon('nxSend', 13)}<span>Envoyer</span></button><span class="ab-hint" data-msg-msg></span></div>
      <small class="ab-hint">${p.messaging ? 'L’application installée doit avoir été construite avec ces réglages.' : 'Messagerie désactivée : le message s’affiche en notification simple, sans style conversation.'}${p.calls || t.kind !== 'call' ? '' : ' Appels entrants désactivés : l’appel s’affiche en notification simple.'}</small>`);

    return intro + open + channelsCard + messaging + calls + reg + test + this.nxMsgDoc(cfg);
  };

  // Documentation : messages à envoyer par le serveur, API de la page, vérifications et limites.
  proto.nxMsgDoc = function nxMsgDoc(cfg) {
    const ex = M.serverExamples(cfg);
    return this.card('Comment ça marche', `
      <details class="ab-doc" open><summary>Le trajet d’un message</summary><ol class="nxm-steps">
        <li><b>Connexion</b> : la page enregistre le jeton du téléphone auprès de votre serveur, avec la session (<code>NexoraApp.push.register()</code>).</li>
        <li><b>Nouveau message</b> : votre serveur l’enregistre, puis prévient chaque téléphone du destinataire par l’API FCM HTTP v1, avec la clé du compte de service gardée sur le serveur.</li>
        <li><b>Sur le téléphone</b> : application fermée, notification (conversation, catégorie, Répondre) ; application à l’écran, la page reçoit le message et décide.</li>
        <li><b>Ouverture</b> : la page reçoit les messages arrivés pendant son absence et le message touché, puis relit les conversations auprès de votre serveur (la notification n’est qu’un signal).</li>
        <li><b>Déconnexion</b> : <code>NexoraApp.push.deleteToken()</code>.</li>
      </ol></details>
      <details class="ab-doc"><summary>Dans la page : NexoraApp.push</summary>${pre(M.PAGE_EXAMPLE)}
        <p class="ab-hint">Aussi : <code>state()</code> (jeton, autorisation, catégories, écran d’appel), <code>pending()</code> (éléments en attente), <code>clear(tag)</code>, <code>showWhenOpen(false)</code>, <code>subscribe(sujet)</code>, <code>openSettings('notifications' | 'channel' | 'fullscreen' | 'battery', catégorie)</code>. Sur un téléphone sans l’application (navigateur), <code>NexoraApp</code> est absent.</p></details>
      <details class="ab-doc"><summary>Envoyer depuis votre serveur</summary>
        <p class="ab-hint"><code>POST https://fcm.googleapis.com/v1/projects/${esc(cfg.push.project ? cfg.push.project.id : 'ID_DU_PROJET')}/messages:send</code>, avec un jeton OAuth du compte de service. Pour une messagerie, envoyez des messages <b>data</b> (sans bloc notification) en priorité haute : ils passent toujours par l’application, même fermée. Les valeurs de <code>data</code> sont des textes.</p>
        <div class="nxm-ex"><b>Message d’une conversation</b>${pre(ex.message)}</div>
        <div class="nxm-ex"><b>Message d’un groupe</b>${pre(ex.group)}</div>
        <div class="nxm-ex"><b>Appel entrant</b>${pre(ex.call)}</div>
        <div class="nxm-ex"><b>Retirer une notification (lu ailleurs, appel terminé)</b>${pre(ex.cancel)}</div>
        <div class="nxm-ex"><b>Événement pour tous (commande, annonce)</b>${pre(ex.event)}</div>
        <p class="ab-hint">Champs reconnus : <code>type</code> (message, call, cancel), <code>tag</code>, <code>title</code>, <code>body</code>, <code>sender</code>, <code>conversation</code>, <code>avatar</code>, <code>image</code>, <code>url</code>, <code>channel</code>, <code>badge</code> (pastille), <code>key</code>, <code>timeout</code> (appel), <code>vt_show: "false"</code> (silencieux : remis à la page seulement).</p></details>
      <details class="ab-doc"><summary>Ce que reçoit votre serveur</summary>
        <div class="nxm-ex"><b>Adresse d’enregistrement (connexion, renouvellement, déconnexion)</b>${pre(ex.register)}</div>
        <div class="nxm-ex"><b>Adresse des actions (Répondre ; aussi read et decline)</b>${pre(ex.action)}</div>
        <p class="ab-hint">Les deux envois portent l’en-tête <code>X-Nexora-Push: 1</code> et les cookies du site (https). Répondez 2xx : sinon la réponse s’affiche « non envoyée » dans la conversation et l’enregistrement est retenté au démarrage suivant. Vérifiez <code>key</code> pour vous assurer que la réponse vient bien d’un message que vous avez envoyé.</p></details>
      <details class="ab-doc"><summary>Vérifier sur un téléphone</summary><ol>
        <li>Construisez l’APK et installez-le (section Signature et fichiers), ouvrez-le une fois et acceptez les notifications.</li>
        <li>Application fermée : envoyez un message de test (carte ci-dessus) deux fois avec le même tag : une seule notification, deux messages empilés.</li>
        <li>Répondez depuis la notification : votre adresse des actions reçoit le texte, et la réponse apparaît dans la conversation.</li>
        <li>Application ouverte sur cette conversation (<code>setActive</code>) : aucune notification, la page reçoit le message.</li>
        <li>Écran verrouillé : envoyez un appel ; la sonnerie et l’écran d’appel s’affichent ; Refuser ou laissez sonner jusqu’au délai.</li>
      </ol></details>
      <details class="ab-doc"><summary>Limites à connaître</summary><ul>
        <li>Le serveur de messagerie (comptes, conversations, temps réel) reste le vôtre : NEXORA construit l’application qui reçoit et répond.</li>
        <li>Le contenu des messages passe par Google : pour une messagerie chiffrée, envoyez un texte générique (« Nouveau message ») et laissez la page récupérer le message chiffré à l’ouverture.</li>
        <li>Certains téléphones (Xiaomi, Tecno, Infinix, Huawei…) ferment les applications en arrière-plan : les notifications peuvent arriver en retard. <code>NexoraApp.push.openSettings('battery')</code> ouvrez le réglage d’économie de batterie. Une application « forcée à l’arrêt » ne reçoit rien jusqu’à sa réouverture ; sans services Google Play, rien n’arrive.</li>
        <li>Les appels se passent dans la page (WebRTC) : l’écran d’appel natif sert à décrocher, pas à transporter la voix.</li>
        <li>iPhone : l’App Builder construit des applications Android.</li>
      </ul></details>`);
  };

  proto.act_msg_on = async function act() { M.defaults(this.cfg).messaging = true; this.save(); this.renderForm(); toast('Messagerie activée : reconstruisez l’application pour l’essayer sur un téléphone.'); };
  proto.act_msg_off = async function act() { const p = M.defaults(this.cfg); p.messaging = false; p.calls = false; this.save(); this.renderForm(); };
  proto.act_msg_ch_add = async function act() { const p = M.defaults(this.cfg); if (p.channels.length < 10) p.channels.push({ name: '', importance: 'default' }); this.save(); this.renderForm(); };
  proto.act_msg_ch_del = async function act(el) { M.defaults(this.cfg).channels.splice(Number(el.dataset.i), 1); this.save(); this.renderForm(); };
  proto.act_msg_perms = async function act() {
    const set = new Set(this.cfg.permissions || []);
    set.add('microphone'); set.add('camera');
    this.set('permissions', [...set], { rerender: true });
    toast('Micro et appareil photo ajoutés aux autorisations de l’application.');
  };
  proto.act_msg_send = async function act(btn) {
    const cfg = this.cfg;
    const t = M.defaults(cfg).msgTest;
    const out = this.el.querySelector('[data-msg-msg]');
    if (t.kind !== 'cancel' && !String(t.sender || '').trim() && !String(t.body || '').trim()) throw new Error('Indiquez au moins l’expéditeur ou le message.');
    if (t.kind === 'cancel' && !String(t.tag || '').trim()) throw new Error('Indiquez le tag de la notification à retirer.');
    const url = t.url && t.url.startsWith('/') && cfg.source.url ? new URL(t.url, cfg.source.url).href : t.url;
    btn.disabled = true;
    if (out) { out.textContent = 'Envoi…'; out.classList.remove('ab-err'); }
    try {
      const r = await api.invoke('android:push-test', {
        appId: cfg.appId,
        kind: t.kind,
        tag: t.tag,
        sender: t.sender,
        conversation: t.kind === 'message' ? t.conversation : '',
        body: t.body,
        avatar: t.avatar,
        url,
        channel: t.kind === 'message' ? t.channel : '',
        timeout: M.defaults(cfg).callTimeout,
        topic: t.target === 'token' ? undefined : t.topic || (cfg.push.topics || ['all'])[0] || 'all',
        token: t.target === 'token' ? t.token : undefined,
      });
      if (out) { out.textContent = r.ok ? `Envoyé ✓ ${r.topic ? `au sujet ${r.topic}` : 'à l’appareil'}` : r.error; out.classList.toggle('ab-err', !r.ok); }
    } finally { btn.disabled = false; }
  };

  // Noms des catégories : l'identifiant affiché suit le nom une fois le champ quitté.
  const onInput0 = proto.onInput;
  proto.onInput = function onInput(e, change = false) {
    const r = onInput0.call(this, e, change);
    const k = e.target && e.target.dataset && e.target.dataset.k;
    if (change && k && /^push\.(channels\.\d+\.name|callTimeout)$/.test(k) && this.section === 'messaging') this.renderForm();
    return r;
  };

  // Aperçu du téléphone : conversation ou appel entrant, pendant que la section est ouverte.
  const preview0 = proto.renderPreview;
  proto.renderPreview = function renderPreview(...a) {
    const r = preview0.apply(this, a);
    try {
      const ov = this.el && this.el.querySelector('.ab-overlay');
      if (ov && this.section === 'messaging' && this.preview === 'app' && this.cfg.push && this.cfg.push.enabled) ov.insertAdjacentHTML('beforeend', previewHtml(this, this.cfg));
    } catch { /* aperçu facultatif */ }
    return r;
  };

  // Construction : réglages de messagerie envoyés avec ceux des notifications push.
  const spec0 = proto.spec;
  proto.spec = async function spec() {
    const s = await spec0.call(this);
    if (s && s.push) Object.assign(s.push, M.pushExtras(this.cfg));
    return s;
  };
  const validate0 = proto.validate;
  proto.validate = function validate() {
    const out = validate0.call(this) || [];
    const twa = this.cfg.engine === 'twa' && this.cfg.source.kind === 'url';
    return twa ? out : out.concat(M.problems(this.cfg));
  };

  // Section Notifications push : lien vers la messagerie et l'API complète.
  const push0 = proto.form_push;
  proto.form_push = function formPush(cfg) {
    const html = push0.call(this, cfg);
    if (!cfg.push || !cfg.push.enabled) return html;
    return html + this.card('Messagerie, catégories et appels', `<p class="ab-hint">Application de messagerie ou à événements internes : messages remis à la page, catégories, une notification par conversation, réponse depuis la notification, appels entrants, jeton par compte et déconnexion.</p>
      <div class="ab-row"><button class="btn small primary" data-sec="messaging">${icon('phone', 13)}<span>Ouvrir Messagerie et appels</span></button></div>`);
  };

  // Prêt pour le Play Store : contrôles de la messagerie.
  const groups0 = proto.nxReadyGroups;
  if (groups0) {
    proto.nxReadyGroups = function nxReadyGroups(cfg) {
      const groups = groups0.call(this, cfg);
      const p = M.defaults(cfg);
      if (!p.enabled || !(p.messaging || p.channels.length)) return groups;
      const it = (state, label, detail, go = 'Régler') => ({ state, label, detail, sec: 'messaging', go });
      const list = [];
      if (p.channels.length) list.push(it('ok', `${M.channels(p).length} catégorie(s) de notifications`, 'Visibles dans les réglages Android de l’application.', 'Voir'));
      if (p.messaging) {
        list.push(String(p.actionUrl || '').startsWith('https://') ? it('ok', 'Adresse des actions', esc(p.actionUrl), 'Voir')
          : it('warn', 'Ajoutez l’adresse des actions', 'Sans elle, pas de boutons Répondre ni Marquer comme lu.'));
        if (!can('messaging_events')) list.push(it('bad', 'Messagerie réservée à l’offre Pro', 'Passez à Pro, ou désactivez la messagerie avant de construire.'));
      }
      if (p.messaging && p.calls) {
        list.push(it('warn', 'Déclarez les intentions plein écran', 'Android 14 : Play Console › Contenu de l’application › Intentions plein écran (application d’appel).', 'Voir'));
      }
      if (list.length) groups.push(['Messagerie et appels', list]);
      return groups;
    };
  }
}
