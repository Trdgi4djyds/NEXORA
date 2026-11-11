// NEXORA #053 : du design au code : inspection (CSS de l'élément), export d'une page ou d'un groupe en HTML et
// CSS, en React (Tailwind) ou en HTML Tailwind ; les mises en page automatiques deviennent des boîtes flex et
// les variables des var(--nom). Envoi direct dans le projet ouvert du Dev Lab.
// NEXORA #113 (d'après le mode Dev de desigma) : code SwiftUI et Jetpack Compose ; statut de développement de chaque
// calque (à faire, en cours, prêt pour le développement, terminé), note et lien, repris en commentaire dans le code.
import { esc, toast, state, api, sec, btn, hex, isText, objs, slug, pascal, textBytes, saveBytes, pl } from './ui.js';
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
  const n = { name: o.name || o.type, style: st, kids: [], o };
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
    const note = devNote(n.o);
    if (note) return `${pad}<!-- ${note.replace(/--/g, '—')} -->\n${renderEl(n, depth, cls, pad)}`;
    return renderEl(n, depth, cls, pad);
  };
  const renderEl = (n, depth, cls, pad) => {
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
  const note = devNote(n.o);
  if (note) return `${pad}${html ? `<!-- ${note.replace(/--/g, '—')} -->` : `{/* ${note.replace(/\*\//g, '* /')} */}`}\n${jsxEl(n, depth, html, pad)}`;
  return jsxEl(n, depth, html, pad);
}
function jsxEl(n, depth, html, pad) {
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
  toast(`${pl(written.length, 'fichier ajouté', 'fichiers ajoutés')} au projet du Dev Lab : ${written.join(', ')}.`, { action: 'Ouvrir le Dev Lab', onAction: () => { const b = document.querySelector('#modeSeg button[data-mode="dev"]'); if (b) b.click(); } });
  return true;
}

