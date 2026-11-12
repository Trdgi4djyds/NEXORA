import{f as b}from"./chunk-5PYR55EX.js";import{a as s,e as g,i as m}from"./chunk-6ZWS5EFO.js";import{b as o}from"./chunk-S4I2LXHS.js";import{a as t,d}from"./chunk-GKSXEY5K.js";import"./chunk-ZAWUH4BJ.js";import{a as i}from"./chunk-V3CX37JL.js";import{a as u,c as f}from"./chunk-VBMWAH3C.js";import"./chunk-6DHFEWGX.js";var v=()=>(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4;function k(){let l=g("maint",`
    <div class="sheet-head"><span class="sheet-icon">${o("wrench",22)}</span><div><h2>Maintenance et sauvegarde</h2><p>Gardez une copie de votre travail, mettez NEXORA \xE0 jour et adaptez-la \xE0 votre ordinateur.</p></div></div>
    <div class="sheet-body mt-grid">
      <section class="mt-card">
        <h3>${o("download",16)} Sauvegarder</h3>
        <p>Un seul fichier prot\xE9g\xE9 par mot de passe : vos applications, sc\xE8nes, pr\xE9sentations et r\xE9glages, <b>et les cl\xE9s de signature de vos applications</b> (indispensables pour publier leurs mises \xE0 jour sur le Play Store).</p>
        <p class="mt-note">Non inclus, par s\xE9curit\xE9 : cl\xE9s d\u2019IA, connexion GitHub, cl\xE9s des comptes de service. Vous les saisirez \xE0 nouveau.</p>
        <label class="field"><span>Mot de passe de la sauvegarde</span><input class="input" type="password" data-bk="p1" autocomplete="new-password" placeholder="6 caract\xE8res minimum"></label>
        <label class="field"><span>Confirmer</span><input class="input" type="password" data-bk="p2" autocomplete="new-password"></label>
        <button class="btn primary" data-mt="backup">${o("download",14)}<span>Cr\xE9er la sauvegarde\u2026</span></button>
      </section>
      <section class="mt-card">
        <h3>${o("upload",16)} Restaurer</h3>
        <p>Sur ce PC ou un nouveau : choisissez le fichier de sauvegarde et son mot de passe. Les r\xE9glages actuels sont gard\xE9s de c\xF4t\xE9 ; une cl\xE9 de signature d\xE9j\xE0 pr\xE9sente n\u2019est jamais remplac\xE9e.</p>
        <label class="field"><span>Mot de passe de la sauvegarde</span><input class="input" type="password" data-bk="r1" autocomplete="current-password"></label>
        <button class="btn" data-mt="restore">${o("upload",14)}<span>Restaurer une sauvegarde\u2026</span></button>
      </section>
      <section class="mt-card">
        <h3>${o("restart",16)} Mises \xE0 jour de NEXORA</h3>
        <p>NEXORA v\xE9rifie si une nouvelle version est disponible, la t\xE9l\xE9charge et l\u2019installe en gardant vos r\xE9glages, vos projets et votre compte.</p>
        ${m("updateAuto","V\xE9rifier au d\xE9marrage","Une fois par jour, sans rien installer sans votre accord.",t.updateAuto!==!1)}
        <div class="mt-row"><button class="btn" data-mt="check">${o("search",14)}<span>V\xE9rifier maintenant</span></button><span class="mt-upd"></span></div>
      </section>
      <section class="mt-card">
        <h3>${o("bolt",16)} Performance</h3>
        ${m("lite","Mode l\xE9ger","Pour les petits ordinateurs : moins d\u2019effets visuels, rendu 3D all\xE9g\xE9, aper\xE7us moins gourmands.",!!t.lite)}
        ${v()&&!t.lite?'<p class="mt-note">Cet ordinateur a peu de m\xE9moire ou de processeurs : le mode l\xE9ger est conseill\xE9.</p>':""}
        <h3 class="mt-sub">${o("info",16)} Assistance</h3>
        <p>En cas de probl\xE8me, le d\xE9tail technique est enregistr\xE9 dans les journaux de NEXORA. Vous pouvez les ouvrir pour les transmettre.</p>
        <button class="btn" data-mt="logs">${o("folderOpen",14)}<span>Ouvrir les journaux</span></button>
      </section>
    </div>
    <div class="sheet-foot"><span class="grow"></span><button class="btn primary" data-sheet="close">Termin\xE9</button></div>`,{wide:!0,refresh:()=>k()}),a=r=>(u(`[data-bk="${r}"]`,l)||{}).value||"";l.onchange=r=>{let n=r.target.dataset.toggle;n==="lite"&&(t.lite=r.target.checked,d(),b(),s(t.lite?"Mode l\xE9ger activ\xE9. Le Studio 3D l\u2019applique \xE0 sa prochaine ouverture.":"Mode l\xE9ger d\xE9sactiv\xE9.")),n==="updateAuto"&&(t.updateAuto=r.target.checked,d()),r.target.matches("[data-mt-repo]")&&(t.updateRepo=r.target.value.trim().replace(/^https?:\/\/github\.com\//,"").replace(/\.git$|\/$/g,""),d())},l.onclick=async r=>{let n=r.target.closest("[data-mt]");if(!n)return;let p=n.dataset.mt;try{if(p==="backup"){if(a("p1").length<6){s("Choisissez un mot de passe d\u2019au moins 6 caract\xE8res.",{kind:"bad"});return}if(a("p1")!==a("p2")){s("Les deux mots de passe ne sont pas identiques.",{kind:"bad"});return}d();let e=await i.invoke("backup:create",{password:a("p1")});e&&s(`Sauvegarde cr\xE9\xE9e : ${e.apps} application(s), ${e.keys} cl\xE9(s) de signature. Gardez bien son mot de passe : il est impossible de le retrouver.`,{action:"Afficher",onAction:()=>i.invoke("android:reveal",e.file)})}else if(p==="restore"){if(!a("r1")){s("Indiquez le mot de passe de la sauvegarde.",{kind:"bad"});return}let e=await i.invoke("backup:restore",{password:a("r1")});e&&e.ok&&(s(`Sauvegarde restaur\xE9e (${e.keys} cl\xE9(s) ajout\xE9e(s)). NEXORA red\xE9marre l\u2019interface\u2026`),setTimeout(()=>location.reload(),1600))}else p==="check"?await h({manual:!0,out:u(".mt-upd",l)}):p==="logs"&&await i.invoke("support:open-logs")}catch(e){s(e.message||String(e),{kind:"bad"})}}}async function h({manual:l=!1,out:a=null}={}){/* NEXORA #114 : plus de d\xE9p\xF4t \xE0 saisir, versions officielles de NEXORA (src/maint.js, DEFAULT_REPO) */a&&(a.textContent="V\xE9rification\u2026");let n=await i.invoke("update:check",{});if(t.updateChecked=Date.now(),d(),!n.available){a&&(a.textContent=`\xC0 jour (version ${n.current}).`),l&&s(`NEXORA est \xE0 jour (version ${n.current}).`);return}a&&(a.textContent=`Version ${n.version} disponible.`),s(`NEXORA ${n.version} est disponible (vous avez la ${n.current}).`,{sticky:!0,action:"Installer",onAction:async()=>{let p=s("T\xE9l\xE9chargement de la mise \xE0 jour\u2026",{busy:!0,sticky:!0}),e=i.on("update:progress",c=>p.update(`T\xE9l\xE9chargement de la mise \xE0 jour\u2026 ${Math.round((c.progress||0)*100)} %`));try{await i.invoke("update:install")}catch(c){s(c.message,{kind:"bad"})}finally{e&&e(),p.close()}}})}function C(){t.updateAuto===!1||Date.now()-(t.updateChecked||0)<20*36e5||setTimeout(()=>h().catch(()=>{}),15e3)}export{h as checkUpdates,k as openMaintenance,C as updatesOnStart};
