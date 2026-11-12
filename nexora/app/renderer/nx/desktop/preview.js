// NEXORA #058 : aperçu du Desktop Builder sur un vrai PC Windows 11 : écran de 1536 × 960 points (mis à l'échelle
// du panneau), fond d'écran, barre des tâches, fenêtre du logiciel à ses dimensions réelles, assistant
// d'installation, menu Démarrer, actions de l'icône (liste de raccourcis), pastille et notification.
// Les images de l'icône sont posées ensuite sur les balises [data-prev-icon] par l'espace.
import { esc, luminance } from '../core.js';

export const SCREEN = { w: 1536, h: 960, bar: 48 };
export const MODES = [['window', 'Fenêtre', 'Fenêtre du logiciel sur le bureau'], ['installer', 'Installateur', 'Assistant d’installation'], ['start', 'Démarrer', 'Menu Démarrer et raccourci du bureau'], ['taskbar', 'Tâches', 'Barre des tâches : actions de l’icône, pastille, notification']];

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const I = '<img data-prev-icon alt="">';

// ---------------------------------------------------------------- pictogrammes du système (dessins simples)
const SVG = {
  start: '<svg viewBox="0 0 24 24"><path fill="#0a7bd6" d="M2 2h9.4v9.4H2z"/><path fill="#1490e8" d="M12.6 2H22v9.4h-9.4z"/><path fill="#0a6fc4" d="M2 12.6h9.4V22H2z"/><path fill="#0f82dc" d="M12.6 12.6H22V22h-9.4z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  tasks: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="8" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="5" width="8" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path fill="#f3b73b" d="M2 6.5A2.5 2.5 0 0 1 4.5 4h4.3l2 2.2h8.7A2.5 2.5 0 0 1 22 8.7V9H2z"/><path fill="#ffd25e" d="M2 8.5h20v9A2.5 2.5 0 0 1 19.5 20h-15A2.5 2.5 0 0 1 2 17.5z"/></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#1a7fd4"/><path fill="#45c4a0" d="M5 16.5c2.3 3.2 7.6 4.3 11.3 1.8-3.4.6-6.2-.6-7.3-2.7 2.6 1.3 7 1 9.3-1.6.9-1 1.2-2.4.8-3.6-1 3-6 3.4-8.4 2.1C8.5 11.4 9.6 8 13 7.4c-4.3-.6-8.4 2.4-8.3 6.4 0 1 .1 1.9.3 2.7z"/></svg>',
  store: '<svg viewBox="0 0 24 24"><path fill="#2f6fe4" d="M3 8h18l-1 12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" fill="none" stroke="#2f6fe4" stroke-width="1.8"/><path fill="#f25022" d="M9 11.5h2.6v2.6H9z"/><path fill="#7fba00" d="M12.4 11.5H15v2.6h-2.6z"/><path fill="#00a4ef" d="M9 14.9h2.6v2.6H9z"/><path fill="#ffb900" d="M12.4 14.9H15v2.6h-2.6z"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#6b7280"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M12 4.5v2.4M12 17.1v2.4M4.5 12h2.4M17.1 12h2.4M6.7 6.7l1.7 1.7M15.6 15.6l1.7 1.7M6.7 17.3l1.7-1.7M15.6 8.4l1.7-1.7" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="#0f6cbd"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5" fill="none" stroke="#fff" stroke-width="1.6"/></svg>',
  photos: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="16" rx="3" fill="#2b8ad8"/><circle cx="8.5" cy="9.5" r="2" fill="#fff"/><path fill="#9fd5ff" d="M3 18l6-6 4 4 3-3 5 5v.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>',
  calc: '<svg viewBox="0 0 24 24"><rect x="4" y="2.5" width="16" height="19" rx="3" fill="#374151"/><rect x="6.5" y="5" width="11" height="4" rx="1" fill="#9ca3af"/><g fill="#e5e7eb"><circle cx="8.5" cy="12.5" r="1.2"/><circle cx="12" cy="12.5" r="1.2"/><circle cx="15.5" cy="12.5" r="1.2"/><circle cx="8.5" cy="16.5" r="1.2"/><circle cx="12" cy="16.5" r="1.2"/></g><circle cx="15.5" cy="16.5" r="1.2" fill="#f59e0b"/></svg>',
  notes: '<svg viewBox="0 0 24 24"><rect x="4.5" y="2.5" width="15" height="19" rx="2.5" fill="#5b8def"/><path d="M8 8h8M8 11.5h8M8 15h5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path fill="#cfd8e3" d="M5 7h14l-1.2 13a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path fill="#9aa8b8" d="M4 5h16v2H4zM9.5 3h5v2h-5z"/></svg>',
  pc: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="12.5" rx="1.8" fill="#3b82f6"/><rect x="4" y="5.5" width="16" height="9.5" rx="1" fill="#93c5fd"/><path fill="#64748b" d="M9 18h6l.8 2.5H8.2z"/></svg>',
  wifi: '<svg viewBox="0 0 24 24"><path d="M3 9.5a13 13 0 0 1 18 0M6 12.8a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  battery: '<svg viewBox="0 0 24 24"><rect x="2.5" y="7" width="17" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4.5" y="9" width="10" height="6" rx="1" fill="currentColor"/><path d="M20.5 10.5v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m7 14 5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  power: '<svg viewBox="0 0 24 24"><path d="M12 3.5v7M7.2 6.5a7.5 7.5 0 1 0 9.6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M14.5 3.5 20.5 9.5l-3 1-3.5 3.5.5 4-2 1-4.5-4.5L3.5 19l-.5-.5L7.5 14 3 9.5l1-2 4 .5L11.5 4.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 10 10"><path d="m1.5 1.5 7 7m0-7-7 7" stroke="currentColor" stroke-width="1"/></svg>',
  min: '<svg viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" stroke-width="1"/></svg>',
  max: '<svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
};
const sys = (k, cls = '') => `<i class="pc-ico ${cls}">${SVG[k]}</i>`;

