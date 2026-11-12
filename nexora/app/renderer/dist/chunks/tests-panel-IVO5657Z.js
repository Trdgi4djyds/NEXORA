import{a as p,h as v}from"./chunk-6ZWS5EFO.js";import{b as r}from"./chunk-S4I2LXHS.js";import{a as c}from"./chunk-V3CX37JL.js";import{a as u,c as o,h as b}from"./chunk-VBMWAH3C.js";import"./chunk-6DHFEWGX.js";var g={goto:"Aller \xE0",click:"Cliquer",type:"Saisir",select:"Choisir",press:"Touche",wait:"Attendre",scroll:"D\xE9filer",assertText:"V\xE9rifier le texte",assertNoText:"V\xE9rifier l\u2019absence",assertUrl:"V\xE9rifier l\u2019adresse",assertVisible:"V\xE9rifier visible",assertTitle:"V\xE9rifier le titre",assertNoErrors:"Aucune erreur JS",screenshot:"Capture"},$={goto:["value"],click:["selector"],type:["selector","value"],select:["selector","value"],press:["value"],wait:["selector?","value?"],scroll:["selector?"],assertText:["value"],assertNoText:["value"],assertUrl:["value"],assertVisible:["selector"],assertTitle:["value"],assertNoErrors:[],screenshot:[]},d={desktop:"Ordinateur",laptop:"Portable",tablet:"Tablette",mobile:"Mobile"},f=String.raw`(() => {
  if (window.__vtRec) { window.__vtRec.on = true; return; }
  const post = (step) => { try { console.debug('__VT__' + JSON.stringify({ type: 'rec', step })); } catch (e) { /* page */ } };
  const uniqueText = (el) => {
    const t = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 40) return null;
    const same = [...document.querySelectorAll(el.tagName)].filter((x) => (x.innerText || x.value || '').trim().replace(/\s+/g, ' ') === t);
    return same.length === 1 ? 'text=' + t : null;
  };
  const sel = (el) => {
    for (const a of ['data-testid', 'data-test', 'data-cy', 'id', 'name', 'aria-label']) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && /^[\w -]+$/.test(v)) { const s = a === 'id' ? '#' + v : '[' + a + '="' + v + '"]'; try { if (document.querySelectorAll(s).length === 1) return s; } catch (e) { /* invalide */ } }
    }
    const t = /^(A|BUTTON|LABEL|SUMMARY)$/.test(el.tagName) || el.getAttribute('role') === 'button' ? uniqueText(el) : null;
    if (t) return t;
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1 && e !== document.body && parts.length < 6) {
      const p = e.parentElement;
      const cls = [...e.classList].filter((c) => /^[a-zA-Z][\w-]*$/.test(c) && !/^(css-|sc-|jsx-)/.test(c)).slice(0, 1);
      let s = e.tagName.toLowerCase() + (cls.length ? '.' + cls[0] : '');
      if (p) { const same = [...p.children].filter((c) => c.tagName === e.tagName); if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(e) + 1) + ')'; }
      parts.unshift(s);
      try { if (document.querySelectorAll(parts.join(' > ')).length === 1) return parts.join(' > '); } catch (err) { /* invalide */ }
      e = p;
    }
    return parts.join(' > ');
  };
  window.__vtRec = { on: true };
  addEventListener('click', (e) => {
    if (!window.__vtRec.on || !e.isTrusted) return;
    let el = e.target.closest('a, button, [role=button], input[type=submit], input[type=button], input[type=checkbox], input[type=radio], label, summary, select, [onclick]') || e.target;
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(submit|button|checkbox|radio)$/.test(el.type)) return;
    post({ action: 'click', selector: sel(el) });
  }, true);
  addEventListener('change', (e) => {
    if (!window.__vtRec.on || !e.isTrusted) return;
    const el = e.target;
    if (el.tagName === 'SELECT') post({ action: 'select', selector: sel(el), value: el.value });
    else if (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|submit|button|file)$/.test(el.type)) post({ action: 'type', selector: sel(el), value: el.type === 'password' ? '' : el.value, secret: el.type === 'password' });
  }, true);
  addEventListener('keydown', (e) => { if (window.__vtRec.on && e.isTrusted && e.key === 'Enter' && /^(INPUT)$/.test(e.target.tagName)) { e.target.dispatchEvent(new Event('change', { bubbles: true })); post({ action: 'press', value: 'Enter' }); } }, true);
})()`,h=class{constructor(e,t){this.lab=e,this.el=t,e.st.tests={mode:"explore",maxPages:25,viewports:["desktop","mobile"],checkLinks:!0,screenshots:!0,...e.st.tests||{}},e.st.scenarios=e.st.scenarios||[],this.t=e.st.tests,this.job=null,this.results=[],this.summary=null,this.onlyIssues=!1,this.current=e.st.scenarios[0]?e.st.scenarios[0].id:null,this.recording=!1,this.secrets=new WeakMap,this.render(),t.addEventListener("click",s=>this.onClick(s)),t.addEventListener("change",s=>this.onChange(s)),t.addEventListener("input",s=>this.onInput(s)),c.on("lab:test",s=>this.onEvent(s)),e.on("picker",s=>this.onPicker(s)),e.on("ready",()=>{this.recording&&this.injectRecorder()}),e.on("navigate",(s,a)=>{this.recording&&!a&&this.addStep({action:"goto",value:s},!0)})}activate(){}deactivate(){}get scn(){return this.lab.st.scenarios.find(e=>e.id===this.current)}render(){this.el.innerHTML=`
      <div class="ts">
        <div class="ts-mode">${v("tsMode",this.t.mode,{explore:"Exploration du site",scenario:"Sc\xE9narios"})}</div>
        <div class="ts-body"></div>
      </div>`,this.renderBody()}renderBody(){let e=u(".ts-body",this.el);this.t.mode==="explore"?e.innerHTML=this.exploreHtml():e.innerHTML=this.scenarioHtml()}exploreHtml(){let e=this.job&&this.job.kind==="explore";return`
      <div class="ts-opts">
        <label class="field"><span>Pages par taille d\u2019\xE9cran</span><input class="input" type="number" min="1" max="500" data-t="maxPages" value="${this.t.maxPages}"></label>
        <div class="field"><span>Tailles d\u2019\xE9cran</span><div class="ts-vps">${Object.entries(d).map(([t,s])=>`<label class="ab-chip"><input type="checkbox" data-vp="${t}" ${this.t.viewports.includes(t)?"checked":""}><span>${s}</span></label>`).join("")}</div></div>
        <label class="el-check"><input type="checkbox" data-t="checkLinks" ${this.t.checkLinks?"checked":""}> V\xE9rifier tous les liens (liens morts)</label>
        <label class="el-check"><input type="checkbox" data-t="screenshots" ${this.t.screenshots?"checked":""}> Miniature de chaque page</label>
      </div>
      <div class="ts-run">
        ${e?`<button class="btn small" data-act="cancel">${r("stop",12)}<span>Arr\xEAter</span></button>`:`<button class="btn primary small" data-act="explore">${r("play",12)}<span>Explorer le site</span></button>`}
        <span class="ts-progress"></span>
      </div>
      ${this.summary||this.results.length?this.resultsHtml():'<p class="bl-hint">Ouvre chaque page interne du site (\xE0 partir de la page affich\xE9e), sur les tailles d\u2019\xE9cran choisies, et rel\xE8ve : erreurs HTTP et JavaScript, requ\xEAtes en \xE9chec, images cass\xE9es, liens morts, d\xE9bordement horizontal sur mobile, titres et descriptions manquants, lenteurs.</p>'}`}resultsHtml(){let e=this.summary,t=this.onlyIssues?this.results.filter(s=>s.issues.some(a=>a.level!=="info")):this.results;return`
      ${e?`<div class="ts-sum">
        <div><b>${e.pages}</b><span>pages test\xE9es</span></div>
        <div class="${e.errors?"bad":"ok"}"><b>${e.errors}</b><span>erreurs</span></div>
        <div class="${e.warnings?"warn":"ok"}"><b>${e.warnings}</b><span>alertes</span></div>
        <div class="${e.broken.length?"bad":"ok"}"><b>${e.broken.length}</b><span>liens morts</span></div>
        <div><b>${(e.avgMs/1e3).toFixed(1).replace(".",",")} s</b><span>chargement moyen</span></div>
      </div>`:""}
      ${e&&e.broken.length?`<details class="ts-broken" open><summary>Liens morts (${e.broken.length})</summary>${e.broken.map(s=>`<div class="ts-b"><span class="bad">${s.status===-1?"injoignable":s.status}</span><span title="${o(s.url)}">${o(s.url)}</span><small>sur ${s.from.map(a=>o(new URL(a).pathname)).join(", ")}</small></div>`).join("")}</details>`:""}
      <div class="ts-filter"><label class="el-check"><input type="checkbox" data-act="only" ${this.onlyIssues?"checked":""}> Seulement les pages \xE0 probl\xE8me</label><button class="btn small" data-act="export-tests">${r("download",12)}<span>Rapport</span></button></div>
      <div class="ts-pages">${t.map((s,a)=>`
        <details class="ts-page ${s.issues.some(n=>n.level==="error")?"bad":s.issues.some(n=>n.level==="warn")?"warn":"ok"}">
          <summary>${s.thumb?`<img src="data:image/jpeg;base64,${s.thumb}" alt="">`:'<i class="ts-noimg"></i>'}<span class="ts-p-main"><b>${o((()=>{try{return new URL(s.url).pathname}catch{return s.url}})())}</b><small>${o(s.info.title||"")}</small></span>
            <span class="ts-p-meta"><em>${d[s.viewport]||s.viewport}</em><span>${s.status||"\u2014"}</span><span>${(s.ms/1e3).toFixed(1).replace(".",",")} s</span>${s.issues.filter(n=>n.level!=="info").length?`<span class="n">${s.issues.filter(n=>n.level!=="info").length}</span>`:""}</span></summary>
          <ul>${s.issues.map(n=>`<li class="${n.level}">${r(n.level==="error"?"error":n.level==="warn"?"warn":"info",13)}<span>${o(n.text)}</span></li>`).join("")||`<li class="pass">${r("pass",13)}<span>Aucun probl\xE8me d\xE9tect\xE9</span></li>`}</ul>
          <div class="ts-p-act"><button class="btn small" data-open="${o(s.url)}" data-i="${a}">Ouvrir dans le Browser Lab</button></div>
        </details>`).join("")}</div>`}scenarioHtml(){let e=this.lab.st.scenarios,t=this.scn,s=this.job&&this.job.kind==="scenario";return`
      <div class="ts-scn-bar">
        <select class="input" data-scn-pick>${e.map(a=>`<option value="${a.id}" ${a.id===this.current?"selected":""}>${o(a.name)}</option>`).join("")}${e.length?"":"<option>Aucun sc\xE9nario</option>"}</select>
        <button class="icon-btn small" data-act="scn-new" title="Nouveau sc\xE9nario">${r("plus",14)}</button>
        ${t?`<button class="icon-btn small" data-act="scn-del" title="Supprimer">${r("trash",13)}</button>`:""}
      </div>
      ${t?`
        <div class="ts-scn-head">
          <input class="input" data-scn="name" value="${o(t.name)}">
          <select class="input" data-scn="viewport">${Object.entries(d).map(([a,n])=>`<option value="${a}" ${t.viewport===a?"selected":""}>${n}</option>`).join("")}</select>
        </div>
        <div class="ts-run">
          ${this.recording?`<button class="btn small rec" data-act="rec-stop">${r("stop",12)}<span>Arr\xEAter l\u2019enregistrement</span></button>`:`<button class="btn small" data-act="rec">${r("record",12)}<span>Enregistrer mes actions</span></button>`}
          ${s?`<button class="btn small" data-act="cancel">${r("stop",12)}<span>Arr\xEAter</span></button>`:`<button class="btn primary small" data-act="scn-run" ${t.steps.length?"":"disabled"}>${r("play",12)}<span>Rejouer</span></button>`}
          <button class="btn small" data-act="playwright" ${t.steps.length?"":"disabled"} title="Exporter en script de test automatis\xE9 (.spec.ts)">${r("code",12)}<span>Exporter le test</span></button>
        </div>
        ${this.recording?`<p class="bl-hint rec">${r("record",12)} Naviguez dans la page : chaque clic, saisie et page visit\xE9e devient une \xE9tape. Ajoutez ensuite des v\xE9rifications.</p>`:""}
        <ol class="ts-steps">${t.steps.map((a,n)=>this.stepHtml(a,n)).join("")}</ol>
        <div class="ts-add">
          <select class="input" data-add-action>${Object.entries(g).map(([a,n])=>`<option value="${a}">${n}</option>`).join("")}</select>
          <button class="btn small" data-act="step-add">${r("plus",12)}<span>Ajouter une \xE9tape</span></button>
        </div>
        <div class="ts-scn-res"></div>`:'<p class="bl-hint">Un sc\xE9nario est une suite d\u2019\xE9tapes (ouvrir une page, cliquer, saisir, v\xE9rifier un texte\u2026) rejou\xE9e automatiquement dans une fen\xEAtre cach\xE9e. Cr\xE9ez-en un, puis enregistrez vos actions dans la page.</p>'}`}stepHtml(e,t){let s=$[e.action]||[],a=this.stepResults&&this.stepResults[t];return`<li class="ts-step ${a?a.ok?"ok":"bad":""}">
      <select class="input" data-step="${t}" data-f="action">${Object.entries(g).map(([n,i])=>`<option value="${n}" ${e.action===n?"selected":""}>${i}</option>`).join("")}</select>
      ${s.some(n=>n.startsWith("selector"))?`<span class="ts-sel"><input class="input mono" data-step="${t}" data-f="selector" value="${o(e.selector||"")}" placeholder="S\xE9lecteur CSS ou text=Libell\xE9"><button class="icon-btn small" data-act="step-pick" data-i="${t}" title="Choisir dans la page">${r("target",12)}</button></span>`:""}
      ${s.some(n=>n.startsWith("value"))?`<input class="input" data-step="${t}" data-f="value" value="${o(e.value||"")}" placeholder="${e.action==="goto"?"Adresse ou /chemin":e.action==="wait"?"Dur\xE9e (ms)":e.action==="press"?"Enter, Escape, Tab\u2026":e.secret?"Mot de passe (non enregistr\xE9)":"Valeur"}" ${e.secret?'type="password"':""}>`:""}
      <span class="ts-step-act"><button class="icon-btn small" data-act="step-up" data-i="${t}">${r("chevronDown",12,"up")}</button><button class="icon-btn small" data-act="step-del" data-i="${t}">${r("close",12)}</button></span>
      ${a&&!a.ok?`<div class="ts-err">${o(a.error||"\xC9chec")}${a.thumb?`<img src="data:image/jpeg;base64,${a.thumb}" alt="">`:""}</div>`:""}
      ${a&&a.ok&&a.thumb?`<div class="ts-ok"><img src="data:image/jpeg;base64,${a.thumb}" alt=""></div>`:""}
    </li>`}addStep(e,t){let s=this.scn;if(!s)return;let a=s.steps[s.steps.length-1];t&&a&&a.action===e.action&&e.action==="type"&&a.selector===e.selector?a.value=e.value:t&&e.action==="goto"&&a&&a.action==="click"||s.steps.push(e),this.lab.save(),this.t.mode==="scenario"&&this.renderBody()}async injectRecorder(){this.lab.wv&&await this.lab.wv.executeJavaScript(f).catch(()=>{})}onPicker(e){if(e.type==="rec"&&this.recording){this.addStep(e.step,!0);return}if(e.type==="select"&&this.pickFor!=null){let t=this.scn;t&&t.steps[this.pickFor]&&(t.steps[this.pickFor].selector=e.info.selector,this.lab.save()),this.pickFor=null,this.lab.togglePick("element"),this.lab.openTab("tests"),this.renderBody()}}playwright(){let e=this.scn,t=i=>JSON.stringify(i||""),s=i=>i&&i.startsWith("text=")?`page.getByText(${t(i.slice(5))}).first()`:`page.locator(${t(i)}).first()`,a={desktop:[1440,900],laptop:[1280,800],tablet:[820,1180],mobile:[390,844]}[e.viewport||"desktop"],n=e.steps.map(i=>{switch(i.action){case"goto":return`  await page.goto(${t(i.value)});`;case"click":return`  await ${s(i.selector)}.click();`;case"type":return`  await ${s(i.selector)}.fill(${i.secret?"process.env.MOT_DE_PASSE":t(i.value)});`;case"select":return`  await ${s(i.selector)}.selectOption(${t(i.value)});`;case"press":return`  await page.keyboard.press(${t(i.value||"Enter")});`;case"wait":return i.selector?`  await ${s(i.selector)}.waitFor();`:`  await page.waitForTimeout(${Number(i.value)||1e3});`;case"scroll":return i.selector?`  await ${s(i.selector)}.scrollIntoViewIfNeeded();`:"  await page.mouse.wheel(0, 800);";case"assertText":return`  await expect(page.locator('body')).toContainText(${t(i.value)});`;case"assertNoText":return`  await expect(page.locator('body')).not.toContainText(${t(i.value)});`;case"assertUrl":return`  await expect(page).toHaveURL(new RegExp(${t(String(i.value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))}));`;case"assertVisible":return`  await expect(${s(i.selector)}).toBeVisible();`;case"assertTitle":return`  await expect(page).toHaveTitle(new RegExp(${t(String(i.value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))}, 'i'));`;case"assertNoErrors":return"  expect(erreurs).toEqual([]);";case"screenshot":return`  await page.screenshot({ path: ${t(`${e.name}-${Date.now()}.png`)}, fullPage: true });`;default:return""}});return`// G\xE9n\xE9r\xE9 par NEX-BROWSER : npx playwright test
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: ${a[0]}, height: ${a[1]} }${e.viewport==="mobile"||e.viewport==="tablet"?", isMobile: true, hasTouch: true":""} });

test(${t(e.name)}, async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
${n.join(`
`)}
});
`}async start(e){let t=this.lab.url;if(!t){p("Ouvrez d\u2019abord une page.",{kind:"bad"});return}if(e==="explore"){this.results=[],this.summary=null;let s=await c.invoke("lab:test-start",{url:t,kind:"explore",options:{maxPages:Number(this.t.maxPages)||25,viewports:this.t.viewports.length?this.t.viewports:["desktop"],checkLinks:this.t.checkLinks,screenshots:this.t.screenshots}});this.job={id:s.id,kind:e}}else{let s=this.scn,a=s.steps.map(i=>i.secret?{...i,value:this.secrets.get(i)||""}:i);(!a.length||a[0].action!=="goto")&&a.unshift({action:"goto",value:t}),this.stepResults=[];let n=await c.invoke("lab:test-start",{url:t,kind:"scenario",steps:a,viewport:s.viewport||"desktop"});this.job={id:n.id,kind:e,offset:a.length-s.steps.length}}this.renderBody()}onEvent(e){if(!this.job||e.id!==this.job.id)return;let t=u(".ts-progress",this.el);if(e.phase==="page"&&t&&(t.textContent=`${d[e.viewport]||""} \xB7 page ${e.done} / ${e.total} \xB7 ${e.url}`),e.phase==="links"&&t&&(t.textContent=`V\xE9rification des liens ${e.done} / ${e.total}`),e.phase==="result"&&(this.results.push(e.result),(u(".ts-pages",this.el)||!this.summary)&&this.renderBody()),e.phase==="step"){let s=e.result.i-(this.job.offset||0);s>=0&&(this.stepResults[s]=e.result,this.renderBody())}e.phase==="done"&&(this.job.kind==="explore"?this.summary=e.summary:p(e.summary.ok?"Sc\xE9nario r\xE9ussi.":"Le sc\xE9nario a \xE9chou\xE9 : voir l\u2019\xE9tape en rouge.",{kind:e.summary.ok?"":"bad"}),this.job=null,this.renderBody()),e.phase==="error"&&(p(e.error,{kind:"bad"}),this.job=null,this.renderBody())}async onClick(e){let t=e.target.closest('[data-set="tsMode"]');if(t){this.t.mode=t.dataset.val,this.lab.save(),this.render();return}let s=e.target.closest("[data-open]");if(s){this.lab.navigate(s.dataset.open);return}if(e.target.matches('[data-act="only"]')){this.onlyIssues=e.target.checked,this.renderBody();return}let a=e.target.closest("[data-act]");if(!a)return;let n=this.scn,i=Number(a.dataset.i);try{switch(a.dataset.act){case"explore":await this.start("explore");break;case"scn-run":await this.start("scenario");break;case"cancel":this.job&&c.invoke("lab:test-cancel",{id:this.job.id});break;case"scn-new":{let l={id:b(),name:`Sc\xE9nario ${this.lab.st.scenarios.length+1}`,viewport:"desktop",steps:this.lab.url?[{action:"goto",value:this.lab.url}]:[]};this.lab.st.scenarios.push(l),this.current=l.id,this.lab.save(),this.renderBody();break}case"scn-del":this.lab.st.scenarios=this.lab.st.scenarios.filter(l=>l.id!==this.current),this.current=this.lab.st.scenarios[0]?this.lab.st.scenarios[0].id:null,this.lab.save(),this.renderBody();break;case"rec":this.recording=!0,n&&!n.steps.length&&this.lab.url&&n.steps.push({action:"goto",value:this.lab.url}),await this.injectRecorder(),this.renderBody();break;case"rec-stop":this.recording=!1,this.lab.wv&&this.lab.wv.executeJavaScript("window.__vtRec && (window.__vtRec.on = false)").catch(()=>{}),this.renderBody();break;case"step-add":{let l=u("[data-add-action]",this.el).value;n.steps.push({action:l,selector:"",value:l==="goto"&&this.lab.url||""}),this.lab.save(),this.renderBody();break}case"step-del":n.steps.splice(i,1),this.lab.save(),this.renderBody();break;case"step-up":i>0&&([n.steps[i-1],n.steps[i]]=[n.steps[i],n.steps[i-1]],this.lab.save(),this.renderBody());break;case"step-pick":this.pickFor=i,this.lab.st.pick&&this.lab.st.pickMode==="element"||await this.lab.togglePick("element"),this.lab.openTab("tests"),p("Cliquez sur l\u2019\xE9l\xE9ment dans la page.");break;case"playwright":{let l=await c.invoke("lab:save-text",{name:`${n.name.replace(/[<>:"/\\|?*]+/g,"-")}.spec.ts`,text:this.playwright(),filters:[{name:"Script de test",extensions:["ts","js"]}]});l&&p("Script de test enregistr\xE9.",{action:"Afficher",onAction:()=>c.invoke("lab:reveal",l)});break}case"export-tests":{await c.invoke("lab:save-text",{name:"tests-navigation.json",text:JSON.stringify({summary:this.summary,results:this.results.map(({thumb:w,...m})=>m)},null,2),filters:[{name:"JSON",extensions:["json"]}]})&&p("Rapport enregistr\xE9.");break}default:break}}catch(l){p(l.message,{kind:"bad"})}}onChange(e){let t=e.target;if(t.dataset.vp){let s=new Set(this.t.viewports);t.checked?s.add(t.dataset.vp):s.delete(t.dataset.vp),this.t.viewports=Object.keys(d).filter(a=>s.has(a)),this.lab.save();return}if(t.dataset.t){this.t[t.dataset.t]=t.type==="checkbox"?t.checked:t.value,this.lab.save();return}if(t.dataset.scnPick!==void 0){this.current=t.value,this.stepResults=null,this.renderBody();return}if(t.dataset.scn){this.scn[t.dataset.scn]=t.value,this.lab.save();return}t.dataset.step!=null&&t.dataset.f==="action"&&(this.scn.steps[Number(t.dataset.step)].action=t.value,this.lab.save(),this.renderBody())}onInput(e){let t=e.target;if(t.dataset.step!=null&&t.dataset.f!=="action"){let s=this.scn.steps[Number(t.dataset.step)];if(s.secret&&t.dataset.f==="value"){this.secrets.set(s,t.value);return}s[t.dataset.f]=t.value,this.lab.save()}}};export{h as default};
