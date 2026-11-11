import{a as p,d as l,e as b,f as h,i as v}from"./chunk-EWSFHS6Y.js";import{a as r}from"./chunk-XJMNRA7U.js";import{a as f}from"./chunk-6ZWS5EFO.js";import{b as i}from"./chunk-S4I2LXHS.js";import{a as c}from"./chunk-GKSXEY5K.js";import{a as u}from"./chunk-V3CX37JL.js";import{a as s,c as d,o as m}from"./chunk-VBMWAH3C.js";function w(n){let e=(Date.now()-n)/1e3;return e<3600?`il y a ${Math.max(1,Math.round(e/60))} min`:e<86400?`il y a ${Math.round(e/3600)} h`:`il y a ${Math.round(e/86400)} j`}function g(){let n=s("#welcome"),e=!!r.source,a=r.board.welcome;if(r.board.welcome=!e,n.hidden=e,document.body.classList.toggle("welcome-mode",!e),a!==r.board.welcome&&(v(),r.board.relayout()),e)return;let t=(c.recent||[]).slice(0,5);n.innerHTML=`
    <div class="hero">
      <h1>Colle un lien,<br>obtiens la maquette.</h1>
      <p class="lead">Affiche un site ou un projet dans le cadre d'un vrai iPhone, Samsung, pliable, ordinateur ou t\xE9l\xE9viseur. Compare plusieurs appareils c\xF4te \xE0 c\xF4te, exporte des photos et des vid\xE9os HD, anime-les en 3D ou transforme le site en application Android.</p>
      <form class="hero-link" data-w="link">
        <span class="hl-ico">${i("link",18)}</span>
        <input id="heroLink" placeholder="https://monsite.com" spellcheck="false" aria-label="Lien du site">
        <button type="button" class="btn" data-w="paste">${i("paste",15)}<span>Coller</span></button>
        <button type="submit" class="btn primary">Afficher</button>
      </form>
      <div class="hero-or">
        <button class="btn" data-w="pick">${i("folder",16)}<span>Ouvrir un dossier de projet</span></button>
        <p class="muted">React, Next.js, Vue, Angular, Svelte, Expo, Flutter, Laravel, Django, Rails, Hugo, .NET\u2026 Le framework est d\xE9tect\xE9 et les d\xE9pendances sont install\xE9es automatiquement.</p>
      </div>
      ${t.length?`<div class="recent"><div class="recent-title">R\xE9cents</div>${t.map((o,k)=>`<button class="recent-row" data-recent="${k}">${i(o.dir?"folder":"globe",16)}<span class="rr-name">${d(o.name)}</span><span class="rr-sub">${d(o.label||(o.url||"").replace(/^https?:\/\//,""))}</span><span class="rr-time">${w(o.at)}</span></button>`).join("")}</div>`:""}
    </div>`}function A(){let n=s("#welcome");n.addEventListener("click",async e=>{let a=e.target.closest("[data-w],[data-recent]");if(a){if(a.dataset.recent!=null){let t=c.recent[Number(a.dataset.recent)];t&&t.dir?b(t.dir):t&&l(t.url);return}if(a.dataset.w==="pick"&&h(),a.dataset.w==="paste"){let t=(await u.invoke("clipboard:read")).trim();s("#heroLink").value=t,p(t)?l(t):f("Le presse-papiers ne contient pas de lien.",{kind:"bad"})}}}),n.addEventListener("submit",e=>{e.preventDefault(),l(s("#heroLink").value)}),n.addEventListener("paste",e=>{if(e.target.id!=="heroLink")return;let a=e.clipboardData.getData("text");p(a)&&(e.preventDefault(),e.target.value=a.trim(),l(a))}),m.on("source",g)}export{g as a,A as b};
