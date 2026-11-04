// NEXORA #032 : réglages redessinés. Fenêtre « Personnaliser l'interface » en cartes (aperçus du thème, couleurs,
// échelle, polices, fond de la scène, affichage, appareils, accessibilité, raccourcis vers le compte, l'IA, les
// outils et la maintenance) et menu « Réglages » du rail. Mêmes réglages et mêmes fonctions que W et R de
// chunk-Y6Q6RT63.js (enregistrement, application du thème, échelle de la fenêtre) : seule la présentation change.
import { a as ACCENTS, b as UI_DEFAULTS, d as isDark, f as applyTheme, nxFonts as FONTS, nxStages as STAGES } from '../../dist/chunks/chunk-5PYR55EX.js';
import { j as SCALES, k as setUiScale } from '../../dist/chunks/chunk-Y6Q6RT63.js';
import { h as seg, i as toggleRow } from '../../dist/chunks/chunk-6ZWS5EFO.js';
import { o as bus } from '../../dist/chunks/chunk-VBMWAH3C.js';
import { e as cloud, u as avatar } from '../../dist/chunks/chunk-EZKHFSAB.js';
import { ico, esc, settings, state, saveSettings, sheet, closeSheet, toast } from '../core.js';

const THEMES = { light: ['Clair', 'sun'], dark: ['Sombre', 'moon'], system: ['Auto', 'auto'] };
const DISPLAY = [
  ['density', 'Densité', 'Espacement des listes, barres et panneaux', { compact: 'Compacte', normal: 'Normale', comfy: 'Aérée' }],
  ['radius', 'Arrondis', 'Coins des panneaux, cartes et boutons', { square: 'Nets', normal: 'Normaux', round: 'Très arrondis' }],
  ['glass', 'Transparence', 'Effet « Liquid Glass » des barres flottantes', { solid: 'Opaque', normal: 'Verre', clear: 'Verre léger' }],
  ['motion', 'Animations', 'Ouverture des fenêtres, menus et transitions', { normal: 'Normales', reduced: 'Réduites', none: 'Aucune' }],
];
const FONT_NAMES = { inter: 'Inter', system: 'Système', rounded: 'Arrondie', serif: 'Classique', mono: 'Code' };
const STAGE_NAMES = { default: 'Par défaut', plain: 'Uni', cool: 'Froid', warm: 'Chaud', mint: 'Menthe', dusk: 'Crépuscule', dark: 'Sombre' };
// Fond « Par défaut » : couleurs --stage-a et --stage-b de styles.css (NEXORA 2), clair puis sombre.
const STAGE_DEFAULT = ['#f5f6fa', '#eceef4', '#121318', '#0f1014'];

const accentName = () => (settings.accent === 'custom' ? 'Personnalisée' : (ACCENTS[settings.accent] || ACCENTS.blue)[2]);

function card(icon, title, sub, body, cls = '') {
  return `<section class="nxc-card nxr-card ${cls}">
    <div class="nxc-card-head"><span class="nxc-card-ic">${ico(icon, 15)}</span><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div></div>
    ${body}
  </section>`;
}

function themeTiles() {
  return `<div class="nxr-themes" role="radiogroup" aria-label="Thème">${Object.entries(THEMES).map(([k, [label, icon]]) => `
    <button type="button" class="nxr-theme${settings.appTheme === k ? ' on' : ''}" role="radio" aria-checked="${settings.appTheme === k}" data-set="appTheme" data-val="${k}">
      <span class="nxr-win is-${k}" aria-hidden="true"><i class="w-rail"></i><i class="w-bar"></i><i class="w-card a"></i><i class="w-card b"></i><i class="w-card c"></i></span>
      <span class="nxr-theme-lb">${ico(icon, 14)}<span>${label}</span></span>
    </button>`).join('')}</div>`;
}

