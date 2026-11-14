// NEXORA #120 : projets à serveur dans l'App Builder (Laravel, dont Laravel + Inertia + Vue ou React, Symfony,
// autres projets PHP ; Django et Ruby on Rails sont reconnus). Un tel projet ne produit jamais de index.html : il
// s'exécute sur un serveur, qu'un téléphone ne peut pas faire tourner seul. Le panneau (posé à la place du message
// « Aucun index.html construit ») propose deux façons de construire l'APK :
//  - l'adresse du site en ligne, pour publier ;
//  - le serveur de test de ce PC, ouvert au réseau local (src/android/serveur.js) : l'APK s'ouvre sur l'adresse du
//    PC, avec le téléphone sur le même Wi-Fi.
// Dans les deux cas, la source de l'application passe en « Site en ligne » avec l'adresse choisie : le reste de
// l'App Builder (construction, aperçu, liens) est celui d'un site web, qui fonctionne déjà.
import { a as ICONS } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { api, ico, esc, toast } from '../core.js';

const MORE_ICONS = {
  // Serveur (tracé Lucide, licence ISC, comme les autres icônes de NEXORA).
  nxServer: '<rect x="3" y="3" width="18" height="7.5" rx="2"/><rect x="3" y="13.5" width="18" height="7.5" rx="2"/><path d="M7 6.75h.01"/><path d="M7 17.25h.01"/>',
};

const WHY = {
  laravel: 'Une application Laravel s’exécute sur un serveur PHP',
  symfony: 'Une application Symfony s’exécute sur un serveur PHP',
  php: 'Un site PHP s’exécute sur un serveur PHP',
  django: 'Une application Django s’exécute sur un serveur Python',
  rails: 'Une application Ruby on Rails s’exécute sur un serveur Ruby',
};

const row = (ok, text, action = '') => `<li class="${ok === true ? 'ok' : ok === false ? 'bad' : 'wait'}">${ico(ok === true ? 'pass' : ok === false ? 'warn' : 'info', 14)}<span>${text}</span>${action}</li>`;

function checksHtml(c, s) {
  if (!c) return row(null, 'Vérification du projet…');
  const out = [];
  out.push(c.php ? row(true, `PHP ${esc(c.php.version)} trouvé sur ce PC`) : row(false, 'PHP introuvable sur ce PC', '<button type="button" class="btn small" data-nxs-php>Installer PHP</button>'));
  const k = c.checks;
  if (k) {
    out.push(k.vendor ? row(true, 'Dépendances PHP installées (vendor)') : row(false, 'Dépendances PHP absentes : lancez « composer install » dans le projet'));
    out.push(k.env ? (k.key ? row(true, 'Configuration (.env) et clé de l’application prêtes') : row(false, 'Clé absente : lancez « php artisan key:generate »')) : row(false, k.envExample ? 'Fichier .env absent : copiez .env.example en .env' : 'Fichier .env absent'));
    if (s.vite) out.push(k.built ? row(true, 'Fichiers de l’interface construits (public/build)') : row(null, 'Fichiers de l’interface construits au démarrage (npm run build)'));
    if (k.hot) out.push(row(null, 'Fichier public/hot présent : arrêtez « npm run dev » s’il tourne'));
  }
  return out.join('');
}

function runningHtml(st) {
  if (!st) return '';
  const others = (st.addresses || []).slice(1);
  return `<div class="nxab-srv-live">
      <span class="nxab-srv-dot" aria-hidden="true"></span>
      <div><b>Serveur de test en marche</b><code>${esc(st.url || st.local)}</code>${others.length ? `<small>Autres adresses : ${others.map((a) => esc(a.url)).join(' · ')}</small>` : ''}</div>
    </div>
    ${st.url ? '' : '<p class="nxab-srv-warn">Aucun réseau local détecté : connectez ce PC au Wi-Fi (ou à un câble réseau) puis redémarrez le serveur.</p>'}
    <div class="nxab-srv-row">
      ${st.url ? '<button type="button" class="btn small primary" data-nxs-use-local>Utiliser cette adresse pour l’APK</button>' : ''}
      <button type="button" class="btn small" data-nxs-copy>${ico('copy', 13)}<span>Copier</span></button>
      <button type="button" class="btn small" data-nxs-stop>${ico('stop', 13)}<span>Arrêter</span></button>
    </div>
    <p class="nxab-srv-note">${ico('info', 13)}<span>Si Windows le demande, autorisez PHP sur les réseaux privés. Le téléphone doit être sur le même Wi-Fi que ce PC ; l’application affiche une page hors ligne quand le serveur est arrêté.</span></p>`;
}

