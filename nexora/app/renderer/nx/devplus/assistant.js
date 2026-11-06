// NEXORA #052 : assistant IA sur tout le projet : il lit les consignes du projet, l'arborescence et les fichiers
// utiles, propose des changements sur plusieurs fichiers, à accepter fichier par fichier (avec annulation).
// Clé API de l'utilisateur (ai:chat) ; réservé à l'offre Pro.
import { api, esc, ico, root, call, noProject, head, btn, iconBtn, pill, toast, has, proGate, dev, relPath, openFile, clean, uid } from './api-ui.js';
import { diffHtml } from './diff.js';

const SYSTEM = `Tu es l’assistant de développement intégré au Dev Lab de NEXORA. Tu travailles sur le projet de l’utilisateur.
Réponds en français, avec le tutoiement, de façon claire et concise.
Format obligatoire de ta réponse :
<reponse>ce que tu proposes et pourquoi (quelques lignes)</reponse>
puis, pour chaque fichier à créer ou modifier, son contenu COMPLET :
<fichier chemin="chemin/relatif/au/projet" action="ecrire">
contenu complet du fichier
</fichier>
et pour supprimer un fichier : <fichier chemin="chemin" action="supprimer"></fichier>
Si la demande est une question ou une explication, n’écris aucun bloc <fichier>.
Ne modifie que les fichiers nécessaires, garde le style du projet et respecte ses consignes. N’invente pas de fichier que tu n’as pas vu sans le créer entièrement.`;

