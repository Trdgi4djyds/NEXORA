// NEXORA #053 : du design au code : inspection (CSS de l'élément), export d'une page ou d'un groupe en HTML et
// CSS, en React (Tailwind) ou en HTML Tailwind ; les mises en page automatiques deviennent des boîtes flex et
// les variables des var(--nom). Envoi direct dans le projet ouvert du Dev Lab.
import { esc, toast, state, api, sec, btn, hex, isText, objs, slug, pascal, textBytes, saveBytes } from './ui.js';
import { byId } from './variables.js';
import { consCss } from './responsive.js';

const px = (n) => `${Math.round(n * 100) / 100}px`;
// Polices livrées avec NEXORA : déclarées « NX Inter », « NX Playfair »… ; le code exporté utilise la vraie famille.
const famCss = (f) => { const n = String(f || 'Inter').split(',')[0].trim().replace(/^['"]|['"]$/g, '').replace(/^NX\s+/, ''); return n === 'Playfair' ? 'Playfair Display' : n; };
function colorCss(D, o, k) {
  const id = o.nxVar && o.nxVar[k];
  const v = id && byId(D, id);
  if (v) return `var(--${v.name})`;
  const c = o[k];
  if (c && typeof c === 'object' && c.colorStops) return `linear-gradient(90deg, ${c.colorStops.map((s) => `${hex(s.color)} ${Math.round(s.offset * 100)}%`).join(', ')})`;
  return hex(c) || (c ? String(c) : null);
}
// Arbre intermédiaire : { tag, style, text, src, svg, alt, name, kids }
function node(D, o, box, flow) {
  const r = o.getBoundingRect();
  const st = {};
  if (!flow) Object.assign(st, { position: 'absolute', left: px(r.left - box.left), top: px(r.top - box.top) });
  const w = o.getScaledWidth(); const h = o.getScaledHeight();
  if (o.angle && !flow) st.transform = `rotate(${Math.round(o.angle)}deg)`;
  if (o.opacity !== undefined && o.opacity < 1) st.opacity = String(Math.round(o.opacity * 100) / 100);
  const n = { name: o.name || o.type, style: st, kids: [] };
  if (o.nxAuto) {
    const a = o.nxAuto; const bg = o.getObjects().find((x) => x.nxAutoBg);
    Object.assign(st, { display: 'flex', flexDirection: a.dir === 'row' ? 'row' : 'column', gap: px(a.gap), padding: px(a.pad), alignItems: { start: 'flex-start', center: 'center', end: 'flex-end' }[a.align] || 'flex-start' });
    if (a.w) st.width = px(a.w);
    if (bg) { const f = colorCss(D, bg, 'fill'); if (f) st.background = f; if (bg.rx) st.borderRadius = px(bg.rx); }
    n.tag = 'div';
    n.kids = o.getObjects().filter((x) => !x.nxAutoBg && x.visible !== false).map((x) => { const k = node(D, x, r, true); if (x.nxAutoFill) k.style[a.dir === 'row' ? 'flex' : 'alignSelf'] = a.dir === 'row' ? '1' : 'stretch'; return k; });
    return n;
  }
  if (o.type === 'group' || o.type === 'activeselection') {
    Object.assign(st, { position: flow ? 'relative' : 'absolute', width: px(w), height: px(h) });
    n.tag = 'div';
    n.kids = o.getObjects().filter((x) => x.visible !== false).map((x) => node(D, x, r, false));
    return n;
  }
  if (isText(o)) {
    const s = o.scaleY || 1;
    const fv = o.nxVar && o.nxVar.fontFamily && byId(D, o.nxVar.fontFamily);
    Object.assign(st, { width: flow && o.nxAutoFill ? undefined : px(w), margin: '0', fontFamily: fv ? `var(--${fv.name})` : `'${famCss(o.fontFamily)}', sans-serif`, fontSize: px(o.fontSize * s), fontWeight: String(o.fontWeight || 400), lineHeight: String(Math.round((o.lineHeight || 1.16) * 100) / 100), color: colorCss(D, o, 'fill') || '#000', textAlign: o.textAlign && o.textAlign !== 'left' ? o.textAlign : undefined, fontStyle: o.fontStyle === 'italic' ? 'italic' : undefined, letterSpacing: o.charSpacing ? `${o.charSpacing / 1000}em` : undefined, textDecoration: o.underline ? 'underline' : o.linethrough ? 'line-through' : undefined, whiteSpace: 'pre-wrap' });
    n.tag = (o.fontSize * s) >= 32 ? 'h2' : 'p';
    n.text = o.text;
    return n;
  }
  if (o.type === 'image') {
    Object.assign(st, { width: px(w), height: px(h), objectFit: 'cover' });
    n.tag = 'img';
    n.src = o.getSrc ? o.getSrc() : o._element && o._element.src;
    n.alt = o.nxAlt || '';
    return n;
  }
  if (o.type === 'rect' || o.type === 'ellipse' || o.type === 'circle') {
    Object.assign(st, { width: px(w), height: px(h) });
    const f = colorCss(D, o, 'fill'); if (f) st.background = f;
    if (o.stroke && o.strokeWidth) st.border = `${px(o.strokeWidth)} solid ${colorCss(D, o, 'stroke')}`;
    if (o.type === 'rect' && o.rx) st.borderRadius = px(o.rx * (o.scaleX || 1));
    if (o.type !== 'rect') st.borderRadius = '50%';
    n.tag = 'div';
    return n;
  }
  // Tracés, polygones et autres : SVG intégré.
  Object.assign(st, { width: px(w), height: px(h) });
  n.tag = 'svg';
  try { n.svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.left} ${r.top} ${r.width} ${r.height}" width="${Math.round(w)}" height="${Math.round(h)}">${o.toSVG()}</svg>`; } catch { n.svg = ''; }
  return n;
}
export function tree(D, target) {
  const pg = D.page;
  if (target && target.id !== '__board') { const n = node(D, target, target.getBoundingRect(), false); n.style.position = 'relative'; delete n.style.left; delete n.style.top; return n; }
  // NEXORA #054 : page adaptable : pleine largeur, éléments placés selon leurs contraintes (responsive.js).
  const kids = objs(D).filter((o) => o.visible !== false).map((o) => { const n = node(D, o, { left: 0, top: 0 }, false); delete n.style.left; delete n.style.top; Object.assign(n.style, consCss(o, pg.w, pg.h)); if (isText(o) && n.style.width !== 'auto') n.style.maxWidth = '100%'; return n; });
  return { tag: 'div', name: pg.name, style: { position: 'relative', width: '100%', height: px(pg.h), background: pg.bg || '#ffffff', overflow: 'hidden' }, kids };
}
const kebab = (k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const cssOf = (st) => Object.entries(st).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${kebab(k)}: ${v};`);
export function cssLines(D, o) { return cssOf(node(D, o, o.getBoundingRect(), true).style); }

// HTML + CSS
export function toHtml(D, target) {
  const css = [];
  let i = 0;
  const render = (n, depth) => {
    const cls = `${slug(n.name).slice(0, 24)}-${++i}`;
    css.push(`.${cls} {\n  ${cssOf(n.style).join('\n  ')}\n}`);
    const pad = '  '.repeat(depth);
    if (n.tag === 'img') return `${pad}<img class="${cls}" src="${esc(n.src || '')}" alt="${esc(n.alt)}">`;
    if (n.tag === 'svg') return `${pad}<div class="${cls}">${n.svg}</div>`;
    if (n.text !== undefined) return `${pad}<${n.tag} class="${cls}">${esc(n.text).replace(/\n/g, '<br>')}</${n.tag}>`;
    return `${pad}<div class="${cls}">\n${n.kids.map((k) => render(k, depth + 1)).join('\n')}\n${pad}</div>`;
  };
  const body = render(tree(D, target), 1);
  const vars = D.doc.nxVars && D.doc.nxVars.list.length ? '<link rel="stylesheet" href="variables.css">\n' : '';
  return `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(target ? target.name || 'Composant' : D.page.name)}</title>\n${vars}<style>\n* { box-sizing: border-box; }\nbody { margin: 0; }\n${css.join('\n')}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}
// Tailwind : valeurs exactes en classes arbitraires.
const und = (v) => v.replace(/\s+/g, '_').replace(/'/g, '');
const TW = { position: (v) => v, left: (v) => `left-[${und(v)}]`, top: (v) => `top-[${und(v)}]`, right: (v) => `right-[${und(v)}]`, bottom: (v) => `bottom-[${und(v)}]`, maxWidth: (v) => `max-w-[${und(v)}]`, width: (v) => `w-[${und(v)}]`, height: (v) => `h-[${und(v)}]`, background: (v) => `bg-[${und(v)}]`, borderRadius: (v) => (v === '50%' ? 'rounded-full' : `rounded-[${v}]`), border: (v) => `border-[${v.split(' ')[0]}] border-solid border-[${und(v.split(' ').slice(2).join(' '))}]`, display: (v) => v, flexDirection: (v) => (v === 'row' ? 'flex-row' : 'flex-col'), gap: (v) => `gap-[${v}]`, padding: (v) => `p-[${v}]`, alignItems: (v) => ({ 'flex-start': 'items-start', center: 'items-center', 'flex-end': 'items-end' }[v]), fontFamily: (v) => `font-[${und(v)}]`, fontSize: (v) => `text-[${v}]`, fontWeight: (v) => `font-[${v}]`, lineHeight: (v) => `leading-[${v}]`, color: (v) => `text-[${und(v)}]`, textAlign: (v) => `text-${v}`, fontStyle: () => 'italic', letterSpacing: (v) => `tracking-[${v}]`, textDecoration: (v) => v, whiteSpace: () => 'whitespace-pre-wrap', margin: () => 'm-0', opacity: (v) => `opacity-[${v}]`, transform: (v) => `rotate-[${v.replace(/rotate\(|\)/g, '')}]`, objectFit: () => 'object-cover', overflow: () => 'overflow-hidden', flex: () => 'flex-1', alignSelf: () => 'self-stretch' };
const twOf = (st) => Object.entries(st).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => (TW[k] ? TW[k](String(v)) : '')).filter(Boolean).join(' ');
function jsx(n, depth, html) {
  const pad = '  '.repeat(depth);
  const attr = html ? 'class' : 'className';
  const c = twOf(n.style);
  if (n.tag === 'img') return `${pad}<img ${attr}="${c}" src="${esc(n.src || '')}" alt="${esc(n.alt)}"${html ? '' : ' /'}>`;
  if (n.tag === 'svg') return html ? `${pad}<div ${attr}="${c}">${n.svg}</div>` : `${pad}<div ${attr}="${c}" dangerouslySetInnerHTML={{ __html: ${JSON.stringify(n.svg)} }} />`;
  if (n.text !== undefined) return `${pad}<${n.tag} ${attr}="${c}">${html ? esc(n.text).replace(/\n/g, '<br>') : `{${JSON.stringify(n.text)}}`}</${n.tag}>`;
  return `${pad}<div ${attr}="${c}">\n${n.kids.map((k) => jsx(k, depth + 1, html)).join('\n')}\n${pad}</div>`;
}
export function toReact(D, target) {
  const name = pascal(target ? target.name || 'Composant' : D.page.name);
  return `// Généré par NEX-DESIGN : composant React avec Tailwind CSS.\nexport default function ${name}() {\n  return (\n${jsx(tree(D, target), 2, false)}\n  );\n}\n`;
}
export function toTailwindHtml(D, target) { return `<!-- Généré par NEX-DESIGN : HTML avec Tailwind CSS -->\n${jsx(tree(D, target), 0, true)}\n`; }

// Dev Lab : fichiers écrits dans le projet ouvert.
export async function toDevLab(D, files) {
  const dev = state.devLab;
  const root = dev && dev.st && dev.st.root;
  if (!root) { toast('Ouvre d’abord un projet dans le Dev Lab, puis recommence.', { kind: 'bad' }); return false; }
  const sep = root.includes('\\') ? '\\' : '/';
  const written = [];
  try {
    for (const f of files) {
      const parts = f.path.split('/');
      let dir = root;
      for (const p of parts.slice(0, -1)) { dir = `${dir}${sep}${p}`; await api.invoke('dev:create', { file: dir, dir: true }).catch(() => {}); }
      await api.invoke('dev:write', { file: `${root}${sep}${parts.join(sep)}`, text: f.text });
      written.push(f.path);
    }
  } catch (e) { toast(`Écriture impossible dans le projet : ${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, { kind: 'bad' }); return false; }
  if (dev.loadDir) dev.loadDir(root).then(() => dev.renderSide && dev.renderSide()).catch(() => {});
  toast(`${written.length} fichier(s) ajouté(s) au projet du Dev Lab : ${written.join(', ')}.`, { action: 'Ouvrir le Dev Lab', onAction: () => { const b = document.querySelector('#modeSeg button[data-mode="dev"]'); if (b) b.click(); } });
  return true;
}

export function inspect(D, o) {
  if (!o) return '';
  return sec('Inspection', `<pre class="dzx-css">${esc(cssLines(D, o).join('\n'))}</pre><div class="nx-btns">${btn('css-copy', 'copy', 'Copier le CSS')}${btn('open-code', 'code', 'Exporter en code…')}</div>`);
}
export function panel(D) {
  const s = D.sel();
  const target = s.length === 1 ? s[0] : null;
  return `<p class="dzx-hint">${target ? `Élément sélectionné : <b>${esc(target.name || target.type)}</b>.` : `Page entière : <b>${esc(D.page.name)}</b>.`} Les mises en page automatiques deviennent des boîtes flex, les variables des <code>var(--nom)</code>.</p>
    <div class="dzp-sub">Télécharger (copié aussi dans le presse-papiers)</div>
    <div class="nx-btns">${btn('code-html', 'code', 'HTML et CSS')}${btn('code-react', 'code', 'React (Tailwind)')}${btn('code-tw', 'code', 'HTML Tailwind')}</div>
    <div class="dzp-sub">Vers le Dev Lab</div>
    <p class="dzx-hint">Ajoute le code ${target ? 'du composant' : 'de la page'} et le fichier des variables au projet ouvert dans le Dev Lab.</p>
    <div class="nx-btns">${btn('code-devlab', 'nxDev', 'Envoyer au projet du Dev Lab', '', 'primary')}</div>`;
}
export async function onPanel(D, e) {
  const b = e.target.closest('[data-dzx]');
  if (!b) return false;
  const a = b.dataset.dzx;
  const s = D.sel();
  const target = s.length === 1 ? s[0] : null;
  const name = target ? target.name || 'composant' : D.page.name;
  const outs = { 'code-html': [toHtml, 'html'], 'code-react': [toReact, 'jsx'], 'code-tw': [toTailwindHtml, 'html'] };
  if (outs[a]) {
    const text = outs[a][0](D, target);
    await navigator.clipboard.writeText(text).catch(() => {});
    await saveBytes(textBytes(text), { name: a === 'code-react' ? pascal(name) : slug(name), ext: outs[a][1], kind: 'document', project: D.doc.name || 'NEXORA' });
    return true;
  }
  if (a === 'code-devlab') {
    const { toCss } = await import('./variables.js');
    const files = [{ path: `src/components/${pascal(name)}.jsx`, text: toReact(D, target) }];
    if (D.doc.nxVars && D.doc.nxVars.list.length) files.push({ path: 'src/styles/variables.css', text: toCss(D) });
    await toDevLab(D, files);
    return true;
  }
  return false;
}
