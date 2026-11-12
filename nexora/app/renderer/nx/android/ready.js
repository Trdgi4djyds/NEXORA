// NEXORA #056 : section « Prêt pour le Play Store » de l'App Builder. Rassemble en un seul endroit tout ce
// que Google vérifie avant une publication (application, exigences d'Android, signature, fichier AAB, fiche,
// règles, accès, tests fermés, version), avec pour chaque point la section où le régler. Les contrôles de la
// fiche viennent de listing.js (readiness, practices) ; aucun réglage n'est dupliqué ici.
import { api, esc, toast } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { readiness, practices } from './listing.js';
import { closedTest, versionCheck, idProblem, REQUIRED } from './playready.js';

export const SECTION = ['ready', 'Prêt pour le Play Store', 'nxCheckCircle', 'Contrôle avant publication'];

// Valeurs du code natif livré (src/android/toolchain.js TARGET_API, builder.js MIN_SDK, coquille MainActivity).
const TARGET_API = 36;
const MIN_SDK = 24;
const STATE_ICON = { ok: 'pass', warn: 'warn', bad: 'error', info: 'info' };

const item = (state, label, detail = '', sec = '', go = 'Régler') => ({ state, label, detail, sec, go });

export function install(proto, SECTIONS) {
  const at = SECTIONS.findIndex((s) => s[0] === 'publish');
  if (!SECTIONS.some((s) => s[0] === SECTION[0])) SECTIONS.splice(at < 0 ? SECTIONS.length : at, 0, SECTION);

  // Images de la fiche et clé d'accès Google Play : lues une fois par application, puis relues à la demande.
  proto.nxReadyLoad = function nxReadyLoad(force = false) {
    const id = this.cfg.appId || '';
    if (!force && this.nxReady && this.nxReady.id === id) return;
    if (this.nxReadyLoading === id) return;
    this.nxReadyLoading = id;
    Promise.all([
      api.invoke('android:listing-assets', id).catch(() => null),
      api.invoke('android:play-status', id).catch(() => ({ serviceAccount: false })),
    ]).then(([assets, st]) => {
      this.nxReady = { id, assets: assets || {}, at: Date.now() };
      if (st) this.playSt = st;
      this.nxReadyLoading = null;
      if (this.section === 'ready') this.renderForm();
    });
  };

  proto.nxReadyGroups = function nxReadyGroups(cfg) {
    const groups = [];
    const twa = cfg.engine === 'twa' && cfg.source.kind === 'url';

    // 1. Application (mêmes contrôles que le bouton « Construire »).
    const app = [];
    for (const [sec, msg] of (this.validate() || [])) app.push(item('bad', esc(msg), '', sec));
    const idp = idProblem(cfg.appId);
    if (cfg.appId && idp) app.push(item('bad', idp, 'L’identifiant ne peut plus changer après la première publication.', 'identity'));
    const v = versionCheck(cfg);
    if (!v.ok) app.push(item('bad', `Numéro de version à augmenter : ${v.cur}, déjà ${v.last} envoyé`, 'Google Play refuse un numéro déjà utilisé.', 'identity'));
    if (!app.length) app.push(item('ok', `${esc(cfg.appName || 'Application')} · ${esc(cfg.appId)}`, `Version ${esc(cfg.versionName || '?')} (n° ${v.cur})${v.last ? `, dernière envoyée : n° ${v.last}` : ''}.`, 'identity', 'Voir'));
    groups.push(['Application', app]);

    // 2. Exigences techniques d'Android : assurées par le code natif de NEXORA.
    const api0 = Math.min(TARGET_API, (this.tools && this.tools.targetApi) || TARGET_API);
    const tech = [
      item('ok', `Cible Android 16 (API ${api0})`, 'Niveau exigé par Google pour les nouvelles applications et les mises à jour ; NEXORA le relève à chaque nouvelle version.'),
      item('ok', `Compatible dès Android 7 (API ${MIN_SDK})`, 'Plus de 99 % des téléphones Android en service.'),
      item('ok', 'Affichage bord à bord', twa ? 'Géré par le navigateur en mode Trusted Web Activity.' : 'Imposé par Android 15 : barres système transparentes, contenu protégé des encoches.'),
      item('ok', 'Geste « retour » prédictif et liens vérifiés', 'Pris en charge par le code natif de l’application.'),
    ];
    if ((cfg.push && cfg.push.enabled) || (cfg.permissions || []).includes('notifications')) tech.push(item('ok', 'Autorisation des notifications demandée', 'Obligatoire depuis Android 13 : l’application la demande au bon moment.'));
    groups.push(['Exigences d’Android', tech]);

    // 3. Signature et fichier AAB.
    const sign = [];
    if (this.key && this.key.sha256) {
      sign.push(item('ok', 'Clé de signature prête', 'Google Play signe ensuite l’application avec sa propre clé (signature d’application Play).', 'publish', 'Voir'));
      sign.push(cfg.nxKeySaved ? item('ok', 'Clé sauvegardée', `Exportée le ${new Date(cfg.nxKeySaved).toLocaleDateString('fr-FR')}.`, 'publish', 'Voir')
        : item('warn', 'Sauvegardez votre clé de signature', 'Sans elle, impossible d’envoyer une mise à jour si le PC est perdu : exportez-la et rangez-la en lieu sûr.', 'publish', 'Exporter'));
    } else sign.push(item('bad', 'Créez ou importez la clé de signature', 'Elle prouve que les mises à jour viennent bien de vous.', 'publish', 'Créer'));
    const r = this.result;
    if (r && r.aab && Number(r.versionCode) === Number(cfg.versionCode)) sign.push(item('ok', `Fichier AAB construit (n° ${r.versionCode})`, 'Format exigé par Google Play pour les nouvelles applications.'));
    else sign.push(item(cfg.outputs && cfg.outputs.aab ? 'warn' : 'bad', 'Construisez l’application au format AAB', cfg.outputs && cfg.outputs.aab ? 'Case « AAB Play Store » cochée : cliquez sur « Construire » en bas à droite.' : 'Coche « AAB Play Store » en bas à droite, puis « Construire ».', 'publish', 'Voir'));
    groups.push(['Signature et fichier', sign]);

    // 4. Fiche Play Store (contrôles de listing.js).
    const assets = this.nxReady && this.nxReady.assets;
    const fiche = assets ? readiness(this, cfg, assets).map(([ok, label]) => item(ok ? 'ok' : 'bad', esc(label), '', 'listing', ok ? 'Voir' : 'Compléter'))
      : [item('info', 'Lecture de la fiche…', '', 'listing', 'Voir')];
    groups.push(['Fiche Play Store', fiche]);

    // 5. Règles et contenu de l'application.
    const rules = [];
    const pr = practices(cfg);
    rules.push(item(pr.length ? 'warn' : 'info', pr.length ? `Sécurité des données : ${pr.length} type(s) de données à déclarer` : 'Sécurité des données : rien à déclarer pour l’application elle-même',
      pr.length ? pr.map((p) => esc(p.cat)).join(', ') + '. Déclarez aussi ce que votre site collecte (comptes, formulaires, mesure d’audience).' : 'Déclarez seulement ce que votre site collecte (comptes, formulaires, commandes, mesure d’audience).', 'listing', 'Réponses'));
    if ((cfg.permissions || []).includes('location')) rules.push(item('warn', 'Position : expliquez son usage dans la fiche', 'Google vérifie que la description justifie chaque autorisation sensible.', 'native', 'Voir'));
    if (cfg.billing && cfg.billing.enabled && cfg.engine !== 'twa') {
      const n = (cfg.billing.products || []).filter((p) => p && p.id).length;
      rules.push(item(n ? 'ok' : 'bad', n ? `Achats intégrés : ${n} produit(s)` : 'Achats intégrés activés sans produit', n ? 'Créez les mêmes identifiants dans la Play Console (Monétiser › Produits).' : 'Ajoutez au moins un produit ou désactivez les achats intégrés.', 'billing', 'Voir'));
    }
    if (cfg.config && cfg.config.passcode && cfg.config.passcode.enabled) rules.push(item('warn', 'Code d’accès : à donner à Google', 'Play Console › Contenu de l’application › Accès à l’application.', 'listing', 'Voir'));
    rules.push(item('info', 'Classification, public cible, annonces', 'Questionnaires à remplir une fois dans la Play Console ; les réponses conseillées sont dans la fiche.', 'listing', 'Réponses'));
    groups.push(['Règles et contenu', rules]);

    // 6. Accès de NEXORA à Google Play.
    const st = this.playSt || {};
    const acc = [];
    if (!st.serviceAccount) acc.push(item('warn', 'Clé d’accès Google Play absente', 'Facultatif : sans elle, envoyez le fichier AAB à la main depuis la Play Console.', 'store', 'Ajouter'));
    else if (this.playChecked) acc.push(item('ok', 'Accès à Google Play vérifié', this.playChecked.tracks && this.playChecked.tracks.length ? `Pistes : ${this.playChecked.tracks.map((t) => esc(t.track)).join(', ')}.` : 'Aucune version encore envoyée.', 'store', 'Voir'));
    else acc.push(item('warn', 'Clé enregistrée, accès non vérifié', 'Vérifiez l’accès avant d’envoyer.', 'store', 'Vérifier'));
    groups.push(['Accès à Google Play', acc]);

    // 7. Test fermé exigé des nouveaux comptes personnels.
    const t = closedTest(cfg.testers || {});
    let test;
    if (!t.applies) test = item('ok', 'Test fermé non exigé pour ce compte', 'Les comptes d’organisation et les comptes personnels plus anciens peuvent publier directement.', 'testers', 'Voir');
    else if (t.state === 'ready') test = item('ok', `Test fermé terminé : ${t.optedIn} testeurs, ${REQUIRED.days} jours`, 'Demande l’accès à la production depuis la Play Console (réponses préparées).', 'testers', 'Réponses');
    else if (t.started) test = item('warn', `Test fermé : jour ${t.day} sur ${REQUIRED.days}, ${t.optedIn} testeur(s) sur ${REQUIRED.testers}`, `Production possible à partir du ${t.endDate.toLocaleDateString('fr-FR')} si ${REQUIRED.testers} testeurs restent inscrits.`, 'testers', 'Suivre');
    else test = item('bad', `Test fermé à mener : ${REQUIRED.testers} testeurs pendant ${REQUIRED.days} jours`, 'Exigé par Google pour les comptes personnels récents avant toute publication en production.', 'testers', 'Préparer');
    groups.push(['Tests fermés', [test]]);

    // 8. Version à publier.
    const rel = [];
    const s = cfg.store || {};
    rel.push(String(s.notes || '').trim() ? item('ok', 'Nouveautés de la version rédigées', '', 'store', 'Voir') : item('warn', 'Rédigez les nouveautés de la version', 'Affichées sur Google Play ; elles rassurent et aident Google à examiner la version.', 'store', 'Rédiger'));
    if (s.track === 'production' && Number(s.rollout || 100) >= 100) rel.push(item('info', 'Déploiement progressif conseillé', 'Commencez à 10 ou 20 % : en cas de plantage (section Statistiques), vous arrêtez avant que tout le monde soit touché.', 'store', 'Régler'));
    if (!(cfg.insights && cfg.insights.enabled)) rel.push(item('info', 'Statistiques et plantages désactivés', 'Activez-les pour surveiller la nouvelle version dès sa sortie.', 'insights', 'Activer'));
    groups.push(['Version', rel]);
    return groups;
  };

  proto.form_ready = function formReady(cfg) {
    this.nxReadyLoad();
    const groups = this.nxReadyGroups(cfg);
    const all = groups.flatMap(([, g]) => g).filter((i) => i.state !== 'info');
    const ok = all.filter((i) => i.state === 'ok').length;
    const bad = all.filter((i) => i.state === 'bad');
    const warn = all.filter((i) => i.state === 'warn');
    // Test interne : application, signature et fichier suffisent ; production : tout, test fermé compris.
    const internalBlock = groups.filter(([n]) => n === 'Application' || n === 'Signature et fichier').flatMap(([, g]) => g).some((i) => i.state === 'bad');
    const verdict = !bad.length ? ['ok', 'Prête pour la production', warn.length ? `${warn.length} point(s) à vérifier, sans blocage.` : 'Tout est en ordre.']
      : !internalBlock ? ['warn', 'Prête pour un test interne ou fermé', `${bad.length} point(s) à régler avant la production.`]
        : ['bad', 'Pas encore prête', `${bad.length} point(s) à régler avant le premier envoi.`];
    const pct = all.length ? Math.round((ok / all.length) * 100) : 0;
    const head = this.card('', `
      <div class="nxr-head nxr-${verdict[0]}">
        <div class="nxr-score"><b>${pct} %</b><small>${ok} sur ${all.length}</small></div>
        <div class="nxr-verdict"><b>${verdict[1]}</b><span>${verdict[2]}</span>
          <div class="nxr-meter" role="img" aria-label="${pct} % des points réglés"><i style="width:${pct}%"></i></div></div>
        <button class="icon-btn small" data-act="ready-refresh" title="Relire la fiche et l’accès Google Play">${icon('refreshCw', 14)}</button>
      </div>
      <p class="ab-hint">Ce que Google vérifie avant de publier une application, d’après vos réglages. Chaque point mène à la section où le régler.</p>`);
    const body = groups.map(([name, list]) => this.card(name, `<ul class="nxr-list">${list.map((i) => `<li class="nxr-${i.state}">
        <span class="nxr-ic">${icon(STATE_ICON[i.state], 15)}</span>
        <div class="nxr-txt"><b>${i.label}</b>${i.detail ? `<small>${i.detail}</small>` : ''}</div>
        ${i.sec ? `<button class="btn small" data-sec="${i.sec}">${esc(i.go)}</button>` : ''}
      </li>`).join('')}</ul>`)).join('');
    return head + body;
  };

  // Publication Play Store : après un envoi en production, la mise à jour à distance existante (section
  // « Réglages à distance », remote.minVersionCode) propose la nouvelle version aux installations plus anciennes.
  const store0 = proto.form_store;
  proto.form_store = function formStore(cfg) {
    let h = store0.call(this, cfg);
    const ls = cfg.lastStore;
    if (!ls) return h;
    const tracks = { internal: 'test interne', alpha: 'test fermé', beta: 'test ouvert', production: 'production' };
    const rm = cfg.remote || {};
    const min = Number(rm.minVersionCode) || 0;
    let body = `<p class="ab-hint">Dernier envoi : version n° ${esc(ls.versionCode)} sur la piste « ${esc(tracks[ls.track] || ls.track)} », le ${new Date(ls.at).toLocaleString('fr-FR')}.</p>`;
    if (ls.track !== 'production') body += '<p class="ab-hint">Quand cette version sera en production, NEXORA pourra la proposer aux installations plus anciennes.</p>';
    else if (!rm.enabled) body += `<div class="ab-note">${icon('info', 15)}<span>Activez les réglages à distance pour proposer automatiquement la nouvelle version aux anciennes installations (à la prochaine construction).</span><button class="btn small" data-sec="remote">${icon('cloud', 13)}<span>Réglages à distance</span></button></div>`;
    else if (min >= Number(ls.versionCode)) body += `<p class="ab-hint nxr-okline">${icon('pass', 13)}<span>Les installations antérieures à la version n° ${esc(min)} proposent déjà la mise à jour${rm.forceUpdate ? ' (obligatoire)' : ''}.</span></p>`;
    else body += `<div class="ab-row"><button class="btn small primary" data-act="ready-minversion">${icon('download', 13)}<span>Proposer la version n° ${esc(ls.versionCode)} aux anciennes installations</span></button></div><p class="ab-hint">Réglez la version minimale des réglages à distance (aujourd’hui n° ${min || 'aucune'}) ; publiez ensuite le fichier nexora-app.json à jour sur votre site. Attendez que Google ait validé la version.</p>`;
    return h + this.card('Après la publication', body);
  };
  proto.act_ready_minversion = async function act() {
    const ls = this.cfg.lastStore; if (!ls) return;
    this.set('remote.minVersionCode', Number(ls.versionCode), { rerender: true });
    toast(`Version minimale réglée sur n° ${ls.versionCode} : enregistrez et publiez à nouveau le fichier nexora-app.json.`, { action: 'Ouvrir', onAction: () => { this.section = 'remote'; this.renderNav(); this.renderForm(); } });
  };

  proto.act_ready_refresh = async function act() { this.nxReady = null; this.nxReadyLoad(true); this.renderForm(); };

  // Clé exportée : même appel que l'App Builder d'origine, avec la date retenue (la fenêtre peut être annulée).
  proto.act_key_export = async function act() {
    const file = await api.invoke('android:key-export', this.cfg.appId);
    if (!file) return;
    toast('Clé exportée, avec ses mots de passe dans un fichier .txt à côté.');
    this.cfg.nxKeySaved = Date.now();
    this.save();
  };
}
