'use strict';
/* Intelligence artificielle : l'utilisateur connecte sa propre clé (Anthropic, OpenAI, Google Gemini, Mistral,
 * OpenRouter, Groq, DeepSeek, Ollama en local, ou tout service compatible OpenAI). Les clés sont chiffrées par le
 * système (safeStorage) et ne quittent le processus principal que vers le fournisseur choisi. */
const fs = require('fs');
const path = require('path');

const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', base: 'https://api.anthropic.com/v1', kind: 'anthropic', models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'], keyUrl: 'https://console.anthropic.com/settings/keys', hint: 'Excellent pour le code et les textes longs. Payant à l’usage.' },
  openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', kind: 'openai', models: [], keyUrl: 'https://platform.openai.com/api-keys', hint: 'Modèles GPT. Payant à l’usage.' },
  gemini: { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', kind: 'gemini', models: [], keyUrl: 'https://aistudio.google.com/apikey', free: 'Gratuit, sans carte', hint: 'Clé gratuite en 1 minute avec ton compte Google.' },
  mistral: { label: 'Mistral AI', base: 'https://api.mistral.ai/v1', kind: 'openai', models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'], keyUrl: 'https://console.mistral.ai/api-keys', free: 'Gratuit (plan Experiment)', hint: 'Plan gratuit « Experiment » : vérification par téléphone.' },
  openrouter: { label: 'OpenRouter (tous les modèles)', base: 'https://openrouter.ai/api/v1', kind: 'openai', models: ['openrouter/auto'], keyUrl: 'https://openrouter.ai/keys', free: 'Modèles « :free » gratuits', hint: 'Choisis un modèle dont le nom finit par « :free » pour ne rien payer.' },
  groq: { label: 'Groq', base: 'https://api.groq.com/openai/v1', kind: 'openai', models: [], keyUrl: 'https://console.groq.com/keys', free: 'Gratuit, sans carte', hint: 'Très rapide. Connexion avec Google, puis « Create API Key ».' },
  deepseek: { label: 'DeepSeek', base: 'https://api.deepseek.com/v1', kind: 'openai', models: ['deepseek-chat', 'deepseek-reasoner'], keyUrl: 'https://platform.deepseek.com/api_keys', hint: 'Très bon en code, prix bas. Payant à l’usage.' },
  ollama: { label: 'Ollama (sur ce PC, sans clé)', base: 'http://127.0.0.1:11434/v1', kind: 'openai', models: [], keyless: true, keyUrl: 'https://ollama.com/download', free: 'Gratuit, hors ligne', hint: 'Installe Ollama puis un modèle (ex. ollama pull qwen2.5-coder) : rien ne quitte ton PC.' },
  custom: { label: 'Compatible OpenAI (adresse personnalisée)', base: '', kind: 'openai', models: [], keyUrl: '', hint: 'Tout service compatible OpenAI (LM Studio, Together, Cerebras, serveur d’entreprise…).' },
};

class AI {
  constructor({ dataDir, safeStorage, fetchImpl, emit }) {
    this.file = path.join(dataDir, 'ai.json');
    this.safe = safeStorage;
    this.fetch = fetchImpl;
    this.emit = emit;
    this.runs = new Map();
    this.data = this.load();
  }

  load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return { providers: {}, active: null }; }
  }

  save() { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 }); }

  encrypt(key) {
    if (this.safe.isEncryptionAvailable()) return { enc: this.safe.encryptString(key).toString('base64') };
    // Sans chiffrement système (rare), la clé reste dans le dossier de l'utilisateur, illisible par les autres comptes.
    return { plain: Buffer.from(key, 'utf8').toString('base64') };
  }

  decrypt(p) {
    if (!p) return '';
    try {
      if (p.enc) return this.safe.decryptString(Buffer.from(p.enc, 'base64'));
      if (p.plain) return Buffer.from(p.plain, 'base64').toString('utf8');
    } catch { /* clé illisible */ }
    return '';
  }

  // État sans les clés : fournisseurs, modèles, fournisseur actif.
  status() {
    const out = {};
    for (const [id, def] of Object.entries(PROVIDERS)) {
      const p = this.data.providers[id] || {};
      const key = this.decrypt(p.key);
      out[id] = {
        id, label: def.label, keyUrl: def.keyUrl, keyless: Boolean(def.keyless), free: def.free || '', info: def.hint || '', models: [...new Set([...(p.models || []), ...def.models])], lastError: p.lastError || '', checked: p.checked || null, connected: Boolean(key || (def.keyless && p.enabled)), model: p.model || def.models[0] || '', baseUrl: p.baseUrl || '', hint: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : '',
      };
    }
    return { providers: out, active: this.data.active, encrypted: this.safe.isEncryptionAvailable() };
  }

  set({ provider, key, model, baseUrl, enabled }) {
    if (!PROVIDERS[provider]) throw new Error('Fournisseur inconnu.');
    const p = this.data.providers[provider] || {};
    if (key) p.key = this.encrypt(String(key).trim());
    if (model !== undefined) p.model = String(model || '').trim();
    if (baseUrl !== undefined) p.baseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (enabled !== undefined) p.enabled = Boolean(enabled);
    this.data.providers[provider] = p;
    if (!this.data.active) this.data.active = provider;
    this.save();
    return this.status();
  }

  remove(provider) {
    delete this.data.providers[provider];
    if (this.data.active === provider) this.data.active = Object.keys(this.data.providers)[0] || null;
    this.save();
    return this.status();
  }

  setActive(provider) {
    this.data.active = provider;
    this.save();
    return this.status();
  }

  conf(provider) {
    const id = provider || this.data.active;
    const def = PROVIDERS[id];
    if (!def) throw new Error("Aucune IA n'est connectée : ajoute une clé dans les réglages de l'IA.");
    const p = this.data.providers[id] || {};
    const key = this.decrypt(p.key);
    if (!key && !def.keyless) throw new Error(`Aucune clé pour ${def.label}.`);
    const base = (p.baseUrl || def.base).replace(/\/+$/, '');
    if (!base) throw new Error("Indique l'adresse du service (compatible OpenAI).");
    return {
      id, def, key, base, model: p.model || def.models[0] || '',
    };
  }

  headers(c) {
    if (c.def.kind === 'anthropic') return { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' };
    const h = { 'content-type': 'application/json' };
    if (c.key) h.authorization = `Bearer ${c.key}`;
    if (c.id === 'openrouter') { h['X-Title'] = 'NEXORA'; }
    return h;
  }

  async models(provider) {
    const c = this.conf(provider);
    let list = [];
    if (c.def.kind === 'gemini') {
      const r = await this.fetch(`${c.base}/models?key=${encodeURIComponent(c.key)}&pageSize=200`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ? j.error.message : `HTTP ${r.status}`);
      list = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
    } else {
      const r = await this.fetch(`${c.base}/models`, { headers: this.headers(c) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || `HTTP ${r.status}`);
      list = (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean);
    }
    list = [...new Set(list)].sort();
    // On garde la liste : le choix du modèle se fait ensuite dans un menu, partout dans NEXORA.
    const p = this.data.providers[c.id] || {};
    p.models = list.slice(0, 400);
    this.data.providers[c.id] = p;
    this.save();
    return list;
  }

  // Résultat du dernier test (affiché dans les réglages).
  mark(provider, error) {
    const p = this.data.providers[provider];
    if (!p) return;
    p.lastError = error ? String(error).slice(0, 300) : '';
    p.checked = new Date().toISOString();
    this.save();
  }

  // Conversation en continu : les morceaux de réponse arrivent par l'événement ai:chunk.
  async chat({
    id, provider, model, system = '', messages = [], maxTokens = 4096, temperature,
  }) {
    const c = this.conf(provider);
    const mdl = model || c.model;
    if (!mdl) throw new Error('Choisis un modèle dans les réglages de l’IA.');
    const ctrl = new AbortController();
    this.runs.set(id, ctrl);
    let url;
    let body;
    if (c.def.kind === 'anthropic') {
      url = `${c.base}/messages`;
      body = {
        model: mdl, max_tokens: maxTokens, system: system || undefined, messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })), stream: true,
      };
      if (temperature != null) body.temperature = temperature;
    } else if (c.def.kind === 'gemini') {
      url = `${c.base}/models/${encodeURIComponent(mdl)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(c.key)}`;
      body = {
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: maxTokens, ...(temperature != null ? { temperature } : {}) },
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
    } else {
      url = `${c.base}/chat/completions`;
      body = {
        model: mdl, stream: true, max_tokens: maxTokens, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((m) => ({ role: m.role, content: m.content }))],
      };
      if (temperature != null) body.temperature = temperature;
    }
    let text = '';
    try {
      const r = await this.fetch(url, {
        method: 'POST', headers: c.def.kind === 'gemini' ? { 'content-type': 'application/json' } : this.headers(c), body: JSON.stringify(body), signal: ctrl.signal,
      });
      if (!r.ok) {
        const t = await r.text();
        let msg = t;
        try { const j = JSON.parse(t); msg = (j.error && (j.error.message || j.error.type || j.error)) || j.message || t; } catch { /* texte brut */ }
        throw new Error(`${c.def.label} : ${String(msg).slice(0, 400)} (HTTP ${r.status})`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let piece = '';
          try {
            const j = JSON.parse(data);
            if (c.def.kind === 'anthropic') {
              if (j.type === 'content_block_delta' && j.delta && j.delta.text) piece = j.delta.text;
              if (j.type === 'error') throw new Error(j.error ? j.error.message : 'erreur');
            } else if (c.def.kind === 'gemini') {
              piece = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('');
            } else {
              piece = (((j.choices || [])[0] || {}).delta || {}).content || '';
            }
          } catch (e) { if (e.message && e.message !== 'Unexpected end of JSON input' && !(e instanceof SyntaxError)) throw e; }
          if (piece) { text += piece; this.emit({ id, chunk: piece }); }
        }
      }
      return { text, model: mdl, provider: c.id };
    } catch (e) {
      if (ctrl.signal.aborted) return { text, model: mdl, provider: c.id, canceled: true };
      throw e;
    } finally { this.runs.delete(id); }
  }

  cancel(id) {
    const c = this.runs.get(id);
    if (c) c.abort();
    return true;
  }

  // NEXORA #011 : image générée ou retouchée par l'IA (remplissage génératif de NEX-DESIGN).
  // OpenAI : modèle d'image (édition avec masque si une image est fournie) ; Gemini : modèle « image ».
  async image({ prompt, image, mask, size = '1024x1024' }) {
    const c = this.conf();
    const toBuf = (u) => Buffer.from(String(u).split(',')[1] || '', 'base64');
    if (c.def.kind === 'gemini') {
      const list = (this.data.providers[c.id] || {}).models || [];
      const mdl = list.find((m) => /image/.test(m) && /flash/.test(m)) || 'gemini-2.5-flash-image';
      const parts = [{ text: prompt }];
      if (image) parts.push({ inlineData: { mimeType: 'image/png', data: String(image).split(',')[1] } });
      if (mask) parts.push({ text: 'Le second visuel est un masque : ne modifie que les zones blanches.' }, { inlineData: { mimeType: 'image/png', data: String(mask).split(',')[1] } });
      const r = await this.fetch(`${c.base}/models/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(c.key)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${c.def.label} : ${(j.error && j.error.message) || `HTTP ${r.status}`}`);
      const part = ((((j.candidates || [])[0] || {}).content || {}).parts || []).find((p) => p.inlineData && p.inlineData.data);
      if (!part) throw new Error('Le modèle n’a pas renvoyé d’image : choisis un modèle Gemini « image ».');
      return { dataUrl: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}` };
    }
    if (c.id !== 'openai' && c.id !== 'openrouter') throw new Error(`${c.def.label} ne génère pas d’images : connecte OpenAI ou Google Gemini dans les réglages de l’IA.`);
    let r;
    if (image) {
      const form = new FormData();
      form.append('model', 'gpt-image-1');
      form.append('prompt', prompt);
      form.append('size', size);
      form.append('image', new Blob([toBuf(image)], { type: 'image/png' }), 'image.png');
      if (mask) form.append('mask', new Blob([toBuf(mask)], { type: 'image/png' }), 'masque.png');
      r = await this.fetch(`${c.base}/images/edits`, { method: 'POST', headers: { authorization: `Bearer ${c.key}` }, body: form });
    } else {
      r = await this.fetch(`${c.base}/images/generations`, { method: 'POST', headers: this.headers(c), body: JSON.stringify({ model: 'gpt-image-1', prompt, size }) });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${c.def.label} : ${(j.error && (j.error.message || j.error)) || `HTTP ${r.status}`}`);
    const d = (j.data || [])[0] || {};
    if (d.b64_json) return { dataUrl: `data:image/png;base64,${d.b64_json}` };
    if (d.url) {
      const img = await this.fetch(d.url);
      return { dataUrl: `data:image/png;base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}` };
    }
    throw new Error('Aucune image reçue.');
  }

  // NEXORA #011 : transcription d'une voix-off ou d'une musique (sous-titres automatiques du Studio).
  // OpenAI (whisper-1) et Groq (whisper-large-v3) ; horodatage par segment et par mot.
  async transcribe({ data, mime = 'audio/wav', name = 'audio.wav', language = 'fr' }) {
    const c = this.conf();
    if (c.id !== 'openai' && c.id !== 'groq') throw new Error(`${c.def.label} ne transcrit pas l’audio : connecte OpenAI ou Groq (gratuit) dans les réglages de l’IA.`);
    const form = new FormData();
    form.append('model', c.id === 'groq' ? 'whisper-large-v3' : 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    form.append('timestamp_granularities[]', 'word');
    if (language) form.append('language', language);
    form.append('file', new Blob([Buffer.from(data)], { type: mime }), name);
    const r = await this.fetch(`${c.base}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${c.key}` }, body: form });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${c.def.label} : ${(j.error && (j.error.message || j.error)) || `HTTP ${r.status}`}`);
    return {
      text: j.text || '',
      segments: (j.segments || []).map((s) => ({ start: s.start, end: s.end, text: String(s.text || '').trim() })),
      words: (j.words || []).map((w) => ({ start: w.start, end: w.end, word: w.word })),
    };
  }
}

// Messages d'erreur compréhensibles (le détail technique reste entre parenthèses).
function friendly(msg) {
  const m = String(msg || '');
  const d = m.length > 160 ? `${m.slice(0, 160)}…` : m;
  if (/\b401\b|\b403\b|invalid.{0,20}(api )?key|api key not valid|incorrect api key|unauthori[sz]ed|authentication/i.test(m)) return `Clé refusée par le fournisseur : copie-la à nouveau, en entier. (${d})`;
  if (/\b429\b|quota|rate.?limit|resource_exhausted|too many requests/i.test(m)) return `Limite atteinte (quota gratuit ou nombre de requêtes par minute) : patiente un peu ou choisis un autre modèle. (${d})`;
  if (/location is not supported|not available in your (country|region)|unsupported_country/i.test(m)) return `Ce fournisseur n'est pas disponible dans ton pays : essaie Groq, OpenRouter ou Ollama. (${d})`;
  if (/insufficient|billing|credit|payment|balance/i.test(m)) return `Crédit insuffisant : ce modèle est payant sur ton compte. Choisis un modèle gratuit ou ajoute du crédit. (${d})`;
  if (/model.{0,30}(not found|does not exist|not supported)|model_not_found|\b404\b/i.test(m)) return `Modèle introuvable chez ce fournisseur : actualise la liste et choisis-en un autre. (${d})`;
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|net::ERR|Failed to fetch/i.test(m)) return `Service injoignable : vérifie ta connexion Internet (ou qu'Ollama est bien lancé). (${d})`;
  return m;
}