function swatches() {
  const dark = isDark();
  const custom = settings.ui.accentCustom;
  return `<div class="swatches nxr-swatches">${Object.entries(ACCENTS).map(([k, c]) => `<button type="button" class="swatch${settings.accent === k ? ' on' : ''}" style="--c:${dark ? c[1] : c[0]}" data-accent="${k}" title="${esc(c[2])}" aria-label="${esc(c[2])}"></button>`).join('')}<label class="swatch custom${settings.accent === 'custom' ? ' on' : ''}" style="--c:${esc(custom)}" title="Couleur personnalisée"><input type="color" value="${esc(custom)}" data-ui-accent aria-label="Couleur personnalisée"></label></div>`;
}

function chips(key, values) {
  const cur = String(settings.ui[key]);
  return `<div class="nxr-seg" role="radiogroup">${Object.entries(values).map(([v, label]) => `<button type="button" role="radio" aria-checked="${cur === String(v)}" class="${cur === String(v) ? 'on' : ''}" data-ui="${key}" data-val="${esc(v)}">${label}</button>`).join('')}</div>`;
}

function quick() {
  const user = cloud.user;
  const p = cloud.profile || {};
  const items = [
    ['compte', user ? avatar(p.id ? p : { email: user.email, id: user.id }, 36) : `<span class="nxr-q-ic">${ico('cloud', 18)}</span>`, user ? 'Mon compte' : 'Connexion', user ? 'Profil, sécurité, équipe et offre' : 'Retrouve tes projets sur le web et sur Windows'],
    ['ia', `<span class="nxr-q-ic">${ico('sparkle', 18)}</span>`, 'Assistant IA', 'Connecte ta clé API et choisis l’IA active'],
    ['outils', `<span class="nxr-q-ic">${ico('download', 18)}</span>`, 'NEX-OUTILS', 'Préparer ou mettre à jour les outils'],
    ['maint', `<span class="nxr-q-ic">${ico('shield', 18)}</span>`, 'Maintenance', 'Sauvegarde, mises à jour, mode léger'],
  ];
  return `<div class="nxr-quick">${items.map(([go, media, title, sub]) => `<button type="button" class="nxc-card nxr-q" data-go="${go}">${media}<span class="nxr-q-txt"><b>${title}</b><small>${sub}</small></span>${ico('chevronRight', 14)}</button>`).join('')}</div>`;
}

