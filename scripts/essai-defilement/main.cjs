// NEXORA #114 : banc d'essai de nexora/app/webview-preload.js sous Electron (lancé par scripts/test-defilement.mjs).
// Fenêtre hors écran émulée en téléphone (comme le Responsive Lab et l'App Builder : barres natives masquées, toucher),
// qui charge le site d'essai avec le vrai script, puis vérifie chaque message du protocole lu par l'interface.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const hidden = new Map();
ipcMain.on('vitrine-emu-state', (e) => e.sender.send('vitrine-emu', { mobile: hidden.get(e.sender.id) === true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const res = []; const ok = (cond, what) => { res.push([cond ? 'OK ' : 'ÉCHEC', what]); };
app.whenReady().then(async () => {
  const got = [];
  ipcMain.on('test-host', (_e, ch, d) => got.push([ch, d]));
  const win = new BrowserWindow({ show: false, width: 390, height: 700, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: false, contextIsolation: true, preload: path.join(__dirname, 'wrapper.cjs') } });
  win.webContents.setFrameRate(60);
  await win.loadFile(path.join(__dirname, 'site.html'));
  const g = win.webContents;
  g.debugger.attach('1.3');
  await g.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 1, mobile: true });
  await g.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await g.debugger.sendCommand('Emulation.setScrollbarsHidden', { hidden: true });
  hidden.set(g.id, true);
  g.reload(); await wait(1800);
  const msgs = async () => got;
  const last = async (ch) => { const m = (await msgs()).filter((x) => x[0] === ch); return m.length ? m[m.length - 1][1] : null; };
  let sc = await last('vitrine-scroll');
  ok(sc && sc.sh > sc.ch && sc.ch > 0, `vitrine-scroll reçu : ${JSON.stringify(sc)}`);
  ok(true, 'page à la largeur du téléphone');

  const top = await last('vitrine-top');
  ok(top === 'rgb(18, 52, 86)', `vitrine-top : ${top}`);
  const overlay = await g.executeJavaScript('!!document.querySelector("[data-nexora=defilement]")');
  ok(overlay, 'barres dessinées dans la page (mobile, sans barres de l’hôte)');
  // ordre de défilement de l'hôte
  g.send('vitrine-scroll-to', { path: null, y: 500 }); await wait(300);
  ok(await g.executeJavaScript('scrollY') === 500, `vitrine-scroll-to : scrollY = ${await g.executeJavaScript('scrollY')}`);
  sc = await last('vitrine-scroll'); ok(sc && sc.y === 500, `état renvoyé après défilement : y = ${sc && sc.y}`);
  g.send('vitrine-scroll-to', { path: null, x: 0, y: 0 }); await wait(300);
  // glissement horizontal dans le carrousel
  const car = await g.executeJavaScript('(() => { const r = document.getElementById("car").getBoundingClientRect(); return [r.left + 300, r.top + r.height / 2]; })()');
  g.sendInputEvent({ type: 'mouseDown', x: Math.round(car[0]), y: Math.round(car[1]), button: 'left', clickCount: 1 });
  for (let x = car[0] - 10; x >= car[0] - 200; x -= 10) { g.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(car[1]), button: 'left', modifiers: ['leftButtonDown'] }); await wait(16); }
  g.sendInputEvent({ type: 'mouseUp', x: Math.round(car[0] - 200), y: Math.round(car[1]), button: 'left', clickCount: 1 }); await wait(900);
  const cx = await g.executeJavaScript('document.getElementById("car").scrollLeft');
  ok(cx >= 150 && await g.executeJavaScript('scrollY') === 0, `glissement horizontal dans un carrousel : scrollLeft = ${cx}, page immobile`);
  // glissement à la souris
  g.sendInputEvent({ type: 'mouseDown', x: 200, y: 600, button: 'left', clickCount: 1 });
  for (let y = 590; y >= 300; y -= 10) { g.sendInputEvent({ type: 'mouseMove', x: 200, y, button: 'left', modifiers: ['leftButtonDown'] }); await wait(16); }
  g.sendInputEvent({ type: 'mouseUp', x: 200, y: 300, button: 'left', clickCount: 1 }); await wait(900);
  const sy = await g.executeJavaScript('scrollY');
  ok(sy >= 250, `glissement vers le haut de 300 px : scrollY = ${sy}`);
  const act = (await msgs()).filter((x) => x[0] === 'vitrine-active').map((x) => x[1]);
  ok(act.includes('down') && act.includes('drag'), `vitrine-active : ${[...new Set(act)].join(', ')}`);
  // un glissement ne déclenche pas de clic ; un clic simple, si
  g.send('vitrine-scroll-to', { path: null, y: 0 }); await wait(300);
  const loc = await g.executeJavaScript('(() => { const r = document.getElementById("b").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
  g.sendInputEvent({ type: 'mouseDown', x: Math.round(loc[0]), y: Math.round(loc[1]), button: 'left', clickCount: 1 });
  g.sendInputEvent({ type: 'mouseUp', x: Math.round(loc[0]), y: Math.round(loc[1]), button: 'left', clickCount: 1 }); await wait(300);
  ok(await g.executeJavaScript('window.clicked||0') === 1, 'clic simple transmis à la page');
  // localisation pour la synchronisation des clics
  g.send('vitrine-config', { hostBars: true, dragScroll: true, touch: true, syncClicks: true, syncScroll: true, syncInput: true, syncNav: true, pointer: true }); await wait(300);
  ok(!(await g.executeJavaScript('!!document.querySelector("[data-nexora=defilement]")')), 'barres de la page retirées quand l’hôte dessine les siennes (Responsive Lab)');
  g.send('vitrine-locate', { path: '#b', tag: 'button', text: 'Valider', req: 'r1', rx: 0.5, ry: 0.5 }); await wait(300);
  const located = await last('vitrine-located');
  ok(located && located.ok && located.req === 'r1' && Math.abs(located.x - loc[0]) < 3, `vitrine-located : ${JSON.stringify(located)}`);
  g.send('vitrine-do-click', { path: '#zzz', tag: 'button', text: 'Valider' }); await wait(200);
  ok(await g.executeJavaScript('window.clicked||0') === 2, 'vitrine-do-click (élément retrouvé par son texte)');
  g.sendInputEvent({ type: 'mouseDown', x: Math.round(loc[0]), y: Math.round(loc[1]), button: 'left', clickCount: 1 });
  g.sendInputEvent({ type: 'mouseUp', x: Math.round(loc[0]), y: Math.round(loc[1]), button: 'left', clickCount: 1 }); await wait(300);
  const clickMsg = await last('vitrine-click');
  ok(clickMsg && clickMsg.tag === 'button' && clickMsg.text === 'Valider', `vitrine-click : ${JSON.stringify(clickMsg)}`);
  const ptr = (await msgs()).filter((x) => x[0] === 'vitrine-pointer').map((x) => x[1].type);
  ok(ptr.includes('down') && ptr.includes('up'), `vitrine-pointer : ${[...new Set(ptr)].join(', ')}`);
  g.send('vitrine-set-input', { path: '#nom', tag: 'input', id: 'nom', name: 'nom', value: 'Awa' }); await wait(200);
  ok(await g.executeJavaScript('document.getElementById("nom").value') === 'Awa', 'vitrine-set-input');
  g.focus(); await g.executeJavaScript('document.getElementById("nom").focus(); document.getElementById("nom").value=""');
  g.sendInputEvent({ type: 'char', keyCode: 'K' }); await wait(200);
  const inp = await last('vitrine-input');
  ok(inp && inp.id === 'nom' && inp.value === 'K', `vitrine-input : ${JSON.stringify(inp)}`);
  g.send('vitrine-scroll-sync', { anchor: { path: '#s3', off: 0 }, ry: 0.1 }); await wait(300);
  const s3 = await g.executeJavaScript('Math.round(document.getElementById("s3").getBoundingClientRect().top)');
  ok(Math.abs(s3) <= 1, `vitrine-scroll-sync aligné sur le repère #s3 (haut à ${s3} px)`);
  sc = await last('vitrine-scroll'); ok(sc && sc.anchor && sc.anchor.path, `repère envoyé avec le défilement : ${JSON.stringify(sc && sc.anchor)}`);
  g.send('vitrine-spa-nav', { url: 'file://' + path.join(__dirname, 'site.html') + '#s2' }); await wait(700);
  const spa = await last('vitrine-spa-done'); ok(spa && spa.ok, `vitrine-spa-nav : ${JSON.stringify(spa)}`);
  // aspect des barres et masquage pendant les captures
  g.send('vitrine-config', { hostBars: false, dragScroll: true, touch: true }); await wait(300);
  g.send('vitrine-scroll-to', { path: null, y: 300 }); await wait(150);
  g.sendInputEvent({ type: 'mouseMove', x: 200, y: 300 }); await wait(400);
  const fs2 = require('fs');
  const { nativeImage } = require('electron'); const cap = async () => nativeImage.createFromBuffer(Buffer.from((await g.debugger.sendCommand('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  const shot1 = await cap(); if (process.env.SORTIE) fs2.writeFileSync(path.join(process.env.SORTIE, 'barres.png'), shot1.toPNG());
  g.send('vitrine-capture', true); await wait(300);
  const shot2 = await cap(); if (process.env.SORTIE) fs2.writeFileSync(path.join(process.env.SORTIE, 'barres-capture.png'), shot2.toPNG());
  g.send('vitrine-capture', false);
  const px = (img, x, y) => { const b = img.toBitmap(); const sz = img.getSize(); const i = (y * sz.width + x) * 4; return [b[i + 2], b[i + 1], b[i]]; };
  const sz = shot1.getSize();
  let diff = 0; for (let y = 20; y < sz.height - 20; y += 4) { const a = px(shot1, sz.width - 6, y); const b = px(shot2, sz.width - 6, y); if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 30) diff++; }
  ok(diff > 3, `barre verticale visible sur la page, absente pendant la capture (${diff} points différents au bord droit)`);

  for (const [s, w] of res) console.log(s, w);
  console.log(res.every((r) => r[0] === 'OK ') ? `\n${res.length} vérifications réussies` : '\nAu moins une vérification a échoué');
  app.exit(res.every((r) => r[0] === 'OK ') ? 0 : 1);
});