// ---------------------------------------------------------------- éléments communs
function clock() {
  const d = new Date();
  return `<span class="pc-clock"><b>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</b><small>${d.toLocaleDateString('fr-FR')}</small></span>`;
}
function taskbar(a, { active = false, badge = 0, startOpen = false } = {}) {
  const pinned = ['folder', 'web', 'store'];
  return `<div class="pc-bar">
    <div class="pc-bar-mid">
      <span class="pc-tb${startOpen ? ' pc-on' : ''}">${sys('start')}</span>
      <span class="pc-search">${sys('search')}<span>Rechercher</span></span>
      <span class="pc-tb">${sys('tasks', 'pc-mono')}</span>
      ${pinned.map((k) => `<span class="pc-tb">${sys(k)}</span>`).join('')}
      <span class="pc-tb pc-app${active ? ' pc-run' : ''}" title="${esc(a.name || '')}">${I}${badge ? `<em class="pc-badge">${badge > 9 ? '9+' : badge}</em>` : ''}</span>
    </div>
    <div class="pc-bar-right">
      ${sys('up', 'pc-mono pc-small')}
      ${a.behavior.tray ? `<span class="pc-tray-app" title="${esc(a.name || '')}">${I}</span>` : ''}
      <span class="pc-sys">${sys('wifi', 'pc-mono pc-small')}${sys('sound', 'pc-mono pc-small')}${sys('battery', 'pc-mono pc-small')}</span>
      ${clock()}
      ${sys('bell', 'pc-mono pc-small')}
    </div>
  </div>`;
}
function desktopIcons(a, withShortcut) {
  return `<div class="pc-icons">
    <span class="pc-dicon">${sys('trash')}<small>Corbeille</small></span>
    <span class="pc-dicon">${sys('pc')}<small>Ce PC</small></span>
    ${withShortcut ? `<span class="pc-dicon pc-app">${I}<small>${esc(a.name || 'Mon logiciel')}</small><i class="pc-arrow"></i></span>` : ''}
  </div>`;
}
function titlebar(title, { dark, min = true, max = true }) {
  return `<div class="pc-title${dark ? ' pc-dark' : ''}">${I}<span>${esc(title)}</span>${min ? `<i class="pc-cap">${SVG.min}</i>` : ''}${max ? `<i class="pc-cap">${SVG.max}</i>` : ''}<i class="pc-cap pc-close">${SVG.close}</i></div>`;
}

