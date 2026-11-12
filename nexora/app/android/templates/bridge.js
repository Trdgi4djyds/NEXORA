/* Fonctions natives exposées à la page (window.NexoraApp) et adaptations de la WebView.
 * Injecté par l'application Android générée par NEXORA à chaque chargement de page.
 * window.VitrineApp reste un alias (pages écrites avant le changement de nom). */
(function () {
  var N = window.VitrineNative;
  if (!N || window.NexoraApp) return;
  var seq = 0;
  var pending = {};
  window.__vitrineResolve = function (id, ok, value) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    (ok ? p.res : p.rej)(value);
  };
  function call(method, args) {
    return new Promise(function (res, rej) {
      var id = 'v' + (++seq) + '_' + Date.now();
      pending[id] = { res: res, rej: rej };
      try { N[method].apply(N, args.concat([id])); } catch (e) { delete pending[id]; rej(e); }
    });
  }
  var info = {};
  try { info = JSON.parse(N.appInfo()); } catch (e) { info = {}; }
  // Mode « projet » : les liens partagés pointent vers le site public plutôt que vers l'adresse interne.
  function publicUrl(u) {
    if (!u || !info.publicUrl) return u;
    return String(u).replace(/^https:\/\/appassets\.androidplatform\.net/, info.publicUrl.replace(/\/$/, ''));
  }
  function toBase64Chunks(blob, size) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result);
        var b64 = s.slice(s.indexOf(',') + 1);
        var out = [];
        for (var i = 0; i < b64.length; i += size) out.push(b64.slice(i, i + size));
        res(out);
      };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }
  var App = {
    platform: 'android',
    info: function () { return info; },
    share: function (d) {
      d = d || {};
      N.share(JSON.stringify({ title: d.title || '', text: d.text || '', url: publicUrl(d.url || '') }));
      return Promise.resolve();
    },
    vibrate: function (ms) { N.vibrate(typeof ms === 'number' ? ms : 40); return true; },
    // Orientation : 'portrait', 'landscape', 'auto', 'sensor', 'lock' (garder l'actuelle), 'default' (réglage de l'app).
    setOrientation: function (o) {
      var ok = false;
      try { ok = N.setOrientation(String(o || 'default')); } catch (e) { ok = false; }
      return ok ? Promise.resolve(true) : Promise.reject(new Error('Orientation non autorisée par l’application'));
    },
    orientation: function () { try { return N.orientation(); } catch (e) { return innerWidth > innerHeight ? 'landscape' : 'portrait'; } },
    toast: function (t) { N.toast(String(t)); },
    notify: function (title, body, opts) {
      if (typeof opts === 'string') opts = { url: opts };
      opts = opts || {};
      N.notify(JSON.stringify({
        title: String(title || ''), body: String(body || ''), url: opts.url || '',
        id: opts.id ? Number(opts.id) || 0 : 0, channel: opts.channel ? String(opts.channel) : '', ongoing: !!opts.ongoing,
      }));
    },
    copy: function (t) { N.copy(String(t)); return Promise.resolve(); },
    openExternal: function (u) { N.openExternal(String(u)); },
    statusBar: function (color, darkIcons) { N.statusBar(String(color), !!darkIcons); },
    openMenu: function () { N.openMenu && N.openMenu(); },
    openInApp: function (u) { N.openInApp && N.openInApp(String(u)); },
    scan: function () {
      return new Promise(function (res, rej) {
        var W = window.WebToNativeInterface;
        if (!W || !W.startScanner) { rej(new Error('Lecteur indisponible')); return; }
        var on = function (e) {
          if (!e.detail || e.detail.type !== 'BARCODE_SCAN') return;
          window.removeEventListener('vitrinenative', on);
          if (e.detail.cancelled) rej(new Error('annulé')); else res(e.detail.value);
        };
        window.addEventListener('vitrinenative', on);
        W.startScanner('{}');
      });
    },
    hideSplash: function () { var W = window.WebToNativeInterface; W && W.hideSplashScreen && W.hideSplashScreen(); },
    saveFile: function (data, name, mime) {
      var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
      var id = 'f' + (++seq) + '_' + Date.now();
      return toBase64Chunks(blob, 393216).then(function (chunks) {
        return new Promise(function (res, rej) {
          pending[id] = { res: res, rej: rej };
          N.fileBegin(id, String(name || 'fichier'), String(mime || blob.type || ''));
          for (var i = 0; i < chunks.length; i++) N.fileChunk(id, chunks[i]);
          N.fileEnd(id);
        });
      });
    },
    authenticate: function (reason) { return call('authenticate', [String(reason || 'Confirmez votre identité')]); },
    requestPermission: function (name) { return call('requestPermission', [String(name)]); },
    pickContact: function () { return call('pickContact', []); },
    keepAwake: function (on) { N.keepAwake(!!on); },
    exit: function () { N.exit(); },
    // Dernière erreur de l'application (fermeture inattendue, moteur de page arrêté…), pour le diagnostic.
    lastError: function () { try { return N.lastError ? N.lastError() : ''; } catch (e) { return ''; } },
  };
  // Notifications push (si l'application a été construite avec) : jeton de l'appareil, sujets, autorisation.
  // NEXORA #073 : messagerie. onMessage(cb) : cb(message) peut renvoyer true (ou une promesse de true) quand la page
  // a déjà montré le message : pas de notification tant que l'application est à l'écran. Les messages reçus pendant
  // que la page était absente lui sont remis à l'ouverture (message.queued). onOpen(cb) : notification touchée ou
  // appel accepté ; onAction(cb) : Répondre, Marquer comme lu, Refuser depuis la notification ; onMissed(cb) : des
  // messages ont été perdus (appareil longtemps hors ligne), tout relire. setActive(tag) : conversation à l'écran ;
  // clear(tag) ; showWhenOpen(false) ; register({ fields, headers }) ; deleteToken() ; pending() ; openSettings(what).
  App.push = (function () {
    var msgCbs = [], openCbs = [], actionCbs = [], tokenCbs = [], missedCbs = [];
    var backlog = null, lastOpen = null;
    function has(m) { return !!N && typeof N[m] === 'function'; }
    function safe(cb, a, b) { try { return cb(a, b); } catch (e) { console.error('NexoraApp.push', e); return undefined; } }
    function takeBacklog() {
      if (backlog === null) {
        try { backlog = has('pushPending') ? (JSON.parse(N.pushPending() || '[]') || []) : []; } catch (e) { backlog = []; }
      }
      return backlog;
    }
    function answer(id, handled) { try { N.pushHandled(id, !!handled); } catch (e) { /* ancienne application */ } }
    function deliverMessage(d) {
      var results = [];
      for (var i = 0; i < msgCbs.length; i++) results.push(safe(msgCbs[i], d.message));
      if (!d.ask) return;
      var sync = false, waits = [];
      for (var j = 0; j < results.length; j++) {
        if (results[j] === true) sync = true;
        else if (results[j] && typeof results[j].then === 'function') waits.push(results[j]);
      }
      if (sync || !waits.length) { answer(d.ask, sync); return; }
      var done = false;
      var finish = function (v) { if (!done) { done = true; answer(d.ask, v); } };
      setTimeout(function () { finish(false); }, 700);
      Promise.all(waits.map(function (p) { return p.then(function (v) { if (v === true) finish(true); return v === true; }, function () { return false; }); }))
        .then(function (vs) { finish(vs.indexOf(true) >= 0); });
    }
    window.addEventListener('vitrinepush', function (e) {
      var d = e.detail || {}, i;
      if (d.type === 'message') deliverMessage(d);
      else if (d.type === 'open') { lastOpen = d; for (i = 0; i < openCbs.length; i++) safe(openCbs[i], d.message, d.action); }
      else if (d.type === 'action') { for (i = 0; i < actionCbs.length; i++) safe(actionCbs[i], d); }
      else if (d.type === 'token') { for (i = 0; i < tokenCbs.length; i++) safe(tokenCbs[i], d.token); }
      else if (d.type === 'deleted') { for (i = 0; i < missedCbs.length; i++) safe(missedCbs[i]); }
    });
    // Éléments mis de côté pendant l'absence de la page, remis à chaque nouvel écouteur du bon type.
    function replay(type, cb) {
      var list = takeBacklog();
      setTimeout(function () {
        for (var i = 0; i < list.length; i++) {
          var it = list[i];
          if (it.type !== type) continue;
          if (type === 'message') { var m = it.message || {}; m.queued = true; m.receivedAt = it.receivedAt; safe(cb, m); } else if (type === 'action') safe(cb, it); else safe(cb);
        }
      }, 0);
    }
    var api = {
      state: function () { try { return JSON.parse(N.pushState()); } catch (e) { return { enabled: false }; } },
      getToken: function (timeout) {
        var s = api.state();
        if (s.token) return Promise.resolve(s.token);
        if (!s.enabled) return Promise.reject(new Error('Notifications push non activées dans cette application'));
        return new Promise(function (res, rej) {
          var on = function (e) { if (e.detail && e.detail.type === 'token' && e.detail.token) { clearTimeout(t); window.removeEventListener('vitrinepush', on); res(e.detail.token); } };
          var t = setTimeout(function () { window.removeEventListener('vitrinepush', on); rej(new Error(api.state().error || 'Jeton indisponible')); }, timeout || 15000);
          window.addEventListener('vitrinepush', on);
          try { if (has('pushRequestToken')) N.pushRequestToken(); } catch (e) { /* ancienne application */ }
        });
      },
      subscribe: function (topic) { return call('pushSubscribe', [String(topic), true]); },
      unsubscribe: function (topic) { return call('pushSubscribe', [String(topic), false]); },
      requestPermission: function () { return call('pushPermission', []).then(function (v) { return v === true || v === 'true'; }); },
      onMessage: function (cb) { msgCbs.push(cb); replay('message', cb); },
      onToken: function (cb) { tokenCbs.push(cb); },
      onOpen: function (cb, opts) {
        openCbs.push(cb);
        if (opts && opts.navigate === false && has('pushPageOpens')) N.pushPageOpens(true);
        if (!lastOpen) {
          var o = '';
          try { o = has('pushOpened') ? N.pushOpened() : ''; } catch (e) { o = ''; }
          if (o) { try { lastOpen = JSON.parse(o); } catch (e) { lastOpen = null; } }
        }
        if (lastOpen) { var d = lastOpen; setTimeout(function () { safe(cb, d.message, d.action); }, 0); }
      },
      onAction: function (cb) { actionCbs.push(cb); replay('action', cb); },
      onMissed: function (cb) { missedCbs.push(cb); replay('deleted', cb); },
      pending: function () { return takeBacklog().slice(); },
      setActive: function (tag) { try { N.pushActive(tag == null ? '' : String(tag)); } catch (e) { /* ancienne application */ } },
      showWhenOpen: function (on) { try { N.pushShowWhenOpen(on !== false); } catch (e) { /* ancienne application */ } },
      clear: function (tag) { try { N.pushClear(tag == null ? '' : String(tag)); } catch (e) { /* ancienne application */ } },
      register: function (opts) { return api.getToken().then(function () { return call('pushRegister', [JSON.stringify(opts || {})]); }); },
      deleteToken: function () {
        if (!has('pushDeleteToken')) return Promise.reject(new Error('Fonction indisponible : reconstruisez l’application avec NEXORA'));
        return call('pushDeleteToken', []);
      },
      openSettings: function (what, channel) { try { N.pushSettings(String(what || 'notifications'), channel ? String(channel) : ''); } catch (e) { /* ancienne application */ } },
    };
    return api;
  })();
  // NEXORA #019 : achats intégrés avec Google Play Billing (si l'application a été construite avec l'option).
  // products(['pro'], 'inapp' | 'subs') → [{ productId, title, price, offers… }] ; buy('pro', { type, offerToken,
  // accountId }) → achats ; purchases(type) ; acknowledge(token) ; consume(token) ; onPurchase(cb).
  var B = window.VitrineBilling;
  function callB(method, args) {
    if (!B) return Promise.reject(new Error('Achats intégrés non activés dans cette application'));
    return new Promise(function (res, rej) {
      var id = 'b' + (++seq) + '_' + Date.now();
      pending[id] = { res: res, rej: rej };
      try { B[method].apply(B, args.concat([id])); } catch (e) { delete pending[id]; rej(e); }
    });
  }
  App.billing = {
    available: !!B,
    connect: function () { return callB('connect', []); },
    products: function (ids, type) { return callB('products', [JSON.stringify([].concat(ids || [])), type === 'subs' ? 'subs' : 'inapp']); },
    buy: function (productId, opts) { opts = opts || {}; return callB('buy', [String(productId), opts.type === 'subs' ? 'subs' : 'inapp', opts.offerToken || '', opts.accountId ? String(opts.accountId) : '']); },
    purchases: function (type) { return callB('purchases', [type === 'subs' ? 'subs' : 'inapp']); },
    acknowledge: function (token) { return callB('acknowledge', [String(token)]); },
    consume: function (token) { return callB('consume', [String(token)]); },
    onPurchase: function (cb) { window.addEventListener('nexora-billing', function (e) { if (e.detail && e.detail.type === 'purchase') cb(e.detail.purchases); }); },
  };
  // NEXORA #115 : modules OneSignal, AdMob, Google Analytics et Meta (si l'application a été construite avec eux).
  function callM(obj, label, method, args) {
    if (!obj) return Promise.reject(new Error(label + ' non activé dans cette application'));
    return new Promise(function (res, rej) {
      var id = 'm' + (++seq) + '_' + Date.now();
      pending[id] = { res: res, rej: rej };
      try { obj[method].apply(obj, args.concat([id])); } catch (e) { delete pending[id]; rej(e); }
    });
  }
  function json(o) { try { return JSON.stringify(o || {}); } catch (e) { return '{}'; } }
  function soft(obj, method, args) { try { if (obj) obj[method].apply(obj, args); } catch (e) { /* module absent */ } }
  // OneSignal : login(idClient), logout(), tag(clé, valeur), untag(clé), email(adresse), status(), requestPermission(),
  // optIn(), optOut(), onOpen(cb) (notification touchée : { title, body, url, data }).
  var OS = window.VitrineOneSignal;
  window.__vitrineOneSignal = function (d) { try { window.dispatchEvent(new CustomEvent('nexora-onesignal', { detail: d })); } catch (e) { /* ignore */ } };
  App.onesignal = {
    available: !!OS,
    login: function (id) { soft(OS, 'login', [String(id || '')]); },
    logout: function () { soft(OS, 'logout', []); },
    tag: function (k, v) { soft(OS, 'addTag', [String(k), v == null ? '' : String(v)]); },
    untag: function (k) { soft(OS, 'removeTag', [String(k)]); },
    email: function (a) { soft(OS, 'addEmail', [String(a || '')]); },
    language: function (l) { soft(OS, 'setLanguage', [String(l || '')]); },
    optIn: function () { soft(OS, 'optIn', []); },
    optOut: function () { soft(OS, 'optOut', []); },
    status: function () { return callM(OS, 'OneSignal', 'status', []); },
    requestPermission: function () { return callM(OS, 'OneSignal', 'requestPermission', []); },
    onOpen: function (cb) { window.addEventListener('nexora-onesignal', function (e) { if (e.detail && e.detail.type === 'open') cb(e.detail); }); },
  };
  // AdMob : showBanner(), hideBanner(), loadInterstitial(), showInterstitial(), loadRewarded(),
  // showRewarded() → { earned, amount, type }, privacyOptions(), status(), onBanner(cb).
  // La hauteur de la bannière est posée dans la variable CSS --nexora-banner (0 quand elle est masquée).
  var AD = window.VitrineAdMob;
  window.__vitrineAds = function (d) {
    try {
      if (d && d.type === 'banner') document.documentElement.style.setProperty('--nexora-banner', (d.shown ? (d.height || 0) : 0) + 'px');
      window.dispatchEvent(new CustomEvent('nexora-ads', { detail: d }));
    } catch (e) { /* ignore */ }
  };
  App.ads = {
    available: !!AD,
    showBanner: function () { soft(AD, 'showBanner', []); },
    hideBanner: function () { soft(AD, 'hideBanner', []); },
    loadInterstitial: function () { return callM(AD, 'AdMob', 'loadInterstitial', []); },
    showInterstitial: function () { return callM(AD, 'AdMob', 'showInterstitial', []); },
    loadRewarded: function () { return callM(AD, 'AdMob', 'loadRewarded', []); },
    showRewarded: function () { return callM(AD, 'AdMob', 'showRewarded', []); },
    privacyOptions: function () { return callM(AD, 'AdMob', 'privacyOptions', []); },
    status: function () { return callM(AD, 'AdMob', 'status', []); },
    onBanner: function (cb) { window.addEventListener('nexora-ads', function (e) { if (e.detail && e.detail.type === 'banner') cb(e.detail); }); },
  };
  // Google Analytics : event(nom, paramètres), screen(nom), userId(id), userProperty(nom, valeur), enable(oui/non).
  var GA = window.VitrineAnalytics;
  App.analytics = {
    available: !!GA,
    event: function (name, params) { soft(GA, 'logEvent', [String(name || ''), json(params)]); },
    screen: function (name, cls) { soft(GA, 'screen', [String(name || location.pathname), String(cls || '')]); },
    userId: function (id) { soft(GA, 'setUserId', [id == null ? '' : String(id)]); },
    userProperty: function (k, v) { soft(GA, 'setUserProperty', [String(k), v == null ? '' : String(v)]); },
    enable: function (on) { soft(GA, 'setEnabled', [on !== false]); },
  };
  try {
    if (GA && GA.autoScreens()) {
      var lastScreen = '';
      var track = function () { var s = location.pathname + location.hash; if (s === lastScreen) return; lastScreen = s; soft(GA, 'screen', [s, document.title || '']); };
      track();
      window.addEventListener('hashchange', track);
      window.addEventListener('popstate', track);
      ['pushState', 'replaceState'].forEach(function (k) { var o = history[k]; history[k] = function () { var r = o.apply(this, arguments); setTimeout(track, 0); return r; }; });
    }
  } catch (e) { /* suivi automatique facultatif */ }
  // Meta : event(nom, paramètres, valeur), purchase(montant, devise, paramètres), userId(id), flush().
  var MT = window.VitrineMeta;
  App.meta = {
    available: !!MT,
    event: function (name, params, value) { soft(MT, 'logEvent', [String(name || ''), json(params), Number(value) || 0]); },
    purchase: function (amount, currency, params) { soft(MT, 'logPurchase', [Number(amount) || 0, String(currency || 'EUR'), json(params)]); },
    userId: function (id) { soft(MT, 'setUserId', [id == null ? '' : String(id)]); },
    flush: function () { soft(MT, 'flush', []); },
  };
  window.NexoraApp = App;
  window.VitrineApp = App;

  // API standard screen.orientation.lock() / unlock() : la WebView Android ne la gère pas, l'application oui.
  try {
    var so = screen.orientation;
    if (so) {
      so.lock = function (o) { return App.setOrientation(o === 'any' || o === 'natural' ? 'auto' : o); };
      so.unlock = function () { App.setOrientation('default').catch(function () {}); };
    }
  } catch (e) { /* ignore */ }

  // Partage natif (la WebView Android n'a pas navigator.share).
  if (!navigator.share) {
    try {
      navigator.share = function (d) { return App.share(d); };
      navigator.canShare = function () { return true; };
    } catch (e) { /* lecture seule */ }
  }
  // Notifications locales (l'API Notification n'existe pas dans la WebView).
  if (!('Notification' in window)) {
    var Notif = function (title, opts) { App.notify(title, opts && opts.body, opts && opts.data && opts.data.url); };
    Notif.permission = 'default';
    Notif.requestPermission = function (cb) {
      return App.requestPermission('notifications').then(function (ok) { return ok; }, function () { return false; }).then(function (ok) {
        Notif.permission = ok ? 'granted' : 'denied';
        if (cb) cb(Notif.permission);
        return Notif.permission;
      });
    };
    window.Notification = Notif;
  }
  // Téléchargements de fichiers générés par la page (blob:, data:) : la WebView ne sait pas les enregistrer.
  window.__vitrineDownload = function (url, name, mime) {
    fetch(url).then(function (r) { return r.blob(); }).then(function (b) { return App.saveFile(b, name, mime || b.type); }).catch(function (e) { console.error('Téléchargement impossible', e); });
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.href || '';
    if (href.indexOf('blob:') === 0 || href.indexOf('data:') === 0) {
      e.preventDefault();
      e.stopPropagation();
      window.__vitrineDownload(href, a.getAttribute('download') || 'fichier', '');
    }
  }, true);
  var openWin = window.open;
  window.open = function (u) {
    if (u && (String(u).indexOf('blob:') === 0 || String(u).indexOf('data:') === 0)) { window.__vitrineDownload(String(u), 'fichier', ''); return null; }
    return openWin.apply(window, arguments);
  };

  // Couleur du haut et du bas de la page → barre d'état et barre de navigation.
  // Lit la couleur réelle sous la barre : couleur de fond, sinon 1re teinte d'un dégradé/image,
  // et en dernier recours la balise <meta name="theme-color"> (en tenant compte du thème clair/sombre).
  function themeColor() {
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    var generic = '';
    for (var i = 0; i < metas.length; i++) {
      var media = metas[i].getAttribute('media');
      var content = (metas[i].getAttribute('content') || '').trim();
      if (!content) continue;
      if (!media) { if (!generic) generic = content; continue; }
      try { if (matchMedia(media).matches) return content; } catch (e) { /* media invalide */ }
    }
    return generic;
  }
  function colorOf(el) {
    var s = getComputedStyle(el);
    var c = s.backgroundColor;
    if (c && c !== 'transparent' && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(c)) return c;
    var bi = s.backgroundImage;
    if (bi && bi !== 'none') {
      var m = bi.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/);
      if (m) return m[0];
    }
    return '';
  }
  function bgAt(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el.nodeType === 1) {
      var c = colorOf(el);
      if (c) return c;
      el = el.parentElement;
    }
    if (document.body) { var b = colorOf(document.body); if (b) return b; }
    var h = colorOf(document.documentElement);
    return h || themeColor() || '#ffffff';
  }
  var lastTop = '';
  var lastBottom = '';
  function sample() {
    try {
      var w = Math.max(1, Math.min(document.documentElement.clientWidth, innerWidth));
      var top = bgAt(w / 2, 1);
      if (top !== lastTop) { lastTop = top; N.__top(top); }
      var bottom = bgAt(w / 2, innerHeight - 2);
      if (bottom !== lastBottom) { lastBottom = bottom; N.__bottom(bottom); }
    } catch (e) { /* page en cours de construction */ }
  }
  var raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; sample(); }); }
  addEventListener('scroll', schedule, { passive: true, capture: true });
  addEventListener('resize', schedule, { passive: true });
  setInterval(sample, 800);
  // Changement de thème clair/sombre : reprendre tout de suite la couleur des barres.
  try {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var reSample = function () { lastTop = ''; lastBottom = ''; sample(); };
    if (mq.addEventListener) mq.addEventListener('change', reSample); else if (mq.addListener) mq.addListener(reSample);
  } catch (e) { /* matchMedia indisponible */ }
  sample();

  // Haut de page : autorise « tirer pour actualiser » seulement si rien n'a défilé sous le doigt.
  document.addEventListener('touchstart', function (e) {
    var top = (document.scrollingElement || document.documentElement).scrollTop <= 0;
    var el = e.target;
    while (top && el && el.nodeType === 1 && el !== document.body) {
      if (el.scrollTop > 0) top = false;
      el = el.parentElement;
    }
    N.__touchTop(top);
  }, { capture: true, passive: true });

  // Marge du haut pour le mode « barre d'état superposée ».
  try { document.documentElement.style.setProperty('--nexora-top', N.insetTop() + 'px'); document.documentElement.style.setProperty('--vitrine-top', N.insetTop() + 'px'); } catch (e) { /* ignore */ }
  document.documentElement.classList.add('nexora-app', 'vitrine-app');
  // Taille du texte : jamais agrandie par les réglages du téléphone (la page s'affiche comme sur le web).
  var st = document.createElement('style');
  st.textContent = 'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}';
  (document.head || document.documentElement).appendChild(st);
  try { window.dispatchEvent(new Event('nexoraready')); window.dispatchEvent(new Event('vitrineready')); } catch (e) { /* ignore */ }
})();
