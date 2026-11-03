'use strict';
/* Code d'un composant ou d'une section choisi dans la page (comme dans Figma) : HTML, règles CSS
 * réellement appliquées à l'élément et à ses descendants (y compris feuilles d'autres domaines,
 * media queries, pseudo-éléments), variables CSS, @keyframes et @font-face utilisés, image de l'élément. */
const cdp = require('./cdp');

const INHERITED = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-transform', 'text-align', 'word-spacing', '-webkit-font-smoothing'];

function blockAt(text, start) {
  // Bloc { … } équilibré à partir de start (position de la première accolade).
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
    else if (c === '"' || c === "'") { const q = c; i += 1; while (i < text.length && text[i] !== q) { if (text[i] === '\\') i += 1; i += 1; } }
  }
  return null;
}

function atRules(text, kind) {
  const out = [];
  const re = new RegExp(`@(-webkit-)?${kind}\\b`, 'gi');
  let m;
  while ((m = re.exec(text))) {
    const brace = text.indexOf('{', m.index);
    if (brace < 0) break;
    const head = text.slice(m.index, brace).trim();
    const body = blockAt(text, brace);
    if (!body) break;
    out.push({ head, text: `${head} ${body}` });
    re.lastIndex = brace + body.length;
  }
  return out;
}

