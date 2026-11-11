import{a as l,e as u,f as h}from"./chunk-6ZWS5EFO.js";import{b as r}from"./chunk-S4I2LXHS.js";import{a as n}from"./chunk-V3CX37JL.js";import{a as p,c as i,j as o}from"./chunk-VBMWAH3C.js";import"./chunk-6DHFEWGX.js";var c=class{constructor(e,s){this.lab=e,this.el=s,e.st.scrape={maxPages:200,maxDepth:6,rendered:!0,external:!0,sitemap:!0,robots:!0,scroll:!0,sourceMaps:!0,subdomains:!1,delay:150,include:"",exclude:"",...e.st.scrape||{}},this.o=e.st.scrape,this.job=null,this.report=null,this.log=[],this.render(),s.addEventListener("click",a=>this.onClick(a)),s.addEventListener("change",a=>this.onChange(a)),n.on("lab:scrape",a=>this.onEvent(a))}activate(){}opt(e,s,a){return`<label class="tog-row"><span class="tog-text"><span>${s}</span>${a?`<small>${a}</small>`:""}</span><input type="checkbox" data-o="${e}" ${this.o[e]?"checked":""}><span class="tog"></span></label>`}render(){let e=!!(this.job&&!this.report);this.el.innerHTML=`
      <div class="sc">
        <div class="sc-head">
          <div><b>Aspirer tout le site</b><p class="bl-hint">Toutes les pages du site, affich\xE9es comme dans un navigateur (le JavaScript s\u2019ex\xE9cute), avec leurs styles, scripts, images, polices et vid\xE9os. Les liens sont r\xE9\xE9crits : la copie s\u2019ouvre et fonctionne hors ligne.</p></div>
        </div>
        <div class="sc-start">
          <code class="sc-url">${i(this.lab.url||"Aucune page ouverte")}</code>
          ${e?`<button class="btn small" data-act="cancel">${r("stop",12)}<span>Arr\xEAter</span></button>`:`<button class="btn primary small" data-act="start" ${this.lab.url?"":"disabled"}>${r("download",13)}<span>Aspirer le site</span></button>`}
        </div>
        ${e||this.report?this.progressHtml():""}
        <details class="sc-opts" ${e||this.report?"":"open"}><summary>Options</summary>
          <div class="ab-grid2"><label class="field"><span>Pages au maximum</span><input class="input" type="number" min="1" max="5000" data-n="maxPages" value="${this.o.maxPages}"></label><label class="field"><span>Profondeur des liens</span><input class="input" type="number" min="0" max="30" data-n="maxDepth" value="${this.o.maxDepth}"></label></div>
          ${this.opt("rendered","Pages apr\xE8s ex\xE9cution du JavaScript","Indispensable pour React, Vue, Angular\u2026 Le code d\u2019origine envoy\xE9 par le serveur est aussi gard\xE9 dans _code-serveur/.")}
          ${this.opt("sourceMaps","Reconstituer le code source d\u2019origine","Si le site publie ses source maps : fichiers React/Vue/TypeScript d\u2019origine dans _sources/.")}
          ${this.opt("external","Ressources d\u2019autres domaines (CDN, polices)","Rang\xE9es dans _externe/ pour que la copie soit compl\xE8te.")}
          ${this.opt("sitemap","Utiliser le plan du site (sitemap.xml)","Trouve aussi les pages qui ne sont reli\xE9es par aucun lien.")}
          ${this.opt("scroll","Faire d\xE9filer chaque page","Charge les images et contenus qui n\u2019apparaissent qu\u2019au d\xE9filement.")}
          ${this.opt("robots","Respecter robots.txt","Recommand\xE9 pour les sites qui ne t\u2019appartiennent pas.")}
          ${this.opt("subdomains","Inclure les sous-domaines","")}
          <div class="ab-grid2"><label class="field"><span>Seulement les adresses contenant</span><input class="input mono" data-s="include" value="${i(this.o.include)}" placeholder="/blog/*, /produits/*"></label><label class="field"><span>Exclure</span><input class="input mono" data-s="exclude" value="${i(this.o.exclude)}" placeholder="/panier, *?page=*"></label></div>
          <label class="field"><span>Pause entre deux pages (ms)</span><input class="input" type="number" min="0" max="10000" step="50" data-n="delay" value="${this.o.delay}"></label>
          <p class="bl-hint">${r("info",12)} Respecte les droits d\u2019auteur et les conditions d\u2019utilisation des sites : aspire tes propres sites, ou ceux que tu as l\u2019autorisation de copier.</p>
        </details>
      </div>`}progressHtml(){let e=this.progress||{},s=this.report;return s?`<div class="sc-done">
        <div class="sc-res-head">${r(s.cancelled?"warn":"pass",18)}<b>${s.cancelled?"Aspiration arr\xEAt\xE9e":"Site aspir\xE9"}</b></div>
        <div class="ts-sum">
          <div><b>${s.pages.length}</b><span>pages</span></div>
          <div><b>${s.files}</b><span>fichiers</span></div>
          <div><b>${o(s.bytes)}</b><span>au total</span></div>
          <div><b>${s.sources}</b><span>sources d\u2019origine</span></div>
        </div>
        <div class="sc-types">${Object.entries(s.byType).map(([t,d])=>`<span><b>${d.count}</b> ${i(t)} \xB7 ${o(d.bytes)}</span>`).join("")}</div>
        ${this.saved?`<p class="ok">${r("pass",13)} Enregistr\xE9 dans ${i(this.saved.dir||this.saved.file)}</p>`:""}
        <div class="sc-actions">
          <button class="btn primary small" data-act="save">${r("folder",13)}<span>Enregistrer le code source</span></button>
          <button class="btn small" data-act="save-choose">${r("folderOpen",13)}<span>Choisir le dossier\u2026</span></button>
          <button class="btn small" data-act="zip">${r("download",13)}<span>ZIP</span></button>
          ${this.saved&&this.saved.dir?`<button class="btn small" data-act="open-dev">${r("code",13)}<span>Ouvrir dans le Dev Lab</span></button><button class="btn small" data-act="reveal">${r("folderOpen",13)}<span>Afficher</span></button>`:""}
        </div>
        <details class="sc-pages"><summary>Pages (${s.pages.length})${s.errors.length?` \xB7 ${s.errors.length} erreur(s)`:""}</summary>${s.pages.map(t=>`<div class="sc-pg"><span class="${t.status>=400?"bad":""}">${t.status||"\u2014"}</span><span title="${i(t.url)}">${i((()=>{try{return new URL(t.url).pathname}catch{return t.url}})())}</span><small>${i(t.title||"")}</small></div>`).join("")}${s.errors.map(t=>`<div class="sc-pg"><span class="bad">!</span><span>${i(t.url)}</span><small>${i(t.error)}</small></div>`).join("")}</details>
      </div>`:`<div class="sc-prog"><div class="ab-bar"><i style="width:${e.total?Math.min(100,e.done/e.total*100):4}%"></i></div>
      <span>${i(e.message||(e.url?`Page ${e.done+1} / ${e.total} \xB7 ${e.url}`:"D\xE9marrage\u2026"))}</span>
      <small>${e.files||0} fichiers \xB7 ${o(e.bytes||0)}</small></div>`}onEvent(e){if(!this.job||e.id!==this.job.id)return;if(e.phase==="done"){this.report=e.report,this.render(),this.ask();return}if(e.phase==="error"){l(`Aspiration impossible : ${e.error}`,{kind:"bad"}),this.job=null,this.render();return}this.progress={...this.progress||{},...e};let s=p(".sc-prog",this.el);s?s.outerHTML=this.progressHtml():this.render()}ask(){let e=this.report,s=u("scrape-save",`
      <div class="sheet-head"><span class="sheet-icon">${r("download",22)}</span><div><h2>Enregistrer le code source du site ?</h2><p>${e.pages.length} pages, ${e.files} fichiers, ${o(e.bytes)}${e.sources?`, dont ${e.sources} fichiers source d\u2019origine`:""}.</p></div></div>
      <div class="sheet-body"><p class="bl-hint">Par d\xE9faut : Documents \u203A NEXORA \u203A Sites \u203A ${i(e.host)}. Le dossier contient la copie navigable (index.html), le code d\u2019origine du serveur (_code-serveur), les sources reconstitu\xE9es (_sources) et un rapport (vitrine-aspiration.json).</p></div>
      <div class="sheet-foot">
        <button class="btn" data-sh="later">Plus tard</button>
        <button class="btn" data-sh="zip">ZIP\u2026</button>
        <button class="btn" data-sh="choose">Choisir\u2026</button>
        <button class="btn primary" data-sh="save" data-autofocus>Enregistrer</button>
      </div>`);s.onclick=async a=>{let t=a.target.closest("[data-sh]");t&&(h("scrape-save"),t.dataset.sh==="save"&&await this.save("default"),t.dataset.sh==="choose"&&await this.save("choose"),t.dataset.sh==="zip"&&await this.save("zip"))}}async save(e){try{let s=await n.invoke("lab:scrape-save",{id:this.job.id,mode:e});if(!s)return;this.saved=s,this.render(),l(s.file?"Archive ZIP enregistr\xE9e.":"Code source du site enregistr\xE9.",{action:s.index?"Ouvrir la copie":"Afficher",onAction:()=>s.index?n.invoke("lab:open-path",s.index):n.invoke("lab:reveal",s.file)})}catch(s){l(s.message,{kind:"bad"})}}async onClick(e){let s=e.target.closest("[data-act]");if(s)switch(s.dataset.act){case"start":{this.report=null,this.saved=null,this.progress={};try{let a=await n.invoke("lab:scrape-start",{url:this.lab.url,options:{...this.o}});this.job=a}catch(a){l(a.message,{kind:"bad"})}this.render();break}case"cancel":this.job&&n.invoke("lab:scrape-cancel",{id:this.job.id});break;case"save":await this.save("default");break;case"save-choose":await this.save("choose");break;case"zip":await this.save("zip");break;case"reveal":this.saved&&n.invoke("lab:reveal",this.saved.index||this.saved.dir);break;case"open-dev":{if(!this.saved||!this.saved.dir)break;let{setMode:a}=await import("./toolbar-LJFELS7F.js");await a("dev"),window.__vitrineDevOpen&&window.__vitrineDevOpen(this.saved.dir);break}default:break}}onChange(e){let s=e.target;if(s.dataset.o)this.o[s.dataset.o]=s.checked;else if(s.dataset.n)this.o[s.dataset.n]=Number(s.value);else if(s.dataset.s)this.o[s.dataset.s]=s.value;else return;this.lab.save()}};export{c as default};
