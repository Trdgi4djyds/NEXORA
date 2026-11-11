// NEXORA #015 : composants communs des vues de la supervision (indicateurs, cartes, réglages d'un site).
import { esc, icon, sheet, closeSheet, toast, call, host } from './util.js';
import { account, link, unlink } from './cloud.js';

export function kpi({ label, value, hint = '', tone = '', ic = '', extra = '', tip = '' }) {
  return `<div class="sup-kpi ${tone}"${tip ? ` data-tip="${esc(tip)}"` : ''}><span class="sup-kpi-l">${ic ? icon(ic, 13) : ''}${esc(label)}</span><b>${value}</b>${hint ? `<small>${hint}</small>` : ''}${extra}</div>`;
}

export function card(title, body, { sub = '', actions = '', cls = '', id = '' } = {}) {
  return `<section class="sup-card ${cls}"${id ? ` id="${id}"` : ''}><header><div><h3>${esc(title)}</h3>${sub ? `<small>${sub}</small>` : ''}</div>${actions ? `<div class="sup-card-act">${actions}</div>` : ''}</header>${body}</section>`;
}

export const btn = (label, attrs, { ic = '', cls = 'small' } = {}) => `<button type="button" class="btn ${cls}" ${attrs}>${ic ? icon(ic, 13) : ''}<span>${esc(label)}</span></button>`;
export const iconBtn = (ic, title, attrs) => `<button type="button" class="icon-btn small" title="${esc(title)}" aria-label="${esc(title)}" ${attrs}>${icon(ic, 14)}</button>`;

