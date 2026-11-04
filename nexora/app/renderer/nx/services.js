// NEXORA #011 : services partagés par NEX-DESIGN, le Studio et les Maquettes.
// Kit de marque, assistant IA (texte, image, transcription) et coédition en direct (Supabase Realtime).
import { api, settings, saveSettings, esc, ico, sheet, closeSheet, sheetHtml, toast, pickFile, loadImage, dominantColors, uid, hexRgb } from './core.js';

// ---------- Kit de marque ----------
const BRAND_DEFAULT = { name: '', colors: ['#6a4cff', '#ff2d78', '#ffcc00', '#14151a', '#f5f5f7'], fonts: { title: 'NX Inter', body: 'NX Inter' }, logo: null };
export const BRAND_FONTS = [['Inter', 'NX Inter'], ['Space Grotesk', 'NX Space Grotesk'], ['Fredoka', 'NX Fredoka'], ['Playfair Display', 'NX Playfair'], ['Segoe UI', 'Segoe UI'], ['Georgia', 'Georgia'], ['Arial', 'Arial'], ['Trebuchet MS', 'Trebuchet MS'], ['Impact', 'Impact'], ['Consolas', 'Consolas']];
export function getBrand() {
  const b = settings.nxBrand || {};
  return { ...BRAND_DEFAULT, ...b, colors: Array.isArray(b.colors) && b.colors.length ? [...b.colors, ...BRAND_DEFAULT.colors].slice(0, 5) : [...BRAND_DEFAULT.colors], fonts: { ...BRAND_DEFAULT.fonts, ...(b.fonts || {}) } };
}
export function setBrand(b) {
  settings.nxBrand = { ...getBrand(), ...b };
  saveSettings();
  for (const fn of brandListeners) try { fn(settings.nxBrand); } catch (e) { console.warn('[marque]', e); }
}
const brandListeners = new Set();
export const onBrand = (fn) => (brandListeners.add(fn), () => brandListeners.delete(fn));
export const hasBrand = () => !!(settings.nxBrand && (settings.nxBrand.name || settings.nxBrand.logo || settings.nxBrand.colors));

