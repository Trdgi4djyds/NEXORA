// NEXORA #056 : section « Tests fermés » de l'App Builder. Les comptes développeur personnels récents doivent
// faire tester l'application par au moins 12 personnes pendant 14 jours avant la production : liste des
// testeurs (CSV pour la Play Console), lien et message d'invitation, suivi des 14 jours, retours des testeurs
// et réponses préparées pour « Demander l'accès à la production ». Réglages dans cfg.testers.
import { api, esc, toast } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';
import * as P from './playready.js';

export const SECTION = ['testers', 'Tests fermés', 'nxUsers', '12 testeurs, 14 jours, production'];
const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

const T = (cfg) => {
  const t = cfg.testers || (cfg.testers = {});
  if (!t.account) t.account = 'personal';
  if (!Array.isArray(t.list)) t.list = [];
  if (!Array.isArray(t.feedback)) t.feedback = [];
  return t;
};
const fmt = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function install(proto, SECTIONS) {
  const at = SECTIONS.findIndex((s) => s[0] === 'store');
  if (!SECTIONS.some((s) => s[0] === SECTION[0])) SECTIONS.splice(at < 0 ? SECTIONS.length : at + 1, 0, SECTION);

  proto.form_testers = function formTesters(cfg) {
    const t = T(cfg);
    const s = P.closedTest(t);
    const idOk = ID_RE.test(cfg.appId || '');
    const name = cfg.appName || 'ton application';

    const account = this.card('Ton compte développeur', `
      ${this.segK('testers.account', P.ACCOUNTS)}
      <p class="ab-hint">${s.applies
    ? `Google exige un <b>test fermé</b> avec au moins <b>${P.REQUIRED.testers} testeurs</b> inscrits sans interruption pendant <b>${P.REQUIRED.days} jours</b> avant de pouvoir demander l’accès à la production.`
    : 'Pas de test fermé obligatoire : tu peux publier directement en production. Un court test fermé reste utile pour repérer les problèmes avant tout le monde.'}</p>`);

    const meter = (v, max) => `<div class="nxr-meter"><i style="width:${Math.round(Math.min(1, v / max) * 100)}%"></i></div>`;
    const status = s.state === 'ready' ? ['ok', 'Test terminé : tu peux demander l’accès à la production.']
      : s.started ? (s.future ? ['warn', `Le test commencera le ${fmt(s.startDate)}.`] : ['warn', `Encore ${s.daysLeft} jour(s)${s.testersOk ? '' : ` et ${P.REQUIRED.testers - s.optedIn} testeur(s) inscrit(s) de plus`} : production possible à partir du ${fmt(s.endDate)}${s.testersOk ? '' : ' si l’effectif est atteint'}.`])
        : ['bad', 'Test pas encore commencé : envoie une version sur la piste « Test fermé », puis indique la date ici (NEXORA la note seul quand il publie sur cette piste).'];
    const follow = this.card('Suivi du test fermé', `
      <div class="nxt-kpis">
        <div class="nxt-kpi"><small>Durée</small><b>${s.started ? `Jour ${s.day}` : '—'}<span> / ${P.REQUIRED.days}</span></b>${meter(s.day, P.REQUIRED.days)}</div>
        <div class="nxt-kpi"><small>Testeurs inscrits</small><b>${s.optedIn}<span> / ${P.REQUIRED.testers}</span></b>${meter(s.optedIn, P.REQUIRED.testers)}</div>
      </div>
      <p class="nxt-status nxr-${s.applies ? status[0] : 'ok'}">${icon(s.applies ? (status[0] === 'ok' ? 'pass' : status[0] === 'warn' ? 'clock' : 'error') : 'pass', 14)}<span>${s.applies ? status[1] : 'Non exigé pour ce type de compte.'}</span></p>
      <div class="ab-grid2">
        <label class="field"><span>Début du test</span><input class="input" type="date" data-k="testers.startedAt" value="${esc(t.startedAt || '')}"><small class="ab-hint">Jour où la première version est arrivée sur la piste « Test fermé ».</small></label>
        <label class="field"><span>Testeurs inscrits</span><input class="input" type="number" min="0" max="1000" data-k="testers.optedIn" value="${esc(t.optedIn ?? '')}" placeholder="0"><small class="ab-hint">Nombre affiché par la Play Console (Tester et publier › Tests › Test fermé). Google ne le communique pas aux outils.</small></label>
      </div>
      <div class="ab-row">${t.startedAt ? '' : `<button class="btn small" data-act="testers-start">${icon('nxCalendar', 13)}<span>Commencer aujourd’hui</span></button>`}<button class="btn small" data-sec="store">${icon('rocket', 13)}<span>Publier sur la piste « Test fermé »</span></button></div>
      <p class="ab-hint">Un testeur qui se désinscrit ne compte plus : invite-en 15 à 20 pour garder une marge. Envoyer une mise à jour pendant le test montre à Google que l’application évolue.</p>`);

    const chips = t.list.map((x) => `<span class="nxt-chip" title="${esc(x.email)}">${esc(x.email)}<button class="icon-btn small" data-act="testers-del" data-email="${esc(x.email)}" title="Retirer" aria-label="Retirer ${esc(x.email)}">${icon('close', 11)}</button></span>`).join('');
    const list = this.card('Testeurs invités', `
      <label class="field"><span>Adresses Gmail ou Google des testeurs (une par ligne, ou séparées par des virgules)</span><textarea class="input" rows="3" data-nxt-paste placeholder="awa.kone@gmail.com&#10;marc.diallo@gmail.com"></textarea></label>
      <div class="ab-row"><button class="btn small primary" data-act="testers-add">${icon('plus', 13)}<span>Ajouter les adresses</span></button><small class="ab-hint" data-nxt-msg></small></div>
      <div class="nxt-count"><b>${t.list.length}</b> invité(s) ${t.list.length >= 20 ? '' : `<small>(conseil : 20 pour garder ${P.REQUIRED.testers} inscrits)</small>`}${meter(t.list.length, 20)}</div>
      ${t.list.length ? `<div class="nxt-chips">${chips}</div>` : '<p class="ab-hint">Aucun testeur pour l’instant : famille, collègues, premiers clients. Chacun doit utiliser un téléphone Android avec ce compte Google.</p>'}
      <div class="ab-row">
        <button class="btn small" data-act="testers-csv" ${t.list.length ? '' : 'disabled'}>${icon('download', 13)}<span>Exporter la liste (CSV)</span></button>
        <button class="btn small" data-copy="${esc(t.list.map((x) => x.email).join(', '))}" ${t.list.length ? '' : 'disabled'}>${icon('copy', 13)}<span>Copier les adresses</span></button>
      </div>
      <p class="ab-hint">Play Console › Tester et publier › Tests › Test fermé › Testeurs › <b>Créer une liste d’adresses e-mail</b> : importe le fichier CSV.</p>`);

    const invite = t.invite || P.inviteText({ appName: name, appId: cfg.appId || 'identifiant.de.ton.app' });
    const inv = this.card('Inviter les testeurs', `
      ${idOk ? `<div class="nxt-links">
        <div><small>Lien d’inscription au test</small><code>${esc(P.optInUrl(cfg.appId))}</code><button class="icon-btn small" data-copy="${esc(P.optInUrl(cfg.appId))}" title="Copier">${icon('copy', 13)}</button></div>
        <div><small>Page Google Play (après l’inscription)</small><code>${esc(P.storeUrl(cfg.appId))}</code><button class="icon-btn small" data-copy="${esc(P.storeUrl(cfg.appId))}" title="Copier">${icon('copy', 13)}</button></div>
      </div>` : '<div class="ab-note">' + icon('info', 15) + '<span>Indique d’abord un identifiant valide (section Identité) : il fait partie du lien d’inscription.</span></div>'}
      <label class="field"><span>Message d’invitation</span><textarea class="input" rows="9" data-k="testers.invite">${esc(invite)}</textarea></label>
      <div class="ab-row">
        <button class="btn small" data-copy="${esc(invite)}">${icon('copy', 13)}<span>Copier le message</span></button>
        <button class="btn small primary" data-external="${esc(P.mailto(t.list, `Teste « ${name} » avant sa sortie`, invite))}" ${t.list.length && idOk ? '' : 'disabled'}>${icon('mail', 13)}<span>Écrire aux testeurs</span></button>
        ${t.invite ? `<button class="btn small" data-act="testers-invite-reset">${icon('refreshCw', 13)}<span>Message d’origine</span></button>` : ''}
      </div>
      <p class="ab-hint">« Écrire aux testeurs » ouvre ta messagerie avec tous les testeurs en copie cachée. Le lien d’inscription ne fonctionne qu’après l’envoi d’une version sur la piste « Test fermé ».</p>`);

    const fb = this.card('Retours des testeurs', `
      <div class="nxt-add"><input class="input" data-nxt-fb placeholder="Ex. : le bouton Commander est caché sur les petits écrans" maxlength="300"><button class="btn small" data-act="testers-fb-add">${icon('plus', 13)}<span>Noter</span></button></div>
      ${t.feedback.length ? `<ul class="nxt-fb">${t.feedback.map((f, i) => `<li class="${f.done ? 'done' : ''}">
        <label class="ab-check"><input type="checkbox" data-act-fb="${i}" ${f.done ? 'checked' : ''}><span>${esc(f.text)}</span></label>
        <small>${new Date(f.at).toLocaleDateString('fr-FR')}</small>
        <button class="icon-btn small" data-act="testers-fb-del" data-i="${i}" title="Retirer">${icon('trash', 12)}</button></li>`).join('')}</ul>` : '<p class="ab-hint">Note ici les remarques reçues et coche-les une fois corrigées : elles servent à répondre aux questions de Google.</p>'}`);

    const answers = P.productionAnswers({ appName: cfg.appName || '', test: s, feedback: t.feedback, audience: t.audience });
    const all = answers.map(([q, a]) => `${q}\n${a}`).join('\n\n');
    const prod = this.card('Demander l’accès à la production', `
      <p class="ab-hint">${s.state === 'ready' || !s.applies ? 'Play Console › Tableau de bord › <b>Demander l’accès à la production</b>.' : `Le bouton apparaît dans la Play Console une fois les ${P.REQUIRED.days} jours écoulés avec ${P.REQUIRED.testers} testeurs inscrits.`} Google pose des questions sur le test : voici un brouillon d’après tes réglages, à relire et à adapter avec tes propres mots.</p>
      <label class="field"><span>Public de l’application (facultatif)</span><textarea class="input" rows="2" data-k="testers.audience" placeholder="Ex. : les clients du restaurant qui commandent à emporter">${esc(t.audience || '')}</textarea></label>
      <div class="nxt-qa">${answers.map(([q, a]) => `<div><b>${esc(q)}</b><p>${esc(a).replace(/\n/g, '<br>')}</p><button class="icon-btn small" data-copy="${esc(a)}" title="Copier la réponse">${icon('copy', 13)}</button></div>`).join('')}</div>
      <div class="ab-row"><button class="btn small" data-copy="${esc(all)}">${icon('copy', 13)}<span>Copier toutes les réponses</span></button><button class="btn small" data-external="https://play.google.com/console">${icon('external', 13)}<span>Ouvrir la Play Console</span></button></div>`);

    return account + (s.applies ? follow : '') + list + inv + fb + prod;
  };

  proto.act_testers_start = async function act() { T(this.cfg).startedAt = P.isoDay(new Date()); this.save(); this.renderForm(); };
  proto.act_testers_add = async function act() {
    const box = this.el.querySelector('[data-nxt-paste]');
    const { ok, bad } = P.parseEmails(box && box.value);
    const t = T(this.cfg);
    const r = P.mergeTesters(t.list, ok);
    t.list = r.list; this.save(); this.renderForm();
    const parts = [];
    if (r.added) parts.push(`${r.added} testeur(s) ajouté(s)`);
    if (r.dupes) parts.push(`${r.dupes} déjà dans la liste`);
    if (bad.length) parts.push(`${bad.length} adresse(s) invalide(s) : ${bad.slice(0, 3).join(', ')}`);
    toast(parts.join(' · ') || 'Aucune adresse reconnue.', bad.length && !r.added ? { kind: 'bad' } : {});
  };
  proto.act_testers_del = async function act(el) { const t = T(this.cfg); t.list = t.list.filter((x) => x.email !== el.dataset.email); this.save(); this.renderForm(); };
  proto.act_testers_csv = async function act() {
    const t = T(this.cfg);
    const file = await api.invoke('lab:save-text', { name: `testeurs-${(this.cfg.appId || 'application').replace(/[^a-z0-9.-]/gi, '')}.csv`, text: P.testersCsv(t.list), filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (file) toast('Liste enregistrée : importe-la dans la Play Console.', { action: 'Afficher', onAction: () => api.invoke('lab:reveal', file) });
  };
  proto.act_testers_invite_reset = async function act() { delete T(this.cfg).invite; this.save(); this.renderForm(); };
  proto.act_testers_fb_add = async function act() {
    const box = this.el.querySelector('[data-nxt-fb]');
    const text = String(box && box.value || '').trim().slice(0, 300);
    if (!text) return;
    T(this.cfg).feedback.unshift({ text, at: Date.now(), done: false }); this.save(); this.renderForm();
  };
  proto.act_testers_fb_del = async function act(el) { T(this.cfg).feedback.splice(Number(el.dataset.i), 1); this.save(); this.renderForm(); };

  // Dates, nombres et cases des retours : le formulaire d'origine ne se redessine que pour les listes.
  const onInput0 = proto.onInput;
  proto.onInput = function onInput(e, change = false) {
    const el = e.target;
    if (el && el.dataset && el.dataset.actFb !== undefined) {
      if (!change) return undefined;
      const f = T(this.cfg).feedback[Number(el.dataset.actFb)];
      if (f) { f.done = el.checked; this.save(); this.renderForm(); }
      return undefined;
    }
    const r = onInput0.call(this, e, change);
    if (change && el && el.dataset && /^testers\.(startedAt|optedIn|audience)$/.test(el.dataset.k || '')) this.renderForm();
    return r;
  };

  // Publication sur la piste « Test fermé » : début du test noté s'il ne l'est pas encore.
  const pub0 = proto.act_play_publish;
  proto.act_play_publish = async function act(...a) {
    const before = this.cfg.lastStore && this.cfg.lastStore.at;
    await pub0.apply(this, a);
    const ls = this.cfg.lastStore;
    if (ls && ls.at !== before && ls.track === 'alpha') {
      const t = T(this.cfg);
      if (!t.startedAt) { t.startedAt = P.isoDay(new Date()); this.save(); toast(`Test fermé commencé aujourd’hui : ${P.REQUIRED.days} jours avant de pouvoir demander la production.`, { action: 'Suivre', onAction: () => { this.section = 'testers'; this.renderNav(); this.renderForm(); } }); }
    }
  };
}
