'use strict';
/* Extensions VS Code pour l'éditeur intégré du Dev Lab, depuis Open VSX (le registre ouvert de la
 * fondation Eclipse) : thèmes de couleurs, extraits de code (snippets) et réglages de langages.
 * Les extensions complètes (débogueurs, linters, assistants…) s'utilisent dans le mode VS Code. */
const fs = require('fs');
const path = require('path');
const zip = require('../android/zip');

const API = 'https://open-vsx.org/api';

// JSON avec commentaires et virgules finales (fichiers de VS Code).
function parseJsonc(text) {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n || ''; i += 2; continue; }
      if (c === '"') inStr = false;
      i += 1;
      continue;
    }
    if (c === '"') { inStr = true; out += c; i += 1; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i += 1; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1; i += 2; continue; }
    out += c;
    i += 1;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1').replace(/^﻿/, ''));
}

class Extensions {
  constructor({ dataDir, fetchImpl }) {
    this.dir = path.join(dataDir, 'dev-extensions');
    this.fetch = fetchImpl;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async search({ query = '', category = '', size = 30 } = {}) {
    const u = new URL(`${API}/-/search`);
    u.searchParams.set('query', query);
    if (category) u.searchParams.set('category', category);
    u.searchParams.set('size', String(size));
    u.searchParams.set('sortBy', query ? 'relevance' : 'downloadCount');
    u.searchParams.set('sortOrder', 'desc');
    const r = await this.fetch(u.toString());
    if (!r.ok) throw new Error(`Open VSX ne répond pas (HTTP ${r.status}).`);
    const j = await r.json();
    const installed = new Set(this.list().map((e) => e.id));
    // Les icônes sont lues ici (l'interface n'accepte pas d'images distantes).
    const icons = await Promise.all((j.extensions || []).map((e) => this.iconData(e.files && e.files.icon)));
    return (j.extensions || []).map((e, i) => ({
      iconData: icons[i],
      id: `${e.namespace}.${e.name}`, namespace: e.namespace, name: e.name, version: e.version, title: e.displayName || e.name, description: e.description || '', icon: e.files && e.files.icon, download: e.files && e.files.download, downloads: e.downloadCount || 0, installed: installed.has(`${e.namespace}.${e.name}`),
    }));
  }

  async iconData(url) {
    if (!url) return null;
    try {
      const r = await this.fetch(url);
      if (!r.ok) return null;
      const type = r.headers.get('content-type') || 'image/png';
      if (!/^image\//.test(type)) return null;
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > 200000) return null;
      return `data:${type};base64,${b.toString('base64')}`;
    } catch { return null; }
  }

  async install({ namespace, name }) {
    const r = await this.fetch(`${API}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
    if (!r.ok) throw new Error(`Extension introuvable (HTTP ${r.status}).`);
    const meta = await r.json();
    const dl = meta.files && meta.files.download;
    if (!dl) throw new Error("Cette extension n'a pas de fichier à télécharger.");
    const f = await this.fetch(dl, { redirect: 'follow' });
    if (!f.ok) throw new Error(`Téléchargement impossible (HTTP ${f.status}).`);
    const buf = Buffer.from(await f.arrayBuffer());
    if (buf.length > 60e6) throw new Error('Extension trop volumineuse.');
    const id = `${namespace}.${name}`;
    const dest = path.join(this.dir, id);
    const tmp = path.join(this.dir, `${id}.vsix`);
    fs.writeFileSync(tmp, buf);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    try { await zip.extract(tmp, dest, { strip: 1 }); } finally { fs.rmSync(tmp, { force: true }); }
    const pkg = this.readPkg(dest);
    if (!pkg) { fs.rmSync(dest, { recursive: true, force: true }); throw new Error("Cette archive n'est pas une extension VS Code."); }
    const iconData = await this.iconData(meta.files.icon);
    fs.writeFileSync(path.join(dest, '.nexora.json'), JSON.stringify({ id, version: meta.version, title: meta.displayName || name, icon: iconData, installed: new Date().toISOString() }));
    return this.describe(id);
  }

  uninstall(id) {
    const dest = path.join(this.dir, id);
    if (!dest.startsWith(this.dir) || id.includes('..')) return false;
    fs.rmSync(dest, { recursive: true, force: true });
    return true;
  }

  readPkg(dir) {
    try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { return null; }
  }

  list() {
    let ids = [];
    try { ids = fs.readdirSync(this.dir).filter((d) => fs.existsSync(path.join(this.dir, d, 'package.json'))); } catch { ids = []; }
    return ids.map((id) => this.describe(id)).filter(Boolean);
  }

  // Ce que l'éditeur intégré sait utiliser : thèmes, extraits de code, configuration des langages.
  describe(id) {
    const dir = path.join(this.dir, id);
    const pkg = this.readPkg(dir);
    if (!pkg) return null;
    let info = {};
    try { info = JSON.parse(fs.readFileSync(path.join(dir, fs.existsSync(path.join(dir, '.nexora.json')) ? '.nexora.json' : '.vitrine.json'), 'utf8')); } catch { /* ancienne installation */ }
    const c = pkg.contributes || {};
    const inside = (p) => { const f = path.resolve(dir, p); return f.startsWith(dir) ? f : null; };
    const themes = (c.themes || []).map((t) => ({ label: t.label || t.id || path.basename(t.path), uiTheme: t.uiTheme, path: t.path })).filter((t) => /\.json$/i.test(t.path || ''));
    const snippets = (c.snippets || []).map((s) => ({ language: s.language, path: s.path })).filter((s) => s.path);
    const languages = (c.languages || []).filter((l) => l.configuration).map((l) => ({ id: l.id, extensions: l.extensions || [], configuration: l.configuration }));
    const unsupported = Object.keys(c).filter((k) => !['themes', 'snippets', 'languages', 'grammars', 'iconThemes', 'configuration', 'keybindings'].includes(k));
    return {
      id, title: info.title || pkg.displayName || pkg.name, version: info.version || pkg.version, description: pkg.description || '', icon: info.icon || null,
      themes, snippets, languages, unsupported, hasMain: Boolean(pkg.main || pkg.browser), dir, inside: Boolean(inside),
    };
  }

  // Contenu des contributions, prêt pour Monaco.
  contributions() {
    const out = { themes: [], snippets: [], languages: [] };
    for (const e of this.list()) {
      const dir = path.join(this.dir, e.id);
      const read = (p) => {
        const f = path.resolve(dir, p);
        if (!f.startsWith(dir)) return null;
        try { return parseJsonc(fs.readFileSync(f, 'utf8')); } catch { return null; }
      };
      for (const t of e.themes) {
        let theme = read(t.path);
        // Thèmes qui en incluent un autre (« include »).
        let guard = 0;
        while (theme && theme.include && guard < 4) {
          const parent = read(path.join(path.dirname(t.path), theme.include));
          if (!parent) break;
          theme = {
            ...parent, ...theme, colors: { ...(parent.colors || {}), ...(theme.colors || {}) }, tokenColors: [...(Array.isArray(parent.tokenColors) ? parent.tokenColors : []), ...(Array.isArray(theme.tokenColors) ? theme.tokenColors : [])], include: parent.include,
          };
          guard += 1;
        }
        if (theme) out.themes.push({ ext: e.id, label: t.label, uiTheme: t.uiTheme, colors: theme.colors || {}, tokenColors: Array.isArray(theme.tokenColors) ? theme.tokenColors : [] });
      }
      for (const s of e.snippets) { const j = read(s.path); if (j) out.snippets.push({ ext: e.id, language: s.language, items: j }); }
      for (const l of e.languages) { const j = read(l.configuration); if (j) out.languages.push({ ext: e.id, id: l.id, configuration: j }); }
    }
    return out;
  }
}

module.exports = { Extensions, parseJsonc };