// Clé de comparaison d'une adresse (même règle que NEXORA #005 : un site n'est surveillé qu'une fois).
export const siteKey = (u) => { try { const x = new URL(u); return (x.host + x.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return String(u || '').trim().toLowerCase(); } };

// Premier nom libre (« Mon site », « Mon site (2) »…), comme partout dans NEXORA depuis #005.
export function freeName(base, taken) {
  const set = new Set(taken.map((n) => String(n || '').trim().toLowerCase()));
  let name = base;
  for (let i = 2; set.has(name.toLowerCase()); i += 1) name = `${base} (${i})`;
  return name;
}

const INTERVALS = [[30, '30 s (temps réel)'], [60, '1 min'], [300, '5 min'], [900, '15 min'], [1800, '30 min']];
// NEXORA #048 : types de vérification, objectif de disponibilité, parcours.
const TYPE_LIST = [['http', 'Site web', 'globe'], ['api', 'API', 'code'], ['tcp', 'Port TCP', 'display'], ['dns', 'DNS', 'link'], ['domain', 'Domaine', 'clock'], ['journey', 'Parcours', 'target'], ['heartbeat', 'Signal de vie', 'heart']];
const SERVER_TYPES = new Set(['http', 'api', 'heartbeat', 'dns', 'domain']);
const SLOS = [99, 99.5, 99.9, 99.95, 99.99];
const STEP_KINDS = [['click', 'Cliquer'], ['fill', 'Remplir'], ['press', 'Valider le formulaire'], ['expect', 'Vérifier un texte'], ['expectUrl', 'Vérifier l’adresse'], ['wait', 'Attendre'], ['goto', 'Ouvrir une adresse']];

function stepsHtml(steps) {
  if (!steps.length) return '<p class="pop-note">Aucune étape : enregistre-les en naviguant, ou ajoute-les une par une.</p>';
  return steps.map((st, i) => {
    const kind = `<select class="input small" data-st="${i}|do">${STEP_KINDS.map(([v, l]) => `<option value="${v}" ${st.do === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    let fields = '';
    if (st.do === 'click' || st.do === 'fill' || st.do === 'press') fields += `<input class="input small" data-st="${i}|sel" value="${esc(st.sel || '')}" placeholder="Sélecteur CSS (#id, button[type=submit]…)">`;
    if (st.do === 'fill') fields += String(st.value || '').startsWith('enc:') ? `<span class="sup-chip">${icon('lock', 11)}Valeur chiffrée</span><button type="button" class="link-btn small" data-st-clear="${i}">Changer</button>` : `<input class="input small" data-st="${i}|value" value="${esc(st.value || '')}" placeholder="Valeur"><label class="sup-check"><input type="checkbox" data-st="${i}|secret" ${st.secret ? 'checked' : ''}><span>Secret</span></label>`;
    if (st.do === 'expect' || st.do === 'expectUrl') fields += `<input class="input small" data-st="${i}|text" value="${esc(st.text || '')}" placeholder="${st.do === 'expect' ? 'Texte attendu dans la page' : 'Partie de l’adresse attendue'}">`;
    if (st.do === 'wait') fields += `<input class="input small" type="number" min="100" max="15000" step="100" data-st="${i}|ms" value="${esc(st.ms || 1000)}"><small class="muted">ms</small>`;
    if (st.do === 'goto') fields += `<input class="input small" data-st="${i}|url" value="${esc(st.url || '')}" placeholder="https://…">`;
    return `<div class="sup-step"><span class="sup-step-n">${i + 1}</span>${kind}<div class="sup-step-f">${fields}</div><button type="button" class="icon-btn small" title="Retirer l’étape" aria-label="Retirer l’étape" data-st-del="${i}">${icon('trash', 12)}</button></div>`;
  }).join('');
}

// Fenêtre d'ajout ou de réglage d'un site surveillé. Renvoie la liste enregistrée, ou null si annulé.
// `server` : site déjà surveillé par les serveurs NEXORA (NEXORA #022).
export function siteSheet({ cfg, site = null, url = '', server = false, type: forcedType = '' }) {
  const owner = 'sup-site';
  const e = site || { name: '', url, intervalSec: 300, thresholdMs: 2000, keyword: '', expectStatus: '', watchErrors: false, confirm: 0, alerts: null, enabled: true, type: forcedType || 'http', slo: 99.9 };
  let type = e.type || 'http';
  let steps = Array.isArray(e.steps) ? e.steps.map((x) => ({ ...x })) : [];
  const ch = cfg.channels || {};
  // NEXORA #030 : un seul canal, l'e-mail (Brevo) envoyé par les serveurs NEXORA.
  const ready = { email: Boolean(ch.email && ch.email.enabled) };
  const wants = (k) => !e.alerts || e.alerts[k] !== false;
  const acc = account();
  const srvHint = !acc.signedIn ? 'Connecte-toi à ton compte NEXORA (bouton Connexion du rail) pour l’activer.'
    : !acc.orgId ? 'Choisis un espace d’équipe dans ton compte NEXORA.'
      : !acc.canEdit ? 'Ton rôle dans cet espace ne le permet pas (éditeur au moins).'
        : `Vérifié en continu, même ordinateur éteint, avec une notification dans NEXORA pour l’équipe « ${acc.orgName} » et un e-mail si les alertes sont activées.`;
  const srvOk = acc.signedIn && acc.orgId && acc.canEdit;
  const sec = (types, html) => `<div data-tsec="${types}">${html}</div>`;
  const hostVal = e.host || (() => { try { return e.url && !/^https?:/.test(e.url) ? new URL(e.url).hostname : ''; } catch { return ''; } })();
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const el = sheet(owner, `<form class="sup-form" autocomplete="off">
      <div class="sheet-head"><span class="sheet-icon">${icon('globe', 22)}</span><div><h2>${site ? 'Réglages de la vérification' : 'Nouvelle vérification'}</h2><p>${site ? esc(site.name || site.url) : 'NEXORA vérifie en continu et te prévient dès qu’un problème apparaît.'}</p></div></div>
      <div class="sheet-body sup-form-body">
        <div class="field"><span>Que veux-tu surveiller ?</span><div class="seg sup-types" role="radiogroup">${TYPE_LIST.map(([v, l, ic]) => `<button type="button" role="radio" data-type="${v}" class="${type === v ? 'on' : ''}" aria-checked="${type === v}" ${site && site.type && site.type !== v ? 'disabled' : ''}>${icon(ic, 13)}<span>${esc(l)}</span></button>`).join('')}</div></div>
        <p class="sup-note" data-type-help></p>
        ${sec('http api journey', `<label class="field"><span data-url-label>Adresse</span><input class="input" name="url" value="${esc(/^https?:/.test(e.url || '') ? e.url : '')}" placeholder="https://ton-site.com" spellcheck="false" data-autofocus></label>`)}
        ${sec('tcp dns domain', `<div class="sup-form-grid"><label class="field"><span data-host-label>Nom d’hôte</span><input class="input" name="host" value="${esc(hostVal)}" placeholder="db.ton-site.com" spellcheck="false"></label>${sec('tcp', `<label class="field"><span>Port</span><input class="input" type="number" name="port" min="1" max="65535" value="${esc(e.port || '')}" placeholder="5432"></label>`)}${sec('dns', `<label class="field"><span>Enregistrement</span><select class="input" name="recordType">${['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'].map((t) => `<option ${String(e.recordType || 'A') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`)}${sec('domain', `<label class="field"><span>Prévenir avant l’expiration</span><select class="input" name="domainWarn">${[[14, '14 jours'], [30, '30 jours'], [45, '45 jours'], [60, '60 jours']].map(([v, l]) => `<option value="${v}" ${Number(e.domainWarn || 30) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`)}</div>`)}
        <label class="field"><span>Nom</span><input class="input" name="name" value="${esc(e.name)}" placeholder="Nom affiché (facultatif)"></label>
        ${sec('api', `<div class="sup-form-grid"><label class="field"><span>Méthode</span><select class="input" name="method">${['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((m) => `<option ${String(e.method || 'GET') === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label class="field"><span>Valeur JSON à vérifier</span><input class="input" name="jsonPath" value="${esc(e.jsonPath || '')}" placeholder="status ou data.items[0].id"></label></div>
          <div class="sup-form-grid"><label class="field"><span>Condition</span><select class="input" name="jsonOp">${[['equals', 'est égale à'], ['contains', 'contient'], ['not', 'est différente de'], ['exists', 'existe'], ['lt', 'est inférieure à'], ['gt', 'est supérieure à']].map(([v, l]) => `<option value="${v}" ${String(e.jsonOp || 'equals') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span>Valeur attendue</span><input class="input" name="jsonExpect" value="${esc(e.jsonExpect || '')}" placeholder="ok"></label></div>
          <label class="field"><span>En-têtes (un par ligne)</span><textarea class="input" name="headers" rows="2" placeholder="Authorization: Bearer …">${esc(e.headers || '')}</textarea></label>
          <label class="field"><span>Corps de la requête</span><textarea class="input" name="body" rows="2" placeholder='{"ping": true}'>${esc(e.body || '')}</textarea></label>`)}
        ${sec('dns', `<label class="field"><span>Valeur attendue (facultatif)</span><input class="input" name="dnsExpect" value="${esc(e.dnsExpect || '')}" placeholder="Ex. : 76.76.21.21"></label><label class="tog-row"><span class="tog-text"><span>Alerte si l’enregistrement change</span><small>Utile contre un détournement du domaine ou une erreur de configuration.</small></span><input type="checkbox" name="dnsWatch" ${e.dnsWatch !== false ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>`)}
        ${sec('journey', `<div class="field"><span>Étapes du parcours</span><div class="sup-steps" data-steps>${stepsHtml(steps)}</div><div class="sup-steps-a"><button type="button" class="btn small primary" data-jr="record">${icon('record', 13)}<span>Enregistrer en naviguant</span></button><button type="button" class="btn small" data-jr="add">${icon('plus', 13)}<span>Ajouter une étape</span></button><button type="button" class="btn small" data-jr="test">${icon('play', 13)}<span>Tester le parcours</span></button></div><div class="sup-steps-res" data-jr-res></div></div>`)}
        ${sec('heartbeat', `<p class="pop-note">Ta tâche planifiée, ta sauvegarde ou ton serveur appelle une adresse unique à chaque passage. Si l’appel n’arrive pas à temps, NEXORA te prévient. L’adresse apparaît dans la fiche après l’enregistrement.</p>`)}
        <div class="sup-form-grid">
          ${sec('http api tcp dns journey heartbeat', `<label class="field"><span data-iv-label>Fréquence des vérifications</span><select class="input" name="intervalSec">${INTERVALS.concat([[3600, '1 h'], [86400, '24 h']]).map(([v, l]) => `<option value="${v}" ${Number(e.intervalSec || 300) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`)}
          ${sec('http api tcp journey', `<label class="field"><span>Seuil de lenteur (ms)</span><input class="input" type="number" name="thresholdMs" min="0" step="100" value="${esc(e.thresholdMs || 2000)}"></label>`)}
          ${sec('http api', `<label class="field"><span>Code HTTP attendu</span><input class="input" type="number" name="expectStatus" min="100" max="599" value="${esc(e.expectStatus || '')}" placeholder="200 à 399"></label>`)}
          ${sec('http api tcp dns heartbeat', `<label class="field"><span>Confirmer une panne après</span><select class="input" name="confirm"><option value="0">Réglage général (${cfg.settings ? cfg.settings.confirm : 2} échecs)</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(e.confirm) === n ? 'selected' : ''}>${n} échec${n > 1 ? 's' : ''} de suite</option>`).join('')}</select></label>`)}
          ${sec('http api tcp journey heartbeat', `<label class="field"><span>Objectif de disponibilité</span><select class="input" name="slo">${SLOS.map((v) => `<option value="${v}" ${Number(e.slo || 99.9) === v ? 'selected' : ''}>${String(v).replace('.', ',')} %</option>`).join('')}</select></label>`)}
        </div>
        ${sec('http', `<label class="field"><span>Mot-clé attendu dans la page</span><input class="input" name="keyword" value="${esc(e.keyword || '')}" placeholder="Facultatif : la page est en panne si ce texte manque"></label>
          <label class="tog-row"><span class="tog-text"><span>Erreurs de la page</span><small>Charge la page dans un navigateur caché (au plus toutes les 5 min) et relève les erreurs JavaScript et les ressources en échec.</small></span><input type="checkbox" name="watchErrors" ${e.watchErrors ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>
          <label class="tog-row"><span class="tog-text"><span>Alerte si le contenu change</span><small>Détecte une modification inattendue de la page (défiguration, page remplacée). Les dates et compteurs sont ignorés.</small></span><input type="checkbox" name="watchChange" ${e.watchChange ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>`)}
        <label class="tog-row sup-srv ${srvOk ? '' : 'off'}" data-srv-row><span class="tog-text"><span>${icon('cloud', 13)} Surveiller aussi 24 h/24, même ordinateur éteint</span><small data-srv-hint>${esc(srvHint)}</small></span><input type="checkbox" name="server" ${server ? 'checked' : ''} ${srvOk ? '' : 'disabled'}><span class="tog" aria-hidden="true"></span></label>
        <div class="field"><span>Alertes pour cette vérification</span><div class="sup-checks">${['email'].map((k) => `<label class="sup-check ${ready[k] ? '' : 'off'}"><input type="checkbox" name="al-${k}" ${wants(k) ? 'checked' : ''}><span>E-mail</span>${ready[k] ? '' : '<small>désactivé dans Alertes</small>'}</label>`).join('')}<label class="sup-check"><input type="checkbox" name="al-webhook" ${wants('webhook') ? 'checked' : ''}><span>Webhooks</span></label></div></div>
        <p class="sup-form-err" hidden></p>
      </div>
      <div class="sheet-foot"><span class="grow"></span><button type="button" class="btn" data-sup-sheet="cancel">Annuler</button><button type="submit" class="btn primary">${site ? 'Enregistrer' : 'Surveiller'}</button></div>
    </form>`, { onClose: () => finish(null), wide: true });
    const form = el.querySelector('form');
    const err = el.querySelector('.sup-form-err');
    const HELP = {
      http: 'Disponibilité, temps de réponse détaillé, certificat, mot-clé, erreurs de la page et modification du contenu.',
      api: 'Une requête au choix (méthode, en-têtes, corps) et une valeur de la réponse JSON à contrôler, par exemple « status = ok ».',
      tcp: 'Ouverture d’un port : base de données, serveur de jeu, SMTP, FTP… (depuis ce PC seulement).',
      dns: 'Un enregistrement DNS attendu, et une alerte s’il change (détournement, erreur de configuration).',
      domain: 'Date d’expiration du nom de domaine, vérifiée toutes les 6 heures : ton site et tes e-mails ne s’arrêteront pas par oubli.',
      journey: 'Un parcours complet rejoué dans un navigateur caché : connexion, panier, formulaire… Chaque étape est chronométrée. Offre Pro.',
      heartbeat: 'Pour tes tâches planifiées (sauvegardes, imports, cron) : elles appellent une adresse ; sans signal à temps, tu es prévenu. Vérifié par les serveurs NEXORA.',
    };
    const applyType = () => {
      for (const b of el.querySelectorAll('[data-type]')) { const on = b.dataset.type === type; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
      for (const d of el.querySelectorAll('[data-tsec]')) d.hidden = !d.dataset.tsec.split(' ').includes(type);
      el.querySelector('[data-type-help]').textContent = HELP[type];
      el.querySelector('[data-url-label]').textContent = type === 'journey' ? 'Adresse de départ' : type === 'api' ? 'Adresse de l’API' : 'Adresse';
      el.querySelector('[data-host-label]').textContent = type === 'domain' ? 'Nom de domaine' : type === 'dns' ? 'Nom à vérifier' : 'Nom d’hôte ou adresse IP';
      el.querySelector('[data-iv-label]').textContent = type === 'heartbeat' ? 'Signal attendu toutes les' : 'Fréquence des vérifications';
      const srvRow = el.querySelector('[data-srv-row]');
      const srvBox = el.querySelector('[name="server"]');
      const can = SERVER_TYPES.has(type);
      srvRow.hidden = !can;
      if (type === 'heartbeat' && srvOk) { srvBox.checked = true; srvBox.disabled = true; } else srvBox.disabled = !srvOk;
    };
    const drawSteps = () => { el.querySelector('[data-steps]').innerHTML = stepsHtml(steps); };
    applyType();
    el.onclick = async (ev) => {
      if (ev.target.closest('[data-sup-sheet="cancel"]')) { closeSheet(owner); finish(null); return; }
      const tb = ev.target.closest('[data-type]');
      if (tb && !tb.disabled) { type = tb.dataset.type; applyType(); return; }
      const del = ev.target.closest('[data-st-del]');
      if (del) { steps.splice(Number(del.dataset.stDel), 1); drawSteps(); return; }
      const clr = ev.target.closest('[data-st-clear]');
      if (clr) { const st = steps[Number(clr.dataset.stClear)]; st.value = ''; st.secret = true; drawSteps(); return; }
      const jr = ev.target.closest('[data-jr]');
      if (!jr) return;
      const start = String(form.elements.url.value || '').trim();
      const res = el.querySelector('[data-jr-res]');
      if (jr.dataset.jr === 'add') { steps.push({ do: 'click', sel: '' }); drawSteps(); return; }
      if (!/^https?:\/\//i.test(start)) { err.hidden = false; err.textContent = 'Indique d’abord l’adresse de départ (https://…).'; return; }
      err.hidden = true;
      jr.disabled = true;
      try {
        if (jr.dataset.jr === 'record') {
          res.innerHTML = `<span class="muted">${icon('record', 12)} Une fenêtre s’ouvre : fais ton parcours (clics, saisies), puis ferme-la.</span>`;
          const r = await call('mon:journey-record', { url: start });
          steps = steps.concat((r && r.steps) || []);
          try { const a = new URL(start); const b = new URL(r.lastUrl); if (b.pathname !== a.pathname) steps.push({ do: 'expectUrl', text: b.pathname }); } catch { /* */ }
          drawSteps();
          res.innerHTML = `<span class="good">${icon('check', 12)} ${(r && r.steps ? r.steps.length : 0)} étape(s) enregistrée(s). Ajoute une vérification de texte pour confirmer le résultat.</span>`;
        } else {
          res.innerHTML = '<span class="spinner small"></span> Parcours en cours…';
          const prepared = await sealSteps(steps);
          const r = await call('mon:journey-run', { url: start, steps: prepared });
          res.innerHTML = `<div class="sup-jres ${r.ok ? 'good' : 'bad'}"><b>${r.ok ? `${icon('check', 12)} Parcours réussi en ${Math.round(r.ms / 100) / 10} s` : `${icon('warn', 12)} ${esc(r.error)}`}</b>${(r.steps || []).map((x) => `<div class="${x.ok ? '' : 'bad'}">${icon(x.ok ? 'check' : 'warn', 11)} ${esc(x.label)} · ${Math.round(x.ms)} ms</div>`).join('')}</div>`;
        }
      } catch (x) { res.innerHTML = `<span class="bad">${esc(x.message || String(x))}</span>`; } finally { jr.disabled = false; }
    };
    el.oninput = (ev) => {
      const t = ev.target.closest('[data-st]');
      if (!t) return;
      const [i, k] = t.dataset.st.split('|');
      const st = steps[Number(i)];
      if (!st) return;
      st[k] = t.type === 'checkbox' ? t.checked : t.value;
      if (k === 'do') drawSteps();
    };
    el.onchange = el.oninput;
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      const list = (cfg.endpoints || []).slice();
      const id = site ? site.id : Math.random().toString(36).slice(2, 9);
      let u = String(f.get('url') || '').trim();
      const h = String(f.get('host') || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
      const fail = (m) => { err.hidden = false; err.textContent = m; };
      if (type === 'http' || type === 'api' || type === 'journey') {
        if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
        try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) throw new Error(); } catch { fail('Adresse invalide : indique une adresse comme https://ton-site.com.'); return; }
        if (type === 'journey' && !steps.length) { fail('Ajoute au moins une étape au parcours.'); return; }
      } else if (type === 'tcp') {
        const port = Number(f.get('port'));
        if (!h || !(port > 0 && port < 65536)) { fail('Indique un nom d’hôte et un port (1 à 65535).'); return; }
        u = `tcp://${h}:${port}`;
      } else if (type === 'dns') { if (!h) { fail('Indique le nom à vérifier.'); return; } u = `dns://${h}/${f.get('recordType') || 'A'}`; }
      else if (type === 'domain') { if (!h) { fail('Indique le nom de domaine.'); return; } u = `domain://${h}`; }
      else if (type === 'heartbeat') { if (!srvOk) { fail(srvHint); return; } u = site && site.url ? site.url : `heartbeat://${id}`; }
      const dup = list.find((x) => x.url && siteKey(x.url) === siteKey(u) && (!site || x.id !== site.id) && (x.type || 'http') === type);
      if (dup) { fail(`« ${dup.name || dup.url} » surveille déjà cette adresse.`); return; }
      const others = list.filter((x) => !site || x.id !== site.id).map((x) => x.name);
      const label = String(f.get('name') || '').trim() || (type === 'heartbeat' ? 'Tâche planifiée' : type === 'tcp' ? `${h}:${f.get('port')}` : type === 'dns' || type === 'domain' ? h : host(u)) || 'Site';
      const name = freeName(label, others);
      const alerts = {};
      for (const k of ['email', 'webhook']) if (!f.get(`al-${k}`)) alerts[k] = false;
      const next = {
        ...(site || { id, enabled: true }),
        type, name, url: u,
        intervalSec: Math.max(type === 'journey' ? 300 : 30, Number(f.get('intervalSec')) || 300),
        thresholdMs: type === 'dns' || type === 'domain' || type === 'heartbeat' ? 0 : Math.max(0, Number(f.get('thresholdMs')) || 0),
        expectStatus: f.get('expectStatus') ? Number(f.get('expectStatus')) : '',
        keyword: type === 'http' ? String(f.get('keyword') || '').trim() : '',
        watchErrors: type === 'http' && Boolean(f.get('watchErrors')),
        watchChange: type === 'http' && Boolean(f.get('watchChange')),
        confirm: Number(f.get('confirm')) || 0,
        slo: Number(f.get('slo')) || 99.9,
        escalateMin: cfg.settings ? Number(cfg.settings.escalateMin) || 0 : 0,
        alerts: Object.keys(alerts).length ? alerts : null,
      };
      if (type === 'api') Object.assign(next, { method: f.get('method') || 'GET', headers: String(f.get('headers') || ''), body: String(f.get('body') || ''), jsonPath: String(f.get('jsonPath') || '').trim(), jsonOp: f.get('jsonOp') || 'equals', jsonExpect: String(f.get('jsonExpect') || '') });
      if (type === 'tcp') Object.assign(next, { host: h, port: Number(f.get('port')) });
      if (type === 'dns') Object.assign(next, { host: h, recordType: f.get('recordType') || 'A', dnsExpect: String(f.get('dnsExpect') || '').trim(), dnsWatch: Boolean(f.get('dnsWatch')) });
      if (type === 'domain') Object.assign(next, { host: h, domainWarn: Number(f.get('domainWarn')) || 30, intervalSec: 21600 });
      if (type === 'journey') next.steps = await sealSteps(steps);
      const out = site ? list.map((x) => (x.id === site.id ? next : x)) : [...list, next];
      try {
        const saved = await call('mon:set-endpoints', out);
        // Surveillance par le serveur (NEXORA #022) : le site de ce PC est enregistré, puis relié ou détaché.
        const wantServer = Boolean(f.get('server')) || type === 'heartbeat';
        let srvMsg = '';
        if (srvOk && SERVER_TYPES.has(type) && (wantServer || server)) {
          try {
            if (wantServer) { await link(next); srvMsg = type === 'heartbeat' ? ' Adresse du signal dans la fiche.' : ' Surveillé aussi 24 h/24.'; } else { await unlink(next.id); srvMsg = ' Surveillance 24 h/24 arrêtée.'; }
          } catch (x) {
            toast(x.message || String(x), { kind: 'bad' });
          }
        }
        finish({ cfg: saved, id: next.id });
        closeSheet(owner);
        toast(`${site ? 'Réglages enregistrés.' : `« ${name} » est maintenant surveillé.`}${srvMsg}`);
      } catch (x) {
        err.hidden = false;
        err.textContent = x.message || String(x);
      }
    };
  });
}

// Valeurs secrètes des parcours chiffrées par le processus principal (safeStorage) avant l'enregistrement.
async function sealSteps(steps) {
  const out = [];
  for (const st of steps) {
    const x = { ...st };
    if (x.do === 'fill' && x.secret && x.value && !String(x.value).startsWith('enc:')) x.value = await call('mon:seal', x.value).catch(() => x.value);
    out.push(x);
  }
  return out;
}

// Fenêtre de confirmation (action destructrice).
export function confirmSheet({ title, text, ok = 'Confirmer', danger = true, ic = 'warn' }) {
  const owner = 'sup-confirm';
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const el = sheet(owner, `<div class="sheet-head"><span class="sheet-icon ${danger ? 'warn' : ''}">${icon(ic, 22)}</span><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div></div>
      <div class="sheet-foot"><span class="grow"></span><button class="btn" data-sup-c="no">Annuler</button><button class="btn primary ${danger ? 'danger' : ''}" data-sup-c="yes" data-autofocus>${esc(ok)}</button></div>`, { onClose: () => finish(false) });
    el.onclick = (ev) => {
      const b = ev.target.closest('[data-sup-c]');
      if (!b) return;
      finish(b.dataset.supC === 'yes');
      closeSheet(owner);
    };
  });
}