function parse(text) {
  const m = /<reponse>([\s\S]*?)(?:<\/reponse>|$)/.exec(text);
  const files = [];
  for (const f of text.matchAll(/<fichier\s+chemin="([^"]+)"(?:\s+action="(\w+)")?\s*>\n?([\s\S]*?)<\/fichier>/g)) {
    let content = f[3];
    const fence = /^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(content);
    if (fence) content = `${fence[1]}\n`;
    files.push({ path: f[1].replace(/^\.?\//, ''), action: f[2] === 'supprimer' ? 'delete' : 'write', content });
  }
  const answer = (m ? m[1] : text.replace(/<fichier[\s\S]*?<\/fichier>/g, '')).trim();
  return { answer, files };
}

export function mount(el, ctx) {
  const st = { turns: [], busy: false, live: '', runId: null, consignes: null, editRules: false, lastError: '', lastProblems: null, undo: [] };
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    if (!has('devlab_pro')) { el.innerHTML = `${head('Assistant IA du projet', '')}${proGate('L’assistant IA sur tout le projet', 'Il lit ton projet, propose des changements sur plusieurs fichiers que tu acceptes un par un, et explique les erreurs du terminal.')}`; return; }
    const d = dev();
    const open = (d.st.open || []).map(relPath);
    el.innerHTML = `${head('Assistant IA du projet', `Il lit les consignes du projet, l’arborescence et les fichiers utiles${open.length ? ` (dont ${open.length} ouvert(s))` : ''}. Tu acceptes chaque changement fichier par fichier.`, `${btn(st.editRules ? 'Fermer les consignes' : 'Consignes du projet', 'data-act="rules"', 'pen')}${st.turns.length ? iconBtn('trash', 'Nouvelle conversation', 'data-act="clear"') : ''}`)}
      ${st.editRules ? `<div class="nxd-rules"><small>${esc(st.consignes ? st.consignes.file : '.nexora/consignes.md')} : style, framework, règles à respecter. Lu à chaque demande.</small><textarea class="input nx-ta" data-rules rows="5" placeholder="Exemple : React 19 et TypeScript strict. Textes en français. Pas de nouvelle dépendance sans le demander.">${esc(st.consignes ? st.consignes.text : '')}</textarea><div class="nxd-row">${btn('Enregistrer les consignes', 'data-act="save-rules"', 'check', 'primary')}</div></div>` : ''}
      <div class="nxd-chat" data-chat>${st.turns.length ? st.turns.map((t, ti) => t.role === 'user' ? `<div class="nxd-msg me"><p>${esc(t.text)}</p></div>` : `<div class="nxd-msg ai">${ico('sparkle', 15)}<div><p>${esc(t.answer).replace(/\n/g, '<br>')}</p>${t.files.map((f, fi) => `<div class="nxd-prop ${f.state || ''}"><div class="nxd-prop-h">${ico(f.action === 'delete' ? 'trash' : f.existed ? 'pen' : 'plus', 13)}<b>${esc(f.path)}</b>${f.action === 'delete' ? pill('suppression', 'bad') : f.existed ? '' : pill('nouveau', 'ok')}<small><span class="nxd-add">+${f.add || 0}</span> <span class="nxd-del">−${f.del || 0}</span></small><span class="grow"></span>${f.state === 'done' ? `${pill('appliqué', 'ok')}${iconBtn('external', 'Ouvrir le fichier', `data-open="${esc(f.path)}"`)}` : f.state === 'refused' ? pill('refusé') : `${btn('Refuser', `data-refuse="${ti}:${fi}"`, 'close')}${btn('Accepter', `data-accept="${ti}:${fi}"`, 'check', 'primary')}`}</div>${f.state ? '' : f.diff || ''}</div>`).join('')}${t.files.filter((f) => !f.state).length > 1 ? `<div class="nxd-row">${btn('Tout accepter', `data-accept-all="${ti}"`, 'pass', 'primary')}</div>` : ''}${t.undoId ? `<div class="nxd-row">${btn('Annuler ces changements', `data-undo="${ti}"`, 'restart')}</div>` : ''}</div></div>`).join('') : `<div class="nxd-empty">${ico('sparkle', 26)}<b>Demande ce que tu veux en langage courant</b><p>« Ajoute une page contact avec validation », « Pourquoi ce test échoue ? », « Passe ce composant en TypeScript ».</p></div>`}
        ${st.busy ? `<div class="nxd-msg ai">${ico('sparkle', 15)}<div><p class="nxd-muted"><span class="spin"></span> L’IA prépare sa réponse${st.live ? ` (${st.live.length.toLocaleString('fr-FR')} caractères)` : '…'}</p></div></div>` : ''}</div>
      <div class="nxd-chips">${st.lastError ? `<button class="nxd-chip" data-quick="error">${ico('error', 12)}Expliquer et corriger la dernière erreur</button>` : ''}${st.lastProblems ? `<button class="nxd-chip" data-quick="problems">${ico('warn', 12)}Corriger les problèmes du projet</button>` : ''}${d.active ? `<button class="nxd-chip" data-quick="tests">${ico('pass', 12)}Écrire les tests de ${esc(relPath(d.active).split('/').pop())}</button><button class="nxd-chip" data-quick="explain">${ico('info', 12)}Expliquer ce fichier</button>` : ''}</div>
      <div class="nxd-ask"><textarea class="input" data-q rows="2" placeholder="Que veux-tu faire dans ce projet ? (Ctrl+Entrée pour envoyer)" ${st.busy ? 'disabled' : ''}></textarea>${st.busy ? btn('Arrêter', 'data-act="stop"', 'stop') : btn('Envoyer', 'data-act="send"', 'nxSend', 'primary')}</div>`;
    const chat = el.querySelector('[data-chat]');
    if (chat) chat.scrollTop = chat.scrollHeight;
  };
  const send = async (text) => {
    text = String(text || '').trim();
    if (!text || st.busy) return;
    const d = dev();
    st.turns.push({ role: 'user', text });
    st.busy = true; st.live = ''; render();
    try {
      const c = await call('devx:agent-context', { query: text, open: d.st.open || [], active: d.active || '' });
      st.consignes = c.consignes;
      const files = c.files.map((f) => `=== ${f.path} ===\n${f.text}`).join('\n\n');
      const prompt = `${c.consignes.text ? `Consignes du projet (${c.consignes.file}) :\n${c.consignes.text}\n\n` : ''}Arborescence (extrait) :\n${c.tree.join('\n')}\n\nFichiers :\n${files}\n\nDemande : ${text}`;
      const history = st.turns.slice(0, -1).slice(-6).map((t) => (t.role === 'user' ? { role: 'user', content: t.text } : { role: 'assistant', content: t.raw }));
      st.runId = uid();
      const r = await api.invoke('ai:chat', { id: st.runId, system: SYSTEM, messages: [...history, { role: 'user', content: prompt }], maxTokens: 16000, temperature: 0.2 });
      const p = parse(r.text || '');
      const known = new Map(c.files.map((f) => [f.path, f.text]));
      for (const f of p.files) {
        let before = known.get(f.path);
        if (before === undefined) { try { const sep = root().includes('\\') ? '\\' : '/'; before = (await api.invoke('dev:read', { file: `${root()}${sep}${f.path.replace(/\//g, sep)}` })).text; } catch { before = null; } }
        f.existed = before != null;
        const dh = diffHtml(before || '', f.action === 'delete' ? '' : f.content);
        Object.assign(f, { diff: dh.html, add: dh.add, del: dh.del });
      }
      st.turns.push({ role: 'ai', answer: p.answer || (p.files.length ? 'Voici les changements proposés.' : r.canceled ? 'Réponse arrêtée.' : ''), files: p.files, raw: r.text || '' });
    } catch (e) {
      const msg = clean(e);
      st.turns.push({ role: 'ai', answer: /Aucune IA n'est connectée|clé/.test(msg) ? 'Aucune IA n’est connectée : ajoute ta clé API dans les réglages de l’IA, puis renvoie ta demande.' : msg, files: [], raw: '', needsAi: /Aucune IA/.test(msg) });
      if (/Aucune IA/.test(msg)) import('../../dist/chunks/ai-RLNIHTXY.js').then((m) => m.openAiSettings()).catch(() => {});
    }
    st.busy = false; st.runId = null; render();
  };
  const apply = async (ti, list) => {
    const t = st.turns[ti];
    const edits = list.map((fi) => t.files[fi]);
    try {
      const r = await call('devx:agent-apply', { edits: edits.map((f) => ({ path: f.path, action: f.action, content: f.content })) });
      for (const f of edits) f.state = 'done';
      t.undoId = r.undoId;
      const d = dev();
      for (const f of edits) { const sep = root().includes('\\') ? '\\' : '/'; const abs = `${root()}${sep}${f.path.replace(/\//g, sep)}`; if (d.files && d.files.has(abs) && f.action !== 'delete') { const m = d.files.get(abs).model; if (m && m.getValue() !== f.content) m.setValue(f.content); } }
      if (d.reloadTree) d.reloadTree(); else if (d.loadDir) d.loadDir(root()).then(() => d.renderSide && d.renderSide()).catch(() => {});
      toast(`${edits.length} fichier(s) modifié(s). « Annuler ces changements » remet l’état d’avant.`);
    } catch { /* message affiché */ }
    render();
  };
  api.on('ai:chunk', (m) => { if (m && m.id === st.runId && el.isConnected) { st.live += m.chunk || ''; const p = el.querySelector('.nxd-msg.ai:last-child .nxd-muted'); if (p) p.innerHTML = `<span class="spin"></span> L’IA prépare sa réponse (${st.live.length.toLocaleString('fr-FR')} caractères)`; } });
  ctx.bus.addEventListener('task-problems', (e) => { const i = (e.detail || [])[0]; if (i) { st.lastError = `${i.message}\n(fichier ${i.rel}, ligne ${i.line})`; if (el.isConnected && !st.busy) render(); } });
  ctx.bus.addEventListener('problems', (e) => { const items = (e.detail && e.detail.items || []).filter((i) => i.severity === 'error'); st.lastProblems = items.length ? items.slice(0, 20) : null; if (el.isConnected && !st.busy) render(); });
  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-act="send"]')) return send(el.querySelector('[data-q]').value);
    if (t.closest('[data-act="stop"]') && st.runId) { api.invoke('ai:cancel', { id: st.runId }).catch(() => {}); return; }
    if (t.closest('[data-act="clear"]')) { st.turns = []; render(); return; }
    if (t.closest('[data-act="rules"]')) { st.editRules = !st.editRules; if (st.editRules && !st.consignes) st.consignes = await call('devx:consignes-get', {}, { quiet: true }).catch(() => null); render(); return; }
    if (t.closest('[data-act="save-rules"]')) { st.consignes = await call('devx:consignes-set', { text: el.querySelector('[data-rules]').value }).catch(() => st.consignes); st.editRules = false; toast('Consignes du projet enregistrées.'); render(); return; }
    const q = t.closest('[data-quick]');
    if (q) {
      const d = dev();
      const f = d.active ? relPath(d.active) : '';
      const prompts = { error: `Explique cette erreur et corrige-la :\n${st.lastError}`, problems: `Corrige ces problèmes du projet :\n${(st.lastProblems || []).map((i) => `- ${i.rel}:${i.line} ${i.message}`).join('\n')}`, tests: `Écris des tests pour ${f}, avec l’outil de test déjà utilisé par le projet.`, explain: `Explique le rôle de ${f} et signale ce qui pourrait poser problème.` };
      return send(prompts[q.dataset.quick]);
    }
    const ac = t.closest('[data-accept]');
    if (ac) { const [ti, fi] = ac.dataset.accept.split(':').map(Number); return apply(ti, [fi]); }
    const aa = t.closest('[data-accept-all]');
    if (aa) { const ti = +aa.dataset.acceptAll; return apply(ti, st.turns[ti].files.map((f, i) => (f.state ? -1 : i)).filter((i) => i >= 0)); }
    const rf = t.closest('[data-refuse]');
    if (rf) { const [ti, fi] = rf.dataset.refuse.split(':').map(Number); st.turns[ti].files[fi].state = 'refused'; render(); return; }
    const un = t.closest('[data-undo]');
    if (un) { const tt = st.turns[+un.dataset.undo]; try { await call('devx:agent-undo', { undoId: tt.undoId }); for (const f of tt.files) if (f.state === 'done') f.state = ''; tt.undoId = null; toast('Changements annulés.'); const d = dev(); if (d.loadDir) d.loadDir(root()).then(() => d.renderSide && d.renderSide()).catch(() => {}); } catch { /* message affiché */ } render(); return; }
    const o = t.closest('[data-open]');
    if (o) openFile(o.dataset.open);
  });
  el.addEventListener('keydown', (e) => { if (e.target.matches('[data-q]') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(e.target.value); } });
  render();
  return { show: (opts = {}) => { render(); if (opts.prompt) { const q = el.querySelector('[data-q]'); if (q) { q.value = opts.prompt; q.focus(); } } } };
}