export function inspect(D, o) {
  if (!o) return '';
  const d = o.nxDev || {};
  return sec('Inspection', `<pre class="dzx-css">${esc(cssLines(D, o).join('\n'))}</pre><div class="nx-btns">${btn('css-copy', 'copy', 'Copier le CSS')}${btn('svg-copy', 'copy', 'Copier en SVG')}${btn('open-code', 'code', 'Exporter en code…')}</div>`)
    + sec('Pour le développement', `<label class="dzx-row"><span>Statut</span><select class="input" data-dzxk="dev.status">${DEV_STATUS.map(([v, l]) => `<option value="${v}" ${(d.status || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="dzx-row dzx-col"><span>Note pour la personne qui le code</span><textarea class="input" rows="2" maxlength="600" data-dzxk="dev.note" placeholder="Ex. : bouton principal, état survol plus foncé">${esc(d.note || '')}</textarea></label>
      <label class="dzx-row"><span>Lien</span><input class="input" data-dzxk="dev.link" value="${esc(d.link || '')}" placeholder="https:// (ticket, documentation)"></label>
      <p class="dzx-hint">Repris en commentaire dans le code exporté (HTML, React, SwiftUI, Compose) ; la liste des éléments prêts est dans Exporter → Code.</p>`);
}
// NEXORA #113 : statut de développement d'un calque.
export const DEV_STATUS = [['', 'Aucun'], ['todo', 'À faire'], ['progress', 'En cours'], ['ready', 'Prêt pour le développement'], ['done', 'Terminé']];
const devLabel = (v) => (DEV_STATUS.find(([k]) => k === v) || ['', ''])[1];
function devNote(o) {
  const d = o && o.nxDev; if (!d || (!d.status && !d.note && !d.link)) return '';
  return [d.status ? devLabel(d.status) : '', d.note || '', d.link || ''].filter(Boolean).join(' · ').replace(/\s+/g, ' ');
}
export function onField(D, o, k, v) {
  if (!o || !k.startsWith('dev.')) return false;
  const d = { ...(o.nxDev || {}) };
  d[k.slice(4)] = String(v || '').trim();
  if (!d.status && !d.note && !d.link) delete o.nxDev; else o.nxDev = d;
  D.nxNextLabel = 'Statut de développement'; D.changed(); D.renderProps();
  return true;
}
export async function copySvg(D, o) {
  try {
    const r = o.getBoundingRect();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.left} ${r.top} ${r.width} ${r.height}" width="${Math.round(r.width)}" height="${Math.round(r.height)}">${o.toSVG()}</svg>`;
    await api.invoke('clipboard:write', svg).catch(() => navigator.clipboard.writeText(svg));
    toast('SVG copié : colle-le dans un autre logiciel ou dans ton code.');
  } catch { toast('Cet élément ne peut pas être copié en SVG.', { kind: 'bad' }); }
}

// ---------- NEXORA #113 : SwiftUI et Jetpack Compose (d'après desigma : swiftui.rs, compose.rs) ----------
const num = (v) => { const n = Number(String(v || 0).replace('px', '')); const r = Math.round(n * 10) / 10; return String(Object.is(r, -0) ? 0 : r); };
const rgba = (c) => {
  const h = hex(c); if (!h) return null;
  const m = /rgba?\([^)]*?,\s*([\d.]+)\s*\)$/.exec(String(c));
  return { h: h.slice(1), a: m && String(c).startsWith('rgba') ? Math.max(0, Math.min(1, Number(m[1]))) : 1 };
};
const fillOf = (o, k = 'fill') => { const c = o && o[k]; if (!c) return null; if (typeof c === 'object' && c.colorStops) return rgba(c.colorStops[0] && c.colorStops[0].color); return rgba(c); };
const swColor = (c) => (c ? `Color(hex: 0x${c.h.toUpperCase()}${c.a < 1 ? `, opacity: ${num(c.a)}` : ''})` : 'Color.clear');
const ktColor = (c) => (c ? `Color(0x${Math.round(c.a * 255).toString(16).padStart(2, '0').toUpperCase()}${c.h.toUpperCase()})` : 'Color.Transparent');
const quote = (t) => JSON.stringify(String(t || ''));
const weightSw = (w) => ({ 100: '.ultraLight', 200: '.thin', 300: '.light', 400: '.regular', 500: '.medium', 600: '.semibold', 700: '.bold', 800: '.heavy', 900: '.black' }[Math.round((Number(w) || 400) / 100) * 100] || '.regular');
const rectOf = (o) => (o ? o.getBoundingRect() : null);
function swiftNode(D, n, depth, box) {
  const pad = '    '.repeat(depth); const o = n.o; const st = n.style; const r = rectOf(o);
  const mods = [];
  let body;
  if (st.display === 'flex') {
    const row = st.flexDirection === 'row';
    const al = row ? ({ 'flex-start': '.top', center: '.center', 'flex-end': '.bottom' }[st.alignItems] || '.top') : ({ 'flex-start': '.leading', center: '.center', 'flex-end': '.trailing' }[st.alignItems] || '.leading');
    body = `${row ? 'HStack' : 'VStack'}(alignment: ${al}, spacing: ${num(st.gap)}) {\n${n.kids.map((k) => swiftNode(D, k, depth + 1, null)).join('\n')}\n${pad}}`;
    if (st.padding) mods.push(`.padding(${num(st.padding)})`);
    if (st.width) mods.push(`.frame(width: ${num(st.width)}, alignment: .leading)`);
    const bg = o && o.getObjects ? o.getObjects().find((x) => x.nxAutoBg) : null;
    if (bg) { mods.push(`.background(${swColor(fillOf(bg))})`); if (bg.rx) mods.push(`.clipShape(RoundedRectangle(cornerRadius: ${num(bg.rx)}))`); }
  } else if (n.text !== undefined) {
    const s = (o && o.scaleY) || 1;
    body = `Text(${quote(n.text)})`;
    mods.push(`.font(.custom(${quote(famCss(o && o.fontFamily))}, size: ${num((o ? o.fontSize : 16) * s)}).weight(${weightSw(o && o.fontWeight)}))`);
    mods.push(`.foregroundColor(${swColor(fillOf(o))})`);
    if (o && o.textAlign && o.textAlign !== 'left') mods.push(`.multilineTextAlignment(.${o.textAlign === 'right' ? 'trailing' : 'center'})`);
    if (st.width) mods.push(`.frame(width: ${num(st.width)}, alignment: .${o && o.textAlign === 'center' ? 'center' : o && o.textAlign === 'right' ? 'trailing' : 'leading'})`);
  } else if (n.tag === 'img') {
    const remote = /^https?:/i.test(n.src || '');
    body = remote ? `AsyncImage(url: URL(string: ${quote(n.src)})) { $0.resizable().scaledToFill() } placeholder: { Color.gray.opacity(0.15) }` : `Image(${quote(slug(n.name))}) // image intégrée : ajoute-la au catalogue d’éléments\n${pad}    .resizable().scaledToFill()`;
    mods.push(`.frame(width: ${num(st.width)}, height: ${num(st.height)})`, '.clipped()');
  } else if (o && (o.type === 'rect' || o.type === 'ellipse' || o.type === 'circle')) {
    const shape = o.type === 'rect' ? (o.rx ? `RoundedRectangle(cornerRadius: ${num(o.rx * (o.scaleX || 1))})` : 'Rectangle()') : 'Ellipse()';
    body = `${shape}\n${pad}    .fill(${swColor(fillOf(o))})`;
    if (o.stroke && o.strokeWidth) body += `\n${pad}    .overlay(${shape}.stroke(${swColor(fillOf(o, 'stroke'))}, lineWidth: ${num(o.strokeWidth)}))`;
    mods.push(`.frame(width: ${num(st.width)}, height: ${num(st.height)})`);
  } else if (n.kids && n.kids.length) {
    body = `ZStack(alignment: .topLeading) {\n${n.kids.map((k) => swiftNode(D, k, depth + 1, r || { left: 0, top: 0 })).join('\n')}\n${pad}}`;
    if (st.width && st.width !== '100%') mods.push(`.frame(width: ${num(st.width)}, height: ${num(st.height)}, alignment: .topLeading)`);
  } else {
    body = `Image(${quote(slug(n.name))}) // forme vectorielle : exporte-la en SVG (Copier en SVG) puis ajoute-la au catalogue`;
    mods.push(`.frame(width: ${num(st.width)}, height: ${num(st.height)})`);
  }
  if (o && o.angle && box) mods.push(`.rotationEffect(.degrees(${num(o.angle)}))`);
  if (o && o.opacity !== undefined && o.opacity < 1) mods.push(`.opacity(${num(o.opacity)})`);
  if (box && r) mods.push(`.offset(x: ${num(r.left - box.left)}, y: ${num(r.top - box.top)})`);
  const note = devNote(o);
  return `${note ? `${pad}// ${note}\n` : ''}${pad}${body}${mods.map((m) => `\n${pad}    ${m}`).join('')}`;
}
export function toSwiftUI(D, target) {
  const name = pascal(target ? target.name || 'Composant' : D.page.name);
  const root = tree(D, target);
  const inner = target ? swiftNode(D, root, 2, null) : `${'    '.repeat(2)}ZStack(alignment: .topLeading) {\n${root.kids.map((k) => swiftNode(D, k, 3, { left: 0, top: 0 })).join('\n')}\n${'    '.repeat(2)}}\n${'    '.repeat(2)}.frame(width: ${num(D.page.w)}, height: ${num(D.page.h)}, alignment: .topLeading)\n${'    '.repeat(2)}.background(${swColor(rgba(D.page.bg || '#ffffff'))})`;
  return `// Généré par NEX-DESIGN : vue SwiftUI.\nimport SwiftUI\n\nstruct ${name}: View {\n    var body: some View {\n${inner}\n    }\n}\n\nextension Color {\n    init(hex: UInt, opacity: Double = 1) {\n        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: opacity)\n    }\n}\n`;
}
function composeNode(D, n, depth, box) {
  const pad = '    '.repeat(depth); const o = n.o; const st = n.style; const r = rectOf(o);
  const mod = ['Modifier'];
  if (box && r) mod.push(`.offset(x = ${num(r.left - box.left)}.dp, y = ${num(r.top - box.top)}.dp)`);
  if (o && o.angle && box) mod.push(`.rotate(${num(o.angle)}f)`);
  if (o && o.opacity !== undefined && o.opacity < 1) mod.push(`.alpha(${num(o.opacity)}f)`);
  let out;
  if (st.display === 'flex') {
    const row = st.flexDirection === 'row';
    const bg = o && o.getObjects ? o.getObjects().find((x) => x.nxAutoBg) : null;
    if (st.width) mod.push(`.width(${num(st.width)}.dp)`);
    if (bg) mod.push(`.background(${ktColor(fillOf(bg))}, RoundedCornerShape(${num(bg.rx || 0)}.dp))`);
    if (st.padding) mod.push(`.padding(${num(st.padding)}.dp)`);
    const al = row ? `verticalAlignment = Alignment.${{ 'flex-start': 'Top', center: 'CenterVertically', 'flex-end': 'Bottom' }[st.alignItems] || 'Top'}` : `horizontalAlignment = Alignment.${{ 'flex-start': 'Start', center: 'CenterHorizontally', 'flex-end': 'End' }[st.alignItems] || 'Start'}`;
    out = `${row ? 'Row' : 'Column'}(\n${pad}    modifier = ${mod.join('')},\n${pad}    ${row ? 'horizontalArrangement' : 'verticalArrangement'} = Arrangement.spacedBy(${num(st.gap)}.dp),\n${pad}    ${al}\n${pad}) {\n${n.kids.map((k) => composeNode(D, k, depth + 1, null)).join('\n')}\n${pad}}`;
  } else if (n.text !== undefined) {
    const s = (o && o.scaleY) || 1;
    if (st.width) mod.push(`.width(${num(st.width)}.dp)`);
    const args = [`text = ${quote(n.text)}`, `fontSize = ${num((o ? o.fontSize : 16) * s)}.sp`, `fontWeight = FontWeight.W${Math.round((Number(o && o.fontWeight) || 400) / 100) * 100}`, `color = ${ktColor(fillOf(o))}`];
    if (o && o.textAlign && o.textAlign !== 'left') args.push(`textAlign = TextAlign.${o.textAlign === 'right' ? 'End' : 'Center'}`);
    args.push(`modifier = ${mod.join('')} // police : ${famCss(o && o.fontFamily)}`);
    out = `Text(\n${args.map((a) => `${pad}    ${a}`).join(',\n')}\n${pad})`;
  } else if (n.tag === 'img') {
    mod.push(`.size(${num(st.width)}.dp, ${num(st.height)}.dp)`);
    out = /^https?:/i.test(n.src || '') ? `AsyncImage( // bibliothèque Coil\n${pad}    model = ${quote(n.src)},\n${pad}    contentDescription = ${quote(n.alt)},\n${pad}    contentScale = ContentScale.Crop,\n${pad}    modifier = ${mod.join('')}\n${pad})` : `Image( // image intégrée : ajoute-la dans res/drawable\n${pad}    painter = painterResource(R.drawable.${slug(n.name).replace(/-/g, '_')}),\n${pad}    contentDescription = ${quote(n.alt)},\n${pad}    contentScale = ContentScale.Crop,\n${pad}    modifier = ${mod.join('')}\n${pad})`;
  } else if (o && (o.type === 'rect' || o.type === 'ellipse' || o.type === 'circle')) {
    const shape = o.type === 'rect' ? `RoundedCornerShape(${num((o.rx || 0) * (o.scaleX || 1))}.dp)` : 'CircleShape';
    mod.push(`.size(${num(st.width)}.dp, ${num(st.height)}.dp)`, `.background(${ktColor(fillOf(o))}, ${shape})`);
    if (o.stroke && o.strokeWidth) mod.push(`.border(${num(o.strokeWidth)}.dp, ${ktColor(fillOf(o, 'stroke'))}, ${shape})`);
    out = `Box(modifier = ${mod.join('')})`;
  } else if (n.kids && n.kids.length) {
    if (st.width && st.width !== '100%') mod.push(`.size(${num(st.width)}.dp, ${num(st.height)}.dp)`);
    out = `Box(modifier = ${mod.join('')}) {\n${n.kids.map((k) => composeNode(D, k, depth + 1, r || { left: 0, top: 0 })).join('\n')}\n${pad}}`;
  } else {
    mod.push(`.size(${num(st.width)}.dp, ${num(st.height)}.dp)`);
    out = `Image( // forme vectorielle : exporte-la en SVG puis importe-la comme Vector Asset\n${pad}    painter = painterResource(R.drawable.${slug(n.name).replace(/-/g, '_')}),\n${pad}    contentDescription = null,\n${pad}    modifier = ${mod.join('')}\n${pad})`;
  }
  const note = devNote(o);
  return `${note ? `${pad}// ${note}\n` : ''}${pad}${out}`;
}
export function toCompose(D, target) {
  const name = pascal(target ? target.name || 'Composant' : D.page.name);
  const root = tree(D, target);
  const inner = target ? composeNode(D, root, 1, null) : `    Box(\n        modifier = Modifier.size(${num(D.page.w)}.dp, ${num(D.page.h)}.dp).background(${ktColor(rgba(D.page.bg || '#ffffff'))})\n    ) {\n${root.kids.map((k) => composeNode(D, k, 2, { left: 0, top: 0 })).join('\n')}\n    }`;
  return `// Généré par NEX-DESIGN : composable Jetpack Compose.\nimport androidx.compose.foundation.*\nimport androidx.compose.foundation.layout.*\nimport androidx.compose.foundation.shape.*\nimport androidx.compose.material3.Text\nimport androidx.compose.runtime.Composable\nimport androidx.compose.ui.*\nimport androidx.compose.ui.draw.*\nimport androidx.compose.ui.graphics.Color\nimport androidx.compose.ui.layout.ContentScale\nimport androidx.compose.ui.res.painterResource\nimport androidx.compose.ui.text.font.FontWeight\nimport androidx.compose.ui.text.style.TextAlign\nimport androidx.compose.ui.unit.*\n\n@Composable\nfun ${name}() {\n${inner}\n}\n`;
}
export function panel(D) {
  const s = D.sel();
  const target = s.length === 1 ? s[0] : null;
  return `<p class="dzx-hint">${target ? `Élément sélectionné : <b>${esc(target.name || target.type)}</b>.` : `Page entière : <b>${esc(D.page.name)}</b>.`} Les mises en page automatiques deviennent des boîtes flex, les variables des <code>var(--nom)</code>.</p>
    <div class="dzp-sub">Télécharger (copié aussi dans le presse-papiers)</div>
    <div class="nx-btns">${btn('code-html', 'code', 'HTML et CSS')}${btn('code-react', 'code', 'React (Tailwind)')}${btn('code-tw', 'code', 'HTML Tailwind')}${btn('code-swift', 'code', 'SwiftUI')}${btn('code-compose', 'code', 'Jetpack Compose')}</div>
    ${devList(D)}
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
  const outs = { 'code-html': [toHtml, 'html'], 'code-react': [toReact, 'jsx'], 'code-tw': [toTailwindHtml, 'html'], 'code-swift': [toSwiftUI, 'swift'], 'code-compose': [toCompose, 'kt'] };
  if (outs[a]) {
    const text = outs[a][0](D, target);
    await navigator.clipboard.writeText(text).catch(() => {});
    await saveBytes(textBytes(text), { name: ['code-react', 'code-swift', 'code-compose'].includes(a) ? pascal(name) : slug(name), ext: outs[a][1], kind: 'document', project: D.doc.name || 'NEXORA' });
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
// NEXORA #113 : éléments de la page marqués pour le développement (statut, note, lien).
function devList(D) {
  const list = [];
  const walkAll = (arr) => { for (const o of arr) { if (o.nxDev && o.nxDev.status) list.push(o); if (o.getObjects) walkAll(o.getObjects()); } };
  walkAll(objs(D));
  if (!list.length) return '<p class="dzx-hint">Aucun élément marqué pour le développement sur cette page (onglet Code du panneau de droite : « Pour le développement »).</p>';
  const ready = list.filter((o) => o.nxDev.status === 'ready').length;
  return `<div class="dzp-sub">Pour le développement · ${pl(ready, 'élément prêt', 'éléments prêts')}</div><div class="dzp-list">${list.map((o) => `<div class="dzp-item ${o.nxDev.status === 'ready' || o.nxDev.status === 'done' ? 'ok' : ''}"><span><b>${esc(o.name || (D.typeName ? D.typeName(o) : o.type))}</b><small>${esc(devLabel(o.nxDev.status))}${o.nxDev.note ? ` · ${esc(o.nxDev.note)}` : ''}${o.nxDev.link ? ` · ${esc(o.nxDev.link)}` : ''}</small></span></div>`).join('')}</div>`;
}
