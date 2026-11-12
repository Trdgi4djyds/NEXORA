import{b as u}from"./chunk-QDKEB2AU.js";import{a as g}from"./chunk-W2YYTHPL.js";import{a as n}from"./chunk-XJMNRA7U.js";import{a as w}from"./chunk-6ZWS5EFO.js";import{b as o}from"./chunk-S4I2LXHS.js";import{a as c,d as v}from"./chunk-GKSXEY5K.js";import"./chunk-ZAWUH4BJ.js";import{a}from"./chunk-V3CX37JL.js";import{a as l,b as h,c as p}from"./chunk-VBMWAH3C.js";import"./chunk-6DHFEWGX.js";var y=String.raw`(function (opts) {
  if (window.__vtPick) { window.__vtPick.on(opts); return 'on'; }
  const ATTR = 'data-vitrine-sel';
  const post = (m) => { try { console.debug('__VT__' + JSON.stringify(m)); } catch (e) { /* page */ } };
  const host = document.createElement('vitrine-picker');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = '<style>'
    + '.b{position:fixed;box-sizing:border-box;pointer-events:none;border-radius:2px;transition:all .06s ease-out}'
    + '.h{border:1.5px solid #0d99ff;background:rgba(13,153,255,.06)}'
    + '.s{border:2px solid #0d99ff;box-shadow:0 0 0 9999px rgba(0,0,0,.0)}'
    + '.p{border:1px dashed rgba(13,153,255,.7)}'
    + '.m{background:rgba(255,155,40,.18)}.pd{background:rgba(40,200,120,.16)}'
    + '.l{position:fixed;font:600 11px/1 Inter,system-ui,sans-serif;color:#fff;background:#0d99ff;padding:4px 6px;border-radius:4px;white-space:nowrap;pointer-events:none;max-width:60vw;overflow:hidden;text-overflow:ellipsis}'
    + '.l i{font-style:normal;opacity:.75;font-weight:500;margin-left:6px}'
    + '.k{position:fixed;width:7px;height:7px;background:#fff;border:1.5px solid #0d99ff;box-sizing:border-box;border-radius:1px}'
    + '.d{position:fixed;font:600 10px/1 Inter,system-ui,sans-serif;color:#fff;background:#f24822;padding:3px 5px;border-radius:3px}'
    + '</style><div class="b p" id="pp" hidden></div><div class="b h" id="hv" hidden></div><div class="b s" id="sl" hidden></div>'
    + '<div class="b m" id="mt" hidden></div><div class="b m" id="mr" hidden></div><div class="b m" id="mb" hidden></div><div class="b m" id="ml" hidden></div>'
    + '<div class="l" id="lb" hidden></div><div class="k" id="k1" hidden></div><div class="k" id="k2" hidden></div><div class="k" id="k3" hidden></div><div class="k" id="k4" hidden></div><div class="d" id="dz" hidden></div>';
  const $ = (id) => root.getElementById(id);
  document.documentElement.appendChild(host);
  let mode = (opts && opts.mode) || 'element';
  let hover = null;
  let sel = null;
  let active = true;

  const SECTION_TAGS = /^(HEADER|NAV|MAIN|SECTION|FOOTER|ASIDE|ARTICLE|FORM|DIALOG)$/;
  const isSection = (el) => {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (SECTION_TAGS.test(el.tagName)) return true;
    const r = el.getBoundingClientRect();
    const p = el.parentElement;
    if (!p) return false;
    const pr = p.getBoundingClientRect();
    return r.width >= innerWidth * 0.6 && r.height >= 80 && (p === document.body || SECTION_TAGS.test(p.tagName) || pr.width >= innerWidth * 0.9) && r.height < pr.height * 0.95;
  };
  const sectionOf = (el) => { let e = el; while (e && e !== document.body) { if (isSection(e)) return e; e = e.parentElement; } return el; };
  const label = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = [...el.classList].filter((c) => !/^(css-|sc-|jsx-|svelte-)/.test(c)).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    return s;
  };
  const compName = (el) => {
    try {
      const k = Object.keys(el).find((x) => x.startsWith('__reactFiber'));
      if (k) {
        let f = el[k];
        while (f) {
          if (typeof f.type === 'function' || (f.type && typeof f.type === 'object' && (f.type.render || f.type.type))) {
            const t = f.type.render || f.type.type || f.type;
            const n = f.type.displayName || t.displayName || t.name;
            if (n && !/^(div|span)$/.test(n)) return { lib: 'React', name: n };
          }
          f = f.return;
        }
      }
      let v = el.__vueParentComponent || (el.__vue__ && el.__vue__.$);
      if (v && v.type) return { lib: 'Vue', name: v.type.name || v.type.__name || (v.type.__file || '').split('/').pop() };
      let e = el;
      while (e) { if (e.tagName && e.tagName.includes('-') && !/^VITRINE/.test(e.tagName)) return { lib: 'Composant web', name: e.tagName.toLowerCase() }; e = e.parentElement; }
    } catch (err) { /* introspection impossible */ }
    return null;
  };
  const cssPath = (el) => {
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && document.querySelectorAll('#' + el.id).length === 1) return '#' + el.id;
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1 && e !== document.documentElement && parts.length < 8) {
      let p = e.tagName.toLowerCase();
      if (e.id && /^[a-zA-Z][\w-]*$/.test(e.id)) { parts.unshift('#' + e.id); break; }
      const cls = [...e.classList].filter((c) => /^[a-zA-Z_][\w-]*$/.test(c) && !/^(css-|sc-|jsx-)/.test(c)).slice(0, 2);
      if (cls.length) p += '.' + cls.join('.');
      const parent = e.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === e.tagName && (!cls.length || cls.every((x) => c.classList.contains(x))));
        if (same.length > 1) p += ':nth-of-type(' + ([...parent.children].filter((c) => c.tagName === e.tagName).indexOf(e) + 1) + ')';
      }
      parts.unshift(p);
      try { if (document.querySelectorAll(parts.join(' > ')).length === 1) break; } catch (err) { /* sélecteur invalide */ }
      e = parent;
    }
    return parts.join(' > ');
  };
  const place = (box, r) => { box.hidden = false; box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px'; };
  const info = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const pick = ['display', 'position', 'width', 'height', 'margin', 'padding', 'gap', 'flex-direction', 'justify-content', 'align-items', 'grid-template-columns', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'background-image', 'border', 'border-radius', 'box-shadow', 'opacity', 'z-index', 'overflow', 'transform', 'transition'];
    const styles = {};
    for (const k of pick) { const v = cs.getPropertyValue(k); if (v && !/^(none|normal|auto|0px|rgba\(0, 0, 0, 0\)|visible|static)$/.test(v)) styles[k] = v; }
    const path = [];
    let e = el;
    while (e && e.nodeType === 1 && e !== document.documentElement) { path.unshift({ label: label(e), section: isSection(e) }); e = e.parentElement; }
    const imgs = [...el.querySelectorAll('img, picture source, video, svg')].length + (el.tagName === 'IMG' ? 1 : 0);
    const bgs = [];
    for (const n of [el, ...el.querySelectorAll('*')].slice(0, 400)) { const b = getComputedStyle(n).backgroundImage; if (b && b.startsWith('url(')) bgs.push(b.slice(4, -1).replace(/^"|"$/g, '')); }
    const assets = [...new Set([...[el, ...el.querySelectorAll('img')].filter((x) => x.tagName === 'IMG').map((x) => x.currentSrc || x.src), ...[...el.querySelectorAll('video, source')].map((x) => x.src).filter(Boolean), ...bgs])].filter((u) => u && !u.startsWith('data:')).slice(0, 60);
    return {
      label: label(el), tag: el.tagName.toLowerCase(), id: el.id || '', classes: [...el.classList], selector: cssPath(el), text: (el.innerText || '').trim().slice(0, 160),
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) },
      children: el.children.length, descendants: el.querySelectorAll('*').length, role: el.getAttribute('role') || '', ariaLabel: el.getAttribute('aria-label') || '', href: el.href || '', src: el.currentSrc || el.src || '',
      styles, path, section: isSection(el), component: compName(el), media: imgs, assets,
    };
  };
  const drawHover = () => {
    if (!hover || !active) { $('hv').hidden = true; $('lb').hidden = true; for (const id of ['mt', 'mr', 'mb', 'ml']) $(id).hidden = true; return; }
    const r = hover.getBoundingClientRect();
    place($('hv'), r);
    const lb = $('lb');
    lb.hidden = false;
    lb.innerHTML = '';
    lb.textContent = label(hover);
    const dim = document.createElement('i');
    dim.textContent = Math.round(r.width) + ' × ' + Math.round(r.height);
    lb.appendChild(dim);
    const comp = compName(hover);
    if (comp && mode !== 'section') { const c = document.createElement('i'); c.textContent = '⟨' + comp.name + '⟩'; lb.appendChild(c); }
    const top = r.top > 24 ? r.top - 22 : r.bottom + 4;
    lb.style.left = Math.max(2, Math.min(innerWidth - lb.offsetWidth - 2, r.left)) + 'px';
    lb.style.top = top + 'px';
    // Marges (orange) autour de l'élément survolé.
    const cs = getComputedStyle(hover);
    const m = ['Top', 'Right', 'Bottom', 'Left'].map((k) => parseFloat(cs['margin' + k]) || 0);
    const boxes = [['mt', { left: r.left, top: r.top - m[0], width: r.width, height: m[0] }], ['mr', { left: r.right, top: r.top, width: m[1], height: r.height }], ['mb', { left: r.left, top: r.bottom, width: r.width, height: m[2] }], ['ml', { left: r.left - m[3], top: r.top, width: m[3], height: r.height }]];
    for (const [id, b] of boxes) { if (b.width > 0 && b.height > 0) place($(id), b); else $(id).hidden = true; }
  };
  const drawSel = () => {
    const ks = ['k1', 'k2', 'k3', 'k4'];
    if (!sel || !document.contains(sel)) { $('sl').hidden = true; $('pp').hidden = true; $('dz').hidden = true; ks.forEach((k) => { $(k).hidden = true; }); return; }
    const r = sel.getBoundingClientRect();
    place($('sl'), r);
    const pts = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]];
    ks.forEach((k, i) => { const b = $(k); b.hidden = false; b.style.left = (pts[i][0] - 3.5) + 'px'; b.style.top = (pts[i][1] - 3.5) + 'px'; });
    const dz = $('dz');
    dz.hidden = false;
    dz.textContent = Math.round(r.width) + ' × ' + Math.round(r.height);
    dz.style.left = (r.left + r.width / 2 - dz.offsetWidth / 2) + 'px';
    dz.style.top = Math.min(innerHeight - 18, r.bottom + 6) + 'px';
    const p = sel.parentElement;
    if (p && p !== document.body && p !== document.documentElement) place($('pp'), p.getBoundingClientRect()); else $('pp').hidden = true;
  };
  let raf = 0;
  const redraw = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; drawHover(); drawSel(); }); };
  const target = (e) => {
    let el = e.composedPath ? e.composedPath()[0] : e.target;
    if (!el || el === host || el.nodeType !== 1) el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host) return null;
    if (el.closest && el.closest('vitrine-picker')) return null;
    return mode === 'section' ? sectionOf(el) : el;
  };
  const choose = (el, scroll) => {
    if (!el || el.nodeType !== 1) return;
    document.querySelectorAll('[' + ATTR + ']').forEach((x) => x.removeAttribute(ATTR));
    sel = el;
    sel.setAttribute(ATTR, '');
    if (scroll) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    redraw();
    post({ type: 'select', info: info(sel) });
  };
  const onMove = (e) => { if (!active) return; const t = target(e); if (t !== hover) { hover = t; redraw(); } };
  const swallow = (e) => { if (!active) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  const onClick = (e) => { if (!active) return; swallow(e); const t = target(e); if (t) choose(t); };
  const onKey = (e) => {
    if (!active || !sel) { if (active && e.key === 'Escape') post({ type: 'escape' }); return; }
    let n = null;
    if (e.key === 'Escape') { document.querySelectorAll('[' + ATTR + ']').forEach((x) => x.removeAttribute(ATTR)); sel = null; redraw(); post({ type: 'deselect' }); swallow(e); return; }
    if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) n = sel.parentElement;
    else if (e.key === 'ArrowDown' || e.key === 'Enter') n = sel.firstElementChild;
    else if (e.key === 'ArrowLeft') n = sel.previousElementSibling;
    else if (e.key === 'ArrowRight') n = sel.nextElementSibling;
    if (n && n !== document.documentElement && n !== document.body.parentElement) { swallow(e); choose(n, true); }
  };
  const evOpts = { capture: true, passive: false };
  const listen = () => {
    addEventListener('mousemove', onMove, true);
    for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick', 'contextmenu']) addEventListener(t, t === 'click' ? onClick : swallow, evOpts);
    addEventListener('keydown', onKey, true);
    addEventListener('scroll', redraw, true);
    addEventListener('resize', redraw);
  };
  const unlisten = () => {
    removeEventListener('mousemove', onMove, true);
    for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick', 'contextmenu']) removeEventListener(t, t === 'click' ? onClick : swallow, evOpts);
    removeEventListener('keydown', onKey, true);
  };
  listen();
  const sections = () => {
    const out = [];
    const seen = new Set();
    const walk = (el, depth) => {
      for (const c of el.children) {
        if (c === host || /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE)$/.test(c.tagName)) continue;
        const r = c.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) { if (depth < 4) walk(c, depth); continue; }
        if (isSection(c) && !seen.has(c)) {
          seen.add(c);
          const h = c.querySelector('h1, h2, h3');
          out.push({ selector: cssPath(c), label: label(c), title: h ? h.innerText.trim().slice(0, 60) : (c.getAttribute('aria-label') || ''), height: Math.round(r.height), depth });
          if (depth < 2) walk(c, depth + 1);
        } else if (depth < 4) walk(c, depth);
      }
    };
    walk(document.body, 0);
    return out.slice(0, 80);
  };
  window.__vtPick = {
    on(o) { active = true; if (o && o.mode) mode = o.mode; host.style.display = 'block'; unlisten(); listen(); redraw(); },
    off() { active = false; hover = null; unlisten(); redraw(); },
    hide() { active = false; hover = null; unlisten(); document.querySelectorAll('[' + ATTR + ']').forEach((x) => x.removeAttribute(ATTR)); sel = null; host.style.display = 'none'; },
    mode(m) { mode = m; },
    select(s) { try { const el = document.querySelector(s); if (el) choose(el, true); return Boolean(el); } catch (e) { return false; } },
    selectPath(i) { if (!sel) return; const chain = []; let e = sel; while (e && e !== document.documentElement) { chain.unshift(e); e = e.parentElement; } if (chain[i]) choose(chain[i], true); },
    nav(dir) { onKey({ key: dir, shiftKey: false, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }); },
    sections,
    current() { return sel ? info(sel) : null; },
  };
  return 'ready';
})`;var d={fill:{label:"Fen\xEAtre",w:0,h:0},fhd:{label:"\xC9cran 1920 \xD7 1080",w:1920,h:1080},desktop:{label:"Ordinateur 1440 \xD7 900",w:1440,h:900},laptop:{label:"Portable 1280 \xD7 800",w:1280,h:800},tabletL:{label:"Tablette paysage 1180 \xD7 820",w:1180,h:820,mobile:!0,dpr:2,os:"android-tablet"},tablet:{label:"Tablette 820 \xD7 1180",w:820,h:1180,mobile:!0,dpr:2,os:"android-tablet"},iphone:{label:"iPhone 402 \xD7 874",w:402,h:874,mobile:!0,dpr:3,os:"ios"},android:{label:"Android 412 \xD7 915",w:412,h:915,mobile:!0,dpr:2.625,os:"android"},small:{label:"Petit mobile 360 \xD7 780",w:360,h:780,mobile:!0,dpr:3,os:"android"}},k={none:"R\xE9seau normal",fibre:"Fibre","4g":"4G","3g":"3G","3g-slow":"3G lente",edge:"EDGE (2G)",offline:"Hors ligne"},f=[["elements","\xC9l\xE9ments","target",()=>import("./elements-panel-X3WQOSJS.js")],["network","R\xE9seau","sync",()=>import("./network-panel-22J5JADH.js")],["audit","Audit","audit",()=>import("./audit-panel-O3NTEVY4.js")],["tests","Tests","pass",()=>import("./tests-panel-IVO5657Z.js")],["scrape","Aspirateur","download",()=>import("./scrape-panel-F7OIKNR6.js")],["console","Console","terminal",()=>import("./console-panel-O72RMDLX.js")],["devtools","DevTools","wrench",null]];function x(){return{url:"",viewport:"fill",throttle:"none",cpu:1,tab:"elements",pick:!1,pickMode:"element",cacheOff:!1,history:[]}}var m=class{constructor(e){this.el=e,c.browserLab={...x(),...c.browserLab||{}},this.st=c.browserLab,this.panels=new Map,this.wv=null,this.wcId=null,this.listeners=new Map,this.render(),this.ensurePanel("console"),this.ensurePanel("network");let t=n.baseUrl||n.source&&n.source.url||"",s=r=>{try{return new URL(r).origin}catch{return""}},i=(t&&s(t)!==s(this.st.url)?t:"")||this.st.url||n.board&&n.board.focused&&n.board.focused.url||"";i?this.navigate(i):this.showEmpty()}save(){v()}on(e,t){return this.listeners.has(e)||this.listeners.set(e,new Set),this.listeners.get(e).add(t),()=>this.listeners.get(e).delete(t)}emit(e,...t){for(let s of this.listeners.get(e)||[])try{s(...t)}catch(i){console.error(i)}}render(){this.el.innerHTML=`
      <div class="bl">
        <div class="bl-bar">
          <div class="bl-navs">
            <button class="icon-btn" data-act="back" title="Pr\xE9c\xE9dente">${o("back",17)}</button>
            <button class="icon-btn" data-act="forward" title="Suivante">${o("forward",17)}</button>
            <button class="icon-btn" data-act="reload" title="Recharger (Maj : sans cache)">${o("reload",16)}</button>
          </div>
          <form class="bl-addr" autocomplete="off"><span class="bl-addr-ico">${o("globe",14)}</span><input class="bl-url" spellcheck="false" placeholder="Adresse d\u2019un site ou recherche" value=""><span class="bl-load"></span></form>
          <select class="input bl-sel" data-set="viewport" title="Taille d\u2019affichage">${Object.entries(d).map(([e,t])=>`<option value="${e}" ${this.st.viewport===e?"selected":""}>${t.label}</option>`).join("")}</select>
          <select class="input bl-sel" data-set="throttle" title="D\xE9bit r\xE9seau simul\xE9">${Object.entries(k).map(([e,t])=>`<option value="${e}" ${this.st.throttle===e?"selected":""}>${t}</option>`).join("")}</select>
          <div class="seg bl-pick" role="group">
            <button data-act="pick-element" class="${this.st.pick&&this.st.pickMode==="element"?"on":""}" title="S\xE9lectionner un composant (comme dans Figma)">${o("target",15)}<span>Composant</span></button>
            <button data-act="pick-section" class="${this.st.pick&&this.st.pickMode==="section"?"on":""}" title="S\xE9lectionner une section enti\xE8re">${o("layers",15)}<span>Section</span></button>
          </div>
          <button class="icon-btn" data-act="to-responsive" title="Ouvrir cette page dans le Responsive Lab">${o("multi",17)}</button>
        </div>
        <div class="bl-body">
          <div class="bl-view">
            <div class="bl-canvas"></div>
            <div class="bl-size"></div>
          </div>
          <aside class="bl-panel">
            <div class="bl-tabs" role="tablist">${f.map(([e,t,s])=>`<button role="tab" data-tab="${e}" class="${this.st.tab===e?"on":""}">${o(s,14)}<span>${t}</span></button>`).join("")}</div>
            <div class="bl-panes">${f.map(([e])=>`<div class="bl-pane" data-pane="${e}" hidden></div>`).join("")}</div>
          </aside>
        </div>
      </div>`,this.$={url:l(".bl-url",this.el),canvas:l(".bl-canvas",this.el),view:l(".bl-view",this.el),size:l(".bl-size",this.el),load:l(".bl-load",this.el),panel:l(".bl-panel",this.el)},l(".bl-addr",this.el).addEventListener("submit",e=>{e.preventDefault(),this.navigate(this.$.url.value),this.$.url.blur()}),this.el.addEventListener("click",e=>this.onClick(e)),this.el.addEventListener("change",e=>this.onChange(e)),g(this.$.panel,{key:"browserPanel",edge:"left",min:340,max:()=>Math.max(360,window.innerWidth*.62),onResize:()=>this.layout()}),new ResizeObserver(()=>this.layout()).observe(this.$.view),this.openTab(this.st.tab)}showEmpty(){this.$.canvas.innerHTML=`<div class="bl-empty">${o("globe",34)}<h2>Browser Lab</h2><p>Saisissez l\u2019adresse d\u2019un site pour l\u2019analyser : composants et leur code, r\xE9seau, audit, tests automatiques, aspiration compl\xE8te.</p>
      ${n.board&&n.board.focused&&n.board.focused.url?`<button class="btn" data-act="from-responsive">${o("multi",15)}<span>Page du Responsive Lab</span></button>`:""}</div>`}onClick(e){let t=e.target.closest("[data-tab]");if(t){this.openTab(t.dataset.tab);return}let s=e.target.closest("[data-act]");if(s)switch(s.dataset.act){/* NEXORA #006 : sans page ou sans historique, un message au lieu de rien */case"back":this.wv?this.wv.canGoBack()?this.wv.goBack():w("Aucune page pr\xE9c\xE9dente."):w("Ouvrez d\u2019abord une page.",{kind:"bad"});break;case"forward":this.wv?this.wv.canGoForward()?this.wv.goForward():w("Aucune page suivante."):w("Ouvrez d\u2019abord une page.",{kind:"bad"});break;case"reload":this.wv?e.shiftKey?this.wv.reloadIgnoringCache():this.wv.reload():w("Ouvrez d\u2019abord une page.",{kind:"bad"});break;case"pick-element":this.togglePick("element");break;case"pick-section":this.togglePick("section");break;case"to-responsive":this.toResponsive();break;case"from-responsive":this.navigate(n.board.focused.url);break;default:break}}onChange(e){let t=e.target.dataset.set;t&&(this.st[t]=e.target.value,this.save(),t==="viewport"&&this.applyViewport(),t==="throttle"&&this.wcId&&a.invoke("lab:net-throttle",{wcId:this.wcId,preset:this.st.throttle}))}async toResponsive(){if(!this.url){w("Ouvrez d\u2019abord une page.",{kind:"bad"});return}let{setMode:e}=await import("./toolbar-LJFELS7F.js"),{openUrl:t}=await import("./sources-GIMEAXU2.js");await e("preview"),t(this.url)}async openTab(e){this.st.tab=e,this.save();for(let i of h("[data-tab]",this.el))i.classList.toggle("on",i.dataset.tab===e);for(let i of h("[data-pane]",this.el))i.hidden=i.dataset.pane!==e;for(let[i,r]of this.panels)i!==e&&r.deactivate&&r.deactivate();let t=l(`[data-pane="${e}"]`,this.el);if(e==="devtools"){this.openDevtools(t);return}let s=await this.ensurePanel(e);s&&s.activate&&this.st.tab===e&&s.activate()}async ensurePanel(e){let t=this.panels.get(e);if(t)return t;let s=f.find(r=>r[0]===e),i=l(`[data-pane="${e}"]`,this.el);try{let r=await s[3]();return t=this.panels.get(e)||new r.default(this,i),this.panels.set(e,t),t}catch(r){return console.error(r),i.innerHTML=`<p class="bl-err">${p(r.message)}</p>`,null}}normalize(e){let t=String(e||"").trim();return t?/^(https?|file|about|data):/i.test(t)?t:/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(t)||/^[\w-]+\.(vitrine|nexora)(:\d+)?(\/|$)/i.test(t)?`http://${t}`:/^[^\s]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(t)?`https://${t}`:`https://www.google.com/search?q=${encodeURIComponent(t)}`:null}navigate(e){let t=this.normalize(e);if(t){if(this.st.url=t,this.save(),this.$.url.value=t,!this.wv){this.createWebview(t);return}try{this.wv.loadURL(t).catch(()=>{})}catch{this.wv.src=t}}}createWebview(e){this.$.canvas.innerHTML="";let t=document.createElement("webview");t.className="bl-wv",t.setAttribute("partition",/* NEXORA #016 : session du projet ouvert */globalThis.nxPartition?globalThis.nxPartition():"persist:vitrine"),t.setAttribute("allowpopups",""),t.src=e,this.wv=t,this.$.canvas.append(t),t.addEventListener("dom-ready",()=>this.onDomReady()),t.addEventListener("did-start-loading",()=>{this.loading=!0,this.$.load.classList.add("on"),this.emit("loading",!0)}),t.addEventListener("did-stop-loading",()=>{this.loading=!1,this.$.load.classList.remove("on"),this.emit("loading",!1)}),t.addEventListener("did-navigate",s=>this.onNavigated(s.url,!1)),t.addEventListener("did-navigate-in-page",s=>{s.isMainFrame&&this.onNavigated(s.url,!0)}),t.addEventListener("page-title-updated",s=>{this.title=s.title,this.emit("title",s.title)}),t.addEventListener("did-fail-load",s=>{s.isMainFrame&&s.errorCode!==-3&&w(`Page inaccessible : ${s.errorDescription}`,{kind:"bad"})}),t.addEventListener("console-message",s=>{let i=s.message||"";if(i.startsWith("__VT__")){try{this.emit("picker",JSON.parse(i.slice(6)))}catch{}return}this.emit("console",{level:s.level,message:i,line:s.line,source:s.sourceId,time:Date.now()})}),t.addEventListener("new-window",s=>this.navigate(s.url)),this.layout()}async onDomReady(){let e=this.wv.getWebContentsId(),t=e!==this.wcId;this.wcId=e;try{this.wv.send("vitrine-config",{dragScroll:!1,touch:!1,pointer:!1,syncClicks:!1,syncNav:!1})}catch{}t&&(await this.applyViewport(),this.st.throttle!=="none"&&a.invoke("lab:net-throttle",{wcId:e,preset:this.st.throttle}).catch(()=>{}),this.emit("attach",e)),this.st.pick&&this.injectPicker(),this.emit("ready",e)}onNavigated(e,t){this.url=e,document.activeElement!==this.$.url&&(this.$.url.value=e),this.st.url=e,this.save();try{this.$.url.parentElement.querySelector(".bl-addr-ico").innerHTML=o(e.startsWith("https:")?"lock":"globe",14)}catch{}this.emit("navigate",e,t)}async applyViewport(){if(this.layout(),!this.wcId)return;let e=d[this.st.viewport]||d.fill;if(!e.w){await a.invoke("lab:emu-clear",{wcId:this.wcId}).catch(()=>{});return}let t=e.mobile?u({os:e.os||"android"}):u({os:"windows"});await a.invoke("device:emulate",{wcId:this.wcId,emu:{width:e.w,height:e.h,screenWidth:e.w,screenHeight:e.h,dpr:e.dpr||1,mobile:!!e.mobile,touch:!!e.mobile,ua:t.ua,uaMeta:t.uaMeta,scale:1},env:c.env}).catch(()=>{});try{this.wv.send("vitrine-config",{dragScroll:!!e.mobile,touch:!!e.mobile,pointer:!1,syncClicks:!1,syncNav:!1})}catch{}}layout(){let e=this.wv;if(!e)return;let t=d[this.st.viewport]||d.fill,s=this.$.view.getBoundingClientRect();if(!t.w){e.style.width="100%",e.style.height="100%",e.style.transform="",this.$.canvas.classList.add("fill"),this.$.size.textContent=`${Math.round(s.width)} \xD7 ${Math.round(s.height)}`,this.scale=1;return}this.$.canvas.classList.remove("fill");let i=Math.min(1,(s.width-32)/t.w,(s.height-40)/t.h);this.scale=i,e.style.width=`${t.w}px`,e.style.height=`${t.h}px`,e.style.transform=`scale(${i})`,this.$.canvas.style.width=`${t.w*i}px`,this.$.canvas.style.height=`${t.h*i}px`,this.$.size.textContent=`${t.w} \xD7 ${t.h}${i<1?` \xB7 ${Math.round(i*100)} %`:""}`}async injectPicker(){if(this.wv)try{await this.wv.executeJavaScript(`${y}(${JSON.stringify({mode:this.st.pickMode})})`)}catch{}}async togglePick(e){let t=this.st.pick&&this.st.pickMode===e;this.st.pick=!t,this.st.pickMode=e,this.save();for(let s of h(".bl-pick button",this.el))s.classList.toggle("on",this.st.pick&&s.dataset.act===`pick-${this.st.pickMode}`);if(this.wv)if(this.st.pick)await this.injectPicker(),this.st.tab!=="elements"&&this.openTab("elements");else try{await this.wv.executeJavaScript("window.__vtPick && window.__vtPick.off()")}catch{}}pickCall(e){return this.wv?this.wv.executeJavaScript(`window.__vtPick ? window.__vtPick.${e} : null`).catch(()=>null):Promise.resolve(null)}openDevtools(e){if(!this.wv||!this.wcId){e.innerHTML=`<div class="bl-note">${o("wrench",22)}<p>Ouvrez d\u2019abord une page : les outils de d\xE9veloppement de Chrome s\u2019afficheront ici, accol\xE9s \xE0 la page.</p></div>`,this.on("ready",()=>{this.st.tab==="devtools"&&!this.dtOpen&&this.openDevtools(e)});return}if(this.dtOpen&&this.dtTarget===this.wcId)return;e.innerHTML='<webview class="bl-dt" src="about:blank"></webview>';let t=l("webview",e);t.addEventListener("dom-ready",async()=>{if(!(this.dtTarget===this.wcId&&this.dtOpen))try{await a.invoke("lab:devtools-open",{targetId:this.wcId,hostId:t.getWebContentsId()}),this.dtOpen=!0,this.dtTarget=this.wcId}catch(s){e.innerHTML=`<p class="bl-err">${p(s.message)}</p>`}},{once:!0})}pause(){this.st.pick&&this.pickCall("off()")}resume(){this.st.pick&&this.injectPicker(),this.layout()}};async function P(b){return n.browserLab?n.browserLab.resume():n.browserLab=new m(b),n.browserLab}export{m as BrowserLab,k as THROTTLES,d as VIEWPORTS,P as openBrowserLab};
