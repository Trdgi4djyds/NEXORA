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
    authenticate: function (reason) { return call('authenticate', [String(reason || 'Confirme ton identité')]); },
    requestPermission: function (name) { return call('requestPermission', [String(name)]); },
    pickContact: function () { return call('pickContact', []); },
    keepAwake: function (on) { N.keepAwake(!!on); },
    exit: function () { N.exit(); },
    // Dernière erreur de l'application (fermeture inattendue, moteur de page arrêté…), pour le diagnostic.
    lastError: function () { try { return N.lastError ? N.lastError() : ''; } catch (e) { return ''; } },
    // Notifications push (si l'application a été construite avec) : jeton de l'appareil, sujets, autorisation.
    push: {
      state: function () { try { return JSON.parse(N.pushState()); } catch (e) { return { enabled: false }; } },
      getToken: function (timeout) {
        var s = App.push.state();
        if (s.token) return Promise.resolve(s.token);
        if (!s.enabled) return Promise.reject(new Error('Notifications push non activées dans cette application'));
        return new Promise(function (res, rej) {
          var t = setTimeout(function () { window.removeEventListener('vitrinepush', on); rej(new Error(App.push.state().error || 'Jeton indisponible')); }, timeout || 15000);
          var on = function (e) { if (e.detail && e.detail.type === 'token') { clearTimeout(t); window.removeEventListener('vitrinepush', on); res(e.detail.token); } };
          window.addEventListener('vitrinepush', on);
        });
      },
      subscribe: function (topic) { return call('pushSubscribe', [String(topic), true]); },
      unsubscribe: function (topic) { return call('pushSubscribe', [String(topic), false]); },
      requestPermission: function () { return call('pushPermission', []).then(function (v) { return v === true || v === 'true'; }); },
      onMessage: function (cb) { window.addEventListener('vitrinepush', function (e) { if (e.detail && e.detail.type === 'message') cb(e.detail.message); }); },
      onToken: function (cb) { window.addEventListener('vitrinepush', function (e) { if (e.detail && e.detail.type === 'token') cb(e.detail.token); }); },
    },
  };
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