async function elementCode(wc, { maxNodes = 600, attr = 'data-vitrine-sel' } = {}) {
  await cdp.send(wc, 'DOM.enable');
  await cdp.send(wc, 'CSS.enable');
  const { root } = await cdp.send(wc, 'DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send(wc, 'DOM.querySelector', { nodeId: root.nodeId, selector: `[${attr}]` });
  if (!nodeId) throw new Error('Aucun élément sélectionné.');
  const { outerHTML } = await cdp.send(wc, 'DOM.getOuterHTML', { nodeId });
  const all = await cdp.send(wc, 'DOM.querySelectorAll', { nodeId, selector: '*' });
  const nodes = [nodeId, ...all.nodeIds].slice(0, maxNodes);
  const rules = new Map();
  const sheetsUsed = new Set();
  const sheetOrder = new Map();
  const varsUsed = new Set();
  const animations = new Set();
  const families = new Set();
  let inheritedVars = new Map();
  let rootInherited = {};
  const addRule = (m, pseudo) => {
    const r = m.rule;
    if (!r || r.origin !== 'regular') return;
    const decls = (r.style.cssProperties || []).filter((p) => p.text && !p.disabled && p.parsedOk !== false).map((p) => p.text.trim().replace(/;?$/, ';'));
    if (!decls.length) return;
    const sel = r.selectorList.text;
    const range = r.style.range;
    const key = r.styleSheetId && range ? `${r.styleSheetId}:${range.startLine}:${range.startColumn}` : `${sel}{${decls.join('')}}`;
    if (rules.has(key)) return;
    if (r.styleSheetId) {
      sheetsUsed.add(r.styleSheetId);
      if (!sheetOrder.has(r.styleSheetId)) sheetOrder.set(r.styleSheetId, sheetOrder.size);
    }
    for (const d of decls) {
      for (const v of d.matchAll(/var\(\s*(--[\w-]+)/g)) varsUsed.add(v[1]);
      const an = /^(?:-webkit-)?animation(?:-name)?\s*:\s*([^;]+)/i.exec(d);
      if (an) an[1].split(',').forEach((part) => part.trim().split(/\s+/).forEach((w) => { if (/^[a-z_-][\w-]*$/i.test(w) && !/^(infinite|linear|ease|ease-in|ease-out|ease-in-out|alternate|reverse|forwards|backwards|both|none|normal|paused|running|step-start|step-end)$/i.test(w)) animations.add(w); }));
      const ff = /^font-family\s*:\s*([^;]+)/i.exec(d) || /^font\s*:\s*[^;]*?\s([^;,]+(?:,[^;]+)?)\s*;?$/i.exec(d);
      if (ff) ff[1].split(',').forEach((f) => families.add(f.trim().replace(/^['"]|['"]$/g, '').replace(/\s*!important$/, '')));
    }
    rules.set(key, {
      sel, decls, media: (r.media || []).map((x) => x.text), supports: (r.supports || []).map((x) => x.text), container: (r.containerQueries || []).map((x) => `${x.name ? `${x.name} ` : ''}${x.text}`), layers: (r.layers || []).map((x) => x.text).filter(Boolean),
      sheet: r.styleSheetId || '', line: range ? range.startLine : 0, col: range ? range.startColumn : 0, pseudo,
    });
  };
  for (let i = 0; i < nodes.length; i += 1) {
    let m;
    try {
      m = await cdp.send(wc, 'CSS.getMatchedStylesForNode', { nodeId: nodes[i] });
    } catch { continue; }
    for (const x of m.matchedCSSRules || []) addRule(x, null);
    for (const pe of m.pseudoElements || []) for (const x of pe.matches || []) addRule(x, pe.pseudoType);
    if (i === 0) {
      // Variables et typographie héritées des parents (html, body, conteneurs).
      for (const inh of m.inherited || []) {
        for (const x of inh.matchedCSSRules || []) {
          const r = x.rule;
          if (!r || r.origin !== 'regular') continue;
          for (const p of r.style.cssProperties || []) {
            if (p.name.startsWith('--') && p.text && !inheritedVars.has(p.name)) inheritedVars.set(p.name, p.value);
          }
        }
      }
      try {
        const cs = await cdp.send(wc, 'CSS.getComputedStyleForNode', { nodeId });
        const map = Object.fromEntries(cs.computedStyle.map((p) => [p.name, p.value]));
        rootInherited = Object.fromEntries(INHERITED.filter((k) => map[k]).map((k) => [k, map[k]]));
        if (map['font-family']) map['font-family'].split(',').forEach((f) => families.add(f.trim().replace(/^['"]|['"]$/g, '')));
      } catch { /* style calculé indisponible */ }
    }
  }
  // Variables définies plus haut, et variables utilisées par ces variables.
  const vars = new Map();
  const want = [...varsUsed];
  while (want.length) {
    const v = want.shift();
    if (vars.has(v) || !inheritedVars.has(v)) continue;
    const val = inheritedVars.get(v);
    vars.set(v, val);
    for (const x of String(val).matchAll(/var\(\s*(--[\w-]+)/g)) want.push(x[1]);
  }
  // @keyframes et @font-face utilisés.
  const keyframes = [];
  const fontFaces = [];
  if (animations.size || families.size) {
    for (const id of sheetsUsed) {
      let text = '';
      try { text = (await cdp.send(wc, 'CSS.getStyleSheetText', { styleSheetId: id })).text || ''; } catch { continue; }
      for (const k of atRules(text, 'keyframes')) {
        const name = k.head.replace(/^@(-webkit-)?keyframes\s+/i, '').replace(/['"]/g, '').trim();
        if (animations.has(name) && !keyframes.some((x) => x.text === k.text)) keyframes.push(k);
      }
      for (const f of atRules(text, 'font-face')) {
        const fam = (/font-family\s*:\s*([^;}]+)/i.exec(f.text) || [])[1];
        if (fam && families.has(fam.trim().replace(/^['"]|['"]$/g, '')) && !fontFaces.some((x) => x.text === f.text)) fontFaces.push(f);
      }
    }
  }
  const sorted = [...rules.values()].sort((a, b) => (sheetOrder.get(a.sheet) ?? 999) - (sheetOrder.get(b.sheet) ?? 999) || a.line - b.line || a.col - b.col);
  const box = await cdp.send(wc, 'DOM.getBoxModel', { nodeId }).catch(() => null);
  return {
    html: outerHTML.replace(new RegExp(`\\s${attr}(="[^"]*")?`, 'g'), ''),
    rules: sorted,
    vars: [...vars],
    inherited: rootInherited,
    keyframes: keyframes.map((k) => k.text),
    fontFaces: fontFaces.map((f) => f.text),
    nodes: nodes.length,
    truncated: all.nodeIds.length + 1 > maxNodes,
    box: box ? box.model : null,
  };
}

/** Image de l'élément sélectionné (2×), même s'il dépasse de l'écran. */
async function elementShot(wc, { attr = 'data-vitrine-sel', scale = 2 } = {}) {
  const rect = await wc.executeJavaScript(`(() => { const el = document.querySelector('[${attr}]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`, true);
  if (!rect || rect.width < 1 || rect.height < 1) throw new Error('Élément invisible.');
  const r = await cdp.send(wc, 'Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, clip: { ...rect, scale },
  });
  return { data: r.data, width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) };
}

module.exports = { elementCode, elementShot };
