// NEXORA #052 : mise en ligne en un clic (Cloudflare Pages, Vercel, Netlify, GitHub Pages), adresse d'aperçu
// par branche, contrôles avant la mise en ligne, historique. Réservé à l'offre Pro.
import { api, esc, ico, root, call, noProject, head, btn, pill, toast, has, proGate, confirmSheet, sheet, closeSheet, sheetHtml, plain, ago, dev } from './ui.js';
import { runAll } from './checks.js';

export function mount(el, ctx) {
  const st = { providers: null, cfg: null, busy: false, log: '', last: null, branch: '' };
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    if (!has('devlab_pro')) { el.innerHTML = `${head('Mise en ligne', '')}${proGate('La mise en ligne en un clic', 'Construis et publie ton site chez l’hébergeur de ton choix, avec une adresse d’aperçu pour chaque branche.')}`; return; }
    if (!st.cfg || !st.providers) { el.innerHTML = '<div class="nxd-loading"><span class="spin"></span>Chargement…</div>'; return; }
    const c = st.cfg;
    const p = st.providers.find((x) => x.id === c.provider) || st.providers[0];
    const hosts = `<div class="nxd-tiles nxd-hosts">${st.providers.map((x) => `<button class="nxd-tile ${x.id === c.provider ? 'on' : ''}" data-provider="${x.id}"><span class="nxd-tile-ic">${ico(x.id === 'github' ? 'code' : 'cloud', 18)}</span><b>${esc(x.name)}</b><small>${x.ready ? `${ico('pass', 11)} prêt` : x.id === 'github' ? 'compte GitHub à connecter' : 'jeton à ajouter'}</small></button>`).join('')}</div>`;
    const form = `<div class="nxd-form"><label class="field"><span>Nom du site</span><input class="input" data-c="project" value="${esc(c.project)}" spellcheck="false"></label><label class="field"><span>Dossier produit</span><input class="input" data-c="outDir" value="${esc(c.outDir)}" spellcheck="false" placeholder="dist"></label><label class="nxd-check"><input type="checkbox" data-c="build" ${c.build ? 'checked' : ''}> Construire avant (script « build »)</label><label class="nxd-check"><input type="checkbox" data-c="checks" ${c.checks ? 'checked' : ''}> Contrôles avant mise en ligne (si le projet est lancé)</label></div>`;
    const actions = `<div class="nxd-row nxd-wrap">${p.id !== 'github' ? btn(p.ready ? `Jeton ${p.name}` : `Ajouter le jeton ${p.name}`, 'data-act="creds"', 'key', p.ready ? '' : 'primary') : ''}<span class="grow"></span>${btn(st.busy ? 'Mise en ligne…' : `Aperçu de « ${st.branch || 'main'} »`, `data-deploy="preview" ${st.busy || !p.ready ? 'disabled' : ''}`, 'eye')}${btn('Mettre en production', `data-deploy="prod" ${st.busy || !p.ready ? 'disabled' : ''}`, 'rocket', 'primary')}</div>`;
    const last = st.last && st.last.url ? `<div class="nxd-note ok">${ico('pass', 16)}<div><b>En ligne${st.last.production ? ' (production)' : ` (aperçu de ${esc(st.last.branch)})`}</b><p><a href="#" data-url="${esc(st.last.url)}">${esc(st.last.url)}</a></p></div>${btn('Contrôler cette adresse', `data-check="${esc(st.last.url)}"`, 'shield')}</div>` : '';
    const history = c.history.length ? `<h4 class="nxd-h4">Historique</h4><div class="nxd-table">${c.history.map((h) => `<div class="nxd-tr">${ico(h.production ? 'rocket' : 'eye', 13)}<b>${esc((st.providers.find((x) => x.id === h.provider) || {}).name || h.provider)}</b>${pill(h.production ? 'production' : h.branch, h.production ? 'ok' : '')}<span class="nxd-grow">${h.url ? `<a href="#" data-url="${esc(h.url)}">${esc(h.url)}</a>` : '<i class="nxd-muted">adresse non lue</i>'}</span><small>${ago(h.at)}</small></div>`).join('')}</div>` : '';
    el.innerHTML = `${head('Mise en ligne', `Branche <b>${esc(st.branch || 'main')}</b> : l’aperçu reçoit sa propre adresse ; la production remplace le site public.`, '')}${hosts}${form}${actions}${last}${st.log ? `<details class="nxd-details" ${st.busy ? 'open' : ''}><summary>Journal</summary><pre class="nxd-console" data-log>${esc(plain(st.log).slice(-40000))}</pre></details>` : ''}${history}`;
    const lg = el.querySelector('[data-log]');
    if (lg) lg.scrollTop = lg.scrollHeight;
  };
  const load = async () => {
    if (!root() || !has('devlab_pro')) return render();
    try {
      [st.providers, st.cfg] = await Promise.all([call('devx:deploy-providers', {}, { quiet: true }), call('devx:deploy-config', {}, { quiet: true })]);
      const b = await call('devx:git-branches', {}, { quiet: true }).catch(() => null);
      st.branch = b && b.current ? b.current : 'main';
    } catch { st.providers = st.providers || []; }
    render();
  };
  const save = () => call('devx:deploy-save', { config: { provider: st.cfg.provider, project: st.cfg.project, outDir: st.cfg.outDir, build: st.cfg.build, checks: st.cfg.checks } }, { quiet: true }).catch(() => {});
  const creds = () => {
    const p = st.providers.find((x) => x.id === st.cfg.provider);
    const s = sheet('nxd-creds', sheetHtml({ icon: 'key', title: `Connexion à ${p.name}`, sub: 'Chiffré sur ce PC, jamais écrit dans le projet. Crée le jeton dans les réglages de ton compte chez l’hébergeur.', body: p.fields.map((f) => `<label class="field"><span>${esc(f.label)}</span><input class="input" ${f.secret ? 'type="password"' : ''} data-k="${f.key}" placeholder="${f.set ? 'Déjà enregistré : laisse vide pour le garder' : ''}" spellcheck="false"></label>`).join(''), go: 'Enregistrer' }), {});
    s.onclick = async (e) => {
      if (!e.target.closest('[data-nx-go]')) return;
      const values = {};
      for (const i of s.querySelectorAll('[data-k]')) if (i.value.trim()) values[i.dataset.k] = i.value.trim();
      try { st.providers = await call('devx:deploy-creds', { provider: p.id, values }); closeSheet('nxd-creds'); toast('Connexion enregistrée.'); render(); } catch { /* message affiché */ }
    };
  };
  const deploy = async (production) => {
    if (st.busy) return;
    if (production && !await confirmSheet({ icon: 'rocket', title: 'Mettre en production ?', sub: 'Le site public est remplacé par cette version.', go: 'Mettre en production' })) return;
    const url = ctx.url();
    if (st.cfg.checks && url) {
      toast('Contrôles avant mise en ligne…');
      try {
        const r = await runAll(url);
        if (!r.ok && !await confirmSheet({ icon: 'warn', title: 'Des contrôles ne passent pas', sub: r.devices.flatMap((d) => d.fails.map((f) => `${d.name} : ${f}`)).slice(0, 4).join(' · ') || 'Score de sécurité sous le seuil.', go: 'Mettre en ligne quand même' })) { ctx.open('checks', { result: r }); return; }
      } catch { /* contrôles impossibles : la mise en ligne continue */ }
    }
    st.busy = true; st.log = ''; st.last = null; render();
    try { st.last = await call('devx:deploy-run', { production }); toast(st.last.url ? `En ligne : ${st.last.url}` : 'Mise en ligne terminée.'); st.cfg = await call('devx:deploy-config', {}, { quiet: true }); } catch { /* message affiché */ }
    st.busy = false; render();
  };
  api.on('devx:deploy', (m) => { if (!el.isConnected) return; if (m.type === 'log') { st.log += m.text; const lg = el.querySelector('[data-log]'); if (lg) { lg.textContent = plain(st.log).slice(-40000); lg.scrollTop = lg.scrollHeight; } else render(); } });
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const pr = t.closest('[data-provider]');
    if (pr) { st.cfg.provider = pr.dataset.provider; save(); render(); const p = st.providers.find((x) => x.id === st.cfg.provider); if (p.id === 'github' && !p.ready) { toast('Connecte ton compte GitHub dans le panneau « Dépôt distant ».'); const b = dev().el.querySelector('[data-side="github"]'); if (b) { ctx.close(); b.click(); } } return; }
    if (t.closest('[data-act="creds"]')) return creds();
    const d = t.closest('[data-deploy]');
    if (d) return deploy(d.dataset.deploy === 'prod');
    const u = t.closest('[data-url]');
    if (u) { e.preventDefault(); window.open(u.dataset.url, '_blank'); return; }
    const ck = t.closest('[data-check]');
    if (ck) ctx.open('checks', { url: ck.dataset.check });
  });
  el.addEventListener('change', (e) => { const k = e.target.dataset.c; if (!k) return; st.cfg[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim(); save(); });
  load();
  return { show: () => { if (!st.cfg) load(); else render(); } };
}