// Fenêtre d'édition du kit de marque (commune aux trois espaces).
export function brandSheet({ onApply = null, applyLabel = '' } = {}) {
  const b = getBrand();
  const labels = ['Principale', 'Secondaire', 'Accent', 'Texte foncé', 'Fond clair'];
  const render = () => sheetHtml({
    icon: 'nxBrand',
    title: 'Kit de marque',
    sub: 'Logo, couleurs et polices de ta marque : NEX-DESIGN, le Studio et les Maquettes les appliquent en un clic.',
    body: `<div class="field-label">Nom de la marque</div><input class="input" data-nxb="name" value="${esc(b.name)}" placeholder="Ma marque">
      <div class="field-label">Couleurs</div>
      <div class="nx-brand-colors">${b.colors.map((c, i) => `<label class="nx-brand-color"><input type="color" data-nxb-color="${i}" value="${esc(c)}"><span>${labels[i]}</span><code>${esc(c)}</code></label>`).join('')}</div>
      <div class="nx-row"><button class="btn small" data-nxb-act="from-logo" ${b.logo ? '' : 'disabled'}>${ico('nxPalette', 13)}<span>Tirer les couleurs du logo</span></button></div>
      <div class="nx-grid2">
        <div><div class="field-label">Police des titres</div><select class="input" data-nxb="title">${BRAND_FONTS.map(([n, v]) => `<option value="${esc(v)}" ${b.fonts.title === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <div><div class="field-label">Police des textes</div><select class="input" data-nxb="body">${BRAND_FONTS.map(([n, v]) => `<option value="${esc(v)}" ${b.fonts.body === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      </div>
      <div class="field-label">Logo</div>
      <div class="nx-brand-logo">${b.logo ? `<img src="${b.logo}" alt="Logo">` : `<span class="nx-muted">${ico('image', 18)} Aucun logo</span>`}
        <button class="btn small" data-nxb-act="logo">${ico('upload', 13)}<span>${b.logo ? 'Remplacer' : 'Importer'}…</span></button>
        ${b.logo ? `<button class="btn small" data-nxb-act="logo-del">${ico('trash', 13)}<span>Retirer</span></button>` : ''}</div>
      <div class="nx-brand-preview" style="--b1:${b.colors[0]};--b2:${b.colors[1]};--b3:${b.colors[2]};--b4:${b.colors[3]};--b5:${b.colors[4]}">
        <b style="font-family:'${esc(b.fonts.title)}'">${esc(b.name || 'Ma marque')}</b><span style="font-family:'${esc(b.fonts.body)}'">Un aperçu de ton style.</span><i></i><i></i><i></i></div>`,
    go: applyLabel || 'Enregistrer',
    goIcon: 'check'
  });
  const s = sheet('nx-brand', render());
  const refresh = () => { s.innerHTML = render(); };
  s.oninput = (e) => {
    const t = e.target;
    if (t.dataset.nxbColor != null) { b.colors[Number(t.dataset.nxbColor)] = t.value; const code = t.parentElement.querySelector('code'); if (code) code.textContent = t.value; const pv = s.querySelector('.nx-brand-preview'); pv && pv.style.setProperty(`--b${Number(t.dataset.nxbColor) + 1}`, t.value); }
    if (t.dataset.nxb === 'name') b.name = t.value;
  };
  s.onchange = (e) => {
    const t = e.target;
    if (t.dataset.nxb === 'title' || t.dataset.nxb === 'body') { b.fonts[t.dataset.nxb] = t.value; refresh(); }
  };
  s.onclick = async (e) => {
    const a = e.target.closest('[data-nxb-act]');
    if (a) {
      if (a.dataset.nxbAct === 'logo') {
        const f = await pickFile({ title: 'Logo de la marque', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] });
        if (f && f.dataUrl) { b.logo = f.dataUrl; refresh(); }
      }
      if (a.dataset.nxbAct === 'logo-del') { b.logo = null; refresh(); }
      if (a.dataset.nxbAct === 'from-logo' && b.logo) {
        try { const img = await loadImage(b.logo); const cols = dominantColors(img, 5).filter((c) => { const [r, g, bb] = hexRgb(c); return !(r > 240 && g > 240 && bb > 240); }); cols.slice(0, 3).forEach((c, i) => { b.colors[i] = c; }); refresh(); toast('Couleurs tirées du logo.'); } catch { toast('Le logo n’a pas pu être lu.', { kind: 'bad' }); }
      }
      return;
    }
    if (e.target.closest('[data-nx-go]')) {
      setBrand(b);
      closeSheet('nx-brand');
      if (onApply) await onApply(getBrand()); else toast('Kit de marque enregistré.');
    }
  };
}

// ---------- Assistant IA (clé de l'utilisateur, via le processus principal) ----------
export async function aiReady() {
  try {
    const s = await api.invoke('ai:status');
    return !!(s && s.active && s.providers && s.providers[s.active] && s.providers[s.active].connected);
  } catch { return false; }
}
export async function aiProvider() {
  try { const s = await api.invoke('ai:status'); return s && s.active ? s.active : null; } catch { return null; }
}
export async function aiChat(prompt, { system = '', maxTokens = 1400, temperature = 0.7 } = {}) {
  const r = await api.invoke('ai:chat', { id: `nx-${uid()}`, system, messages: [{ role: 'user', content: prompt }], maxTokens, temperature });
  if (!r || r.error) throw new Error(r && r.error ? r.error : 'L’assistant IA n’a pas répondu.');
  return String(r.text || '').trim();
}
// Réponse JSON : on isole le premier objet ou tableau de la réponse.
export async function aiJson(prompt, opts = {}) {
  const txt = await aiChat(`${prompt}\n\nRéponds uniquement avec du JSON valide, sans texte autour.`, { temperature: 0.6, ...opts });
  const m = txt.match(/[[{][\s\S]*[\]}]/);
  if (!m) throw new Error('Réponse de l’IA illisible.');
  return JSON.parse(m[0]);
}
export async function aiImage({ prompt, image = null, mask = null, size = '1024x1024' }) {
  const r = await api.invoke('ai:image', { prompt, image, mask, size });
  if (!r || r.error) throw new Error(r && r.error ? r.error : 'La génération d’image a échoué.');
  return r.dataUrl;
}
export async function aiTranscribe(bytes, { mime = 'audio/wav', name = 'audio.wav', language = 'fr' } = {}) {
  const r = await api.invoke('ai:transcribe', { data: Array.from(bytes), mime, name, language });
  if (!r || r.error) throw new Error(r && r.error ? r.error : 'La transcription a échoué.');
  return r;
}
// Message clair quand l'IA n'est pas configurée.
export async function needAi() {
  if (await aiReady()) return true;
  toast('Connecte d’abord ta clé IA (bouton « IA » du rail).', { kind: 'bad', action: 'Ouvrir', onAction: () => document.getElementById('btnAI') && document.getElementById('btnAI').click() });
  return false;
}

// ---------- Coédition en direct ----------
// Salle partagée : diffusion de l'état et des curseurs par Supabase Realtime (aucune écriture en base).
export class CollabRoom {
  constructor({ kind, code, onState, onCursor, onPeers, getState }) {
    Object.assign(this, { kind, code, onState, onCursor, onPeers, getState });
    this.me = { id: uid(), name: 'Invité', color: ['#ff2d78', '#0a84ff', '#34c759', '#ff9500', '#af52de'][Math.floor(Math.random() * 5)] };
    this.rev = 0;
    this.peers = [];
  }
  async join() {
    const mod = await import('../dist/chunks/chunk-EZKHFSAB.js');
    const client = mod.b; const cloud = mod.e;
    if (!client || !client.channel) throw new Error('Service de coédition indisponible.');
    if (cloud && cloud.user) this.me.name = (cloud.profile && cloud.profile.full_name) || cloud.user.email || this.me.name;
    this.channel = client.channel(`nexora-collab:${this.kind}:${this.code}`, { config: { broadcast: { self: false }, presence: { key: this.me.id } } });
    this.channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (!payload || payload.by === this.me.id) return;
      this.rev = Math.max(this.rev, payload.rev || 0);
      this.onState && this.onState(payload.state, payload);
    });
    this.channel.on('broadcast', { event: 'cursor' }, ({ payload }) => { payload && payload.by !== this.me.id && this.onCursor && this.onCursor(payload); });
    this.channel.on('broadcast', { event: 'hello' }, () => { this.sendState(true); });
    this.channel.on('presence', { event: 'sync' }, () => {
      const st = this.channel.presenceState();
      this.peers = Object.values(st).map((v) => v[0]).filter((p) => p && p.id !== this.me.id);
      this.onPeers && this.onPeers(this.peers);
    });
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Connexion au service de coédition impossible (réseau ou pare-feu).')), 9000);
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(to);
          await this.channel.track(this.me);
          this.channel.send({ type: 'broadcast', event: 'hello', payload: { by: this.me.id } });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(to); reject(new Error('Le service de coédition a refusé la connexion.')); }
      });
    });
    return this;
  }
  sendState(force = false) {
    if (!this.channel) return;
    clearTimeout(this.t);
    const go = () => {
      const state = this.getState && this.getState();
      if (!state) return;
      this.channel.send({ type: 'broadcast', event: 'state', payload: { by: this.me.id, name: this.me.name, rev: ++this.rev, state } });
    };
    force ? go() : (this.t = setTimeout(go, 500));
  }
  sendCursor(x, y, extra = {}) {
    if (!this.channel) return;
    const now = performance.now();
    if (now - (this.lastCur || 0) < 60) return;
    this.lastCur = now;
    this.channel.send({ type: 'broadcast', event: 'cursor', payload: { by: this.me.id, name: this.me.name, color: this.me.color, x, y, ...extra } });
  }
  async leave() {
    clearTimeout(this.t);
    if (this.channel) { try { await this.channel.unsubscribe(); } catch { /* déjà fermé */ } }
    this.channel = null;
  }
}
export const roomCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