function html() {
  const ui = settings.ui;
  const dark = isDark();
  const scale = Number(ui.scale) || 1;
  const fonts = `<div class="nxr-fonts" role="radiogroup">${Object.entries(FONT_NAMES).map(([k, label]) => `<button type="button" role="radio" aria-checked="${ui.font === k}" class="nxr-tile${ui.font === k ? ' on' : ''}" data-ui="font" data-val="${k}"><span class="nxr-aa" style="font-family:${esc(FONTS[k] || FONTS.inter)}">Aa</span><small>${label}</small></button>`).join('')}</div>`;
  const stages = `<div class="nxr-stages" role="radiogroup">${Object.keys(STAGE_NAMES).map((k) => {
    const c = STAGES[k] || STAGE_DEFAULT;
    const a = (dark && c[2]) || c[0];
    const b = (dark && c[3]) || c[1];
    return `<button type="button" role="radio" aria-checked="${ui.stage === k}" class="nxr-tile${ui.stage === k ? ' on' : ''}" data-ui="stage" data-val="${k}"><span class="nxr-stage" style="--a:${a};--b:${b}"></span><small>${STAGE_NAMES[k]}</small></button>`;
  }).join('')}</div>`;
  const scales = `<div class="nxr-scale"><b class="nxr-big">${Math.round(scale * 100)}<small> %</small></b><div class="nxr-seg">${SCALES.map((s) => `<button type="button" class="${Math.abs(scale - s) < 0.001 ? 'on' : ''}" data-ui-scale-set="${s}">${Math.round(s * 100)} %</button>`).join('')}</div></div>
    <p class="nxr-hint">${ico('key', 12)} Ctrl+Alt+− · Ctrl+Alt+= · Ctrl+Alt+0 pour revenir à 100 %</p>`;
  const display = `<div class="nxr-rows">${DISPLAY.map(([k, label, sub, values]) => `<div class="nxr-row"><div><b>${label}</b><small>${sub}</small></div>${chips(k, values)}</div>`).join('')}</div>`;
  const devices = `<div class="nxr-togs">
      ${toggleRow('displayHD', 'Écrans en haute définition', 'La page est dessinée à la définition réelle de l’appareil : texte net, photos et vidéos en pleine définition', settings.displayHD)}
      ${toggleRow('framesOn', 'Cadre de l’appareil', 'Coque, boutons et encoche autour de l’écran', settings.framesOn)}
      ${toggleRow('statusBar', 'Barre d’état', 'Heure, réseau et batterie en haut de l’écran', settings.statusBar)}
    </div>`;
  const check = (k, title, sub) => `<label class="tog-row"><span class="tog-text"><span>${title}</span><small>${sub}</small></span><input type="checkbox" data-ui-check="${k}" ${ui[k] ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>`;
  const access = `<div class="nxr-togs">
      ${check('contrast', 'Contraste renforcé', 'Séparateurs et textes secondaires plus marqués')}
      ${check('labels', 'Libellés des onglets', 'Afficher les noms des espaces dans le rail (sinon icônes seules)')}
    </div>`;
  return `
  <div class="nxr">
    <header class="sheet-head nxr-head">
      <div><small class="nxc-kicker">Réglages</small><h2>Personnalise NEXORA</h2><p>Les changements s’appliquent tout de suite, dans tous les espaces.</p></div>
    </header>
    <div class="sheet-body nxr-body">
      ${quick()}
      <div class="nxr-grid">
        ${card('palette', 'Thème', 'Clair, sombre, ou selon Windows', themeTiles(), 'span2')}
        ${card('nxPalette', 'Couleur d’accentuation', `Boutons, sélections et bannière du profil · <b>${esc(accentName())}</b>`, swatches(), 'span2')}
        ${card('nxScale', 'Échelle de l’interface', 'Tout le logiciel : panneaux, menus, fenêtres, outils', scales, 'span2')}
        ${card('nxType', 'Police', 'Textes de l’interface', fonts, 'span2')}
        ${card('grid', 'Affichage', 'Densité, arrondis, transparence et animations', display, 'span4')}
        ${card('image', 'Fond de la scène', 'Derrière les appareils du Responsive Lab', stages, 'span4')}
        ${card('phone', 'Appareils', 'Rendu des sites dans le Responsive Lab', devices, 'span2')}
        ${card('nxAccess', 'Accessibilité', 'Lisibilité et navigation', access, 'span2')}
      </div>
    </div>
    <div class="sheet-foot"><button class="btn" data-ui-reset>${ico('restart', 13)}<span>Réglages d’origine</span></button><span class="grow"></span><button class="btn primary" data-sheet="close">Terminé</button></div>
  </div>`;
}

// Raccourcis : mêmes fenêtres que le menu Réglages, la palette « Aller à » et le menu du compte.
// Une erreur (fonction de bureau absente de l'aperçu, par exemple) s'affiche en notification.
const OPEN = {
  compte: () => import('../../dist/chunks/chunk-EOM7FQDL.js').then((m) => (cloud.user ? m.j('profile') : m.h())),
  ia: () => import('../../dist/chunks/ai-RLNIHTXY.js').then((m) => m.openAiSettings()),
  outils: () => import('../../dist/chunks/setup-ECKH4HAI.js').then((m) => m.openSetup()),
  maint: () => import('../../dist/chunks/maintenance-MDTLNMUF.js').then((m) => m.openMaintenance()),
};
function go(target) {
  if (!OPEN[target]) return;
  OPEN[target]().catch((e) => toast((e && e.message) || String(e), { kind: 'bad' }));
}

