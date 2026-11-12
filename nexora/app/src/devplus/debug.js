'use strict';
/* NEXORA #052 : débogueur des programmes Node.js (serveur, scripts) par le protocole d'inspection de Node :
 * points d'arrêt, pas à pas, pile d'appels, variables et évaluation. La page affichée se débogue avec les outils
 * de développement de l'aperçu (côté interface). */
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');
const { start, envFor, inside, killTree, readJson } = require('./util');

const fileOf = (url) => { try { return url && url.startsWith('file:') ? fileURLToPath(url) : url || ''; } catch { return url || ''; } };

class Session {
  constructor(emit) { this.emit = emit; this.ws = null; this.seq = 0; this.pending = new Map(); this.scripts = new Map(); this.bps = new Map(); this.child = null; this.frames = []; }
  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== 1) return Promise.reject(new Error('Le programme n’est pas en cours de débogage.'));
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`${method} : pas de réponse.`)); } }, 15000);
    });
  }
  async connect(wsUrl) {
    if (typeof WebSocket !== 'function') throw new Error('Débogage indisponible dans cette version de NEXORA.');
    this.ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = () => reject(new Error('Connexion au programme impossible.')); });
    this.ws.onmessage = (ev) => this.onMessage(JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()));
    this.ws.onclose = () => { this.emit({ type: 'ended' }); this.ws = null; };
    await this.send('Runtime.enable');
    await this.send('Debugger.enable');
    await this.send('Debugger.setPauseOnExceptions', { state: 'uncaught' });
    for (const [file, lines] of this.bps) await this.applyBreakpoints(file, lines.map((b) => b.line));
    await this.send('Runtime.runIfWaitingForDebugger');
    this.emit({ type: 'running' });
  }
  async onMessage(m) {
    if (m.id && this.pending.has(m.id)) {
      const p = this.pending.get(m.id);
      this.pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
      return;
    }
    if (m.method === 'Debugger.scriptParsed') this.scripts.set(m.params.scriptId, m.params.url);
    else if (m.method === 'Debugger.paused') {
      // Premier arrêt de --inspect-brk : les points d'arrêt sont posés, le programme repart.
      if (this.skipFirst) { this.skipFirst = false; this.send('Debugger.resume').catch(() => {}); return; }
      this.frames = m.params.callFrames;
      const frames = this.frames.slice(0, 40).map((f) => ({ id: f.callFrameId, fn: f.functionName || '(anonyme)', file: fileOf(f.url || this.scripts.get(f.location.scriptId)), line: f.location.lineNumber + 1, col: (f.location.columnNumber || 0) + 1 }));
      let scopes = [];
      try { scopes = await this.scopes(0); } catch { /* portée illisible */ }
      const ex = m.params.reason === 'exception' && m.params.data ? (m.params.data.description || m.params.data.value || '').toString().slice(0, 600) : '';
      this.emit({ type: 'paused', reason: m.params.reason, exception: ex, frames, scopes });
    } else if (m.method === 'Debugger.resumed') this.emit({ type: 'running' });
    else if (m.method === 'Runtime.consoleAPICalled') this.emit({ type: 'console', level: m.params.type, text: m.params.args.map((a) => (a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : a.description || a.type)).join(' ') });
    else if (m.method === 'Runtime.exceptionThrown') this.emit({ type: 'console', level: 'error', text: (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text });
  }
  async props(objectId) {
    const r = await this.send('Runtime.getProperties', { objectId, ownProperties: true, generatePreview: true });
    return (r.result || []).filter((p) => p.value && !p.name.startsWith('__')).slice(0, 200).map((p) => ({ name: p.name, type: p.value.type, value: p.value.description !== undefined ? String(p.value.description).slice(0, 300) : JSON.stringify(p.value.value), objectId: p.value.objectId && p.value.type === 'object' ? p.value.objectId : null }));
  }
  async scopes(index) {
    const f = this.frames[index];
    if (!f) return [];
    const out = [];
    for (const s of f.scopeChain.filter((x) => x.type !== 'global').slice(0, 4)) out.push({ type: { local: 'Locales', closure: 'Fermeture', block: 'Bloc', module: 'Module', script: 'Script', catch: 'Erreur interceptée' }[s.type] || s.type, vars: await this.props(s.object.objectId) });
    return out;
  }
  async applyBreakpoints(file, lines) {
    for (const b of this.bps.get(file) || []) if (b.id) await this.send('Debugger.removeBreakpoint', { breakpointId: b.id }).catch(() => {});
    const list = [];
    for (const line of lines) {
      let id = null;
      if (this.ws) {
        const url = pathToFileURL(file).href;
        const r = await this.send('Debugger.setBreakpointByUrl', { lineNumber: line - 1, urlRegex: url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/^file:\/\/\/([a-z]):/i, (m0, d) => `file:///[${d.toLowerCase()}${d.toUpperCase()}]:`) }).catch(() => null);
        id = r && r.breakpointId;
      }
      list.push({ line, id });
    }
    this.bps.set(file, list);
  }
  stop() { if (this.child) killTree(this.child.pid); if (this.ws) try { this.ws.close(); } catch { /* fermé */ } }
}