// Modèle proposé par défaut quand l'utilisateur n'en a pas choisi (gratuit et rapide si possible).
function pickModel(id, list) {
  if (!list.length) return '';
  const find = (...res) => { for (const re of res) { const x = list.find((m) => re.test(m)); if (x) return x; } return ''; };
  if (id === 'openrouter') return find(/:free$/) || list[0];
  if (id === 'gemini') return find(/^gemini-[\d.]+-flash$/, /flash(?!.*(image|tts|live|thinking))/) || list[0];
  if (id === 'groq') return find(/llama-3\.3-70b/, /llama/, /qwen/) || list[0];
  if (id === 'openai') return find(/^gpt-[\d.]+-mini$/, /^gpt-[\d.o]+$/) || list[0];
  if (id === 'ollama') return find(/coder/, /qwen/, /llama/) || list[0];
  return list[0];
}

function register({
  ipcMain, app, safeStorage, net, send,
}) {
  const fetchImpl = (u, o) => (net && net.fetch ? net.fetch(u, o) : fetch(u, o));
  const ai = new AI({
    dataDir: app.getPath('userData'), safeStorage, fetchImpl, emit: (m) => send('ai:chunk', m),
  });
  const wrap = (fn) => async (_e, arg) => { try { return await fn(arg || {}); } catch (e) { return { error: friendly(e.message || String(e)) }; } };
  ipcMain.handle('ai:status', wrap(() => ai.status()));
  ipcMain.handle('ai:set', wrap((a) => ai.set(a)));
  ipcMain.handle('ai:remove', wrap((a) => ai.remove(a.provider)));
  ipcMain.handle('ai:active', wrap((a) => ai.setActive(a.provider)));
  ipcMain.handle('ai:models', wrap((a) => ai.models(a.provider)));
  ipcMain.handle('ai:chat', wrap((a) => ai.chat(a)));
  ipcMain.handle('ai:cancel', wrap((a) => ai.cancel(a.id)));
  ipcMain.handle('ai:image', wrap((a) => ai.image(a)));
  ipcMain.handle('ai:transcribe', wrap((a) => ai.transcribe(a)));
  const test = async (provider) => {
    try {
      const r = await ai.chat({
        id: `test-${Date.now()}`, provider, messages: [{ role: 'user', content: 'Réponds seulement : OK' }], maxTokens: 16,
      });
      ai.mark(provider, null);
      return { ok: true, reply: r.text.trim().slice(0, 60), model: r.model };
    } catch (e) { ai.mark(provider, friendly(e.message)); throw e; }
  };
  ipcMain.handle('ai:test', wrap((a) => test(a.provider)));
  // Connexion en une fois : enregistre, lit les modèles, en choisit un si besoin, teste, puis active.
  ipcMain.handle('ai:connect', wrap(async (a) => {
    ai.set(a);
    let models = [];
    let listErr = null;
    try { models = await ai.models(a.provider); } catch (e) { listErr = e; /* certains services ne listent pas leurs modèles */ }
    const cur = ai.status().providers[a.provider];
    if (!a.model && (!cur.model || (models.length && !models.includes(cur.model)))) {
      const m = pickModel(a.provider, models);
      if (m) ai.set({ provider: a.provider, model: m });
    }
    if (listErr && !ai.status().providers[a.provider].model) { ai.mark(a.provider, friendly(listErr.message)); throw listErr; }
    const t = await test(a.provider);
    ai.setActive(a.provider);
    return { ...t, models, status: ai.status() };
  }));
  return ai;
}

module.exports = { register, PROVIDERS, AI };
