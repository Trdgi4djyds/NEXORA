// NEXORA #023 : Desktop Builder, l'espace qui transforme un site en ligne, un dossier de site (ou un projet web à
// construire) ou un projet Electron en logiciel de bureau installable : installateur Windows (NSIS), version
// portable, archive ZIP, paquet MSI, fichier GitHub Actions pour macOS et Linux.
// Mise en page et styles de l'App Builder (.ab-*) ; la construction est faite par le processus principal
// (src/desktop/, canaux desktop:*). Réglages enregistrés dans settings.desktop.
// NEXORA #087 : offre Gratuite à 2 applications (App Builder et Desktop Builder confondus) : identifiant du logiciel
// joint à la construction, bandeau de l'offre au-dessus du bouton « Construire » (../offres/desktop.js).
import {
  api, state, settings, saveSettings, esc, uid, $, ico, toast, sheet, sheetHtml, closeSheet, pickFile, loadImage, makeCanvas, luminance,
} from '../core.js';
import { a as resizable } from '../../dist/chunks/chunk-W2YYTHPL.js';
import { iconDataUrl, sidebarCanvas, buildAssets, initials } from './icons.js';
import { pcHtml, MODES, modeOf, SCREEN } from './preview.js';
import { b as supabase, e as cloud } from '../../dist/chunks/chunk-EZKHFSAB.js';
import { explain as insExplain, chart as insChart, table as insTable } from '../android/insights.js';
import { banner as offerBanner, nxApp as offerApp, refresh as refreshOffer, released as offerReleased } from '../offres/desktop.js';

export const SECTIONS = [
  ['source', 'Source', 'globe', 'Site en ligne, dossier ou projet de bureau'],
  ['identity', 'Identité', 'file', 'Nom, éditeur, version, identifiant'],
  ['icon', 'Icône', 'image', 'Icône du logiciel et de l’installateur'],
  ['window', 'Fenêtre', 'display', 'Taille, démarrage, barre de menus, thème'],
  ['behavior', 'Comportement', 'link', 'Liens, hors connexion, zone de notification'],
  ['security', 'Sécurité', 'shield', 'Autorisations, verrouillage, intégrité'],
  ['install', 'Installation', 'download', 'Installateur, raccourcis, formats'],
  ['updates', 'Mises à jour', 'sync', 'Mise à jour automatique du logiciel'],
  ['signing', 'Signature', 'key', 'Certificat et avertissement SmartScreen'],
  ['build', 'Construction', 'rocket', 'Fichiers d’installation et historique'],
  // NEXORA #058
  ['ready', 'Prêt pour la distribution', 'nxCheckCircle', 'Contrôle avant de publier'],
  ['distrib', 'Distribution', 'upload', 'Mise à jour, Store, winget, essai'],
  ['insights', 'Statistiques', 'timeline', 'Installations, versions, plantages'],
];
const ACCEL_RE = /^((CommandOrControl|Ctrl|Alt|Shift|Super)\+){1,3}([A-Z0-9]|F([1-9]|1[0-2]))$/;
const RESERVED_EXT = ['exe', 'com', 'bat', 'cmd', 'msi', 'msix', 'appx', 'ps1', 'vbs', 'js', 'jse', 'wsf', 'lnk', 'url', 'scr', 'dll', 'sys', 'reg', 'html', 'htm', 'zip'];
const AZURE_REGIONS = [['https://weu.codesigning.azure.net/', 'Europe de l’Ouest'], ['https://neu.codesigning.azure.net/', 'Europe du Nord'], ['https://eus.codesigning.azure.net/', 'Est des États-Unis'], ['https://wus.codesigning.azure.net/', 'Ouest des États-Unis'], ['https://wcus.codesigning.azure.net/', 'Centre-ouest des États-Unis'], ['https://wus2.codesigning.azure.net/', 'Ouest des États-Unis 2']];
const KINDS = {
  url: ['Site en ligne', 'globe', 'Ton site dans une fenêtre de logiciel : chaque mise à jour du site est visible sans réinstaller.'],
  folder: ['Dossier de site', 'folderOpen', 'Un site (HTML) ou un projet web (React, Vue, Angular, Astro…) intégré au logiciel : il marche hors connexion.'],
  electron: ['Projet de bureau', 'code', 'Ton projet existant, emballé avec sa configuration ou celle recommandée par NEXORA.'],
};
const LOGINS = [
  ['google', 'Compte web'], ['microsoft', 'Compte professionnel'], ['apple', 'Compte de l’appareil'], ['facebook', 'Réseau social'], ['github', 'Dépôt de code'],
  ['auth0', 'Connexion centralisée'], ['okta', 'Compte d’entreprise'], ['stripe', 'Paiement en ligne'], ['paypal', 'Portefeuille en ligne'],
];
const PERMS = [
  ['notifications', 'Notifications', 'Messages du site dans le centre de notifications de Windows.', ['allow', 'deny']],
  ['camera', 'Caméra', 'Visioconférence, photo de profil, lecture de QR codes.'],
  ['microphone', 'Micro', 'Appels, messages vocaux, dictée.'],
  ['display', 'Partage d’écran', 'Le logiciel demande quel écran ou quelle fenêtre partager.'],
  ['geolocation', 'Localisation', 'Cartes, magasins proches, météo.'],
  ['clipboard', 'Lecture du presse-papiers', 'Coller du contenu par un bouton du site (copier reste toujours permis).'],
  ['localNetwork', 'Réseau local', 'Appareils et serveurs de ton réseau (imprimantes, localhost).'],
  ['midi', 'Appareils MIDI', 'Claviers et contrôleurs de musique.'],
];
const PERM_LABEL = { allow: 'Autoriser', ask: 'Demander', deny: 'Refuser' };
const SIZES = [['1024x700', 'Compact'], ['1280x800', 'Standard'], ['1440x900', 'Grand'], ['1600x1000', 'Très grand']];
const SPELL = [['fr', 'Français'], ['en-US', 'Anglais (États-Unis)'], ['en-GB', 'Anglais (Royaume-Uni)'], ['de', 'Allemand'], ['es', 'Espagnol'], ['it', 'Italien'], ['pt-BR', 'Portugais (Brésil)'], ['nl', 'Néerlandais']];
const FORMATS = [['nsis', 'Installateur', 'Assistant d’installation .exe (recommandé)'], ['portable', 'Portable', 'Un seul .exe, sans installation'], ['zip', 'ZIP', 'Archive à décompresser'], ['msi', 'MSI', 'Déploiement en entreprise (GPO, Intune)']];
const FORMATS_ALL = [...FORMATS, ['appx', 'Microsoft Store', 'Paquet MSIX signé par le Store (section Distribution)']];
const STEP_LABELS = [['tools', 'Outils de construction'], ['electron', 'Moteur du logiciel'], ['source', 'Source'], ['project', 'Projet du logiciel'], ['package', 'Emballage et installateur'], ['msi', 'Paquet MSI'], ['copy', 'Fichiers d’installation']];

// ---------------------------------------------------------------- modèle d'un logiciel
function defaults() {
  return {
    id: uid(),
    created: Date.now(),
    name: 'Mon logiciel',
    appId: 'com.monlogiciel.desktop',
    version: '1.0.0',
    publisher: '',
    email: '',
    description: '',
    homepage: '',
    copyright: '',
    lang: 'auto',
    source: {
      kind: 'url', url: '', dir: '', analysis: null, buildCmd: '', webDir: '', build: true, useProjectConfig: true, prepareCmd: '',
    },
    icon: {
      image: null, shape: 'rounded', bg: '#2563eb', padding: 16, letter: '',
    },
    internal: [],
    logins: [],
    window: {
      width: 1280, height: 800, minWidth: 640, minHeight: 480, start: 'normal', remember: true, resizable: true, menu: 'auto', theme: 'system', background: '#ffffff', accent: '#2563eb', title: 'page',
    },
    behavior: {
      singleInstance: true, external: 'browser', offline: true, tray: false, closeToTray: false, autostartOption: true, downloads: 'ask', spellcheck: ['fr', 'en-US'], contextMenu: true, userAgent: 'chrome', customUserAgent: '', zoom: true, protocol: '',
      badge: false, jumpList: [], shortcut: '', fileTypes: [],
    },
    permissions: {
      notifications: 'allow', camera: 'ask', microphone: 'ask', display: 'ask', geolocation: 'ask', clipboard: 'ask', localNetwork: 'deny', midi: 'deny',
    },
    security: {
      devtools: false, httpsOnly: true, fuses: true, integrity: true, cookieEncryption: true,
    },
    install: {
      mode: 'assisted', scope: 'user', changeDir: true, desktop: true, startMenu: true, runAfter: true, deleteData: false, license: '',
      formats: {
        nsis: true, portable: false, zip: false, msi: false, appx: false,
      },
      archs: { x64: true, arm64: false },
      electron: 'latest',
      compression: 'normal',
      ci: false,
    },
    updates: {
      mode: 'none', url: '', owner: '', repo: '', checkOnStart: true, channel: 'latest',
    },
    signing: {
      enabled: false, mode: 'pfx', azure: { endpoint: AZURE_REGIONS[0][0], account: '', profile: '', publisherName: '' },
    },
    store: { identityName: '', publisher: '', publisherDisplayName: '' },
    insights: {
      enabled: false, key: '', app: '', appId: '', days: 30,
    },
    distrib: {
      staging: 100, mandatory: false, notes: '', license: 'Propriétaire', wingetUrl: '',
    },
    lastPublish: null,
    out: '',
    inspect: null,
    builds: [],
  };
}
const OBJ = ['source', 'icon', 'window', 'behavior', 'permissions', 'security', 'install', 'updates', 'signing', 'store', 'insights', 'distrib'];
function merge(saved) {
  const d = defaults();
  const out = { ...d, ...saved };
  for (const k of OBJ) out[k] = { ...d[k], ...((saved && saved[k]) || {}) };
  out.install.formats = { ...d.install.formats, ...((saved && saved.install && saved.install.formats) || {}) };
  out.install.archs = { ...d.install.archs, ...((saved && saved.install && saved.install.archs) || {}) };
  for (const k of ['internal', 'logins', 'builds']) if (!Array.isArray(out[k])) out[k] = [];
  if (!Array.isArray(out.behavior.spellcheck)) out.behavior.spellcheck = d.behavior.spellcheck;
  for (const k of ['jumpList', 'fileTypes']) if (!Array.isArray(out.behavior[k])) out.behavior[k] = [];
  out.signing.azure = { ...d.signing.azure, ...((saved && saved.signing && saved.signing.azure) || {}) };
  return out;
}
const getp = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function setp(o, p, v) {
  const ks = p.split('.');
  let x = o;
  for (const k of ks.slice(0, -1)) { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; }
  x[ks[ks.length - 1]] = v;
}
const slugWord = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(n >= 1048576 * 100 ? 0 : 1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);
const fmtDate = (t) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const APP_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+$/;
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
/** Domaine principal d'une adresse (app.monsite.com → monsite.com, shop.monsite.co.uk → monsite.co.uk). */
function siteDomain(host) {
  const parts = String(host || '').split('.').filter(Boolean);
  if (parts.length <= 2 || /^\d+$/.test(parts[parts.length - 1])) return parts.join('.');
  const sld = parts[parts.length - 2];
  const n = ['co', 'com', 'org', 'net', 'gouv', 'gov', 'ac', 'edu', 'or', 'ne'].includes(sld) && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-n).join('.');
}

// ---------------------------------------------------------------- petits éléments de formulaire
const card = (title, body, sub = '') => `<section class="ab-card"><h3>${title}${sub ? ` <small>${sub}</small>` : ''}</h3>${body}</section>`;
const hint = (t, cls = '') => `<p class="ab-hint${cls ? ` ${cls}` : ''}">${t}</p>`;
function inp(a, p, { placeholder = '', type = 'text', mono = false, min, max, list } = {}) {
  const v = getp(a, p);
  return `<input class="input${mono ? ' mono' : ''}" data-k="${p}" type="${type}" value="${esc(v == null ? '' : v)}" placeholder="${esc(placeholder)}" spellcheck="false"${min != null ? ` min="${min}"` : ''}${max != null ? ` max="${max}"` : ''}${list ? ` list="${list}"` : ''}>`;
}
const field = (label, control, help = '') => `<label class="field"><span>${label}</span>${control}</label>${help ? hint(help) : ''}`;
function seg(a, p, options, cls = 'wide') {
  const cur = String(getp(a, p));
  return `<div class="seg ${cls}" role="radiogroup">${Object.entries(options).map(([v, l]) => `<button type="button" role="radio" aria-checked="${cur === v}" class="${cur === v ? 'on' : ''}" data-seg="${p}" data-v="${esc(v)}">${l}</button>`).join('')}</div>`;
}
function tog(a, p, label, sub = '', { disabled = false } = {}) {
  return `<label class="tog-row${disabled ? ' dsk-off' : ''}"><span class="tog-text"><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-k="${p}" ${getp(a, p) ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="tog" aria-hidden="true"></span></label>`;
}
const chip = (a, p, label, title = '') => `<label class="ab-chip"${title ? ` title="${esc(title)}"` : ''}><input type="checkbox" data-k="${p}" ${getp(a, p) ? 'checked' : ''}><span>${label}</span></label>`;
function colorRow(a, p) {
  const v = getp(a, p) || '#ffffff';
  return `<div class="ab-color-row"><input type="color" data-k="${p}" value="${esc(v)}"><input class="input" data-k="${p}" value="${esc(v)}" spellcheck="false" maxlength="7"></div>`;
}

// ---------------------------------------------------------------- l'espace
class DesktopSpace {
  constructor(el) {
    this.el = el;
    const st = settings.desktop && Array.isArray(settings.desktop.apps) ? settings.desktop : { apps: [], current: null };
    st.apps = st.apps.map(merge);
    if (!st.apps.length) st.apps.push(defaults());
    if (!st.apps.some((x) => x.id === st.current)) st.current = st.apps[0].id;
    st.section = SECTIONS.some((s) => s[0] === st.section) ? st.section : 'source';
    st.preview = modeOf(st.preview);
    settings.desktop = st;
    this.status = null;
    this.building = false;
    this.progress = null;
    this.logLines = [];
    this.result = null;
    this.error = '';
    this.icons = [];
    this.cert = null;
    this.inspecting = false;
    this.render();
    this.init();
  }