class Debugger {
  constructor(emit) { this.emit = emit; this.s = null; this.breakpoints = new Map(); }
  // Script de départ : fichier choisi, sinon « main » du package.json, sinon server.js / index.js.
  entry(root, file) {
    if (file) return inside(root, file);
    const pkg = readJson(path.join(root, 'package.json')) || {};
    for (const f of [pkg.main, 'server.js', 'index.js', 'src/index.js', 'src/server.js', 'app.js'].filter(Boolean)) { try { const p = inside(root, f); if (require('fs').existsSync(p)) return p; } catch { /* ignoré */ } }
    throw new Error('Choisissez le fichier à lancer (ouvrez-le dans l’éditeur, puis « Déboguer ce fichier »).');
  }
  fresh() {
    if (this.s) this.s.stop();
    this.s = new Session((m) => this.emit(m));
    for (const [f, lines] of this.breakpoints) this.s.bps.set(f, lines.map((line) => ({ line })));
    return this.s;
  }
  async start(root, { file, args = '' } = {}) {
    const entry = this.entry(root, file);
    const s = this.fresh();
    s.skipFirst = true;
    const child = start(`node --inspect-brk=127.0.0.1:0 "${entry}" ${args}`, { cwd: root, env: envFor(root) });
    s.child = child;
    const url = await new Promise((resolve, reject) => {
      let buf = '';
      const t = setTimeout(() => reject(new Error('Le programme n’a pas démarré en mode débogage.')), 15000);
      child.stderr.on('data', (d) => {
        const text = d.toString();
        buf += text;
        const m = /Debugger listening on (ws:\/\/\S+)/.exec(buf);
        if (m) { clearTimeout(t); resolve(m[1]); }
        if (!/Debugger (listening|attached)|For help, see/.test(text)) this.emit({ type: 'console', level: 'error', text });
      });
      child.on('error', (e) => { clearTimeout(t); reject(e); });
      child.on('close', (code) => { clearTimeout(t); this.emit({ type: 'ended', code }); reject(new Error(`Le programme s’est arrêté (code ${code}).`)); });
    });
    child.stdout.on('data', (d) => this.emit({ type: 'console', level: 'log', text: d.toString() }));
    await s.connect(url);
    return { entry, pid: child.pid };
  }
  async attach(port = 9229) {
    const list = await (await fetch(`http://127.0.0.1:${Number(port)}/json/list`)).json().catch(() => null);
    if (!list || !list[0]) throw new Error(`Aucun programme en attente de débogage sur le port ${port} (lancez-le avec --inspect).`);
    const s = this.fresh();
    await s.connect(list[0].webSocketDebuggerUrl);
    return { title: list[0].title };
  }
  async setBreakpoints(file, lines) {
    this.breakpoints.set(file, lines);
    if (this.s && this.s.ws) await this.s.applyBreakpoints(file, lines);
    return { file, lines };
  }
  async cmd(action) {
    const map = { resume: 'Debugger.resume', over: 'Debugger.stepOver', into: 'Debugger.stepInto', out: 'Debugger.stepOut', pause: 'Debugger.pause' };
    if (action === 'stop') { if (this.s) this.s.stop(); return true; }
    if (!map[action] || !this.s) throw new Error('Aucun programme en cours de débogage.');
    await this.s.send(map[action]);
    return true;
  }
  async evaluate(frame, expression) {
    if (!this.s) throw new Error('Aucun programme en cours de débogage.');
    const f = this.s.frames[frame || 0];
    const r = f ? await this.s.send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression, generatePreview: true }) : await this.s.send('Runtime.evaluate', { expression, generatePreview: true });
    const v = r.result || {};
    return { type: v.type, value: v.description !== undefined ? String(v.description) : JSON.stringify(v.value), objectId: v.objectId || null, error: r.exceptionDetails ? (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text : null };
  }
  async frameScopes(index) { if (!this.s) return []; return this.s.scopes(index); }
  async props(objectId) { if (!this.s) return []; return this.s.props(objectId); }
  stopAll() { if (this.s) this.s.stop(); }
}

module.exports = { Debugger };