// Fenêtre « Personnaliser l'interface » (remplace W de chunk-Y6Q6RT63.js, mêmes effets).
export function open() {
  settings.ui = { ...UI_DEFAULTS, ...(settings.ui || {}) };
  const el = sheet('ui', html(), { wide: true });
  const redraw = () => {
    const top = (el.querySelector('.sheet-body') || {}).scrollTop || 0;
    el.innerHTML = html();
    const body = el.querySelector('.sheet-body');
    if (body) body.scrollTop = top;
  };
  const apply = () => { saveSettings(); applyTheme(); redraw(); };
  el.refresh = redraw;
  el.onclick = (e) => {
    let b;
    if ((b = e.target.closest('[data-ui-scale-set]'))) { setUiScale(Number(b.dataset.uiScaleSet)); redraw(); return; }
    if ((b = e.target.closest('[data-ui]'))) { settings.ui[b.dataset.ui] = b.dataset.val; apply(); return; }
    if ((b = e.target.closest('[data-set="appTheme"]'))) { settings.appTheme = b.dataset.val; apply(); return; }
    if ((b = e.target.closest('[data-accent]'))) { settings.accent = b.dataset.accent; apply(); return; }
    if ((b = e.target.closest('[data-go]'))) { go(b.dataset.go); return; }
    if (e.target.closest('[data-ui-reset]')) {
      settings.ui = { ...UI_DEFAULTS };
      settings.accent = 'nexora';
      saveSettings();
      applyTheme();
      closeSheet('ui');
      open();
    }
  };
  el.onchange = async (e) => {
    const t = e.target;
    if (t.matches('[data-ui-accent]')) { settings.ui.accentCustom = t.value; settings.accent = 'custom'; apply(); return; }
    if (t.dataset.uiCheck) { settings.ui[t.dataset.uiCheck] = t.checked; saveSettings(); applyTheme(); return; }
    if (t.dataset.toggle) {
      settings[t.dataset.toggle] = t.checked;
      saveSettings();
      if (state.board) await state.board.refreshAll();
      bus.emit('board-changed');
    }
  };
  return el;
}

// Menu « Réglages » du rail (contenu du menu de R, chunk-Y6Q6RT63.js, qui garde ses propres actions :
// data-set, data-accent, data-toggle, data-ui-more, data-tools, data-maint).
export function pop() {
  const dark = isDark();
  const link = (attr, icon, label) => `<button type="button" class="nxr-link" ${attr}><span class="nxr-link-ic">${ico(icon, 15)}</span><span>${label}</span>${ico('chevronRight', 13)}</button>`;
  return `
    <div class="nxr-pop-head"><span class="nxc-brand-ic">${ico('palette', 16)}</span><div><b>Apparence</b><small>Thème, couleur et affichage des appareils</small></div></div>
    ${seg('appTheme', settings.appTheme, { light: `${ico('sun', 15)}<span>Clair</span>`, dark: `${ico('moon', 15)}<span>Sombre</span>`, system: `${ico('auto', 15)}<span>Auto</span>` })}
    <div class="pop-sub">Couleur d'accentuation</div>
    <div class="swatches">${Object.entries(ACCENTS).map(([k, c]) => `<button class="swatch${settings.accent === k ? ' on' : ''}" style="--c:${dark ? c[1] : c[0]}" data-accent="${k}" title="${esc(c[2])}" aria-label="${esc(c[2])}"></button>`).join('')}</div>
    <div class="pop-sub">Affichage des appareils</div>
    <div class="nxr-pop-group">
      ${toggleRow('displayHD', 'Écrans en haute définition', 'La page est dessinée à la définition réelle de l\'appareil : texte net, photos et vidéos en pleine définition', settings.displayHD)}
      ${toggleRow('framesOn', 'Cadre de l\'appareil', '', settings.framesOn)}
      ${toggleRow('statusBar', 'Barre d\'état', 'Heure, réseau et batterie en haut de l\'écran', settings.statusBar)}
    </div>
    <div class="nxr-links">
      ${link('data-ui-more', 'wrench', 'Personnaliser l’interface…')}
      ${link('data-tools', 'download', 'NEX-OUTILS…')}
      ${link('data-maint', 'shield', 'Maintenance et sauvegarde…')}
    </div>`;
}