export function render(el, info, ab) {
  const s = info.server;
  const dir = info.dir || (ab.cfg && ab.cfg.source && ab.cfg.source.dir);
  const pub = (ab.cfg && ab.cfg.source && ab.cfg.source.publicUrl) || '';
  el.innerHTML = `<div class="nxab-srv">
    <div class="nxab-srv-head"><span class="nxab-srv-ic">${ico('nxServer', 18)}</span><div>
      <b>Projet ${esc(s.label)} détecté</b>
      <p>${esc(WHY[s.kind] || 'Ce projet s’exécute sur un serveur')} : un téléphone ne peut pas la faire tourner seul, l’APK s’ouvre donc sur l’adresse d’un serveur. Choisissez l’une des deux façons ci-dessous.</p>
    </div></div>
    <div class="nxab-srv-opts">
      <section class="nxab-srv-opt">
        <h4>${ico('globe', 15)}<span>Site en ligne</span><em>pour publier</em></h4>
        <p>L’adresse de votre application hébergée. L’APK fonctionne partout, même PC éteint.</p>
        <div class="nxab-srv-row"><input class="input" type="url" data-nxs-url placeholder="https://www.monsite.com/" value="${esc(pub)}" spellcheck="false"><button type="button" class="btn small primary" data-nxs-use-url>Utiliser cette adresse</button></div>
      </section>
      ${s.canServe ? `<section class="nxab-srv-opt">
        <h4>${ico('laptop', 15)}<span>Tester depuis ce PC</span><em>même Wi-Fi</em></h4>
        <p>NEXORA construit les fichiers si besoin et lance ${s.kind === 'laravel' ? '« php artisan serve »' : 'le serveur intégré de PHP'} sur votre réseau local. L’APK s’ouvre sur l’adresse de ce PC tant qu’il reste allumé.</p>
        <ul class="nxab-srv-checks" data-nxs-checks>${checksHtml(null, s)}</ul>
        <div data-nxs-live></div>
        <div class="nxab-srv-row" data-nxs-start-row><button type="button" class="btn small primary" data-nxs-start>${ico('play', 13)}<span>Démarrer le serveur de test</span></button></div>
      </section>` : `<section class="nxab-srv-opt muted">
        <h4>${ico('laptop', 15)}<span>Tester depuis ce PC</span></h4>
        <p>Lancez le serveur de votre projet sur le réseau local (par exemple « ${s.kind === 'django' ? 'python manage.py runserver 0.0.0.0:8000' : s.kind === 'rails' ? 'rails server -b 0.0.0.0' : 'php -S 0.0.0.0:8000'} »), puis indiquez dans « Site en ligne » l’adresse de ce PC (http://192.168.x.x:8000/).</p>
      </section>`}
    </div>
  </div>`;

  let state = null;
  const $ = (q) => el.querySelector(q);
  const paint = () => {
    const checks = $('[data-nxs-checks]');
    if (checks) checks.innerHTML = checksHtml(state, s);
    const live = $('[data-nxs-live]');
    if (live) live.innerHTML = runningHtml(state && state.running);
    const startRow = $('[data-nxs-start-row]');
    if (startRow) startRow.hidden = Boolean(state && state.running);
  };
  const refresh = async () => {
    if (!s.canServe || !dir) return;
    try { state = await api.invoke('android:server-check', dir); } catch (e) { state = { php: null, checks: null, running: null, error: e.message }; }
    if (el.isConnected) paint();
  };
  const useUrl = (url, msg) => {
    ab.set('source.kind', 'url');
    ab.set('source.url', url, { rerender: true });
    if (typeof ab.renderApps === 'function') ab.renderApps();
    toast(msg);
  };

  el.onclick = async (e) => {
    const t = e.target.closest('button');
    if (!t || !el.contains(t)) return;
    if (t.matches('[data-nxs-use-url]')) {
      const v = String(($('[data-nxs-url]') || {}).value || '').trim();
      if (!/^https?:\/\/[^\s/]+\.[^\s]+/i.test(v)) { toast('Indiquez l’adresse complète du site, par exemple https://www.monsite.com/', { kind: 'bad' }); return; }
      if (/^https?:\/\/(localhost|127\.|\[::1\])/i.test(v)) { toast('Cette adresse ne fonctionne que sur ce PC : utilisez « Tester depuis ce PC » ou l’adresse du site en ligne.', { kind: 'bad' }); return; }
      ab.set('source.publicUrl', v);
      useUrl(v, 'Source enregistrée : l’APK s’ouvrira sur votre site en ligne.');
      return;
    }
    if (t.matches('[data-nxs-php]')) {
      if (window.__nxTools && typeof window.__nxTools.ensure === 'function') { await window.__nxTools.ensure(dir, 'appbuilder'); refresh(); }
      else toast('Installez PHP depuis Bibliothèques (Dev Lab → Bibliothèques).', { kind: 'bad' });
      return;
    }
    if (t.matches('[data-nxs-start]')) {
      t.disabled = true;
      t.setAttribute('aria-busy', 'true');
      if (typeof ab.openLog === 'function') ab.openLog();
      const busy = toast('Démarrage du serveur de test…', { busy: true, sticky: true });
      try {
        const st = await api.invoke('android:server-start', dir);
        state = { ...(state || {}), running: st };
        busy.close();
        toast(st.url ? `Serveur de test en marche : ${st.url}` : 'Serveur de test en marche, mais aucun réseau local détecté.');
        refresh();
      } catch (err) {
        busy.close();
        toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), { kind: 'bad' });
      } finally {
        t.disabled = false;
        t.removeAttribute('aria-busy');
        if (el.isConnected) paint();
      }
      return;
    }
    if (t.matches('[data-nxs-stop]')) {
      await api.invoke('android:server-stop', dir).catch(() => {});
      if (state) state.running = null;
      paint();
      toast('Serveur de test arrêté.');
      return;
    }
    if (t.matches('[data-nxs-copy]')) {
      const url = state && state.running && (state.running.url || state.running.local);
      if (url) { try { await navigator.clipboard.writeText(url); toast('Adresse copiée.'); } catch { toast(url); } }
      return;
    }
    if (t.matches('[data-nxs-use-local]')) {
      const url = state && state.running && state.running.url;
      if (url) useUrl(url, 'Source enregistrée : construisez l’APK, puis installez-le sur un téléphone connecté au même Wi-Fi que ce PC.');
    }
  };
  refresh();
}

export function install() {
  for (const [k, v] of Object.entries(MORE_ICONS)) if (!ICONS[k]) ICONS[k] = v;
  globalThis.__nxAbServer = { render };
}