  get st() { return settings.desktop; }
  get cfg() { return this.st.apps.find((x) => x.id === this.st.current) || this.st.apps[0]; }
  get section() { return this.st.section; }
  set section(v) { this.st.section = v; }
  save() { saveSettings(); }
  saveSoon() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.save(), 400); }

  async init() {
    if (!DesktopSpace.listening) {
      DesktopSpace.listening = true;
      api.on('desktop:progress', (p) => { const s = state.desktop; if (s) s.onProgress(p); });
      api.on('desktop:log', (l) => { const s = state.desktop; if (s) s.onLog(l); });
    }
    await this.refreshStatus();
  }
  async refreshStatus() {
    try { this.status = await api.invoke('desktop:status'); } catch (e) { this.status = { error: e.message || String(e) }; }
    this.renderTools();
    if (this.section === 'build') this.renderForm();
    // NEXORA #087 : applications de l'offre (logiciel réservé, constructions du mois).
    await refreshOffer();
    this.renderBuildBar();
  }
  /** Rafraîchir l'espace (F5, bouton de la barre d'outils, petits boutons des panneaux). */
  async refresh(scope = 'space') {
    if (scope === 'nav') { this.renderApps(); this.renderNav(); return; }
    if (scope === 'form') { this.renderForm(); return; }
    if (scope === 'preview') { this.renderPreview(); return; }
    this.render();
    await this.refreshStatus();
  }
  goSection(id) { this.section = id; this.save(); this.renderNav(); this.renderForm(); }

  // ------------------------------------------------------------ rendu général
  render() {
    this.el.innerHTML = `
      <div class="ab dsk">
        <nav class="ab-nav">
          <div class="ab-apps"></div>
          <div class="ab-sections">${SECTIONS.map(([id, t, i, s]) => `
            <button class="ab-sec" data-sec="${id}" title="${esc(t)} — ${esc(s)}">${ico(i, 17)}<span><b>${esc(t)}</b><small>${esc(s)}</small></span></button>`).join('')}
          </div>
        </nav>
        <main class="ab-main">
          <div class="ab-tools dsk-tools" hidden></div>
          <div class="ab-form"></div>
        </main>
        <aside class="ab-side">
          <div class="ab-prev-head"><div class="dsk-prev-seg"></div></div>
          <div class="dsk-stage"></div>
          <div class="ab-build dsk-build"></div>
        </aside>
      </div>`;
    if (!this.bound) {
      this.bound = true;
      this.el.addEventListener('click', (e) => this.onClick(e));
      this.el.addEventListener('input', (e) => this.onInput(e, false));
      this.el.addEventListener('change', (e) => this.onInput(e, true));
      this.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-enter]')) { e.preventDefault(); this.action(e.target.dataset.enter, e.target); } });
    }
    this.renderApps();
    this.renderNav();
    this.renderForm();
    this.renderTools();
    this.renderPreview();
    this.renderBuildBar();
    resizable($('.ab-nav', this.el), { key: 'dskNav', edge: 'right', min: 64, max: 340 });
    resizable($('.ab-side', this.el), { key: 'dskSide', edge: 'left', min: 300, max: () => Math.max(320, window.innerWidth * 0.5), onResize: () => this.layoutPreview() });
    if (this.ro) this.ro.disconnect();
    this.ro = new ResizeObserver(() => this.layoutPreview());
    this.ro.observe($('.dsk-stage', this.el));
  }
  renderApps() {
    const box = $('.ab-apps', this.el);
    if (!box) return;
    box.innerHTML = `
      <label class="ab-app-pick" title="Logiciel affiché"><select class="input" data-app-pick>${this.st.apps.map((x) => `<option value="${x.id}" ${x.id === this.cfg.id ? 'selected' : ''}>${esc(x.name || 'Sans nom')}</option>`).join('')}</select></label>
      <button class="icon-btn small" data-act="new" title="Nouveau logiciel" aria-label="Nouveau logiciel">${ico('plus', 15)}</button>
      <button class="icon-btn small" data-act="dup" title="Dupliquer ce logiciel (nouveau nom et nouvel identifiant)" aria-label="Dupliquer">${ico('copy', 15)}</button>
      <button class="icon-btn small" data-act="del" title="Supprimer ce logiciel de la liste" aria-label="Supprimer">${ico('trash', 15)}</button>`;
  }
  renderNav() {
    for (const b of this.el.querySelectorAll('.ab-sec')) b.classList.toggle('on', b.dataset.sec === this.section);
  }
  renderTools() {
    const box = $('.dsk-tools', this.el);
    if (!box) return;
    const s = this.status;
    const missing = [];
    if (s && !s.error) {
      if (!s.node || !s.node.ok) missing.push(s.node && s.node.version ? `l’environnement de construction (${esc(s.node.version)} est trop ancien)` : 'l’environnement de construction (≈ 35 Mo)');
      if (!s.kit || s.kit.version !== s.kit.expected) missing.push('les outils de construction (≈ 90 Mo)');
      if (!s.electron || !s.electron.cached || !s.electron.cached.length) missing.push('le moteur du logiciel (≈ 150 Mo)');
    }
    box.hidden = !missing.length || this.section === 'build';
    if (box.hidden) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="ab-banner">${ico('download', 18)}<div><b>Préparation automatique à la première construction</b>
      <p>Il manque ${missing.join(', ')}. NEXORA les télécharge depuis leurs sources officielles (empreintes vérifiées) lors de ta première construction, puis les garde pour les suivantes. Aucun droit d’administrateur n’est demandé.</p></div></div>`;
  }
  renderForm() {
    const box = $('.ab-form', this.el);
    if (!box) return;
    const a = this.cfg;
    const sec = SECTIONS.find((s) => s[0] === this.section) || SECTIONS[0];
    const scroll = box.dataset.shown === sec[0] ? box.scrollTop : 0;
    const body = this[`form_${sec[0]}`](a);
    box.dataset.shown = sec[0];
    box.innerHTML = `<header class="ab-head"><h2>${esc(sec[1])}</h2><p>${esc(sec[3])}</p></header>${body}`;
    box.scrollTop = scroll;
    this.renderTools();
    if (sec[0] === 'icon') this.paintIconPreviews();
    if (sec[0] === 'signing' && !this.cert) this.loadCert();
    if (sec[0] === 'signing' && !this.azure) this.loadAzure();
    if ((sec[0] === 'ready' || sec[0] === 'distrib') && !this.elSupport) this.loadElectron();
    if ((sec[0] === 'ready' || sec[0] === 'distrib') && !this.gh) this.loadGh();
    if (sec[0] === 'ready' && !this.cert) this.loadCert();
    if (sec[0] === 'ready' && !this.azure) this.loadAzure();
  }

  // ------------------------------------------------------------ sections
  form_source(a) {
    const s = a.source;
    const intro = !s.url && !s.dir ? `<div class="ab-banner dsk-intro">${ico('display', 18)}<div><b>Un vrai logiciel Windows, installable et désinstallable</b>
      <p>Pars d’un site en ligne, d’un dossier de site ou d’un projet de bureau. NEXORA produit un installateur Windows (menu Démarrer, bureau, désinstallation depuis les paramètres), avec ses réglages de sécurité : bac à sable, liens externes dans le navigateur, autorisations contrôlées, exécutable verrouillé.</p></div></div>` : '';
    let detail = '';
    if (s.kind === 'url') {
      const ins = a.inspect;
      const http = /^http:/i.test(s.url);
      detail = card('Adresse du site', `
        ${field('Adresse de départ', `<div class="ab-row">${inp(a, 'source.url', { placeholder: 'https://monsite.com/' })}<button class="btn" data-act="inspect" ${this.inspecting ? 'aria-busy="true"' : ''}>${ico('sparkle', 14)}<span>${this.inspecting ? 'Analyse…' : 'Reconnaître le site'}</span></button></div>`)}
        ${http ? hint(`${ico('warn', 13)} Adresse en http : les échanges ne sont pas chiffrés. Utilise https si ton site le permet.`, 'bad') : ''}
        ${hint('« Reconnaître le site » lit son nom, sa description, son logo et ses couleurs pour remplir les autres sections.')}
        ${ins ? `<div class="dsk-inspect">
          <span class="${ins.https ? 'ok' : 'warn'}">${ico(ins.https ? 'lock' : 'warn', 13)}${ins.https ? 'HTTPS' : 'Sans HTTPS'}</span>
          <span class="${ins.certificate !== false ? 'ok' : 'warn'}">${ico(ins.certificate !== false ? 'pass' : 'warn', 13)}${ins.certificate !== false ? 'Certificat valide' : 'Certificat invalide'}</span>
          <span class="${ins.manifest ? 'ok' : ''}">${ico(ins.manifest ? 'pass' : 'info', 13)}${ins.manifest ? 'Manifeste d’application' : 'Pas de manifeste'}</span>
          ${ins.title ? `<small>${esc(ins.title)}</small>` : ''}
        </div>` : ''}`)
        + card('Domaines de l’application', `
        ${hint('Les liens vers ces domaines restent dans le logiciel ; les autres s’ouvrent dans le navigateur par défaut. Le domaine de l’adresse de départ en fait toujours partie.')}
        ${this.domainsHtml(a)}
        <div class="ab-row"><input class="input mono" data-new-domain data-enter="add-domain" placeholder="exemple.com ou *.exemple.com" spellcheck="false"><button class="btn" data-act="add-domain">${ico('plus', 14)}<span>Ajouter</span></button></div>
        <div class="field"><span>Connexion avec un service tiers (reste dans le logiciel)</span><div class="dsk-chips">${LOGINS.map(([id, l]) => `<label class="ab-chip"><input type="checkbox" data-login="${id}" ${a.logins.includes(id) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>`);
    } else {
      const an = s.analysis;
      const pick = `<div class="ab-pick"><div><b>${esc(s.dir ? s.dir.split(/[\\/]/).filter(Boolean).pop() : 'Aucun dossier choisi')}</b><small>${esc(s.dir || (s.kind === 'electron' ? 'Choisis le dossier qui contient la configuration du projet de bureau.' : 'Choisis le dossier du site ou la racine du projet web.'))}</small></div>
        <div class="ab-row">${s.dir ? `<button class="btn small" data-act="reanalyze" title="Analyser de nouveau">${ico('refreshCw', 13)}</button>` : ''}<button class="btn" data-act="pick-source">${ico('folderOpen', 14)}<span>${s.dir ? 'Changer…' : 'Choisir le dossier…'}</span></button></div></div>`;
      let info = '';
      if (an) {
        const head = `<p class="${an.kind === 'unsupported' ? 'bad' : 'ok'}">${ico(an.kind === 'unsupported' ? 'warn' : 'pass', 13)} ${esc(an.unsupported ? an.unsupported.title : an.label)}</p>`;
        const warns = (an.warnings || []).map((w) => hint(`${ico('info', 12)} ${esc(w)}`)).join('');
        if (an.kind === 'unsupported') info = `${head}${hint(esc(an.unsupported.message))}`;
        else if (s.kind === 'electron') {
          const e = an.electron || {};
          info = `${head}<ul class="ab-feat"><li>Moteur détecté${e.main ? ` · fichier principal ${esc(e.main)}` : ''}</li><li>${e.configFile ? `Configuration de construction détectée : ${esc(e.configFile)}` : 'NEXORA appliquera ses réglages recommandés.'}</li></ul>
            ${field('Commande de préparation (avant l’emballage)', inp(a, 'source.prepareCmd', { placeholder: 'npm run build', mono: true }), 'Compile le code (TypeScript, Vite…) avant l’emballage. Laisse vide si le projet est prêt.')}
            ${e.builder && !e.forge ? tog(a, 'source.useProjectConfig', 'Utiliser la configuration du projet', 'Formats, icône et installateur définis par le projet. Sinon : réglages de NEXORA (sections Installation, Sécurité…).') : ''}${warns}`;
        } else if (an.kind === 'web') {
          info = `${head}
            ${tog(a, 'source.build', 'Construire le site avant l’emballage', `Installe les dépendances si besoin (${esc(an.pm || 'npm')}), puis lance la commande ci-dessous.`)}
            <div class="ab-grid2">${field('Commande de construction', inp(a, 'source.buildCmd', { placeholder: 'npm run build', mono: true }))}${field('Dossier produit', inp(a, 'source.webDir', { placeholder: 'dist', mono: true, list: 'dsk-webdirs' }))}</div>
            <datalist id="dsk-webdirs">${(an.webDirs || []).map((d) => `<option value="${esc(d)}">`).join('')}</datalist>${warns}`;
        } else {
          info = `${head}${field('Dossier du site (contient index.html)', inp(a, 'source.webDir', { placeholder: '(racine du dossier)', mono: true, list: 'dsk-webdirs' }))}<datalist id="dsk-webdirs">${(an.webDirs || []).map((d) => `<option value="${esc(d)}">`).join('')}</datalist>${warns}`;
        }
      }
      detail = card(s.kind === 'electron' ? 'Projet de bureau' : 'Dossier du site ou du projet', `${pick}${info}`)
        + (s.kind === 'folder' ? card('Pages et liens', `${hint('Le site est servi à l’adresse privée app://local : ses liens internes restent dans le logiciel et les liens vers Internet s’ouvrent dans le navigateur. Ajoute ici les domaines de tes API ou services à garder dans le logiciel (fenêtres de connexion, paiement).')}${this.domainsHtml(a)}<div class="ab-row"><input class="input mono" data-new-domain data-enter="add-domain" placeholder="api.monsite.com" spellcheck="false"><button class="btn" data-act="add-domain">${ico('plus', 14)}<span>Ajouter</span></button></div>`) : '');
    }
    return `${intro}${card('Type de source', `${seg(a, 'source.kind', Object.fromEntries(Object.entries(KINDS).map(([k, [l, i]]) => [k, `${ico(i, 14)}<span>${l}</span>`])))}${hint(KINDS[s.kind][2])}`)}${detail}`;
  }
  domainsHtml(a) {
    const host = a.source.kind === 'url' ? hostOf(a.source.url) : '';
    const base = host ? [host] : [];
    return `<div class="dsk-chips">${base.map((d) => `<span class="dsk-domain fixed" title="Adresse de départ">${ico('lock', 11)}${esc(d)}</span>`).join('')}${a.internal.map((d) => `<span class="dsk-domain">${esc(d)}<button data-act="del-domain" data-domain="${esc(d)}" title="Retirer ${esc(d)}" aria-label="Retirer ${esc(d)}">${ico('close', 10)}</button></span>`).join('')}${!base.length && !a.internal.length ? '<span class="ab-empty">Aucun domaine ajouté.</span>' : ''}</div>`;
  }
  form_identity(a) {
    const owner = this.st.apps.find((x) => x.id !== a.id && x.appId === a.appId);
    const idOk = APP_ID_RE.test(a.appId);
    return card('Nom et éditeur', `
      ${field('Nom du logiciel', inp(a, 'name', { placeholder: 'Mon logiciel' }), 'Affiché dans le menu Démarrer, la barre des tâches, l’installateur et les paramètres de Windows.')}
      ${field('Description', inp(a, 'description', { placeholder: 'Ce que fait le logiciel, en une phrase' }))}
      <div class="ab-grid2">${field('Éditeur', inp(a, 'publisher', { placeholder: 'Ton nom ou celui de ton entreprise' }))}${field('E-mail de contact (facultatif)', inp(a, 'email', { placeholder: 'contact@monsite.com', type: 'email' }))}</div>
      ${field('Site web', inp(a, 'homepage', { placeholder: 'https://monsite.com' }), 'Lien « Site web » du menu Aide et page d’assistance dans les paramètres de Windows.')}
      ${field('Copyright', inp(a, 'copyright', { placeholder: `Copyright © ${new Date().getFullYear()} ${a.publisher || a.name}` }))}`)
      + card('Version', `
      <div class="ab-row">${inp(a, 'version', { placeholder: '1.0.0', mono: true })}<button class="btn small" data-act="bump" data-part="2">+ correctif</button><button class="btn small" data-act="bump" data-part="1">+ mineure</button><button class="btn small" data-act="bump" data-part="0">+ majeure</button></div>
      ${VERSION_RE.test(a.version) ? hint('Augmente la version à chaque publication : l’installateur remplace alors l’ancienne version sans toucher aux données de l’utilisateur.') : hint(`${ico('warn', 12)} Utilise la forme 1.0.0 (trois nombres).`, 'bad')}`)
      + card('Identifiant', `
      <div class="ab-row">${inp(a, 'appId', { mono: true, placeholder: 'com.monentreprise.monlogiciel' })}<button class="btn small" data-act="suggest-id" title="Proposer un identifiant libre">${ico('sparkle', 13)}<span>Proposer</span></button></div>
      ${!idOk ? hint(`${ico('warn', 12)} Forme attendue : com.monentreprise.monlogiciel (lettres, chiffres, points).`, 'bad') : owner ? hint(`${ico('warn', 12)} Cet identifiant est déjà celui de « ${esc(owner.name)} » : les deux logiciels se remplaceraient à l’installation. Choisis-en un autre.`, 'bad') : hint('Ne le change plus après la première publication : Windows s’en sert pour les mises à jour, les raccourcis et les notifications. Le dossier des données du logiciel porte aussi ce nom.')}`)
      + card('Langue', `${seg(a, 'lang', { auto: 'Celle de Windows', fr: 'Français', en: 'Anglais' })}${hint('Menus, fenêtres de choix et pages d’état du logiciel. L’installateur suit toujours la langue de Windows.')}`);
  }
  form_icon(a) {
    const ic = a.icon;
    const logos = [...this.icons, ...((a.inspect && a.inspect.logos) || []).map((l) => ({ name: l.kind, remote: l.src }))].slice(0, 8);
    return card('Image', `
      <div class="dsk-icon-edit">
        <div class="dsk-icon-big"><img data-icon-prev="256" alt="Icône du logiciel"></div>
        <div class="dsk-icon-ctl">
          <div class="ab-row"><button class="btn" data-act="pick-icon">${ico('image', 14)}<span>Choisir une image…</span></button>${ic.image ? `<button class="btn" data-act="clear-icon">${ico('close', 13)}<span>Initiales</span></button>` : ''}</div>
          ${hint('PNG, SVG, JPEG ou WebP, carré, d’au moins 512 × 512 px. Sans image, l’icône affiche les initiales du nom.')}
          ${!ic.image ? field('Initiales', `<input class="input" data-k="icon.letter" maxlength="2" value="${esc(ic.letter)}" placeholder="${esc(initials(a.name))}">`) : ''}
          ${logos.length ? `<div class="field"><span>Trouvées dans ${a.source.kind === 'url' ? 'le site' : 'le projet'}</span><div class="dsk-logos">${logos.map((l, i) => `<button class="dsk-logo" data-act="use-logo" data-i="${i}" title="${esc(l.name || '')}">${l.dataUrl ? `<img src="${esc(l.dataUrl)}" alt="">` : ico('download', 16)}</button>`).join('')}</div></div>` : ''}
        </div>
      </div>`)
      + card('Forme et fond', `
      ${seg(a, 'icon.shape', { none: 'Aucune (transparente)', rounded: 'Carré arrondi', circle: 'Cercle', square: 'Carré' })}
      <div class="ab-grid2">${field('Couleur de fond', colorRow(a, 'icon.bg'))}${field(`Marge : ${ic.padding} %`, `<input type="range" min="0" max="30" step="1" data-k="icon.padding" value="${ic.padding}">`)}</div>
      ${hint('Windows 11 affiche les icônes sans cadre : « Aucune » convient à un logo détouré ; un fond coloré convient à un logo sur fond plein.')}`)
      + card('Aperçu sur Windows', `<div class="dsk-icon-sizes">${[16, 24, 32, 48].map((s) => `<figure><div class="dsk-sz light"><img data-icon-prev="${s}" width="${s}" height="${s}" alt=""></div><div class="dsk-sz dark"><img data-icon-prev="${s}" width="${s}" height="${s}" alt=""></div><figcaption>${s} px</figcaption></figure>`).join('')}</div>${hint('Barre des tâches, menu Démarrer, explorateur et zone de notification, en thème clair et sombre.')}`);
  }
  async paintIconPreviews() {
    const a = this.cfg;
    const key = JSON.stringify([a.icon, a.name]);
    this.iconKey = key;
    const urls = {};
    for (const s of [16, 24, 32, 48, 256]) {
      // eslint-disable-next-line no-await-in-loop
      urls[s] = await iconDataUrl(a.icon, a.name, s).catch(() => '');
      if (this.iconKey !== key) return;
    }
    for (const img of this.el.querySelectorAll('[data-icon-prev]')) img.src = urls[img.dataset.iconPrev] || '';
    this.iconUrl = urls[256];
    this.paintPreviewIcons();
  }
  form_window(a) {
    const w = a.window;
    const cur = `${w.width}x${w.height}`;
    return card('Taille', `
      <div class="st-chips">${SIZES.map(([v, l]) => `<button class="st-chip${cur === v ? ' on' : ''}" data-act="size" data-size="${v}">${l} · ${v.replace('x', ' × ')}</button>`).join('')}</div>
      <div class="ab-grid2">${field('Largeur (px)', inp(a, 'window.width', { type: 'number', min: 400, max: 7680 }))}${field('Hauteur (px)', inp(a, 'window.height', { type: 'number', min: 300, max: 4320 }))}</div>
      <div class="ab-grid2">${field('Largeur minimale', inp(a, 'window.minWidth', { type: 'number', min: 320 }))}${field('Hauteur minimale', inp(a, 'window.minHeight', { type: 'number', min: 240 }))}</div>
      ${hint('Sur un petit écran, la fenêtre ne dépasse jamais la zone utile.')}
      ${tog(a, 'window.remember', 'Mémoriser la taille et la position', 'Réouverture au même endroit ; recentrée si l’écran a été débranché.')}
      ${tog(a, 'window.resizable', 'Fenêtre redimensionnable')}`)
      + card('Démarrage', seg(a, 'window.start', { normal: 'Fenêtre normale', maximized: 'Agrandie', fullscreen: 'Plein écran' }))
      + card('Apparence', `
      ${field('Barre de menus', seg(a, 'window.menu', { auto: 'Masquée (touche Alt)', visible: 'Toujours visible', hidden: 'Aucune' }))}
      ${field('Thème', seg(a, 'window.theme', { system: 'Celui de Windows', light: 'Clair', dark: 'Sombre' }), 'Barre de titre, menus et préférence de thème transmise au site (prefers-color-scheme).')}
      ${field('Titre de la fenêtre', seg(a, 'window.title', { page: 'Titre de la page', fixed: 'Nom du logiciel' }))}
      <div class="ab-grid2">${field('Fond au chargement', colorRow(a, 'window.background'))}${field('Couleur du logiciel', colorRow(a, 'window.accent'))}</div>
      ${hint('Le fond évite l’éclair blanc au démarrage ; la couleur sert aux pages hors connexion et à l’image de l’installateur.')}`);
  }
  form_behavior(a) {
    const b = a.behavior;
    return card('Fenêtre et démarrage', `
      ${tog(a, 'behavior.singleInstance', 'Une seule instance', 'Relancer le logiciel ramène la fenêtre déjà ouverte au lieu d’en ouvrir une seconde.')}
      ${tog(a, 'behavior.tray', 'Icône dans la zone de notification', 'À côté de l’horloge, avec « Ouvrir » et « Quitter ».')}
      ${tog(a, 'behavior.closeToTray', 'La croix garde le logiciel ouvert', 'Utile pour une messagerie : les notifications continuent d’arriver. Un message l’explique la première fois.', { disabled: !b.tray })}
      ${tog(a, 'behavior.autostartOption', 'Proposer « Lancer au démarrage de l’ordinateur »', 'Case à cocher dans le menu Aide ; désactivée par défaut, au choix de l’utilisateur.')}`)
      + card('Liens et navigation', `
      ${field('Liens vers d’autres sites', seg(a, 'behavior.external', { browser: 'Navigateur par défaut', app: 'Fenêtre du logiciel' }), 'Recommandé : navigateur par défaut. Seuls les liens web, e-mail et téléphone sont ouverts.')}
      ${tog(a, 'behavior.offline', 'Page hors connexion', 'Message clair et reconnexion automatique dès que le réseau revient (au lieu d’une page blanche).')}
      ${tog(a, 'behavior.contextMenu', 'Menu du clic droit', 'Copier, coller, corrections orthographiques, ouvrir un lien dans le navigateur, enregistrer une image.')}
      ${tog(a, 'behavior.zoom', 'Mémoriser le zoom', 'Ctrl + molette, Ctrl + = et Ctrl + −.')}
      ${field('Lien d’ouverture (facultatif)', `<div class="ab-row"><span class="dsk-pre">${b.protocol ? esc(b.protocol) : 'monlogiciel'}://</span>${inp(a, 'behavior.protocol', { placeholder: 'monlogiciel', mono: true })}</div>`, 'Un lien comme monlogiciel://compte ouvre le logiciel sur la page /compte (enregistré par l’installateur).')}`)
      + card('Téléchargements', `${seg(a, 'behavior.downloads', { ask: 'Demander où enregistrer', auto: 'Dossier Téléchargements' })}${hint('Progression dans la barre des tâches et notification à la fin.')}`)
      + card('Correcteur orthographique', `<div class="dsk-chips">${SPELL.map(([id, l]) => `<label class="ab-chip"><input type="checkbox" data-spell="${id}" ${b.spellcheck.includes(id) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>${hint('Quatre langues au plus. Aucune case : correcteur désactivé.')}`)
      + card('Compatibilité des sites', `
      ${seg(a, 'behavior.userAgent', { chrome: 'Navigateur standard', electron: 'Application de bureau', custom: 'Personnalisé' })}
      ${b.userAgent === 'custom' ? inp(a, 'behavior.customUserAgent', { placeholder: 'Mozilla/5.0 …', mono: true }) : ''}
      ${hint('« Navigateur standard » utilise une identité web classique : les connexions, messageries et sites qui refusent les navigateurs intégrés restent compatibles.')}`)
      + this.win11Cards(a);
  }
  /** NEXORA #058 : pastille, raccourci global, actions de l'icône et types de fichiers. */
  win11Cards(a) {
    const b = a.behavior;
    const accelOk = !b.shortcut || ACCEL_RE.test(b.shortcut);
    const jl = b.jumpList.map((j, i) => `<div class="dsk-li"><span><b>${esc(j.label)}</b><small>${esc(j.path)}</small></span><button class="icon-btn small" data-act="jl-del" data-i="${i}" title="Retirer" aria-label="Retirer ${esc(j.label)}">${ico('close', 12)}</button></div>`).join('');
    const ft = b.fileTypes.map((f, i) => `<div class="dsk-li"><span><b>.${esc(f.ext)}</b><small>${esc(f.name)}</small></span><button class="icon-btn small" data-act="ft-del" data-i="${i}" title="Retirer" aria-label="Retirer .${esc(f.ext)}">${ico('close', 12)}</button></div>`).join('');
    return card('Intégration à Windows', `
      ${tog(a, 'behavior.badge', 'Pastille du nombre de non-lus', 'Quand le titre de la page commence par un nombre, comme « (3) Messages », une pastille rouge s’affiche sur l’icône de la barre des tâches.')}
      ${field('Raccourci clavier global (facultatif)', `<div class="ab-row">${inp(a, 'behavior.shortcut', { placeholder: 'CommandOrControl+Alt+M', mono: true })}<button class="btn small" data-act="shortcut-suggest">${ico('sparkle', 13)}<span>Proposer</span></button></div>`, accelOk ? 'Ouvre le logiciel depuis n’importe quel programme, ou le réduit s’il est déjà au premier plan. CommandOrControl = Ctrl sous Windows.' : '')}
      ${accelOk ? '' : hint(`Forme attendue : une à trois touches parmi Ctrl, Alt, Shift (ou CommandOrControl), puis une lettre, un chiffre ou F1 à F12. Exemple : CommandOrControl+Alt+M.`, 'bad')}
      <div class="field"><span>Actions au clic droit sur l’icône (5 au plus)</span>${jl ? `<div class="dsk-list">${jl}</div>` : '<span class="ab-empty">Aucune action.</span>'}</div>
      ${b.jumpList.length < 5 ? `<div class="dsk-add2"><input class="input" data-jl-label placeholder="Nouvelle commande" maxlength="40"><input class="input mono" data-jl-path placeholder="/commandes/nouvelle" maxlength="200" data-enter="jl-add" spellcheck="false"><button class="btn" data-act="jl-add">${ico('plus', 14)}<span>Ajouter</span></button></div>` : ''}
      ${hint('Chaque action ouvre le logiciel sur une page de ton site (chemin commençant par /). Elles apparaissent au clic droit sur l’icône de la barre des tâches et du menu Démarrer.')}`)
      + card('Types de fichiers', `
      ${ft ? `<div class="dsk-list">${ft}</div>` : hint('Aucun type de fichier : le logiciel n’apparaît pas dans « Ouvrir avec ».')}
      ${b.fileTypes.length < 5 ? `<div class="dsk-add2"><input class="input mono" data-ft-ext placeholder="devis" maxlength="12" spellcheck="false"><input class="input" data-ft-name placeholder="Devis" maxlength="40" data-enter="ft-add"><button class="btn" data-act="ft-add">${ico('plus', 14)}<span>Ajouter</span></button></div>` : ''}
      ${hint('Double-clic sur un fichier de ce type : le logiciel s’ouvre et la page reçoit le fichier par l’événement <code>nexora-open-file</code> (nom, taille, contenu ; jamais le chemin du PC).')}
      <pre class="dsk-code">window.addEventListener('nexora-open-file', (e) =&gt; {\n  const { name, size, dataUrl } = e.detail;\n  // ouvrir le fichier dans ton site\n});</pre>`);
  }
  form_security(a) {
    const row = ([k, l, d, opts]) => `<div class="dsk-perm"><div><b>${l}</b><small>${d}</small></div>${seg(a, `permissions.${k}`, Object.fromEntries((opts || ['allow', 'ask', 'deny']).map((o) => [o, PERM_LABEL[o]])), '')}</div>`;
    return `<div class="ab-banner">${ico('shield', 18)}<div><b>Toujours actif</b><p>Pages isolées, navigation et nouvelles fenêtres limitées aux domaines du logiciel, liens externes ouverts dans le navigateur, certificats invalides bloqués.</p></div></div>`
      + card('Autorisations demandées par le site', `${PERMS.map(row).join('')}${hint('Accordées seulement aux pages du logiciel, jamais aux sites tiers. « Demander » ouvre une fenêtre de choix, avec « Retenir mon choix ».')}`)
      + card('Verrouillage du logiciel', `
      ${tog(a, 'security.fuses', 'Verrouiller l’exécutable', 'Empêche de détourner le logiciel pour lancer d’autres programmes ou l’inspecter.')}
      ${tog(a, 'security.integrity', 'Vérifier l’intégrité des fichiers au démarrage', 'Le logiciel refuse de démarrer si ses fichiers ont été modifiés.', { disabled: !a.security.fuses })}
      ${tog(a, 'security.cookieEncryption', 'Chiffrer les cookies', 'Avec la clé du compte Windows. Ne le désactive pas après une publication : les sessions enregistrées seraient perdues.', { disabled: !a.security.fuses })}
      ${tog(a, 'security.httpsOnly', 'HTTPS uniquement', 'Les adresses http des domaines du logiciel s’ouvrent dans le navigateur.', { disabled: a.source.kind === 'url' && /^http:/i.test(a.source.url) })}
      ${tog(a, 'security.devtools', 'Outils de développement (F12)', 'Pour tester. Désactive-les pour la version publiée.')}`);
  }
  form_install(a) {
    const i = a.install;
    const oneClick = i.mode === 'oneclick';
    return card('Installateur', `
      ${seg(a, 'install.mode', { assisted: 'Assistant d’installation', oneclick: 'Installation en un clic' })}
      ${hint(oneClick ? 'Double-clic sur le fichier : le logiciel s’installe et se lance, sans question (comme Slack ou Discord).' : 'Pages Bienvenue, licence (si fournie), pour qui, dossier, installation et fin, aux couleurs de ton logiciel.')}
      ${field('Pour qui', seg(a, 'install.scope', oneClick ? { user: 'Moi seulement (sans droits administrateur)', machine: 'Tous les utilisateurs (droits administrateur)' } : { user: 'Au choix, « moi seulement » proposé', machine: 'Tous les utilisateurs' }))}
      ${!oneClick ? tog(a, 'install.changeDir', 'Choix du dossier d’installation') : ''}
      ${tog(a, 'install.desktop', 'Raccourci sur le bureau')}
      ${tog(a, 'install.startMenu', 'Raccourci dans le menu Démarrer', 'Indispensable aux notifications de Windows.')}
      ${tog(a, 'install.runAfter', 'Lancer le logiciel à la fin de l’installation')}
      ${oneClick ? tog(a, 'install.deleteData', 'Effacer les données à la désinstallation', 'Réglages, cookies et cache du logiciel. Sinon ils sont gardés pour une réinstallation.') : ''}
      ${!oneClick ? field('Licence (facultatif)', `<textarea class="input" data-k="install.license" rows="4" placeholder="Texte du contrat de licence, affiché avant l’installation">${esc(i.license)}</textarea>`) : ''}`)
      + card('Formats', `<div class="dsk-formats">${FORMATS.map(([k, l, d]) => `<label class="dsk-format"><input type="checkbox" data-k="install.formats.${k}" ${i.formats[k] ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>
      ${i.formats.msi ? hint(`${ico('info', 12)} Le MSI est construit à part (outil WiX téléchargé automatiquement) : s’il échoue, les autres formats restent prêts. Certains PC demandent d’activer le .NET Framework 3.5.`) : ''}
      ${i.formats.portable ? hint(`${ico('info', 12)} La version portable ne s’inscrit pas dans le menu Démarrer : Windows n’y affiche pas les notifications et elle ne se met pas à jour seule.`) : ''}
      <div class="field"><span>Processeurs</span><div class="dsk-chips">${chip(a, 'install.archs.x64', 'Intel et AMD 64 bits')}${chip(a, 'install.archs.arm64', 'ARM 64 bits (Snapdragon)')}</div></div>
      ${hint('Avec les deux, l’installateur contient les deux versions et choisit la bonne. Les systèmes 32 bits ne sont plus pris en charge.')}`)
      + card('Moteur et compression', `
      ${field('Moteur du logiciel', seg(a, 'install.electron', { latest: 'Dernière version stable (recommandé)', nexora: 'Celle de NEXORA' }), 'La dernière version contient les correctifs de sécurité les plus récents.')}
      ${field('Compression', seg(a, 'install.compression', { normal: 'Normale', maximum: 'Maximale', store: 'Rapide (essais)' }))}`)
      + card('Dossier des fichiers', `
      <div class="ab-pick"><div><b>${esc(a.out ? a.out : 'Documents › NEXORA › Logiciels')}</b><small>Chaque logiciel a son sous-dossier : installateurs, puis son code source dans « projet ».</small></div><div class="ab-row">${a.out ? `<button class="btn small" data-act="out-reset">Par défaut</button>` : ''}<button class="btn" data-act="pick-out">${ico('folderOpen', 14)}<span>Changer…</span></button></div></div>
      ${tog(a, 'install.ci', 'Construction automatique pour macOS et Linux', 'Ajoute au projet un fichier d’automatisation qui produit aussi les versions macOS (.dmg) et Linux (.AppImage) depuis le dépôt distant.')}`);
  }
  form_updates(a) {
    const u = a.updates;
    const files = `<code>${esc(slugName(a.name))}-Setup-${esc(a.version)}.exe</code>, son <code>.blockmap</code> et <code>latest.yml</code>`;
    return card('Mise à jour automatique', `
      ${seg(a, 'updates.mode', { none: 'Aucune', generic: 'Mon serveur web', github: 'Dépôt de versions' })}
      ${u.mode === 'none' ? hint(a.source.kind === 'url' ? 'Le contenu de ton site se met à jour tout seul. Pour mettre à jour le moteur du logiciel, reconstruis puis réinstalle une nouvelle version.' : 'Pour diffuser une nouvelle version, augmente le numéro de version, reconstruis et envoie le nouvel installateur.') : ''}
      ${u.mode === 'generic' ? `${field('Adresse du dossier de mise à jour', inp(a, 'updates.url', { placeholder: 'https://monsite.com/telechargements/monlogiciel', mono: true }))}${hint(`Après chaque construction, dépose ${files} dans ce dossier (en https).`)}` : ''}
      ${u.mode === 'github' ? `<div class="ab-grid2">${field('Propriétaire', inp(a, 'updates.owner', { placeholder: 'mon-compte', mono: true }))}${field('Dépôt (public)', inp(a, 'updates.repo', { placeholder: 'mon-logiciel', mono: true }))}</div>${hint(`Crée une version (Release) par numéro de version et joins-y ${files}.`)}` : ''}
      ${u.mode !== 'none' ? field('Canal', seg(a, 'updates.channel', { latest: 'Stable (tout le monde)', beta: 'Bêta (testeurs)' }), u.channel === 'beta' ? 'Ce logiciel reçoit aussi les versions bêta. Construis-en une version à part (autre identifiant) pour tes testeurs ; sur GitHub, elles sont publiées comme « pré-versions ».' : 'Les versions bêta ne sont proposées qu’aux logiciels construits sur le canal bêta.') : ''}
      ${u.mode !== 'none' ? tog(a, 'updates.checkOnStart', 'Vérifier au démarrage', 'Puis toutes les 6 heures. La mise à jour est téléchargée en arrière-plan, installée à la fermeture, et un message propose de redémarrer.') : ''}`)
      + (u.mode !== 'none' ? card('Bon à savoir', `<ul class="ab-feat"><li>Le module de mise à jour est ajouté au logiciel ; seuls les changements nécessaires sont téléchargés.</li><li>L’installateur doit garder le même identifiant (section Identité) d’une version à l’autre.</li><li>Un logiciel signé (section Signature) vérifie que la mise à jour vient bien de toi.</li></ul>`) : '');
  }
  form_signing(a) {
    const c = this.cert;
    const g = a.signing;
    const az = this.azure;
    const pfx = `<div class="ab-pick"><div><b>${c && c.ok ? esc(c.name) : 'Aucun certificat'}</b><small>${c && c.ok ? `Enregistré le ${esc(fmtDate(c.at))}, mot de passe protégé par le trousseau de Windows.` : c && c.error ? esc(c.error) : 'Fichier .pfx ou .p12 et son mot de passe.'}</small></div>
        <div class="ab-row">${c && c.ok ? `<button class="btn small" data-act="cert-remove">${ico('trash', 13)}<span>Retirer</span></button>` : ''}<button class="btn" data-act="cert-add">${ico('key', 14)}<span>${c && c.ok ? 'Remplacer…' : 'Ajouter un certificat…'}</span></button></div></div>
      ${hint('Depuis 2023, les autorités ne livrent plus de certificat en fichier .pfx : la clé reste sur une clé USB matérielle ou dans le cloud. Ce mode convient à un certificat déjà exporté ; sinon, choisis la signature Microsoft dans le cloud.')}`;
    const azure = `
      ${field('Région du compte de signature', `<select class="input" data-k="signing.azure.endpoint">${AZURE_REGIONS.map(([v, l]) => `<option value="${esc(v)}" ${g.azure.endpoint === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      <div class="ab-grid2">${field('Compte de signature', inp(a, 'signing.azure.account', { placeholder: 'mon-compte-signature', mono: true }))}${field('Profil de certificat', inp(a, 'signing.azure.profile', { placeholder: 'profil-public', mono: true }))}</div>
      ${field('Nom de l’éditeur (sur le certificat)', inp(a, 'signing.azure.publisherName', { placeholder: a.publisher || 'Mon entreprise' }), 'Exactement comme sur le profil de certificat (champ CN) : Windows l’affiche à la place de « Éditeur inconnu ».')}
      <div class="ab-pick"><div><b>${az && az.ok ? 'Identifiants Azure enregistrés' : 'Identifiants Azure'}</b><small>${az && az.ok ? `Application ${esc(String(az.client || '').slice(0, 8))}…, secret protégé par le trousseau de Windows (${esc(fmtDate(az.at))}).` : az && az.error ? esc(az.error) : 'Locataire (tenant), application (client) et secret d’une inscription d’application qui a le rôle « Trusted Signing Certificate Profile Signer ».'}</small></div>
        <div class="ab-row">${az && az.ok ? `<button class="btn small" data-act="azure-remove">${ico('trash', 13)}<span>Retirer</span></button>` : ''}<button class="btn" data-act="azure-add">${ico('key', 14)}<span>${az && az.ok ? 'Remplacer…' : 'Ajouter…'}</span></button></div></div>
      <ol class="dsk-howto"><li>Portail Azure › <b>Trusted Signing</b> (Artifact Signing) : crée un compte de signature (offre de base, environ 10 $ par mois).</li><li>Fais valider ton identité (entreprise ou personne), puis crée un <b>profil de certificat</b> « Public Trust ».</li><li>Microsoft Entra ID › <b>Inscriptions d’applications</b> : crée une application et un secret client, puis donne-lui le rôle « Trusted Signing Certificate Profile Signer » sur le compte.</li><li>Au premier envoi, electron-builder installe le module PowerShell de signature de Microsoft (connexion Internet nécessaire).</li></ol>`;
    return `<div class="ab-banner">${ico('info', 18)}<div><b>Pourquoi signer ?</b><p>Sans signature, Windows affiche « Windows a protégé votre ordinateur » au premier lancement d’un installateur téléchargé, avec « Éditeur inconnu ». Une signature fait apparaître ton nom et réduit l’avertissement ; depuis 2024, même un certificat EV ne le supprime plus d’office : la réputation SmartScreen se construit avec les téléchargements. La publication sur le Microsoft Store évite l’avertissement (le Store signe le paquet).</p></div></div>`
      + card('Signature du logiciel', `
      ${tog(a, 'signing.enabled', 'Signer l’installateur et l’exécutable', 'Avec horodatage : la signature reste valable après l’expiration du certificat.')}
      ${field('Méthode', seg(a, 'signing.mode', { azure: 'Microsoft, dans le cloud (recommandé)', pfx: 'Certificat (.pfx)' }))}
      ${g.mode === 'azure' ? azure : pfx}
      ${hint('Certificats et secrets restent dans le dossier de NEXORA sur ce PC ; ils ne sont jamais envoyés en ligne ni écrits dans le projet.')}`);
  }
  async loadAzure() {
    try { this.azure = await api.invoke('desktop:azure-info', { appId: this.cfg.appId }); } catch (e) { this.azure = { ok: false, error: e.message }; }
    if (this.section === 'signing' || this.section === 'ready') this.renderForm();
  }
  async loadCert() {
    try { this.cert = await api.invoke('desktop:cert-info', { appId: this.cfg.appId }); } catch (e) { this.cert = { ok: false, error: e.message }; }
    if (this.section === 'signing' || this.section === 'ready') this.renderForm();
  }
  form_build(a) {
    const s = this.status;
    const envRow = (ok, label, detail) => `<li class="${ok ? 'ok' : 'todo'}">${ico(ok ? 'pass' : 'download', 14)}<span><b>${label}</b><small>${detail}</small></span></li>`;
    const env = s && !s.error ? `<ul class="dsk-env">
        ${envRow(s.node && s.node.ok, 'Environnement de construction', s.node && s.node.ok ? 'Prêt' : s.autoInstall ? 'Installé automatiquement (≈ 35 Mo)' : 'À installer')}
        ${envRow(s.kit && s.kit.version === s.kit.expected, 'Outils de construction', s.kit && s.kit.version === s.kit.expected ? 'Installé' : 'Installé automatiquement (≈ 90 Mo, une fois)')}
        ${envRow(s.electron && s.electron.cached && s.electron.cached.length, 'Moteur du logiciel', s.electron && s.electron.cached && s.electron.cached.length ? 'Déjà téléchargé' : 'Téléchargé à la première construction (≈ 150 Mo par processeur)')}
      </ul>` : hint(esc((s && s.error) || 'Vérification des outils…'));
    const p = this.progress;
    const steps = this.building || (p && p.step === 'error') ? `<ol class="dsk-steps">${STEP_LABELS.filter(([id]) => id !== 'msi' || a.install.formats.msi).map(([id, l]) => {
      const order = STEP_LABELS.map((x) => x[0]);
      const cur = p ? order.indexOf(p.step) : -1;
      const me = order.indexOf(id);
      const cls = p && p.step === 'done' ? 'done' : me < cur ? 'done' : me === cur ? (p.step === 'error' ? 'bad' : 'now') : '';
      return `<li class="${cls}">${ico(cls === 'done' ? 'pass' : cls === 'bad' ? 'warn' : cls === 'now' ? 'sync' : 'chevronRight', 13)}<span>${l}${me === cur && p.label ? `<small>${esc(p.label)}${p.detail ? ` · ${esc(p.detail)}` : ''}</small>` : ''}</span></li>`;
    }).join('')}</ol>` : '';
    const last = this.result || (a.builds[0] && a.builds[0].files ? a.builds[0] : null);
    const res = last ? card(this.result ? 'Fichiers prêts' : 'Dernière construction', `${this.filesHtml(last)}
      <div class="ab-row">${last.outDir ? `<button class="btn" data-act="open-out" data-path="${esc(last.outDir)}">${ico('folderOpen', 14)}<span>Ouvrir le dossier</span></button>` : ''}${last.unpacked ? `<button class="btn" data-act="run-test" data-path="${esc(last.unpacked)}">${ico('play', 14)}<span>Tester sans installer</span></button>` : ''}${last.project ? `<button class="btn" data-act="open-out" data-path="${esc(last.project)}">${ico('code', 14)}<span>Code source</span></button>` : ''}</div>
      ${(last.warnings || []).map((w) => hint(`${ico('warn', 12)} ${esc(w)}`)).join('')}
      ${last.version === a.version && this.result ? hint('Pour publier une nouvelle version, augmente d’abord le numéro (section Identité).') : ''}`, last.at ? fmtDate(last.at) : '') : '';
    const hist = a.builds.length > 1 ? card('Historique', `<div class="dsk-hist">${a.builds.slice(0, 8).map((b) => `<div><b>${esc(b.version)}</b><small>${esc(fmtDate(b.at))} · ${Math.round((b.ms || 0) / 1000)} s</small>${b.outDir ? `<button class="btn small" data-act="open-out" data-path="${esc(b.outDir)}">${ico('folderOpen', 13)}</button>` : ''}</div>`).join('')}</div>`) : '';
    return card('Outils de construction', `${env}${hint('Construction dans un dossier de travail local de NEXORA (hors OneDrive) ; seuls les fichiers finaux sont copiés dans le dossier du logiciel.')}`)
      + card('Construire', `
      <p class="dsk-summary">${this.summary(a)}</p>
      <div class="ab-row">${this.building ? `<button class="btn" data-act="cancel">${ico('stop', 14)}<span>Annuler</span></button>` : `<button class="btn primary" data-act="build">${ico('rocket', 15)}<span>Construire le logiciel</span></button>`}${!this.building && a.source.kind !== 'electron' ? `<button class="btn" data-act="export">${ico('code', 14)}<span>Exporter le code source…</span></button>` : ''}</div>
      ${this.error && !this.building ? hint(`${ico('warn', 12)} ${esc(this.error)}`, 'bad') : ''}
      ${steps}
      ${this.logLines.length ? `<details class="ab-log" ${this.building ? '' : ''}><summary>Journal de construction (${this.logLines.length} lignes)</summary><pre>${esc(this.logLines.slice(-400).join('\n'))}</pre><div class="ab-row"><button class="btn small" data-act="log-open">${ico('external', 13)}<span>Journal complet</span></button></div></details>` : ''}`)
      + res + hist
      + card('Espace disque', `<div class="ab-row"><button class="btn" data-act="clear-cache">${ico('trash', 14)}<span>Vider le cache de construction</span></button></div>${hint('Retire les dossiers de travail et les versions de test. Les composants téléchargés sont gardés.')}`);
  }
  // ------------------------------------------------------------ NEXORA #058 : prêt pour la distribution
  async loadElectron() {
    const versions = [...new Set(this.cfg.builds.map((b) => b.electron).filter(Boolean))].slice(0, 5);
    try { this.elSupport = await api.invoke('desktop:electron-support', { versions }); } catch (e) { this.elSupport = { error: e.message || String(e), versions: {} }; }
    if (!this.elSupport.versions) this.elSupport.versions = {};
    if (this.section === 'ready' || this.section === 'distrib') this.renderForm();
  }
  async loadGh() {
    try { this.gh = await api.invoke('desktop:gh-token-info'); } catch (e) { this.gh = { ok: false, error: e.message }; }
    if (this.section === 'ready' || this.section === 'distrib') this.renderForm();
  }
  readyGroups(a) {
    const it = (state, label, detail = '', sec = '', go = 'Régler') => ({ state, label, detail, sec, go });
    const last = a.builds[0] || null;
    const groups = [];
    const id = [];
    if (!String(a.name || '').trim()) id.push(it('bad', 'Donne un nom au logiciel', '', 'identity'));
    if (!VERSION_RE.test(a.version)) id.push(it('bad', 'Version à corriger (forme 1.0.0)', '', 'identity'));
    if (!APP_ID_RE.test(a.appId)) id.push(it('bad', 'Identifiant à corriger (com.monentreprise.monlogiciel)', '', 'identity'));
    id.push(a.publisher ? it('ok', `Éditeur : ${esc(a.publisher)}`, '', 'identity', 'Voir') : it('warn', 'Indique l’éditeur', 'Affiché dans l’installateur, les paramètres de Windows et les fiches du Store et de winget.', 'identity'));
    id.push(a.description ? it('ok', 'Description renseignée', '', 'identity', 'Voir') : it('warn', 'Ajoute une description', 'Demandée par winget et le Microsoft Store.', 'identity'));
    id.push(a.icon.image ? it('ok', 'Icône personnalisée', '', 'icon', 'Voir') : it('warn', 'Icône en initiales', 'Ajoute ton logo : c’est lui que les utilisateurs repèrent dans la barre des tâches.', 'icon'));
    if (a.lastPublish && a.lastPublish.version === a.version) id.push(it('warn', `Version ${esc(a.version)} déjà publiée`, 'Augmente le numéro avant de publier de nouveau : sinon les logiciels installés ne voient pas la mise à jour.', 'identity'));
    groups.push(['Identité', id]);
    const g = a.signing;
    const sig = [];
    if (!g.enabled) sig.push(it('warn', 'Logiciel non signé', 'Windows affiche « Éditeur inconnu » et l’avertissement SmartScreen au premier lancement.', 'signing'));
    else if (g.mode === 'azure') {
      const okF = /^https:\/\/[a-z0-9]+\.codesigning\.azure\.net\/?$/.test(g.azure.endpoint) && g.azure.account && g.azure.profile && g.azure.publisherName;
      sig.push(okF ? it('ok', `Signature Microsoft dans le cloud (${esc(g.azure.publisherName)})`, '', 'signing', 'Voir') : it('bad', 'Signature dans le cloud : compte, profil ou éditeur à indiquer', '', 'signing'));
      if (this.azure && !this.azure.ok) sig.push(it('bad', 'Identifiants Azure à enregistrer', '', 'signing', 'Ajouter'));
    } else sig.push(this.cert && this.cert.ok ? it('ok', `Signé avec ${esc(this.cert.name)}`, '', 'signing', 'Voir') : it('bad', 'Signature activée sans certificat', '', 'signing', 'Ajouter'));
    if (a.install.formats.appx) sig.push(it('info', 'Paquet Microsoft Store', 'Signé par le Store à la publication : pas d’avertissement SmartScreen pour les utilisateurs du Store.', 'distrib', 'Voir'));
    groups.push(['Signature et confiance', sig]);
    const sec = [];
    if (a.security.devtools) sec.push(it('bad', 'Outils de développement (F12) activés', 'Désactive-les pour la version publiée.', 'security'));
    if (!a.security.fuses) sec.push(it('warn', 'Exécutable non verrouillé', 'Le logiciel pourrait être détourné pour lancer d’autres programmes.', 'security'));
    if (!a.security.httpsOnly && !(a.source.kind === 'url' && /^http:/i.test(a.source.url))) sec.push(it('warn', 'HTTPS non imposé', '', 'security'));
    if (!sec.length) sec.push(it('ok', 'Réglages de sécurité recommandés', 'Exécutable verrouillé, HTTPS imposé, outils de développement désactivés.', 'security', 'Voir'));
    groups.push(['Sécurité', sec]);
    const up = [];
    if (a.updates.mode === 'none') up.push(it(a.source.kind === 'url' ? 'info' : 'warn', 'Pas de mise à jour automatique', a.source.kind === 'url' ? 'Le contenu du site se met à jour seul ; le moteur du logiciel, seulement par réinstallation.' : 'Les utilisateurs devront réinstaller chaque nouvelle version.', 'updates'));
    else {
      up.push(it('ok', a.updates.mode === 'github' ? `Mises à jour par GitHub (${esc(a.updates.owner)}/${esc(a.updates.repo)})` : 'Mises à jour par ton serveur web', a.updates.channel === 'beta' ? 'Canal bêta.' : '', 'updates', 'Voir'));
      if (a.updates.mode === 'github' && this.gh && !this.gh.ok) up.push(it('warn', 'Jeton GitHub absent', 'Nécessaire pour publier la mise à jour depuis NEXORA (section Distribution).', 'distrib', 'Ajouter'));
    }
    if (a.install.formats.portable && !a.install.formats.nsis) up.push(it('warn', 'Version portable seule', 'Elle ne se met pas à jour seule et n’affiche pas les notifications de Windows.', 'install'));
    groups.push(['Mises à jour', up]);
    const bd = [];
    if (!last) bd.push(it('bad', 'Logiciel jamais construit', '', 'build', 'Construire'));
    else if (last.version !== a.version) bd.push(it('warn', `Version ${esc(a.version)} pas encore construite`, `Dernière construction : ${esc(last.version)}, le ${esc(fmtDate(last.at))}.`, 'build', 'Construire'));
    else bd.push(it('ok', `Version ${esc(a.version)} construite le ${esc(fmtDate(last.at))}`, (last.files || []).filter((f) => f.kind !== 'update').map((f) => esc(f.name)).join(', '), 'build', 'Voir'));
    const el = last && last.electron;
    const sup = el && this.elSupport && this.elSupport.versions ? this.elSupport.versions[el] : null;
    if (!el) bd.push(it('info', 'Moteur du logiciel : connu après la construction', '', 'build', 'Voir'));
    else if (!sup) bd.push(it('info', `Electron ${esc(el)}`, this.elSupport && this.elSupport.error ? 'Calendrier de prise en charge indisponible (connexion nécessaire).' : 'Vérification de la prise en charge…', 'distrib', 'Voir'));
    else if (sup.state === 'ended') bd.push(it('bad', `Electron ${esc(el)} n’est plus suivi`, `Plus de correctifs de sécurité${sup.eol ? ` depuis le ${esc(new Date(sup.eol).toLocaleDateString('fr-FR'))}` : ''} : reconstruis avec la dernière version (${esc(sup.newest || 'récente')}).`, 'distrib', 'Reconstruire'));
    else if (sup.state === 'soon') bd.push(it('warn', `Electron ${esc(el)} : fin du suivi le ${esc(new Date(sup.eol).toLocaleDateString('fr-FR'))}`, 'Prévois une reconstruction avec une version plus récente.', 'distrib', 'Voir'));
    else bd.push(it('ok', `Electron ${esc(el)} encore suivi`, sup.eol ? `Correctifs de sécurité jusqu’au ${esc(new Date(sup.eol).toLocaleDateString('fr-FR'))}.` : '', 'distrib', 'Voir'));
    groups.push(['Construction', bd]);
    const ds = [];
    if (a.install.formats.appx && (!/^[A-Za-z0-9.-]{3,50}$/.test(a.store.identityName) || !/^CN=.+/.test(a.store.publisher))) ds.push(it('bad', 'Microsoft Store : identité du paquet à indiquer', '', 'distrib'));
    ds.push(a.insights.enabled && a.insights.key ? it('ok', 'Statistiques et plantages envoyés à ton compte', '', 'insights', 'Voir') : it('info', 'Statistiques et plantages désactivés', 'Active-les pour suivre les installations et corriger les plantages.', 'insights', 'Activer'));
    ds.push(it('info', 'Essai sur un Windows neuf', 'Installe le logiciel dans le Bac à sable Windows avant de le diffuser.', 'distrib', 'Essayer'));
    groups.push(['Distribution', ds]);
    return groups;
  }
  form_ready(a) {
    const groups = this.readyGroups(a);
    const all = groups.flatMap(([, g]) => g).filter((i) => i.state !== 'info');
    const ok = all.filter((i) => i.state === 'ok').length;
    const bad = all.filter((i) => i.state === 'bad').length;
    const warn = all.filter((i) => i.state === 'warn').length;
    const pct = all.length ? Math.round((ok / all.length) * 100) : 0;
    const v = !bad ? ['ok', 'Prêt à distribuer', warn ? `${warn} point(s) à vérifier, sans blocage.` : 'Tout est en ordre.'] : ['bad', 'Pas encore prêt', `${bad} point(s) à régler avant de distribuer le logiciel.`];
    const icon = { ok: 'pass', warn: 'warn', bad: 'error', info: 'info' };
    return `<section class="ab-card"><div class="dskr-head dskr-${v[0]}"><div class="dskr-score"><b>${pct} %</b><small>${ok} sur ${all.length}</small></div><div class="dskr-verdict"><b>${v[1]}</b><span>${v[2]}</span><div class="dskr-meter"><i style="width:${pct}%"></i></div></div><button class="icon-btn small" data-act="ready-refresh" title="Vérifier de nouveau">${ico('refreshCw', 14)}</button></div>
      ${hint('Ce qui compte pour les utilisateurs et pour Windows avant de diffuser le logiciel. Chaque point mène à la section où le régler.')}</section>`
      + groups.map(([n, list]) => card(n, `<ul class="dskr-list">${list.map((i) => `<li class="dskr-${i.state}"><span class="dskr-ic">${ico(icon[i.state], 15)}</span><div><b>${i.label}</b>${i.detail ? `<small>${i.detail}</small>` : ''}</div>${i.sec ? `<button class="btn small" data-act="go" data-to="${i.sec}">${esc(i.go)}</button>` : ''}</li>`).join('')}</ul>`)).join('');
  }

  // ------------------------------------------------------------ NEXORA #058 : distribution
  publicUrl(a, file) {
    const n = String(file || '').split(/[\\/]/).pop().replace(/ /g, '.');
    if (a.updates.mode === 'github' && a.updates.owner && a.updates.repo) return `https://github.com/${a.updates.owner}/${a.updates.repo}/releases/download/v${a.version}/${encodeURIComponent(n)}`;
    if (a.updates.mode === 'generic' && /^https:/i.test(a.updates.url || '')) return `${a.updates.url.replace(/\/+$/, '')}/${encodeURIComponent(n)}`;
    return '';
  }
  form_distrib(a) {
    const last = a.builds[0] && a.builds[0].version === a.version ? a.builds[0] : null;
    const installers = last ? (last.files || []).filter((f) => ['nsis', 'msi', 'portable'].includes(f.kind)) : [];
    const d = a.distrib;
    const needBuild = hint(`Construis d’abord la version ${esc(a.version)} (section Construction).`);
    // 1. Mise à jour
    let pub;
    if (a.updates.mode === 'none') pub = `${hint('Choisis d’abord comment le logiciel se met à jour : ton serveur web ou un dépôt GitHub.')}<div class="ab-row"><button class="btn" data-act="go" data-to="updates">${ico('sync', 14)}<span>Mises à jour</span></button></div>`;
    else {
      const gh = a.updates.mode === 'github';
      const tok = this.gh;
      pub = `
        <div class="ab-grid2">${field(`Déploiement progressif : ${d.staging} %`, `<input type="range" min="5" max="100" step="5" data-k="distrib.staging" value="${d.staging}">`, d.staging < 100 ? `Proposée d’abord à ${d.staging} % des installations, tirées au hasard ; republie ensuite à 100 %.` : 'Proposée à toutes les installations.')}
        <div>${tog(a, 'distrib.mandatory', 'Mise à jour obligatoire', 'Pour un correctif de sécurité : pas de « Plus tard », le logiciel redémarre pour l’installer.')}</div></div>
        ${field('Nouveautés de la version', `<textarea class="input" data-k="distrib.notes" rows="3" placeholder="• Démarrage plus rapide&#10;• Corrections">${esc(d.notes)}</textarea>`, 'Affichées sur GitHub et transmises au logiciel avec la mise à jour.')}
        ${gh ? `<div class="ab-pick"><div><b>${tok && tok.ok ? `Jeton GitHub ${esc(tok.hint || '')}` : 'Jeton GitHub'}</b><small>${tok && tok.ok ? 'Chiffré par le trousseau de Windows, jamais affiché.' : 'Jeton à accès précis (fine-grained) limité à ce dépôt, autorisation « Contents : Read and write ».'}</small></div><div class="ab-row">${tok && tok.ok ? `<button class="btn small" data-act="gh-remove">${ico('trash', 13)}<span>Retirer</span></button>` : ''}<button class="btn" data-act="gh-add">${ico('key', 14)}<span>${tok && tok.ok ? 'Remplacer…' : 'Ajouter…'}</span></button><button class="btn small" data-external="https://github.com/settings/personal-access-tokens/new">${ico('external', 13)}<span>Créer</span></button></div></div>` : ''}
        ${last ? `<div class="ab-row"><button class="btn primary" data-act="publish" ${gh && !(tok && tok.ok) ? 'disabled' : ''}>${ico('upload', 14)}<span>${gh ? `Publier la version ${esc(a.version)} sur GitHub` : 'Préparer les fichiers à déposer'}</span></button></div>` : needBuild}
        ${gh ? '' : hint('NEXORA complète latest.yml (déploiement, obligation, nouveautés) ; dépose ensuite l’installateur, son .blockmap et latest.yml dans le dossier de mise à jour de ton serveur.')}
        ${a.lastPublish ? hint(`Dernière publication : version ${esc(a.lastPublish.version)}, le ${esc(fmtDate(a.lastPublish.at))}${a.lastPublish.url ? ` · <button class="link-btn" data-external="${esc(a.lastPublish.url)}">voir sur GitHub</button>` : ''}.`) : ''}`;
    }
    // 2. Bac à sable
    const sandbox = installers.length ? `<div class="dsk-files">${installers.map((f) => `<div class="dsk-file">${ico('download', 15)}<span><b>${esc(f.name)}</b><small>${esc(fmtSize(f.size || 0))}</small></span><button class="btn small" data-act="sandbox" data-path="${esc(f.path)}">${ico('play', 12)}<span>Essayer</span></button></div>`).join('')}</div>` : needBuild;
    // 3. winget
    const inst = installers.find((f) => f.kind === 'nsis') || installers[0];
    const auto = inst ? this.publicUrl(a, inst.name) : '';
    const winget = `
      ${field('Adresse publique de l’installateur (https)', inp(a, 'distrib.wingetUrl', { placeholder: auto || 'https://monsite.com/telechargements/MonLogiciel-Setup-1.0.0.exe', mono: true }), auto ? `Laisse vide pour utiliser ${esc(auto)}.` : 'winget télécharge l’installateur à cette adresse.')}
      <div class="ab-grid2">${field('Licence', inp(a, 'distrib.license', { placeholder: 'Propriétaire, Gratuit, MIT…' }))}${field('Identifiant winget', `<input class="input mono" value="${esc(wingetIdOf(a))}" disabled>`)}</div>
      ${inst ? `<div class="ab-row"><button class="btn" data-act="winget" data-path="${esc(inst.path)}">${ico('file', 14)}<span>Créer les fichiers winget</span></button></div>` : needBuild}
      ${hint('Trois fichiers YAML, rangés comme dans le dépôt microsoft/winget-pkgs. Pour les proposer : <code>wingetcreate submit &lt;dossier&gt;</code>, ou une demande de fusion sur GitHub. Les clients installent ensuite avec <code>winget install</code>.')}`;
    // 4. Store
    const st = a.store;
    const store = `
      ${tog(a, 'install.formats.appx', 'Construire le paquet Microsoft Store (MSIX)', 'En plus des autres formats. Le Store signe le paquet : pas de certificat nécessaire, pas d’avertissement SmartScreen.')}
      ${a.install.formats.appx ? `<div class="ab-grid2">${field('Nom d’identité du paquet', inp(a, 'store.identityName', { placeholder: '12345Entreprise.MonLogiciel', mono: true }))}${field('Éditeur (Publisher)', inp(a, 'store.publisher', { placeholder: 'CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX', mono: true }))}</div>${field('Nom affiché de l’éditeur', inp(a, 'store.publisherDisplayName', { placeholder: a.publisher || 'Mon entreprise' }))}` : ''}
      <ol class="dsk-howto"><li>Espace partenaires Microsoft : inscris-toi comme développeur d’applications (gratuit pour les particuliers selon les conditions actuelles de Microsoft).</li><li>Réserve le nom du logiciel, puis copie les valeurs de <b>Gestion des produits › Identité du produit</b> ci-dessus.</li><li>Construis, puis envoie le fichier .appx dans une nouvelle soumission, avec la fiche (description, captures, âge, confidentialité).</li></ol>
      <div class="ab-row"><button class="btn small" data-external="https://partner.microsoft.com/dashboard/apps-and-games/overview">${ico('external', 13)}<span>Espace partenaires</span></button></div>`;
    // 5. macOS et Linux
    const proj = a.builds[0] && a.builds[0].project;
    const mac = `
      ${tog(a, 'install.ci', 'Ajouter la construction automatique pour macOS et Linux', 'Fichier d’automatisation GitHub Actions ajouté au code source du logiciel.')}
      <ol class="dsk-howto"><li>Construis le logiciel : son code source est rangé dans le dossier « projet ».</li><li>Ouvre ce dossier dans le Dev Lab, puis envoie-le dans un dépôt GitHub (Git › Publier sur GitHub).</li><li>GitHub construit les versions macOS (.dmg) et Linux (.AppImage) à chaque envoi : récupère-les dans l’onglet Actions du dépôt.</li></ol>
      <div class="ab-row">${proj ? `<button class="btn" data-act="open-devlab" data-path="${esc(proj)}">${ico('code', 14)}<span>Ouvrir le projet dans le Dev Lab</span></button>` : ''}${a.updates.mode === 'github' && a.updates.owner && a.updates.repo ? `<button class="btn small" data-external="https://github.com/${esc(a.updates.owner)}/${esc(a.updates.repo)}/actions">${ico('external', 13)}<span>Actions du dépôt</span></button>` : ''}</div>
      ${hint('macOS : sans compte Apple Developer (99 $ par an), le .dmg n’est ni signé ni notarisé ; macOS demande alors un clic droit › Ouvrir.')}`;
    // 6. Electron
    const el = a.builds[0] && a.builds[0].electron;
    const sup = el && this.elSupport && this.elSupport.versions ? this.elSupport.versions[el] : null;
    const newest = this.elSupport && this.elSupport.newest;
    const eng = `<p class="dsk-summary">${el ? `Dernière construction avec Electron <b>${esc(el)}</b>` : 'Aucune construction pour l’instant'}${newest ? ` · dernière version stable : <b>${esc(newest)}</b>` : ''}</p>
      ${sup ? hint(sup.state === 'ended' ? `Cette version ne reçoit plus de correctifs de sécurité.` : sup.state === 'soon' ? `Fin du suivi le ${esc(new Date(sup.eol).toLocaleDateString('fr-FR'))}.` : `Version suivie${sup.eol ? ` jusqu’au ${esc(new Date(sup.eol).toLocaleDateString('fr-FR'))}` : ''}.`, sup.state === 'ended' ? 'bad' : '') : this.elSupport && this.elSupport.error ? hint('Calendrier de prise en charge indisponible pour l’instant (connexion nécessaire).') : ''}
      ${hint('Electron publie une version majeure toutes les 8 semaines et ne corrige les failles que des trois dernières : reconstruis tes logiciels au moins deux fois par an.')}
      <div class="ab-row"><button class="btn" data-act="rebuild-latest">${ico('refreshCw', 14)}<span>Reconstruire avec la dernière version</span></button></div>`;
    return card('Publier la mise à jour', pub, a.updates.mode === 'github' ? 'GitHub' : a.updates.mode === 'generic' ? 'serveur web' : '')
      + card('Essayer sur un Windows neuf', `${hint('Le Bac à sable Windows ouvre un Windows vierge et jetable, y installe le logiciel comme chez un client, puis s’efface à la fermeture (Windows 10 et 11 Professionnel ou Entreprise).')}${sandbox}`)
      + card('winget, le gestionnaire de paquets de Windows', winget)
      + card('Microsoft Store', store)
      + card('macOS et Linux', mac)
      + card('Moteur du logiciel', eng);
  }

  // ------------------------------------------------------------ NEXORA #058 : statistiques et plantages
  insLoad(force = false) {
    const i = this.cfg.insights;
    const k = `${i.app}|${i.days}`;
    if (!i.app || (!force && this.ins && this.ins.k === k) || this.insLoading === k) return;
    this.insLoading = k;
    supabase.rpc('app_insights_summary', { p_app: i.app, p_days: Number(i.days) || 30 }).then(({ data, error }) => {
      this.ins = { k, data: error ? null : data, error: error ? insExplain(error) : null, at: Date.now() };
    }, (e) => { this.ins = { k, data: null, error: insExplain(e), at: Date.now() }; }).then(() => {
      this.insLoading = null;
      if (this.section === 'insights') this.renderForm();
    });
  }
  form_insights(a) {
    const i = a.insights;
    const user = cloud.user;
    const stale = i.key && i.appId && i.appId !== a.appId;
    let h = card('Statistiques du logiciel', `
      ${hint('À chaque lancement et à chaque plantage, le logiciel installé envoie à ton compte NEXORA : un identifiant d’installation tiré au hasard, la version du logiciel et de Windows, la langue et, pour un plantage, sa cause. Rien d’autre ; données gardées 180 jours, visibles par toi seul.')}
      ${user ? '' : `<div class="ab-note">${ico('user', 15)}<span>Connecte-toi à ton compte NEXORA : les statistiques y sont rangées.</span><button class="btn small primary" data-act="ins-login">${ico('user', 13)}<span>Se connecter</span></button></div>`}
      ${tog(a, 'insights.enabled', 'Envoyer les statistiques et les plantages', 'Pris en compte à la prochaine construction.')}
      ${i.enabled && (!i.key || stale) ? `<div class="ab-row"><button class="btn small primary" data-act="ins-register" ${user && APP_ID_RE.test(a.appId) ? '' : 'disabled'}>${ico('cloud', 13)}<span>${stale ? 'Inscrire de nouveau (identifiant changé)' : 'Inscrire le logiciel sur mon compte'}</span></button></div>` : ''}
      ${i.enabled && i.key && !stale ? hint(`Logiciel inscrit : les premières données arrivent après la construction et l’installation.`) : ''}
      ${i.err ? hint(esc(i.err), 'bad') : ''}`);
    if (!i.app || !user) return h;
    const st = this.ins && this.ins.k === `${i.app}|${i.days}` ? this.ins : null;
    if (!st) this.insLoad();
    const head = `<div class="ab-row dskr-insh">${seg(a, 'insights.days', { 7: '7 jours', 30: '30 jours', 90: '90 jours' }, '')}<button class="icon-btn small" data-act="ins-refresh" title="Actualiser">${ico('refreshCw', 14)}</button></div>`;
    if (!st) return h + card('Tableau de bord', `${head}${hint('Lecture des statistiques…')}`);
    if (st.error) return h + card('Tableau de bord', `${head}${hint(esc(st.error), 'bad')}`);
    const d = st.data || {};
    const t = d.totals || {};
    const free = t.installs ? Math.max(0, 100 - (100 * (t.crashInstalls || 0)) / t.installs) : null;
    const kpi = (l, v, sub, cls = '') => `<div class="nxi-kpi ${cls}"><small>${l}</small><b>${v}</b><span>${sub}</span></div>`;
    const n = (x) => Number(x || 0).toLocaleString('fr-FR');
    h += card('Tableau de bord', `${head}<div class="nxi-kpis">${kpi('Installations actives', n(t.installs), `sur ${d.days || i.days} jours`)}${kpi('Lancements', n(t.launches), t.installs ? `${(t.launches / t.installs).toFixed(1).replace('.', ',')} par installation` : '—')}${kpi('Plantages', n(t.crashes), `${n(t.errors)} autre(s) erreur(s)`, t.crashes ? 'bad' : '')}${kpi('Sans plantage', free == null ? '—' : `${free.toFixed(1).replace('.', ',')} %`, 'des installations', free != null && free < 99 ? 'warn' : '')}</div>
      ${t.installs ? insChart(d.daily || []) : hint('Aucune donnée sur cette période : construis le logiciel avec l’option ci-dessus, installe-le et ouvre-le.')}`);
    if (t.installs) h += card('Répartition', `<div class="nxi-tbls">${insTable('Versions du logiciel', d.versions, ['version', 'crashes'])}${insTable('Versions de Windows', d.os, ['os'])}</div>`);
    const cr = d.crashes || [];
    h += card('Plantages et erreurs', cr.length ? `<div class="nxi-crashes">${cr.map((c, k) => `<details class="nxi-crashitem"${k === 0 ? ' open' : ''}><summary><span class="nxi-kind ${esc(c.kind)}">${c.kind === 'crash' ? 'Plantage' : 'Erreur'}</span><code>${esc(c.signature || '—')}</code><span class="nxi-meta">${n(c.count)} fois · ${n(c.installs)} installation(s)</span></summary>${c.detail && c.detail.message ? hint(esc(c.detail.message)) : ''}${c.detail && c.detail.stack ? `<pre class="nxi-stack">${esc(c.detail.stack)}</pre>` : ''}</details>`).join('')}</div>` : hint(`Aucun plantage sur cette période.`));
    return h;
  }

  summary(a) {
    const fm = FORMATS_ALL.filter(([k]) => a.install.formats[k]).map(([, l]) => l.toLowerCase());
    const ar = [a.install.archs.x64 ? 'Intel/AMD 64 bits' : '', a.install.archs.arm64 ? 'ARM 64 bits' : ''].filter(Boolean).join(' et ');
    const src = a.source.kind === 'url' ? (hostOf(a.source.url) || 'adresse à indiquer') : (a.source.dir ? a.source.dir.split(/[\\/]/).filter(Boolean).pop() : 'dossier à choisir');
    return `<b>${esc(a.name)}</b> ${esc(a.version)} · ${esc(src)} · ${esc(fm.join(', ') || 'installateur')} · ${esc(ar)}${a.signing.enabled ? ' · signé' : ''}`;
  }
  filesHtml(r) {
    const label = { nsis: 'Installateur', portable: 'Version portable', zip: 'Archive ZIP', msi: 'Paquet MSI', update: 'Mise à jour', appx: 'Paquet MSIX', squirrel: 'Paquet Squirrel' };
    return `<div class="dsk-files">${(r.files || []).map((f) => `<div class="dsk-file">${ico(f.kind === 'update' ? 'sync' : f.kind === 'zip' ? 'file' : 'download', 15)}<span><b>${esc(f.name)}</b><small>${esc(label[f.kind] || 'Fichier')} · ${esc(fmtSize(f.size || 0))}</small></span>
      ${['nsis', 'msi'].includes(f.kind) ? `<button class="btn small" data-act="install" data-path="${esc(f.path)}">${ico('play', 12)}<span>Installer</span></button>` : ''}<button class="btn small" data-act="reveal" data-path="${esc(f.path)}" title="Afficher dans l’explorateur" aria-label="Afficher dans l’explorateur">${ico('folderOpen', 13)}</button></div>`).join('')}</div>`;
  }

  // ------------------------------------------------------------ aperçu (panneau de droite)
  renderPreview() {
    const head = $('.dsk-prev-seg', this.el);
    const stage = $('.dsk-stage', this.el);
    if (!head || !stage) return;
    const a = this.cfg;
    const mode = modeOf(this.st.preview);
    head.innerHTML = `<div class="seg wide" role="radiogroup">${MODES.map(([v, l, t]) => `<button type="button" role="radio" aria-checked="${mode === v}" class="${mode === v ? 'on' : ''}" data-prev="${v}" title="${esc(t)}">${l}</button>`).join('')}</div>`;
    const dark = a.window.theme === 'dark' || (a.window.theme === 'system' && document.documentElement.dataset.theme === 'dark');
    const { html, note } = pcHtml(a, mode, { dark, webview: true });
    const name = esc(a.name || 'Mon logiciel');
    stage.innerHTML = `${html}<p class="dsk-dim">${note}</p><button class="btn small dsk-zoom-btn" data-act="zoom">${ico('eye', 13)}<span>Voir en grand</span></button>${mode === 'start' ? `<div class="dsk-apps-row"><img data-prev-icon alt=""><span><b>${name}</b><small>${esc(a.version)}${a.publisher ? ` · ${esc(a.publisher)}` : ''} · Paramètres › Applications installées</small></span><i>Désinstaller</i></div>` : ''}`;
    const cv = $('.dsk-sidebar', stage);
    if (cv) sidebarCanvas(a).then((c) => cv.getContext('2d').drawImage(c, 0, 0)).catch(() => {});
    this.paintPreviewIcons();
    if (!this.iconUrl) iconDataUrl(a.icon, a.name, 256).then((u) => { this.iconUrl = u; this.paintPreviewIcons(); }).catch(() => {});
    this.layoutPreview();
  }
  paintPreviewIcons() { if (this.iconUrl) for (const img of document.querySelectorAll('.dsk [data-prev-icon], .dsk-zoom [data-prev-icon]')) img.src = this.iconUrl; }
  /** Aperçu en grand : le même PC sur presque tout l'écran, avec les quatre vues (Échap ou la croix pour fermer). */
  openZoom() {
    this.closeZoom();
    const box = document.createElement('div');
    box.className = 'dsk-zoom';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Aperçu sur un PC Windows 11');
    document.body.append(box);
    this.zoomEl = box;
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.closest('[data-zclose]')) { this.closeZoom(); return; }
      const m = e.target.closest('[data-zprev]');
      if (m) { this.st.preview = m.dataset.zprev; this.save(); this.renderZoom(); this.renderPreview(); }
    });
    this.zoomKey = (e) => { if (e.key === 'Escape') this.closeZoom(); };
    document.addEventListener('keydown', this.zoomKey);
    this.zoomRO = new ResizeObserver(() => this.layoutZoom());
    this.zoomRO.observe(box);
    this.renderZoom();
  }
  renderZoom() {
    const box = this.zoomEl;
    if (!box) return;
    const a = this.cfg;
    const mode = modeOf(this.st.preview);
    const dark = a.window.theme === 'dark' || (a.window.theme === 'system' && document.documentElement.dataset.theme === 'dark');
    const { html, note } = pcHtml(a, mode, { dark, webview: true });
    box.innerHTML = `<div class="dsk-zoom-box"><div class="dsk-zoom-head"><b>${esc(a.name || 'Mon logiciel')} sur un PC Windows 11</b><div class="seg" role="radiogroup">${MODES.map(([v, l, t]) => `<button type="button" role="radio" aria-checked="${mode === v}" class="${mode === v ? 'on' : ''}" data-zprev="${v}" title="${esc(t)}">${l}</button>`).join('')}</div><button class="icon-btn" data-zclose title="Fermer (Échap)" aria-label="Fermer">${ico('close', 16)}</button></div><div class="dsk-zoom-stage">${html}<p class="dsk-dim">${note}</p></div></div>`;
    const cv = box.querySelector('.dsk-sidebar');
    if (cv) sidebarCanvas(a).then((c) => cv.getContext('2d').drawImage(c, 0, 0)).catch(() => {});
    this.paintPreviewIcons();
    this.layoutZoom();
  }
  layoutZoom() {
    const box = this.zoomEl;
    if (!box) return;
    const stage = box.querySelector('.dsk-zoom-stage');
    const pc = box.querySelector('.dsk-pc');
    const scr = box.querySelector('.pc-screen');
    const os = box.querySelector('.pc-os');
    if (!stage || !pc || !scr || !os) return;
    pc.style.maxWidth = `${Math.max(320, Math.floor((stage.clientHeight - 90) * 1.6) + 14)}px`;
    os.style.transform = `scale(${scr.clientWidth / SCREEN.w})`;
  }
  closeZoom() {
    if (this.zoomRO) { this.zoomRO.disconnect(); this.zoomRO = null; }
    if (this.zoomKey) { document.removeEventListener('keydown', this.zoomKey); this.zoomKey = null; }
    if (this.zoomEl) { this.zoomEl.remove(); this.zoomEl = null; }
  }
  /** Écran de 1536 × 960 mis à l'échelle : la largeur du panneau, sans dépasser sa hauteur. */
  layoutPreview() {
    const stage = $('.dsk-stage', this.el);
    const pc = $('.dsk-pc', this.el);
    const scr = $('.pc-screen', this.el);
    const os = $('.pc-os', this.el);
    if (!stage || !pc || !scr || !os) return;
    const extra = [...stage.children].filter((x) => x !== pc).reduce((h, x) => h + x.offsetHeight + 12, 0);
    const room = stage.clientHeight - 36 - extra - 30;
    pc.style.maxWidth = `${Math.max(260, Math.floor(room * 1.6) + 14)}px`;
    os.style.transform = `scale(${scr.clientWidth / SCREEN.w})`;
  }

  // ------------------------------------------------------------ barre de construction
  renderBuildBar() {
    const box = $('.dsk-build', this.el);
    if (!box) return;
    const a = this.cfg;
    const p = this.progress;
    const r = this.result;
    box.innerHTML = `${offerBanner(a)}
      <div class="ab-build-row dsk-build-formats">${FORMATS.map(([k, l, d]) => chip(a, `install.formats.${k}`, l, d)).join('')}</div>
      <div class="ab-build-row"><span class="dsk-build-sum">${esc(a.version)} · ${a.install.archs.x64 && a.install.archs.arm64 ? 'x64 et ARM64' : a.install.archs.arm64 ? 'ARM64' : 'x64'}${a.signing.enabled ? ' · signé' : ''}</span>
        ${this.building ? `<button class="btn ab-go" data-act="cancel">${ico('stop', 15)}<span>Annuler</span></button>` : `<button class="btn primary ab-go" data-act="build">${ico('rocket', 15)}<span>Construire le logiciel</span></button>`}</div>
      <div class="ab-progress" ${this.building ? '' : 'hidden'}><div class="ab-bar"><i style="width:${Math.round(((p && p.progress) || 0) * 100)}%"></i></div><span class="ab-step">${esc((p && p.label) || 'Préparation…')}${p && p.detail ? ` · ${esc(p.detail)}` : ''}</span></div>
      ${!this.building && r ? `<div class="ab-result"><p class="ok">${ico('pass', 13)} ${esc(a.name)} ${esc(r.version)} est prêt (${Math.round(r.ms / 1000)} s).</p>${this.filesHtml({ files: r.files.filter((f) => f.kind !== 'update') })}</div>` : ''}
      ${!this.building && this.error ? `<p class="ab-hint bad">${ico('warn', 12)} ${esc(this.error)}</p>` : ''}`;
  }
  onProgress(p) {
    this.progress = p;
    const bar = $('.dsk-build .ab-bar i', this.el);
    const lab = $('.dsk-build .ab-step', this.el);
    if (bar) bar.style.width = `${Math.round(p.progress * 100)}%`;
    if (lab) lab.textContent = `${p.label}${p.detail ? ` · ${p.detail}` : ''}`;
    if (this.section === 'build') {
      clearTimeout(this.progTimer);
      this.progTimer = setTimeout(() => this.renderForm(), 250);
    }
  }
  onLog(line) {
    this.logLines.push(line);
    if (this.logLines.length > 2000) this.logLines.splice(0, 500);
    const pre = this.section === 'build' && $('.ab-log pre', this.el);
    if (pre) { pre.textContent += `\n${line}`; pre.scrollTop = pre.scrollHeight; }
  }

  // ------------------------------------------------------------ actions
  onClick(e) {
    const sec = e.target.closest('.ab-sec[data-sec]');
    if (sec) { this.goSection(sec.dataset.sec); return; }
    const pv = e.target.closest('[data-prev]');
    if (pv) { this.st.preview = pv.dataset.prev; this.save(); this.renderPreview(); return; }
    const sg = e.target.closest('[data-seg]');
    if (sg) {
      this.set(sg.dataset.seg, sg.dataset.v);
      this.renderForm();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && !act.disabled) this.action(act.dataset.act, act);
  }
  onInput(e, committed) {
    const t = e.target;
    if (t.matches('[data-app-pick]')) { if (committed) this.selectApp(t.value); return; }
    if (t.matches('[data-login]')) { const a = this.cfg; a.logins = t.checked ? [...new Set([...a.logins, t.dataset.login])] : a.logins.filter((x) => x !== t.dataset.login); this.save(); return; }
    if (t.matches('[data-spell]')) {
      const a = this.cfg;
      let list = t.checked ? [...new Set([...a.behavior.spellcheck, t.dataset.spell])] : a.behavior.spellcheck.filter((x) => x !== t.dataset.spell);
      if (list.length > 4) { list = list.slice(0, 4); t.checked = false; toast('Quatre langues au plus pour le correcteur orthographique.', { kind: 'bad' }); }
      a.behavior.spellcheck = list;
      this.save();
      return;
    }
    const k = t.dataset && t.dataset.k;
    if (!k) return;
    let v = t.type === 'checkbox' ? t.checked : t.type === 'number' || t.type === 'range' ? Number(t.value) : t.value;
    if (t.type === 'color' || (k.endsWith('.bg') || k.endsWith('.background') || k.endsWith('.accent'))) {
      if (typeof v === 'string' && !/^#[0-9a-f]{6}$/i.test(v)) return;
      for (const o of this.el.querySelectorAll(`[data-k="${k}"]`)) if (o !== t) o.value = v;
    }
    if (t.type === 'number' && !Number.isFinite(v)) return;
    this.set(k, v, { quiet: !committed });
    // Réglages qui changent d'autres champs : formulaire redessiné quand la saisie est validée.
    if (committed && (t.type === 'checkbox' || t.tagName === 'SELECT' || /^(source\.(url|dir)|appId|version|install\.formats|icon\.padding|distrib\.staging|behavior\.shortcut)/.test(k))) this.renderForm();
  }
  set(path, value, { quiet = false } = {}) {
    const a = this.cfg;
    setp(a, path, value);
    if (path === 'name') { this.renderApps(); }
    if (path === 'behavior.tray' && !value) a.behavior.closeToTray = false;
    if (path === 'install.formats.nsis' || path.startsWith('install.formats.')) {
      if (!Object.values(a.install.formats).some(Boolean)) { a.install.formats.nsis = true; toast('Garde au moins un format : l’installateur est réactivé.'); this.renderForm(); }
    }
    if (path.startsWith('install.archs.') && !a.install.archs.x64 && !a.install.archs.arm64) { a.install.archs.x64 = true; this.renderForm(); }
    if (path === 'source.url') a.inspect = null;
    if (path.startsWith('icon.') || path === 'name' || path === 'version' || path === 'publisher' || path === 'window.accent') { this.iconUrl = null; if (this.section === 'icon') this.paintIconPreviews(); }
    if (path === 'icon.padding') { const lab = this.el.querySelector('[data-k="icon.padding"]'); if (lab) lab.closest('.field').querySelector('span').textContent = `Marge : ${value} %`; }
    if (path.startsWith('install.formats.')) for (const c of this.el.querySelectorAll(`[data-k="${path}"]`)) c.checked = Boolean(value);
    this.result = null;
    if (quiet) this.saveSoon(); else this.save();
    clearTimeout(this.prevTimer);
    this.prevTimer = setTimeout(() => { this.renderPreview(); if (!this.building) this.renderBuildBar(); }, quiet ? 350 : 0);
  }
  async action(name, btn) {
    const a = this.cfg;
    try {
      switch (name) {
        case 'new': this.newApp(); break;
        case 'dup': this.duplicate(); break;
        case 'del': this.remove(); break;
        case 'inspect': await this.inspect(); break;
        case 'pick-source': await this.pickSource(); break;
        case 'reanalyze': await this.analyze(a.source.dir); break;
        case 'add-domain': this.addDomain(); break;
        case 'del-domain': a.internal = a.internal.filter((d) => d !== btn.dataset.domain); this.save(); this.renderForm(); break;
        case 'bump': this.bump(Number(btn.dataset.part)); break;
        case 'suggest-id': a.appId = this.freeAppId(this.baseAppId(a), a.id); this.save(); this.renderForm(); toast(`Identifiant proposé : ${a.appId}`); break;
        case 'pick-icon': await this.pickIcon(); break;
        case 'clear-icon': a.icon = { ...a.icon, image: null, shape: a.icon.shape === 'none' ? 'rounded' : a.icon.shape }; this.set('icon.image', null); this.renderForm(); break;
        case 'use-logo': await this.useLogo(Number(btn.dataset.i)); break;
        case 'size': { const [w, h] = btn.dataset.size.split('x').map(Number); a.window.width = w; a.window.height = h; this.set('window.width', w); this.renderForm(); break; }
        case 'pick-out': { const d = await api.invoke('desktop:pick-out'); if (d) { a.out = d; this.save(); this.renderForm(); } break; }
        case 'out-reset': a.out = ''; this.save(); this.renderForm(); break;
        case 'cert-add': await this.addCert(); break;
        case 'cert-remove': this.cert = await api.invoke('desktop:cert-remove', { appId: a.appId }); this.renderForm(); toast('Certificat retiré de ce PC.'); break;
        case 'build': await this.build(); break;
        case 'cancel': await api.invoke('desktop:cancel'); toast('Annulation de la construction…'); break;
        case 'export': await this.exportProject(); break;
        case 'log-open': if (!(await api.invoke('desktop:log-open'))) toast('Aucun journal de construction pour l’instant.'); break;
        case 'clear-cache': { const r = await api.invoke('desktop:clear-cache'); toast(r && r.freed ? `Cache vidé : ${fmtSize(r.freed)} libérés.` : 'Le cache de construction est déjà vide.'); break; }
        case 'open-out': await api.invoke('desktop:open', { file: btn.dataset.path, action: 'folder' }); break;
        case 'reveal': await api.invoke('desktop:open', { file: btn.dataset.path, action: 'reveal' }); break;
        case 'install': await api.invoke('desktop:open', { file: btn.dataset.path, action: 'install' }); toast('Installateur lancé.'); break;
        case 'run-test': await api.invoke('desktop:open', { file: btn.dataset.path, action: 'run' }); toast(`« ${a.name} » est lancé sans installation.`); break;
        // NEXORA #058
        case 'go': this.goSection(btn.dataset.to); break;
        case 'zoom': this.openZoom(); break;
        case 'ready-refresh': this.elSupport = null; this.gh = null; this.cert = null; this.azure = null; this.renderForm(); break;
        case 'shortcut-suggest': { const l = (slugWord(a.name)[0] || 'n').toUpperCase(); this.set('behavior.shortcut', `CommandOrControl+Alt+${/[A-Z]/.test(l) ? l : 'N'}`); this.renderForm(); break; }
        case 'jl-add': this.listAdd('jumpList'); break;
        case 'jl-del': a.behavior.jumpList.splice(Number(btn.dataset.i), 1); this.set('behavior.jumpList', a.behavior.jumpList); this.renderForm(); break;
        case 'ft-add': this.listAdd('fileTypes'); break;
        case 'ft-del': a.behavior.fileTypes.splice(Number(btn.dataset.i), 1); this.set('behavior.fileTypes', a.behavior.fileTypes); this.renderForm(); break;
        case 'azure-add': this.addAzure(); break;
        case 'azure-remove': this.azure = await api.invoke('desktop:azure-remove', { appId: a.appId }); this.renderForm(); toast('Identifiants Azure retirés de ce PC.'); break;
        case 'gh-add': this.addGhToken(); break;
        case 'gh-remove': this.gh = await api.invoke('desktop:gh-token-remove'); this.renderForm(); toast('Jeton GitHub retiré de ce PC.'); break;
        case 'publish': await this.publish(); break;
        case 'sandbox': await api.invoke('desktop:sandbox', { file: btn.dataset.path }); toast('Bac à sable Windows en cours d’ouverture : l’installateur s’y lance tout seul.'); break;
        case 'winget': await this.winget(btn.dataset.path); break;
        case 'open-devlab': await this.openInDevLab(btn.dataset.path); break;
        case 'rebuild-latest': a.install.electron = 'latest'; this.save(); this.elSupport = null; await this.build(); break;
        case 'ins-login': { const ui = await import('../../dist/chunks/ui-AVQ7QKWX.js'); ui.openAuthSheet(); break; }
        case 'ins-register': await this.insRegister(); break;
        case 'ins-refresh': this.ins = null; this.insLoad(true); this.renderForm(); break;
        default: break;
      }
    } catch (err) {
      toast(err.message || String(err), { kind: 'bad' });
    }
  }

  // ------------------------------------------------------------ NEXORA #058 : actions de distribution
  listAdd(kind) {
    const a = this.cfg;
    const b = a.behavior;
    if (kind === 'jumpList') {
      const label = String((this.el.querySelector('[data-jl-label]') || {}).value || '').trim().slice(0, 40);
      let p = String((this.el.querySelector('[data-jl-path]') || {}).value || '').trim();
      if (p && !p.startsWith('/')) p = `/${p}`;
      if (!label || !/^\/[^\s]*$/.test(p)) { toast('Indique un nom et un chemin de page (par exemple /commandes/nouvelle).', { kind: 'bad' }); return; }
      b.jumpList = [...b.jumpList, { label, path: p.slice(0, 200) }].slice(0, 5);
      this.set('behavior.jumpList', b.jumpList);
    } else {
      const ext = String((this.el.querySelector('[data-ft-ext]') || {}).value || '').trim().toLowerCase().replace(/^\./, '');
      const name = String((this.el.querySelector('[data-ft-name]') || {}).value || '').trim().slice(0, 40);
      if (!/^[a-z0-9]{1,12}$/.test(ext)) { toast('Extension invalide : lettres et chiffres, sans point (par exemple devis).', { kind: 'bad' }); return; }
      if (RESERVED_EXT.includes(ext)) { toast(`.${ext} est réservé à Windows ou à d’autres programmes : choisis une extension propre à ton logiciel.`, { kind: 'bad' }); return; }
      if (b.fileTypes.some((f) => f.ext === ext)) { toast(`.${ext} est déjà dans la liste.`, { kind: 'bad' }); return; }
      b.fileTypes = [...b.fileTypes, { ext, name: name || ext.toUpperCase() }].slice(0, 5);
      this.set('behavior.fileTypes', b.fileTypes);
    }
    this.renderForm();
  }
  addAzure() {
    const a = this.cfg;
    const s = sheet('dsk-azure', sheetHtml({
      icon: 'key', title: 'Identifiants Azure', sub: 'Inscription d’application qui a le rôle « Trusted Signing Certificate Profile Signer » sur ton compte de signature.',
      body: `<label class="field"><span>Locataire (Directory / tenant ID)</span><input class="input mono" data-az="tenant" placeholder="00000000-0000-0000-0000-000000000000" spellcheck="false" data-autofocus></label>
        <label class="field"><span>Application (Application / client ID)</span><input class="input mono" data-az="client" placeholder="00000000-0000-0000-0000-000000000000" spellcheck="false"></label>
        <label class="field"><span>Secret client</span><input class="input" type="password" data-az="secret" autocomplete="off"></label>
        <p class="sheet-note">Le secret est protégé par le trousseau de Windows sur ce PC ; il n’est donné qu’à l’outil de construction, jamais affiché ni envoyé ailleurs qu’à Microsoft.</p>`,
      go: 'Enregistrer', goIcon: 'key',
    }));
    const go = async () => {
      const v = (k) => s.querySelector(`[data-az="${k}"]`).value.trim();
      try {
        this.azure = await api.invoke('desktop:azure-save', { appId: a.appId, tenant: v('tenant'), client: v('client'), secret: v('secret') });
        closeSheet('dsk-azure');
        a.signing.enabled = true; a.signing.mode = 'azure';
        this.save(); this.renderForm();
        toast('Identifiants enregistrés : la prochaine construction sera signée par Microsoft.');
      } catch (err) { toast(err.message || String(err), { kind: 'bad' }); }
    };
    s.onclick = (e) => { if (e.target.closest('[data-nx-go]')) go(); };
    s.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  }
  addGhToken() {
    const s = sheet('dsk-gh', sheetHtml({
      icon: 'key', title: 'Jeton GitHub', sub: 'Pour publier les versions de tes logiciels depuis NEXORA.',
      body: '<label class="field"><span>Jeton (github_pat_… ou ghp_…)</span><input class="input mono" type="password" data-tok data-autofocus autocomplete="off" spellcheck="false"></label><p class="sheet-note">Crée un jeton « fine-grained » limité au dépôt des mises à jour, avec l’autorisation « Contents : Read and write ». Il est chiffré par le trousseau de Windows et ne s’affiche plus.</p>',
      go: 'Enregistrer', goIcon: 'key',
    }));
    const go = async () => {
      try {
        this.gh = await api.invoke('desktop:gh-token-save', { token: s.querySelector('[data-tok]').value });
        closeSheet('dsk-gh');
        this.renderForm();
        toast('Jeton GitHub enregistré sur ce PC.');
      } catch (err) { toast(err.message || String(err), { kind: 'bad' }); }
    };
    s.onclick = (e) => { if (e.target.closest('[data-nx-go]')) go(); };
    s.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  }
  async publish() {
    const a = this.cfg;
    const last = a.builds[0];
    if (!last || last.version !== a.version) throw new Error(`Construis d’abord la version ${a.version} (section Construction).`);
    const files = (last.files || []).filter((f) => ['nsis', 'update', 'msi', 'portable', 'zip'].includes(f.kind)).map((f) => f.path);
    if (!files.some((f) => /\.yml$/i.test(f))) throw new Error('Cette construction ne contient pas de fichier de mise à jour (latest.yml) : choisis le mode de mise à jour, puis reconstruis.');
    const d = a.distrib;
    const t = toast(a.updates.mode === 'github' ? 'Publication sur GitHub…' : 'Préparation des fichiers…', { busy: true, sticky: true });
    try {
      const r = await api.invoke('desktop:publish', {
        mode: a.updates.mode, owner: a.updates.owner, repo: a.updates.repo, version: a.version, files, notes: d.notes, staging: d.staging, mandatory: d.mandatory, beta: a.updates.channel === 'beta',
      });
      a.lastPublish = { version: a.version, at: Date.now(), url: r.url || '', dir: r.dir || '', mode: a.updates.mode };
      this.save();
      this.renderForm();
      if (r.url) toast(`Version ${a.version} publiée${d.staging < 100 ? ` pour ${d.staging} % des installations` : ''}.`, { action: 'Voir', onAction: () => api.invoke('shell:external', r.url) });
      else toast('Fichiers prêts : dépose l’installateur, son .blockmap et latest.yml sur ton serveur.', { action: 'Ouvrir le dossier', onAction: () => api.invoke('desktop:open', { file: r.dir, action: 'folder' }) });
    } finally { if (t && t.close) t.close(); }
  }
  async winget(file) {
    const a = this.cfg;
    const name = String(file).split(/[\\/]/).pop();
    const url = String(a.distrib.wingetUrl || '').trim() || this.publicUrl(a, name);
    if (!/^https:\/\//i.test(url)) throw new Error('Indique l’adresse https publique de l’installateur (winget le télécharge à cette adresse).');
    const r = await api.invoke('desktop:winget', {
      file, url, app: { id: wingetIdOf(a), name: a.name, publisher: a.publisher, version: a.version, description: a.description, homepage: a.homepage, license: a.distrib.license, copyright: a.copyright, scope: a.install.scope },
    });
    toast(`Fichiers winget créés (${r.id}).`, { action: 'Ouvrir le dossier', onAction: () => api.invoke('desktop:open', { file: r.dir, action: 'folder' }) });
  }
  async openInDevLab(dir) {
    const rail = document.querySelector('#modeSeg button[data-mode="dev"]');
    if (!rail) throw new Error('Dev Lab introuvable.');
    rail.click();
    for (let i = 0; i < 40 && !(state.devLab && state.devLab.openFolder); i++) await new Promise((r) => setTimeout(r, 150));
    if (!state.devLab || !state.devLab.openFolder) throw new Error('Le Dev Lab n’a pas pu s’ouvrir.');
    await state.devLab.openFolder(dir);
  }
  async insRegister() {
    const a = this.cfg;
    if (!cloud.user) { const ui = await import('../../dist/chunks/ui-AVQ7QKWX.js'); ui.openAuthSheet(); return; }
    const { data, error } = await supabase.rpc('app_insights_register', { p_app_id: a.appId, p_name: a.name || '' });
    if (error) { a.insights.err = insExplain(error); this.save(); this.renderForm(); return; }
    const row = Array.isArray(data) ? data[0] : data;
    Object.assign(a.insights, { app: row.id, key: row.ingest_key, appId: a.appId, err: null });
    this.ins = null;
    this.save();
    this.renderForm();
    toast('Logiciel inscrit : construis-le pour qu’il envoie ses statistiques.');
  }

  // ------------------------------------------------------------ logiciels : créer sans conflit
  freeName(base, except = null) {
    const taken = new Set(this.st.apps.filter((x) => x.id !== except).map((x) => String(x.name || '').trim().toLowerCase()));
    const b = String(base || 'Mon logiciel').trim() || 'Mon logiciel';
    let n = b;
    for (let i = 2; taken.has(n.toLowerCase()); i++) n = `${b} ${i}`;
    return n;
  }
  baseAppId(a) {
    const host = a.source.kind === 'url' ? hostOf(a.source.url) : '';
    const parts = host && !/^(\d+\.){3}\d+$|^localhost$/.test(host) ? host.split('.').reverse().map(slugWord).filter(Boolean) : [];
    if (parts.length >= 2) return `${parts.join('.')}.desktop`;
    const pub = slugWord(a.publisher);
    return `com.${pub || slugWord(a.name) || 'monlogiciel'}.${pub ? slugWord(a.name) || 'app' : 'desktop'}`.replace(/\.(\d)/g, '.a$1');
  }
  freeAppId(base, except = null) {
    const taken = new Set(this.st.apps.filter((x) => x.id !== except).map((x) => x.appId));
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}${i}`;
    return id;
  }
  selectApp(id) {
    if (this.building) { toast('Attends la fin de la construction pour changer de logiciel.', { kind: 'bad' }); this.renderApps(); return; }
    this.st.current = id;
    this.result = null; this.error = ''; this.progress = null; this.logLines = []; this.icons = []; this.cert = null; this.iconUrl = null;
    this.save();
    this.render();
  }
  /** « Nouveau » (rail, Ctrl+N) : un logiciel en plus des autres, nom et identifiant libres. */
  newApp() {
    let kind = 'url';
    const s = sheet('dsk-new', sheetHtml({
      icon: 'display', title: 'Nouveau logiciel', sub: 'Il aura son propre nom, son propre identifiant et son propre dossier : tes autres logiciels ne changent pas.',
      body: `<div class="nw-grid">${Object.entries(KINDS).map(([k, [l, i, d]], n) => `<button class="nw-tile${n === 0 ? ' on' : ''}" data-kind="${k}">${ico(i, 20)}<b>${l}</b><small>${d}</small></button>`).join('')}</div>
        <label class="field"><span>Nom du logiciel</span><input class="input" data-name value="${esc(this.freeName('Mon logiciel'))}" spellcheck="false" data-autofocus></label>
        <label class="field" data-url-field><span>Adresse du site</span><input class="input" data-url placeholder="https://monsite.com" spellcheck="false"></label>`,
      go: 'Créer', goIcon: 'plus',
    }), { wide: true });
    s.onclick = (e) => {
      const t = e.target.closest('[data-kind]');
      if (t) {
        kind = t.dataset.kind;
        for (const b of s.querySelectorAll('[data-kind]')) b.classList.toggle('on', b === t);
        s.querySelector('[data-url-field]').hidden = kind !== 'url';
        return;
      }
      if (!e.target.closest('[data-nx-go]')) return;
      let url = s.querySelector('[data-url]').value.trim();
      if (kind === 'url' && url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (kind === 'url' && url) { try { new URL(url); } catch { toast('Cette adresse n’est pas valide. Exemple : https://monsite.com', { kind: 'bad' }); return; } }
      const a = defaults();
      a.source.kind = kind;
      a.source.url = kind === 'url' ? url : '';
      a.name = this.freeName(s.querySelector('[data-name]').value.trim() || (url ? hostOf(url).split('.')[0] : 'Mon logiciel'));
      a.appId = this.freeAppId(this.baseAppId(a));
      if (kind === 'electron') { a.permissions.localNetwork = 'allow'; }
      if (kind === 'folder') a.permissions.localNetwork = 'allow';
      this.st.apps.push(a);
      closeSheet('dsk-new');
      this.selectApp(a.id);
      this.goSection('source');
      toast(`« ${a.name} » créé. Tes autres logiciels restent dans la liste.`);
      if (kind !== 'url') this.pickSource();
      else if (url) this.inspect();
    };
  }
  duplicate() {
    const src = this.cfg;
    const a = merge(JSON.parse(JSON.stringify({ ...src, builds: [], inspect: src.inspect })));
    a.id = uid();
    a.created = Date.now();
    a.name = this.freeName(`${src.name} (copie)`);
    a.appId = this.freeAppId(src.appId);
    this.st.apps.push(a);
    this.selectApp(a.id);
    toast(`Copie créée : « ${a.name} », identifiant ${a.appId}.`);
  }
  remove() {
    const a = this.cfg;
    const s = sheet('dsk-del', sheetHtml({
      icon: 'trash', title: `Supprimer « ${a.name} » ?`, sub: 'Le logiciel est retiré de cette liste. Les fichiers déjà construits et son code source restent dans son dossier.', go: 'Supprimer', goIcon: 'trash',
    }));
    s.onclick = (e) => {
      if (!e.target.closest('[data-nx-go]')) return;
      closeSheet('dsk-del');
      const at = this.st.apps.findIndex((x) => x.id === a.id);
      this.st.apps = this.st.apps.filter((x) => x.id !== a.id);
      offerReleased(a.id);
      if (!this.st.apps.length) this.st.apps.push(defaults());
      // Le logiciel voisin (celui d'avant dans la liste) est affiché.
      this.selectApp(this.st.apps[Math.max(0, Math.min(this.st.apps.length - 1, at - 1))].id);
      toast(`« ${a.name} » retiré de la liste.`);
    };
  }
  bump(part) {
    const a = this.cfg;
    const n = (VERSION_RE.test(a.version) ? a.version : '1.0.0').split('-')[0].split('.').map(Number);
    n[part] += 1;
    for (let i = part + 1; i < 3; i++) n[i] = 0;
    this.set('version', n.join('.'));
    this.renderForm();
  }
  addDomain() {
    const box = this.el.querySelector('[data-new-domain]');
    const a = this.cfg;
    const d = String((box && box.value) || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '');
    if (!d) { toast('Écris d’abord un domaine, par exemple exemple.com.', { kind: 'bad' }); if (box) box.focus(); return; }
    if (!/^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+$/.test(d)) { toast('Domaine invalide. Exemples : exemple.com, *.exemple.com', { kind: 'bad' }); return; }
    if (!a.internal.includes(d)) a.internal.push(d);
    this.save();
    this.renderForm();
    const nb = this.el.querySelector('[data-new-domain]');
    if (nb) nb.focus();
  }

  // ------------------------------------------------------------ source
  async inspect() {
    const a = this.cfg;
    let url = String(a.source.url || '').trim();
    if (!url) { toast('Colle d’abord l’adresse du site (https://monsite.com).', { kind: 'bad' }); const f = this.el.querySelector('[data-k="source.url"]'); if (f) f.focus(); return; }
    if (!/^https?:\/\//i.test(url)) { url = `https://${url}`; a.source.url = url; }
    try { new URL(url); } catch { toast('Cette adresse n’est pas valide.', { kind: 'bad' }); return; }
    this.inspecting = true;
    this.renderForm();
    try {
      const r = await api.invoke('android:pwa-inspect', url);
      const id = r.identity || {};
      a.source.url = r.url || url;
      a.inspect = {
        title: r.title || '', https: r.security ? r.security.https : /^https:/.test(url), certificate: r.security ? r.security.certificate : true, manifest: Boolean(r.manifest),
        logos: (id.logos || []).filter((l) => /^https?:|^data:image/.test(l.src)).slice(0, 6).map((l) => ({ src: l.src, kind: l.kind, size: l.size })),
      };
      const fresh = /^Mon logiciel( \d+)?$/.test(a.name);
      if (fresh && (id.shortName || id.name || r.title)) a.name = this.freeName(String(id.shortName || id.name || r.title).slice(0, 60), a.id);
      if (!a.description && id.description) a.description = String(id.description).slice(0, 300);
      if (/^#[0-9a-f]{6}$/i.test(id.brand || '')) { a.window.accent = id.brand; a.icon.bg = id.brand; }
      if (/^#[0-9a-f]{6}$/i.test(id.background || '')) a.window.background = id.background;
      if (/^com\.monlogiciel\.desktop\d*$/.test(a.appId)) a.appId = this.freeAppId(this.baseAppId(a), a.id);
      const host = hostOf(a.source.url);
      const dom = siteDomain(host);
      for (const d of dom && dom !== host ? [dom, `*.${dom}`] : dom ? [`*.${dom}`] : []) if (!a.internal.includes(d)) a.internal.push(d);
      if (!a.icon.image && a.inspect.logos.length) await this.useLogo(this.icons.length, { quiet: true });
      this.save();
      this.renderApps();
      toast(`Site reconnu : ${a.name}. Vérifie l’identité et l’icône proposées.`);
    } catch (err) {
      toast(err.message || String(err), { kind: 'bad' });
    } finally {
      this.inspecting = false;
      this.renderForm();
      this.renderPreview();
    }
  }
  async pickSource() {
    const a = this.cfg;
    const r = await api.invoke('desktop:pick-source', { kind: a.source.kind });
    if (r) this.applyAnalysis(r);
  }
  async analyze(dir) {
    if (!dir) return;
    this.applyAnalysis(await api.invoke('desktop:analyze', { dir }));
    toast('Dossier analysé de nouveau.');
  }
  applyAnalysis(an) {
    const a = this.cfg;
    const s = a.source;
    s.dir = an.dir;
    if (an.kind === 'electron' && s.kind !== 'electron') { s.kind = 'electron'; toast('C’est un projet de bureau : la source correspondante est choisie.'); }
    if (an.kind !== 'electron' && s.kind === 'electron' && an.kind !== 'unsupported') { s.kind = 'folder'; toast('Ce dossier n’est pas un projet de bureau : la source « Dossier de site » est choisie.'); }
    this.icons = (an.icons || []).map((i) => ({ name: i.name, dataUrl: i.dataUrl }));
    s.analysis = { ...an, icons: undefined };
    s.buildCmd = an.buildCmd || '';
    s.webDir = an.webDir || '';
    s.build = an.kind === 'web' && Boolean(an.buildCmd);
    s.prepareCmd = an.electron ? an.electron.prepareCmd || '' : '';
    s.useProjectConfig = Boolean(an.electron && an.electron.builder);
    if (/^Mon logiciel( \d+)?$/.test(a.name) && an.name) a.name = this.freeName(String(an.name).replace(/^@[^/]+\//, '').replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()).slice(0, 60), a.id);
    if (a.version === '1.0.0' && an.version) a.version = an.version;
    if (!a.description && an.description) a.description = String(an.description).slice(0, 300);
    if (!a.publisher && an.author) a.publisher = String(an.author).slice(0, 100);
    if (!a.homepage && an.homepage) a.homepage = an.homepage;
    if (/^com\.monlogiciel\.desktop\d*$/.test(a.appId)) a.appId = this.freeAppId(this.baseAppId(a), a.id);
    if (!a.icon.image && this.icons.length) this.useLogo(0, { quiet: true });
    this.save();
    this.renderApps();
    this.renderForm();
    this.renderPreview();
  }

  // ------------------------------------------------------------ icône
  async pickIcon() {
    const f = await pickFile({ title: 'Image de l’icône', name: 'Images', extensions: ['png', 'svg', 'jpg', 'jpeg', 'webp', 'ico'] });
    if (!f || !f.dataUrl) return;
    await this.setIconImage(f.dataUrl);
    toast('Icône mise à jour.');
  }
  async useLogo(i, { quiet = false } = {}) {
    const a = this.cfg;
    const local = this.icons[i];
    let src = local && local.dataUrl;
    if (!src) {
      const remote = ((a.inspect && a.inspect.logos) || [])[i - this.icons.length];
      if (!remote) return;
      src = remote.src.startsWith('data:') ? remote.src : await api.invoke('desktop:fetch-image', { url: remote.src }).catch(() => null);
      if (!src) { if (!quiet) toast('Cette image n’a pas pu être récupérée.', { kind: 'bad' }); return; }
    }
    await this.setIconImage(src);
    if (!quiet) toast('Icône mise à jour.');
  }
  /** Image gardée en PNG de 512 px au plus (les réglages restent légers). */
  async setIconImage(src) {
    let img;
    try { img = await loadImage(src); } catch { toast('Image illisible.', { kind: 'bad' }); return; }
    const k = Math.min(1, 512 / Math.max(img.naturalWidth || 512, img.naturalHeight || 512));
    const isSvg = /^data:image\/svg/.test(src);
    const w = Math.round((img.naturalWidth || 512) * (isSvg ? 512 / Math.max(img.naturalWidth || 512, img.naturalHeight || 512) : k));
    const h = Math.round((img.naturalHeight || 512) * (isSvg ? 512 / Math.max(img.naturalWidth || 512, img.naturalHeight || 512) : k));
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    // Image avec transparence : pas de fond par défaut ; image opaque : coins arrondis.
    const px = ctx.getImageData(0, 0, w, h).data;
    let transparent = false;
    for (let i = 3; i < px.length; i += 4 * 97) if (px[i] < 250) { transparent = true; break; }
    const a = this.cfg;
    a.icon = { ...a.icon, image: c.toDataURL('image/png'), shape: transparent ? 'none' : 'rounded', padding: transparent ? 4 : 0 };
    this.iconUrl = null;
    this.save();
    if (this.section === 'icon') this.renderForm();
    this.renderPreview();
  }

  // ------------------------------------------------------------ signature
  async addCert() {
    const a = this.cfg;
    const f = await api.invoke('desktop:pick-cert');
    if (!f) return;
    const s = sheet('dsk-cert', sheetHtml({
      icon: 'key', title: 'Mot de passe du certificat', sub: esc(f.name),
      body: '<label class="field"><span>Mot de passe</span><input class="input" type="password" data-pw data-autofocus autocomplete="off"></label><p class="sheet-note">Protégé par le trousseau de Windows sur ce PC ; jamais affiché ni envoyé en ligne.</p>',
      go: 'Enregistrer', goIcon: 'key',
    }));
    const go = async () => {
      const pw = s.querySelector('[data-pw]').value;
      try {
        this.cert = await api.invoke('desktop:cert-save', { appId: a.appId, file: f.path, password: pw });
        closeSheet('dsk-cert');
        a.signing.enabled = true;
        this.save();
        this.renderForm();
        toast('Certificat enregistré : la prochaine construction sera signée.');
      } catch (err) { toast(err.message || String(err), { kind: 'bad' }); }
    };
    s.onclick = (e) => { if (e.target.closest('[data-nx-go]')) go(); };
    s.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  }

  // ------------------------------------------------------------ construction
  check(a) {
    const fail = (sec, msg) => { this.goSection(sec); toast(msg, { kind: 'bad' }); return false; };
    if (!String(a.name || '').trim()) return fail('identity', 'Donne un nom à ton logiciel.');
    if (/[<>:"/\\|?*]/.test(a.name)) return fail('identity', 'Le nom ne doit pas contenir ces caractères : < > : " / \\ | ? *');
    if (!VERSION_RE.test(a.version)) return fail('identity', 'Version invalide : utilise la forme 1.0.0.');
    if (!APP_ID_RE.test(a.appId)) return fail('identity', 'Identifiant invalide : utilise la forme com.monentreprise.monlogiciel.');
    const owner = this.st.apps.find((x) => x.id !== a.id && x.appId === a.appId);
    if (owner) return fail('identity', `L’identifiant ${a.appId} est déjà celui de « ${owner.name} ». Choisis-en un autre (bouton « Proposer »).`);
    if (a.source.kind === 'url' && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(a.source.url || '')) return fail('source', 'Indique l’adresse complète du site, par exemple https://monsite.com.');
    if (a.source.kind !== 'url' && !a.source.dir) return fail('source', 'Choisis d’abord le dossier du site ou du projet.');
    if (a.source.analysis && a.source.analysis.kind === 'unsupported') return fail('source', a.source.analysis.unsupported.message);
    if (a.updates.mode === 'generic' && !/^https:\/\//i.test(a.updates.url || '')) return fail('updates', 'Indique l’adresse https du dossier de mise à jour.');
    if (a.updates.mode === 'github' && (!a.updates.owner || !a.updates.repo)) return fail('updates', 'Indique le propriétaire et le nom du dépôt distant.');
    if (a.behavior.shortcut && !ACCEL_RE.test(a.behavior.shortcut)) return fail('behavior', 'Raccourci clavier invalide : par exemple CommandOrControl+Alt+M (ou laisse vide).');
    if (a.signing.enabled && a.signing.mode === 'azure' && (!a.signing.azure.account || !a.signing.azure.profile || !a.signing.azure.publisherName)) return fail('signing', 'Signature dans le cloud : indique le compte de signature, le profil de certificat et le nom de l’éditeur.');
    if (a.install.formats.appx && (!/^[A-Za-z0-9.-]{3,50}$/.test(a.store.identityName) || !/^CN=.+/.test(a.store.publisher))) return fail('distrib', 'Paquet Microsoft Store : indique le nom d’identité et l’éditeur (CN=…) copiés depuis l’Espace partenaires.');
    return true;
  }
  payload(a) {
    const { analysis, ...source } = a.source;
    return {
      name: a.name.trim(), appId: a.appId.trim(), version: a.version.trim(), publisher: a.publisher, email: a.email, description: a.description, homepage: a.homepage, copyright: a.copyright, lang: a.lang,
      source, internal: a.internal, logins: a.logins, window: a.window, behavior: a.behavior, permissions: a.permissions, security: a.security, install: a.install, updates: a.updates, signing: a.signing,
      store: a.store,
      // Statistiques : seulement pour un logiciel inscrit sous son identifiant actuel (clé d'envoi, clé publique anon).
      insights: a.insights.enabled && a.insights.key && a.insights.appId === a.appId ? { url: supabase.supabaseUrl, anon: supabase.supabaseKey, key: a.insights.key } : null,
    };
  }
  async build() {
    const a = this.cfg;
    if (this.building) return;
    if (!this.check(a)) return;
    this.building = true;
    this.error = '';
    this.result = null;
    this.logLines = [];
    this.progress = { step: 'tools', label: 'Préparation des images du logiciel', progress: 0 };
    if (this.section !== 'build') this.goSection('build'); else this.renderForm();
    this.renderBuildBar();
    try {
      const assets = await buildAssets(a);
      const r = await api.invoke('desktop:build', { app: this.payload(a), assets, out: a.out || '', nxApp: offerApp(a) });
      this.result = { ...r, at: Date.now() };
      a.builds.unshift({
        at: Date.now(), version: r.version, files: r.files, outDir: r.outDir, unpacked: r.unpacked, project: r.project, electron: r.electron, ms: r.ms, warnings: r.warnings,
      });
      a.builds = a.builds.slice(0, 10);
      this.save();
      toast(`« ${a.name} » ${r.version} est prêt.`, { action: 'Ouvrir le dossier', onAction: () => api.invoke('desktop:open', { file: r.outDir, action: 'folder' }) });
    } catch (err) {
      this.error = err.message || String(err);
      if (!/annulée/.test(this.error)) toast(this.error, { kind: 'bad' });
      else toast('Construction annulée.');
    } finally {
      this.building = false;
      this.renderForm();
      this.renderBuildBar();
      this.refreshStatus();
    }
  }
  async exportProject() {
    const a = this.cfg;
    if (!this.check(a)) return;
    const assets = await buildAssets(a);
    const r = await api.invoke('desktop:export', { app: this.payload(a), assets });
    if (r) toast(`Code source écrit dans ${r.dir}.`, { action: 'Ouvrir', onAction: () => api.invoke('desktop:open', { file: r.dir, action: 'folder' }) });
  }
}

function wingetIdOf(a) {
  const part = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9-]+/g, '').slice(0, 32);
  return `${part(a.publisher) || part(a.name) || 'Editeur'}.${part(a.name) || 'App'}`;
}
function slugName(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'Logiciel';
}
const capMin = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor"/></svg>';
const capMax = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="none" stroke="currentColor"/></svg>';
const capClose = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="m1.5 1.5 7 7m0-7-7 7" stroke="currentColor"/></svg>';
const winLogo = '<svg width="14" height="14" viewBox="0 0 14 14"><path fill="currentColor" d="M0 0h6.6v6.6H0zM7.4 0H14v6.6H7.4zM0 7.4h6.6V14H0zM7.4 7.4H14V14H7.4z"/></svg>';

/** Ouverture de l'espace (registre des espaces de chunk-Y6Q6RT63.js). */
export function openDesktop(el) {
  if (state.desktop && state.desktop.el === el) {
    state.desktop.refreshStatus();
    return state.desktop;
  }
  state.desktop = new DesktopSpace(el);
  return state.desktop;
}
