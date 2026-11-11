import{a as g,h as y}from"./chunk-6ZWS5EFO.js";import{b as f}from"./chunk-S4I2LXHS.js";import{a as b}from"./chunk-V3CX37JL.js";import{a as j,c}from"./chunk-VBMWAH3C.js";import"./chunk-6DHFEWGX.js";var k=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]),P=new Set(["a","abbr","b","bdi","bdo","br","cite","code","data","dfn","em","i","kbd","mark","q","s","samp","small","span","strong","sub","sup","time","u","var","wbr","label"]),I=new Set(["script","style","pre","textarea"]),x=n=>n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/ /g,"&nbsp;"),F=n=>n.replace(/&/g,"&amp;").replace(/"/g,"&quot;");function T(n){let t=document.createElement("template");return t.innerHTML=n,t.content}function N(n,{dropScripts:t=!0}={}){let s=T(n),e=[],o=i=>[...i.attributes].map(d=>d.value===""&&!/^(alt|value|content)$/.test(d.name)?` ${d.name}`:` ${d.name}="${F(d.value)}"`).join(""),r=i=>[...i.childNodes].every(d=>d.nodeType===3||d.nodeType===1&&P.has(d.localName)&&r(d)),h=i=>{if(i.nodeType===3)return x(i.textContent.replace(/\s+/g," "));if(i.nodeType!==1)return"";let d=i.localName;return k.has(d)?`<${d}${o(i)}>`:`<${d}${o(i)}>${[...i.childNodes].map(h).join("")}</${d}>`},p=(i,d)=>{let l="  ".repeat(d);if(i.nodeType===3){let m=i.textContent.replace(/\s+/g," ").trim();m&&e.push(l+x(m));return}if(i.nodeType===8||i.nodeType!==1)return;let a=i.localName;if(!(t&&a==="script")){if(k.has(a)){e.push(`${l}<${a}${o(i)}>`);return}if(I.has(a)){e.push(`${l}<${a}${o(i)}>${a==="pre"||a==="textarea"?i.innerHTML:i.textContent.trim()}</${a}>`);return}if(a==="svg"||a==="math"){e.push(l+i.outerHTML.replace(/>\s+</g,"><"));return}if(!i.childNodes.length){e.push(`${l}<${a}${o(i)}></${a}>`);return}if(r(i)){let m=`${l}<${a}${o(i)}>${[...i.childNodes].map(h).join("").trim()}</${a}>`;if(m.length<160){e.push(m);return}}e.push(`${l}<${a}${o(i)}>`);for(let m of i.childNodes)p(m,d+1);e.push(`${l}</${a}>`)}};for(let i of s.childNodes)p(i,0);return e.join(`
`)}function O(n){let t=`${n.sel}${n.pseudo&&!n.sel.includes("::"),""} {
${n.decls.map(e=>`  ${e}`).join(`
`)}
}`,s=e=>e.split(`
`).map(o=>`  ${o}`).join(`
`);for(let e of n.layers||[])t=`@layer ${e} {
${s(t)}
}`;for(let e of n.container||[])t=`@container ${e} {
${s(t)}
}`;for(let e of n.supports||[])t=`@supports ${e} {
${s(t)}
}`;for(let e of n.media||[])t=`@media ${e} {
${s(t)}
}`;return t}function w(n,{inherited:t=!0,rootClass:s="vt-root"}={}){let e=[];return n.vars.length&&e.push(`/* Variables utilis\xE9es */
:root {
${n.vars.map(([o,r])=>`  ${o}: ${String(r).trim()};`).join(`
`)}
}`),n.fontFaces.length&&e.push(`/* Polices */
${n.fontFaces.join(`

`)}`),t&&Object.keys(n.inherited||{}).length&&e.push(`/* Styles h\xE9rit\xE9s de la page (\xE0 appliquer au conteneur) */
.${s} {
${Object.entries(n.inherited).map(([o,r])=>`  ${o}: ${r};`).join(`
`)}
}`),n.rules.length&&e.push(n.rules.map(O).join(`

`)),n.keyframes.length&&e.push(`/* Animations */
${n.keyframes.join(`

`)}`),e.join(`

`)}function A(n,t,s,e){return`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${x(e||"Composant")}</title>
  <style>
${s.split(`
`).map(o=>`    ${o}`).join(`
`)}
  </style>
</head>
<body>
  <div class="vt-root">
${t.split(`
`).map(o=>`    ${o}`).join(`
`)}
  </div>
</body>
</html>
`}var q={class:"className",for:"htmlFor",tabindex:"tabIndex",readonly:"readOnly",maxlength:"maxLength",minlength:"minLength",colspan:"colSpan",rowspan:"rowSpan",srcset:"srcSet",crossorigin:"crossOrigin",autocomplete:"autoComplete",autofocus:"autoFocus",enctype:"encType",frameborder:"frameBorder",contenteditable:"contentEditable",spellcheck:"spellCheck",playsinline:"playsInline",novalidate:"noValidate",datetime:"dateTime",allowfullscreen:"allowFullScreen",inputmode:"inputMode",referrerpolicy:"referrerPolicy",usemap:"useMap","accept-charset":"acceptCharset","http-equiv":"httpEquiv","xlink:href":"xlinkHref","xml:space":"xmlSpace",fetchpriority:"fetchPriority",imagesrcset:"imageSrcSet",imagesizes:"imageSizes",formaction:"formAction",cellpadding:"cellPadding",cellspacing:"cellSpacing",hreflang:"hrefLang",marginheight:"marginHeight",marginwidth:"marginWidth"},L=n=>n.replace(/-([a-z])/g,(t,s)=>s.toUpperCase());function R(n){let t=[];for(let s of n.split(";")){let e=s.indexOf(":");if(e<0)continue;let o=s.slice(0,e).trim(),r=s.slice(e+1).trim();if(!o)continue;let h=o.startsWith("--")?`'${o}'`:L(o.replace(/^-ms-/,"ms-"));t.push(`${h}: ${JSON.stringify(r).replace(/^"|"$/g,"'").replace(/\\"/g,'"')}`)}return`{{ ${t.join(", ")} }}`}function C(n){return String(n||"Composant").replace(/[#.]/g," ").replace(/[^a-zA-Z0-9 ]+/g," ").trim().split(/\s+/).map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join("").replace(/^[0-9]+/,"")||"Composant"}function H(n,t){let s=T(n),e=[],o=l=>l.replace(/[{}]/g,a=>`{'${a}'}`).replace(/</g,"&lt;").replace(/>/g,"&gt;"),r=l=>[...l.attributes].filter(a=>!/^on/i.test(a.name)).map(a=>{let m=q[a.name]||(a.name.startsWith("data-")||a.name.startsWith("aria-")?a.name:a.name.includes("-")||a.name.includes(":")?L(a.name.replace(":","-")):a.name);return a.name==="style"?` style=${R(a.value)}`:a.value===""&&!/^(alt|value|content|href|src)$/.test(a.name)?` ${m}`:` ${m}="${a.value.replace(/"/g,"&quot;")}"`}).join(""),h=(l,a)=>{let m="  ".repeat(a);if(l.nodeType===3){let u=l.textContent.replace(/\s+/g," ").trim();u&&e.push(m+o(u));return}if(l.nodeType!==1)return;let $=l.localName==="svg"?"svg":l.tagName.includes("-")||/[A-Z]/.test(l.tagName)&&l.namespaceURI!=="http://www.w3.org/1999/xhtml"?l.tagName:l.localName;if($==="script"||$==="style")return;if(k.has($)||!l.childNodes.length||![...l.childNodes].some(u=>u.nodeType===1||u.nodeType===3&&u.textContent.trim())){e.push(`${m}<${$}${r(l)} />`);return}let v=[...l.childNodes].filter(u=>u.nodeType===1||u.nodeType===3&&u.textContent.trim());if(v.length===1&&v[0].nodeType===3){let u=`${m}<${$}${r(l)}>${o(v[0].textContent.replace(/\s+/g," ").trim())}</${$}>`;if(u.length<150){e.push(u);return}}e.push(`${m}<${$}${r(l)}>`);for(let u of l.childNodes)h(u,a+1);e.push(`${m}</${$}>`)},i=[...s.childNodes].filter(l=>l.nodeType===1).length>1;i&&e.push("      <>");for(let l of s.childNodes)h(l,i?4:3);i&&e.push("      </>");let d=C(t);return`import './${d}.css';

export default function ${d}() {
  return (
${e.join(`
`)}
  );
}
`}var M={html:"HTML",css:"CSS",jsx:"React (JSX)",file:"Fichier autonome"};function B(n,t){let s=window.hljs;if(!s||n.length>4e5)return c(n);try{return s.highlight(n,{language:t==="jsx"?"javascript":t==="file"||t==="html"?"xml":t}).value}catch{return c(n)}}var S=class{constructor(t,s){this.lab=t,this.el=s,this.info=null,this.code=null,this.format="html",this.sub="code",this.inherited=!0,this.render(),t.on("picker",e=>this.onPicker(e)),t.on("navigate",(e,o)=>{o||(this.info=null,this.code=null,this.sections=null,this.render())}),t.on("ready",()=>{this.active&&!this.info&&this.loadSections()}),s.addEventListener("click",e=>this.onClick(e))}activate(){this.active=!0,this.info||this.loadSections()}deactivate(){this.active=!1}async loadSections(){this.lab.wv&&(await this.lab.pickCall("sections()")||await this.lab.injectPicker().then(()=>this.lab.st.pick?null:this.lab.pickCall("off()")),this.sections=await this.lab.pickCall("sections()")||[],this.info||this.render())}onPicker(t){t.type==="select"?(this.info=t.info,this.code=null,this.render(),this.loadCode()):t.type==="deselect"?(this.info=null,this.render()):t.type==="escape"&&this.lab.togglePick(this.lab.st.pickMode)}async loadCode(){let t=this.token=(this.token||0)+1;try{let s=await b.invoke("lab:el-code",{wcId:this.lab.wcId,maxNodes:800});if(t!==this.token)return;this.code=s,this.html=N(s.html),this.css=w(s,{inherited:this.inherited})}catch(s){this.code={error:s.message}}this.renderBody()}name(){let t=this.info;return t?t.component?t.component.name:C(t.classes[0]||t.id||t.tag):"Composant"}text(){if(!this.code||this.code.error)return"";switch(this.format){case"css":return this.css;case"jsx":return H(this.html,this.name());case"file":return A(this.code,this.html,this.css,this.name());default:return this.html}}render(){let t=this.info;if(!t){let s=this.sections||[];this.el.innerHTML=`
        <div class="bl-empty-panel">
          <p class="bl-hint">${f("target",15)} Active <b>Composant</b> ou <b>Section</b> dans la barre, puis clique dans la page. <kbd>\u2191</kbd> parent, <kbd>\u2193</kbd> enfant, <kbd>\u2190</kbd> <kbd>\u2192</kbd> voisins, <kbd>\xC9chap</kbd> pour d\xE9s\xE9lectionner.</p>
          ${s.length?`<div class="bl-sub-title">Sections de la page</div><div class="bl-sections">${s.map(e=>`<button data-sec="${c(e.selector)}" style="--d:${e.depth}"><span>${c(e.title||e.label)}</span><small>${c(e.label)} \xB7 ${e.height} px</small></button>`).join("")}</div>`:""}
        </div>`;return}this.el.innerHTML=`
      <div class="el-head">
        <div class="el-path">${t.path.map((s,e)=>`<button data-path="${e}" class="${e===t.path.length-1?"on":""} ${s.section?"sec":""}">${c(s.label)}</button>`).join("<span>\u203A</span>")}</div>
        <div class="el-title">
          <div><b>${c(t.label)}</b>${t.component?`<span class="pill">${c(t.component.lib)} \xB7 ${c(t.component.name)}</span>`:""}${t.section?'<span class="pill">section</span>':""}</div>
          <div class="el-nav">
            <button class="icon-btn small" data-nav="ArrowUp" title="Parent (\u2191)">${f("chevronDown",13,"up")}</button>
            <button class="icon-btn small" data-nav="ArrowDown" title="Premier enfant (\u2193)">${f("chevronDown",13)}</button>
            <button class="icon-btn small" data-nav="ArrowLeft" title="Pr\xE9c\xE9dent (\u2190)">${f("chevronLeft",13)}</button>
            <button class="icon-btn small" data-nav="ArrowRight" title="Suivant (\u2192)">${f("chevronRight",13)}</button>
          </div>
        </div>
        <div class="el-meta"><span>${t.rect.width} \xD7 ${t.rect.height}</span><span>x ${t.rect.x} \xB7 y ${t.rect.y}</span><span>${t.descendants} \xE9l\xE9ment${t.descendants>1?"s":""}</span>${t.media?`<span>${t.media} m\xE9dia${t.media>1?"s":""}</span>`:""}</div>
        <code class="el-sel" title="S\xE9lecteur CSS">${c(t.selector)}</code>
      </div>
      <div class="el-subtabs">${y("elSub",this.sub,{code:"Code",styles:"Styles",assets:`Ressources${t.assets.length?` (${t.assets.length})`:""}`})}</div>
      <div class="el-body"></div>`,this.renderBody()}renderBody(){let t=j(".el-body",this.el);if(!t||!this.info)return;if(this.sub==="styles"){t.innerHTML=this.stylesHtml();return}if(this.sub==="assets"){t.innerHTML=this.assetsHtml();return}if(!this.code){t.innerHTML='<div class="bl-loading"><span class="spinner small"></span> Lecture du code et des styles\u2026</div>';return}if(this.code.error){t.innerHTML=`<p class="bl-err">${c(this.code.error)}</p>`;return}let s=this.text(),e=this.format;t.innerHTML=`
      <div class="el-fmt">${y("elFmt",this.format,M)}</div>
      <div class="el-actions">
        <button class="btn small" data-act="copy">${f("copy",13)}<span>Copier</span></button>
        <button class="btn small" data-act="save">${f("download",13)}<span>Enregistrer</span></button>
        <button class="btn small" data-act="shot">${f("camera",13)}<span>Image PNG</span></button>
        ${this.format==="css"||this.format==="file"?`<label class="el-check"><input type="checkbox" data-inh ${this.inherited?"checked":""}> Styles h\xE9rit\xE9s</label>`:""}
      </div>
      <p class="bl-hint">${this.code.rules.length} r\xE8gle${this.code.rules.length>1?"s":""} CSS \xB7 ${this.code.vars.length} variable${this.code.vars.length>1?"s":""} \xB7 ${this.code.fontFaces.length} police${this.code.fontFaces.length>1?"s":""} \xB7 ${this.code.keyframes.length} animation${this.code.keyframes.length>1?"s":""}${this.code.truncated?" \xB7 composant tr\xE8s grand : styles des 800 premiers \xE9l\xE9ments":""}</p>
      <pre class="el-code hljs"><code>${B(s,e)}</code></pre>`}stylesHtml(){let t=this.info.styles,s=h=>/^(rgb|#|hsl)/.test(h)?`<i class="sw" style="background:${c(h)}"></i>`:"",e=(t.margin||"0").split(" "),o=(t.padding||"0").split(" "),r=(h,p)=>h[p]??h[p%2]??h[0];return`
      <div class="el-box">
        <div class="bx-m"><span class="t">${c(r(e,0))}</span><span class="r">${c(r(e,1))}</span><span class="b">${c(r(e,2))}</span><span class="l">${c(r(e,3))}</span><em>marge</em>
          <div class="bx-p"><span class="t">${c(r(o,0))}</span><span class="r">${c(r(o,1))}</span><span class="b">${c(r(o,2))}</span><span class="l">${c(r(o,3))}</span><em>int\xE9rieur</em>
            <div class="bx-c">${this.info.rect.width} \xD7 ${this.info.rect.height}</div></div></div>
      </div>
      <table class="el-styles">${Object.entries(t).map(([h,p])=>`<tr><th>${c(h)}</th><td>${s(p)}<span>${c(p)}</span></td></tr>`).join("")}</table>`}assetsHtml(){let t=this.info.assets;return t.length?`<div class="el-assets">${t.map(s=>`<div class="el-asset">${/\.(mp4|webm|mov)(\?|$)/i.test(s)?f("video",22):`<img src="${c(s)}" alt="" loading="lazy">`}<span title="${c(s)}">${c(s.split("/").pop().split("?")[0]||s)}</span><button class="icon-btn small" data-copy="${c(s)}" title="Copier l\u2019adresse">${f("copy",12)}</button></div>`).join("")}</div>`:'<p class="bl-hint">Aucune image ni vid\xE9o dans cet \xE9l\xE9ment.</p>'}async onClick(t){let s=t.target.closest("[data-sec]");if(s){this.lab.st.pick||await this.lab.togglePick("section"),await this.lab.pickCall(`select(${JSON.stringify(s.dataset.sec)})`);return}let e=t.target.closest("[data-path]");if(e){this.lab.pickCall(`selectPath(${Number(e.dataset.path)})`);return}let o=t.target.closest("[data-nav]");if(o){this.lab.pickCall(`nav(${JSON.stringify(o.dataset.nav)})`);return}let r=t.target.closest("[data-set]");if(r){r.dataset.set==="elSub"&&(this.sub=r.dataset.val,this.render()),r.dataset.set==="elFmt"&&(this.format=r.dataset.val,this.renderBody());return}if(t.target.matches("[data-inh]")){this.inherited=t.target.checked,this.code&&!this.code.error&&(this.css=w(this.code,{inherited:this.inherited})),this.renderBody();return}let h=t.target.closest("[data-act]");if(h)try{if(h.dataset.act==="copy")await b.invoke("clipboard:write",this.text()),g("Code copi\xE9.");else if(h.dataset.act==="save"){let p={html:"html",css:"css",jsx:"jsx",file:"html"}[this.format],i=await b.invoke("lab:save-text",{name:`${this.name()}.${p}`,text:this.text(),filters:[{name:M[this.format],extensions:[p]}]});i&&g("Fichier enregistr\xE9.",{action:"Afficher",onAction:()=>b.invoke("lab:reveal",i)})}else if(h.dataset.act==="shot"){let p=await b.invoke("lab:el-shot",{wcId:this.lab.wcId,scale:2}),i=await b.invoke("capture:save",{kind:"photo",project:"Browser Lab",name:this.name(),ext:"png",data:p.data});i&&g(`Image ${p.width} \xD7 ${p.height} enregistr\xE9e.`,{action:"Afficher",onAction:()=>b.invoke("shell:reveal",i)})}}catch(p){g(p.message,{kind:"bad"})}}};export{S as default};
