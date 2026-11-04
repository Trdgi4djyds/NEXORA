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

// Fenêtre d'ajout ou de réglage d'un site surveillé. Renvoie la liste enregistrée, ou null si annulé.
// `server` : site déjà surveillé par les serveurs NEXORA (NEXORA #022).
export function siteSheet({ cfg, site = null, url = '', server = false }) {
  const owner = 'sup-site';
  const e = site || { name: '', url, intervalSec: 300, thresholdMs: 2000, keyword: '', expectStatus: '', watchErrors: false, confirm: 0, alerts: null, enabled: true };
  const ch = cfg.channels || {};
  // NEXORA #030 : un seul canal, l'e-mail (Brevo) envoyé par les serveurs NEXORA.
  const ready = { email: Boolean(ch.email && ch.email.enabled) };
  const wants = (k) => !e.alerts || e.alerts[k] !== false;
  const acc = account();
  const srvHint = !acc.signedIn ? 'Connecte-toi à ton compte NEXORA (bouton Connexion du rail) pour l’activer.'
    : !acc.orgId ? 'Choisis un espace d’équipe dans ton compte NEXORA.'
      : !acc.canEdit ? 'Ton rôle dans cet espace ne le permet pas (éditeur au moins).'
        : `Vérifié par les serveurs NEXORA toutes les minutes au plus, même ordinateur éteint, avec une notification dans NEXORA pour l’équipe « ${acc.orgName} », et un e-mail (Brevo) si les alertes des serveurs sont activées.`;
  const srvOk = acc.signedIn && acc.orgId && acc.canEdit;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const el = sheet(owner, `<form class="sup-form" autocomplete="off">
      <div class="sheet-head"><span class="sheet-icon">${icon('globe', 22)}</span><div><h2>${site ? 'Réglages du site' : 'Surveiller un site'}</h2><p>${site ? esc(site.name || site.url) : 'NEXORA vérifie ton site en continu et te prévient dès qu’il tombe, ralentit ou que son certificat arrive à expiration.'}</p></div></div>
      <div class="sheet-body sup-form-body">
        <label class="field"><span>Adresse</span><input class="input" name="url" value="${esc(e.url)}" placeholder="https://ton-site.com" spellcheck="false" data-autofocus required></label>
        <label class="field"><span>Nom</span><input class="input" name="name" value="${esc(e.name)}" placeholder="Nom affiché (facultatif)"></label>
        <div class="sup-form-grid">
          <label class="field"><span>Fréquence des vérifications</span><select class="input" name="intervalSec">${INTERVALS.map(([v, l]) => `<option value="${v}" ${Number(e.intervalSec || 300) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Seuil de lenteur (ms)</span><input class="input" type="number" name="thresholdMs" min="0" step="100" value="${esc(e.thresholdMs || 2000)}"></label>
          <label class="field"><span>Code HTTP attendu</span><input class="input" type="number" name="expectStatus" min="100" max="599" value="${esc(e.expectStatus || '')}" placeholder="200 à 399"></label>
          <label class="field"><span>Confirmer une panne après</span><select class="input" name="confirm"><option value="0">Réglage général (${cfg.settings ? cfg.settings.confirm : 2} échecs)</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(e.confirm) === n ? 'selected' : ''}>${n} échec${n > 1 ? 's' : ''} de suite</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Mot-clé attendu dans la page</span><input class="input" name="keyword" value="${esc(e.keyword || '')}" placeholder="Facultatif : la page est en panne si ce texte manque"></label>
        <label class="tog-row"><span class="tog-text"><span>Erreurs de la page</span><small>Charge la page dans un navigateur caché (au plus toutes les 5 min) et relève les erreurs JavaScript et les ressources en échec.</small></span><input type="checkbox" name="watchErrors" ${e.watchErrors ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>
        <label class="tog-row sup-srv ${srvOk ? '' : 'off'}"><span class="tog-text"><span>${icon('cloud', 13)} Surveiller aussi 24 h/24 par les serveurs NEXORA</span><small>${esc(srvHint)}</small></span><input type="checkbox" name="server" ${server ? 'checked' : ''} ${srvOk ? '' : 'disabled'}><span class="tog" aria-hidden="true"></span></label>
        <div class="field"><span>Alertes pour ce site</span><div class="sup-checks">${['email'].map((k) => `<label class="sup-check ${ready[k] ? '' : 'off'}"><input type="checkbox" name="al-${k}" ${wants(k) ? 'checked' : ''}><span>E-mail (Brevo)</span>${ready[k] ? '' : '<small>désactivé dans Alertes</small>'}</label>`).join('')}</div></div>
        <p class="sup-form-err" hidden></p>
      </div>
      <div class="sheet-foot"><span class="grow"></span><button type="button" class="btn" data-sup-sheet="cancel">Annuler</button><button type="submit" class="btn primary">${site ? 'Enregistrer' : 'Surveiller ce site'}</button></div>
    </form>`, { onClose: () => finish(null) });
    const form = el.querySelector('form');
    const err = el.querySelector('.sup-form-err');
    el.onclick = (ev) => { if (ev.target.closest('[data-sup-sheet="cancel"]')) { closeSheet(owner); finish(null); } };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      let u = String(f.get('url') || '').trim();
      if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
      try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) throw new Error(); } catch { err.hidden = false; err.textContent = 'Adresse invalide : indique une adresse comme https://ton-site.com.'; return; }
      const list = (cfg.endpoints || []).slice();
      const dup = list.find((x) => x.url && siteKey(x.url) === siteKey(u) && (!site || x.id !== site.id));
      if (dup) { err.hidden = false; err.textContent = `« ${dup.name || dup.url} » surveille déjà ce site.`; return; }
      const others = list.filter((x) => !site || x.id !== site.id).map((x) => x.name);
      const name = freeName(String(f.get('name') || '').trim() || host(u) || 'Site', others);
      const alerts = {};
      for (const k of ['email']) if (!f.get(`al-${k}`)) alerts[k] = false;
      const next = {
        ...(site || { id: Math.random().toString(36).slice(2, 9), enabled: true }),
        name, url: u,
        intervalSec: Number(f.get('intervalSec')) || 300,
        thresholdMs: Math.max(0, Number(f.get('thresholdMs')) || 0),
        expectStatus: f.get('expectStatus') ? Number(f.get('expectStatus')) : '',
        keyword: String(f.get('keyword') || '').trim(),
        watchErrors: Boolean(f.get('watchErrors')),
        confirm: Number(f.get('confirm')) || 0,
        alerts: Object.keys(alerts).length ? alerts : null,
      };
      const out = site ? list.map((x) => (x.id === site.id ? next : x)) : [...list, next];
      try {
        const saved = await call('mon:set-endpoints', out);
        // Surveillance par le serveur (NEXORA #022) : le site de ce PC est enregistré, puis relié ou détaché.
        const wantServer = Boolean(f.get('server'));
        let srvMsg = '';
        if (srvOk && (wantServer || server)) {
          try {
            if (wantServer) { await link(next); srvMsg = ' Surveillé aussi 24 h/24 par les serveurs NEXORA.'; } else { await unlink(next.id); srvMsg = ' Surveillance par le serveur arrêtée.'; }
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