// Fenêtre « Coéditer en direct » : créer ou rejoindre une salle.
export function collabSheet({ current, onStart, onStop }) {
  const s = sheet('nx-collab', sheetHtml({
    icon: 'nxUsers',
    title: 'Coéditer en direct',
    sub: 'Travaille à plusieurs sur le même document : les modifications et les curseurs s’affichent chez tout le monde. Partage le code de la salle avec tes coéquipiers.',
    body: current ? `<div class="nx-room"><span class="nx-muted">Salle en cours</span><b class="nx-code">${esc(current.code)}</b><span>${current.peers.length ? `${current.peers.length} autre${current.peers.length > 1 ? 's' : ''} personne${current.peers.length > 1 ? 's' : ''} connectée${current.peers.length > 1 ? 's' : ''}` : 'Personne d’autre pour l’instant.'}</span></div>
      <div class="nx-row"><button class="btn small" data-nxc="copy">${ico('copy', 13)}<span>Copier le code</span></button><button class="btn small" data-nxc="stop">${ico('close', 13)}<span>Quitter la salle</span></button></div>`
      : `<div class="nx-grid2"><div><div class="field-label">Créer une salle</div><button class="btn wide" data-nxc="new">${ico('plus', 14)}<span>Nouvelle salle</span></button></div>
        <div><div class="field-label">Rejoindre une salle</div><div class="nx-row"><input class="input" data-nxc-code placeholder="Code (6 caractères)" maxlength="6"><button class="btn" data-nxc="join">Rejoindre</button></div></div></div>
        <p class="sheet-note">Connexion directe entre les participants : rien n’est enregistré sur le serveur. Chacun garde sa copie du document.</p>`
  }));
  s.onclick = async (e) => {
    const b = e.target.closest('[data-nxc]');
    if (!b) return;
    const a = b.dataset.nxc;
    if (a === 'copy') { await api.invoke('clipboard:write', current.code).catch(() => {}); toast('Code de la salle copié.'); return; }
    if (a === 'stop') { closeSheet('nx-collab'); await onStop(); return; }
    const code = a === 'new' ? roomCode() : String((s.querySelector('[data-nxc-code]') || {}).value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { toast('Saisis le code à 6 caractères donné par ton coéquipier.', { kind: 'bad' }); return; }
    closeSheet('nx-collab');
    await onStart(code, a === 'new');
  };
}