/** Page factice (gabarit d'un site) aux couleurs du logiciel, sous la vraie page quand l'aperçu peut l'afficher. */
function skeleton(a, label) {
  const bg = a.window.background || '#ffffff';
  const accent = a.window.accent || '#2563eb';
  const ink = luminance(bg) > 0.45 ? '17,24,39' : '243,244,246';
  return `<div class="pc-site" style="--sbg:${esc(bg)};--sac:${esc(accent)};--sink:${ink}">
    <div class="pc-site-head">${I}<b>${esc(a.name || 'Mon logiciel')}</b><span></span><span></span><span></span><i></i></div>
    <div class="pc-site-hero"><div><b></b><b class="pc-short"></b><p></p><p></p><p class="pc-short"></p><i></i></div><figure></figure></div>
    <div class="pc-site-cards"><span></span><span></span><span></span></div>
    ${label ? `<small class="pc-site-url">${esc(label)}</small>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- les quatre vues
function windowView(a, ctx) {
  const w = a.window;
  const work = { w: SCREEN.w, h: SCREEN.h - SCREEN.bar };
  const full = w.start === 'fullscreen';
  const maxd = w.start === 'maximized';
  const menuH = w.menu === 'visible' ? 26 : 0;
  const titleH = full ? 0 : 32;
  const k = Math.min(1, (work.w - 120) / w.width, (work.h - 70) / w.height);
  const ww = full ? SCREEN.w : maxd ? work.w : Math.round(w.width * k);
  const wh = full ? SCREEN.h : maxd ? work.h : Math.round(w.height * k);
  const left = full || maxd ? 0 : Math.round((work.w - ww) / 2);
  const top = full || maxd ? 0 : Math.max(16, Math.round((work.h - wh) / 2));
  const url = a.source.kind === 'url' ? a.source.url : '';
  const live = url && /^https?:/i.test(url) && ctx.webview;
  const title = w.title === 'fixed' || !url ? (a.name || 'Mon logiciel') : (hostOf(url) || a.name || 'Mon logiciel');
  const ch = wh - titleH - menuH;
  const label = a.source.kind === 'url' ? (url ? hostOf(url) : 'Adresse du site à indiquer') : a.source.dir ? 'app://local/index.html' : 'Dossier du site à choisir';
  const part = typeof globalThis.nxPartition === 'function' ? globalThis.nxPartition() : '';
  const kk = full || maxd ? 1 : k;
  const content = `${skeleton(a, label)}${live ? `<webview class="pc-wv" src="${esc(url)}" ${part ? `partition="${esc(part)}"` : ''} style="width:${Math.round(ww / kk)}px;height:${Math.round(ch / kk)}px;transform:scale(${kk})"></webview>` : ''}`;
  const winHtml = `<div class="pc-win${ctx.dark ? ' pc-dark' : ''}${full ? ' pc-full' : ''}${maxd ? ' pc-maxd' : ''}" style="left:${left}px;top:${top}px;width:${ww}px;height:${wh}px">
    ${full ? '' : titlebar(title, { dark: ctx.dark, max: w.resizable !== false })}
    ${menuH ? `<div class="pc-menu${ctx.dark ? ' pc-dark' : ''}"><span>Fichier</span><span>Édition</span><span>Affichage</span><span>Navigation</span><span>Aide</span></div>` : ''}
    <div class="pc-content" style="height:${ch}px">${content}</div>
  </div>`;
  const scaled = k < 1 && !full && !maxd ? ` (réduite à ${Math.round(k * 100)} % pour tenir sur cet écran)` : '';
  return {
    body: `${desktopIcons(a, a.install.desktop)}${winHtml}${full ? '' : taskbar(a, { active: true, badge: a.behavior.badge ? 3 : 0 })}`,
    note: `Fenêtre de ${w.width} × ${w.height} px sur un écran de 1536 × 960${scaled} · minimum ${w.minWidth} × ${w.minHeight}${full ? ' · plein écran' : maxd ? ' · démarre agrandie' : ''}${w.menu === 'auto' ? ' · menus avec Alt' : ''}${live || !url ? '' : ' · le site s’affiche ici dans l’application NEXORA pour Windows'}`,
  };
}
function installerView(a) {
  const i = a.install;
  const name = esc(a.name || 'Mon logiciel');
  if (i.mode === 'oneclick') {
    return {
      body: `${desktopIcons(a, false)}<div class="pc-win pc-setup pc-one-win" style="left:${(SCREEN.w - 420) / 2}px;top:${(SCREEN.h - SCREEN.bar - 170) / 2}px;width:420px;height:170px">
        ${titlebar(`Installation de ${a.name || 'Mon logiciel'}`, { dark: false, max: false })}
        <div class="pc-one">${I}<div><b>${name}</b><span>Installation en cours, patiente quelques secondes…</span><div class="pc-prog"><i style="width:64%"></i></div></div></div>
      </div>${taskbar(a, { active: false })}`,
      note: `Installation en un clic, puis lancement${i.scope === 'machine' ? ' · droits administrateur demandés' : ' · sans droits administrateur'}.`,
    };
  }
  const pages = ['Bienvenue', ...(i.license ? ['Licence'] : []), ...(i.scope === 'user' ? ['Pour qui'] : []), ...(i.changeDir ? ['Dossier'] : []), 'Installation', 'Fin'];
  return {
    body: `${desktopIcons(a, false)}<div class="pc-win pc-setup" style="left:${(SCREEN.w - 504) / 2}px;top:${(SCREEN.h - SCREEN.bar - 420) / 2}px;width:504px;height:420px">
      ${titlebar(`Installation de ${a.name || 'Mon logiciel'}`, { dark: false, max: false })}
      <div class="pc-setup-body"><canvas class="dsk-sidebar" width="164" height="314"></canvas>
        <div class="pc-setup-text"><b>Bienvenue dans l’assistant d’installation de ${name}</b><p>Cet assistant va installer ${name} ${esc(a.version)} sur votre ordinateur.</p><p>Il est conseillé de fermer les autres applications avant de continuer.</p><p>Cliquez sur Suivant pour continuer.</p></div></div>
      <div class="pc-setup-foot"><span>${esc(a.publisher || '')}</span><i class="pc-def">Suivant &gt;</i><i>Annuler</i></div>
    </div>${taskbar(a, { active: false })}`,
    note: `Étapes : ${pages.join(' → ')}${i.scope === 'machine' ? ' · droits administrateur demandés' : ' · sans droits administrateur'}.`,
  };
}
function startView(a, ctx) {
  const pins = [['web', 'Navigateur'], ['mail', 'Courrier'], ['photos', 'Photos'], ['settings', 'Paramètres'], ['folder', 'Explorateur'], ['store', 'Store'], ['calc', 'Calculatrice'], ['notes', 'Bloc-notes']];
  const rec = a.install.startMenu ? `<div class="pc-rec-item">${I}<span><b>${esc(a.name || 'Mon logiciel')}</b><small>Ajouté récemment</small></span></div>` : '';
  return {
    body: `${desktopIcons(a, a.install.desktop)}<div class="pc-start${ctx.dark ? ' pc-dark' : ''}">
      <div class="pc-start-search">${sys('search', 'pc-mono pc-small')}<span>Rechercher des applications, des paramètres et des documents</span></div>
      <div class="pc-start-sec"><b>Épinglé</b><small>Toutes les applications ›</small></div>
      <div class="pc-pins">${pins.map(([k, l]) => `<span>${sys(k)}<small>${l}</small></span>`).join('')}</div>
      <div class="pc-start-sec"><b>Recommandé</b><small>Plus ›</small></div>
      <div class="pc-rec">${rec}<div class="pc-rec-item">${sys('notes')}<span><b>Notes de réunion</b><small>Hier à 17:42</small></span></div>${rec ? '' : `<div class="pc-rec-item">${sys('photos')}<span><b>Vacances</b><small>Il y a 3 jours</small></span></div>`}</div>
      <div class="pc-start-foot"><span class="pc-user"><i></i>Utilisateur</span>${sys('power', 'pc-mono pc-small')}</div>
    </div>${taskbar(a, { active: false, startOpen: true })}`,
    note: `${a.install.startMenu ? 'Menu Démarrer : le logiciel apparaît dans « Recommandé », puis dans « Toutes les applications »' : 'Pas de raccourci dans le menu Démarrer (Windows n’affichera pas ses notifications)'}${a.install.desktop ? ' · raccourci sur le bureau' : ''}.`,
  };
}
function taskbarView(a, ctx) {
  const jl = (a.behavior.jumpList || []).filter((j) => j && j.label);
  const toast = a.permissions.notifications !== 'deny';
  // Icône du logiciel : dernier bouton du groupe centré de la barre des tâches.
  const appX = SCREEN.w / 2 + 196;
  return {
    body: `${desktopIcons(a, a.install.desktop)}
      <div class="pc-jump${ctx.dark ? ' pc-dark' : ''}" style="left:${appX - 150}px">
        ${jl.length ? `<b class="pc-jump-h">Tâches</b>${jl.map((j) => `<span>${I}${esc(j.label)}</span>`).join('')}<hr>` : ''}
        <span>${I}${esc(a.name || 'Mon logiciel')}</span>
        <span>${sys('pin', 'pc-mono pc-small')}Désépingler de la barre des tâches</span>
        <span>${sys('close', 'pc-mono pc-small')}Fermer la fenêtre</span>
      </div>
      ${toast ? `<div class="pc-toast${ctx.dark ? ' pc-dark' : ''}"><div class="pc-toast-h">${I}<span>${esc(a.name || 'Mon logiciel')}</span><i>${SVG.close}</i></div><b>Nouveau message</b><p>Awa : « Le devis est validé, merci ! »</p></div>` : ''}
      ${taskbar(a, { active: true, badge: a.behavior.badge ? 3 : 0 })}`,
    note: `${jl.length ? `${jl.length} action${jl.length > 1 ? 's' : ''} au clic droit sur l’icône` : 'Actions du clic droit sur l’icône : à ajouter dans Comportement'}${a.behavior.badge ? ' · pastille du nombre de non-lus' : ''}${a.behavior.tray ? ' · icône près de l’horloge' : ''}${toast ? ' · notifications de Windows' : ''}${a.behavior.shortcut ? ` · ${esc(a.behavior.shortcut.replace('CommandOrControl', 'Ctrl'))} ouvre le logiciel` : ''}.`,
  };
}
const VIEWS = { window: windowView, installer: installerView, start: startView, taskbar: taskbarView };
const ALIASES = { desktop: 'start' };
export const modeOf = (m) => (VIEWS[m] ? m : ALIASES[m] || 'window');

/** Écran complet : { html, note }. ctx : { dark, webview } */
export function pcHtml(a, mode, ctx) {
  const v = VIEWS[modeOf(mode)](a, ctx);
  return {
    html: `<div class="dsk-pc"><div class="pc-monitor"><div class="pc-screen"><div class="pc-os${ctx.dark ? ' pc-dark' : ''}" style="width:${SCREEN.w}px;height:${SCREEN.h}px">${v.body}</div></div></div><div class="pc-stand"><i></i><b></b></div></div>`,
    note: v.note,
  };
}
