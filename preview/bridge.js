/*
 * Pont de l'aperçu navigateur de NEXORA.
 *
 * Dans l'application Windows, nexora/app/preload.js expose `window.vitrine` : un pont IPC vers le
 * processus principal d'Electron (fichiers, SDK, fenêtres, Android…). L'aperçu Figma Make n'est
 * qu'un navigateur : ce script fournit la même API pour que l'interface démarre comme sur un PC
 * neuf (rien d'installé, aucun projet ouvert). Les fonctions qui exigent le bureau répondent par un
 * message clair au lieu de planter.
 *
 * Ce fichier n'est jamais inclus dans l'application Windows (scripts/pack-windows.mjs n'empaquette
 * que nexora/app).
 */
;(() => {
  // Dans Electron, preload.js a déjà fourni le vrai pont.
  if (window.vitrine) return

  const DESKTOP_ONLY =
    "Disponible uniquement dans l’application NEXORA pour Windows."
  const SETTINGS_KEY = "nexora-preview:settings"
  const script = document.currentScript
  const version = (script && script.dataset.version) || ""
  const previewFile = (name) =>
    new URL(name, script ? script.src : location.href).href

  // Boîtes de dialogue système (choisir un dossier, enregistrer un fichier…) : sur le bureau, une
  // annulation renvoie null, ce que l'interface gère partout. L'aperçu répond comme une annulation.
  const DIALOG_CHANNELS = new Set([
    "project:pick",
    "capture:save",
    "dialog:open-file",
    "media:pick",
    "mon:export-stack",
    "skins:import",
    "dev:pick-folder",
    "android:push-kit-dir-pick",
    "android:key-export",
    "backup:create",
    "backup:restore",
    "android:pick-dir",
    "android:pick-out",
    "android:pwa-pack",
    "lab:net-har",
    "lab:scrape-save",
    "lab:save-text",
    // Desktop Builder (NEXORA #023) : choix du dossier source, du dossier des fichiers, du certificat, export.
    "desktop:pick-source",
    "desktop:pick-out",
    "desktop:pick-cert",
    "desktop:export",
    // Espace Sécurité (NEXORA #048) : dossier du projet, application à auditer, rapport, export SARIF.
    "sec:pick-dir",
    "sec:pick-app",
    "sec:report-save",
    "sec:sarif-save",
  ])

  const listeners = new Map()
  const emit = (channel, data) => {
    for (const cb of listeners.get(channel) || []) {
      try {
        cb(data)
      } catch (err) {
        console.error(err)
      }
    }
  }

  // Notification au format de NEXORA (#toasts), seulement juste après un clic de l'utilisateur :
  // les appels faits en arrière-plan restent silencieux.
  const userActed = () =>
    !navigator.userActivation || navigator.userActivation.isActive
  const shownNotice = () =>
    [...document.querySelectorAll("#toasts .toast")].some((t) =>
      t.textContent.includes(DESKTOP_ONLY),
    )
  const showNotice = () => {
    const host = document.getElementById("toasts")
    if (!host || shownNotice()) return
    const toast = document.createElement("div")
    toast.className = "toast"
    toast.innerHTML =
      '<span class="tt"></span><button class="toast-x" aria-label="Fermer">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>'
    toast.querySelector(".tt").textContent = DESKTOP_ONLY
    toast.querySelector(".toast-x").onclick = () => toast.remove()
    host.append(toast)
    setTimeout(() => toast.classList.add("out"), 5500)
    setTimeout(() => toast.remove(), 5900)
  }

  const darkScheme = window.matchMedia("(prefers-color-scheme: dark)")
  darkScheme.addEventListener("change", (e) => emit("system:theme", e.matches))
  document.addEventListener("fullscreenchange", () =>
    emit("window:fullscreen", Boolean(document.fullscreenElement)),
  )

  const loadSettings = () => {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")
    } catch {
      return {}
    }
  }
  const openWebUrl = (url) => {
    if (!/^https?:\/\//i.test(String(url || ""))) throw new Error(DESKTOP_ONLY)
    window.open(String(url), "_blank", "noopener")
    return true
  }

  // Supervision (NEXORA #015) : mêmes valeurs par défaut que src/monitor.js (DEFAULTS, RANGES).
  const MON_SETTINGS = {
    confirm: 2,
    slowConfirm: 3,
    repeatMin: 60,
    certDays: 14,
    notifyRecovery: true,
    silenceUntil: 0,
  }
  const RANGE_MS = {
    "1h": 3600e3,
    "24h": 86400e3,
    "7j": 7 * 86400e3,
    "30j": 30 * 86400e3,
    "90j": 90 * 86400e3,
  }
  const NO_INCIDENT = {
    count: 0,
    down: 0,
    open: 0,
    downtime: 0,
    mttr: null,
    mtbf: null,
  }
  const emptyOverview = (range) => {
    const to = Date.now() + 1
    const from = to - (RANGE_MS[range] || RANGE_MS["24h"])
    return {
      now: Date.now(),
      range,
      from,
      to,
      step: Math.ceil((to - from) / 60),
      settings: { ...MON_SETTINGS },
      sites: [],
      totals: {
        sites: 0,
        active: 0,
        up: 0,
        down: 0,
        slow: 0,
        paused: 0,
        avail: null,
        checks: 0,
        fails: 0,
        p95: null,
        certSoon: 0,
        coverage: null,
        incidents: NO_INCIDENT,
      },
      incidents: [],
    }
  }

  // Santé de NEXORA (src/telemetry.js, SERVICES et snapshot()) : services vérifiés depuis la page.
  const SERVICES = [
    { id: "auth", label: "Comptes et connexion", path: "/auth/v1/health" },
    {
      id: "db",
      label: "Données",
      path: "/rest/v1/plans?select=id&limit=1",
    },
    {
      id: "storage",
      label: "Stockage des fichiers",
      path: "/storage/v1/status",
    },
    {
      id: "functions",
      label: "Fonctions serveur",
      path: "/functions/v1/site-info",
      method: "OPTIONS",
    },
    {
      id: "realtime",
      label: "Temps réel (synchronisation)",
      ws: "/realtime/v1/websocket",
    },
  ]
  const startedAt = Date.now()
  const telemetry = { config: null, services: {}, checkedAt: 0 }
  const timed = (fn) => {
    const t0 = performance.now()
    return fn().then((status) => ({
      status,
      ms: Math.round(performance.now() - t0),
    }))
  }
  const wsOpen = (url) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error("délai dépassé"))
      }, 15000)
      ws.onopen = () => {
        clearTimeout(timer)
        ws.close()
        resolve(101)
      }
      ws.onerror = () => {
        clearTimeout(timer)
        reject(new Error("connexion refusée"))
      }
    })
  const checkServices = async () => {
    const cfg = telemetry.config
    if (!cfg) return
    telemetry.checkedAt = Date.now()
    const base = String(cfg.url).replace(/\/+$/, "")
    const headers = { apikey: cfg.key, authorization: `Bearer ${cfg.key}` }
    await Promise.all(
      SERVICES.map(async (sv) => {
        const t = Date.now()
        let rec
        try {
          const r = await timed(() =>
            sv.ws
              ? wsOpen(
                  `${base.replace(/^http/, "ws")}${sv.ws}?apikey=${encodeURIComponent(cfg.key)}&vsn=1.0.0`,
                )
              : fetch(`${base}${sv.path}`, {
                  method: sv.method || "GET",
                  headers,
                }).then((res) => res.status),
          )
          const ok = r.status < 400
          rec = {
            t,
            ok,
            ms: r.ms,
            status: r.status,
            error: ok ? "" : `réponse ${r.status}`,
          }
        } catch (err) {
          rec = {
            t,
            ok: false,
            ms: null,
            status: 0,
            error: String((err && err.message) || "injoignable"),
          }
        }
        ;(telemetry.services[sv.id] = telemetry.services[sv.id] || []).push(rec)
      }),
    )
  }
  const servicesView = () =>
    SERVICES.map((sv) => {
      const list = telemetry.services[sv.id] || []
      const ok = list.filter((r) => r.ok)
      const ms = ok.map((r) => r.ms).sort((a, b) => a - b)
      return {
        id: sv.id,
        label: sv.label,
        last: list[list.length - 1] || null,
        avail: list.length
          ? Math.round((ok.length / list.length) * 1000) / 10
          : null,
        p95: ms.length
          ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))]
          : null,
        series: list.slice(-240),
      }
    })
  const telSnapshot = async () => {
    if (telemetry.config && Date.now() - telemetry.checkedAt > 60000)
      await checkServices()
    const now = Date.now()
    return {
      now,
      app: {
        version,
        electron: "",
        chrome: (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || "",
        node: "",
        platform: "win32",
        arch: "x64",
        os: "Aperçu dans le navigateur",
        cpuModel: "",
        cpus: navigator.hardwareConcurrency || 0,
        totalMem: (navigator.deviceMemory || 0) * 1024,
        startedAt,
        uptime: now - startedAt,
      },
      groups: {
        main: "Processus principal",
        window: "Interface",
        webview: "Sites affichés",
        gpu: "Carte graphique",
        other: "Services",
      },
      current: null,
      samples: [],
      minutes: [],
      events: [],
      sessions: [
        { start: startedAt, end: null, version, errors: 0, crashes: 0 },
      ],
      services: servicesView(),
      servicesReady: Boolean(telemetry.config),
      counters: {
        errors24h: 0,
        crashes7d: 0,
        sessions7d: 1,
        avgSession: null,
      },
    }
  }

  // Mode démonstration (option --demo de pnpm captures) : canaux mon:/tel: exécutés par le vrai code du
  // processus principal dans le serveur d'aperçu (preview/demo-main.mjs), évènements en direct compris.
  const DEMO_MODE = (() => {
    try {
      return localStorage.getItem("nexora-preview:demo")
    } catch {
      return null
    }
  })()
  const DEMO = DEMO_MODE === "supervision"
  // NEXORA #052 : mode démonstration du Dev Lab (option --demo-dev de pnpm captures) : canaux dev:, git: et
  // devx: (et gh:, tunnel:) servis par le vrai code du processus principal sur un projet de démonstration (preview/demo-dev.mjs).
  const DEMO_DEV = DEMO_MODE === "devlab"
  const demoInvoke = (channel, args) =>
    fetch(previewFile("main"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel, args }),
    })
      .then((r) => r.json())
      .then((out) => {
        if (!out.ok) throw new Error(out.error)
        return out.value
      })
  if ((DEMO || DEMO_DEV) && typeof EventSource === "function") {
    const source = new EventSource(
      previewFile("events") + (DEMO_DEV ? "?dev=1" : ""),
    )
    source.onmessage = (ev) => {
      try {
        const { channel, data } = JSON.parse(ev.data)
        emit(channel, data)
      } catch {
        // Message illisible : ignoré.
      }
    }
  }

  // Mêmes formes de réponse que nexora/app/main.js et nexora/app/src/**/ipc.js sur un PC neuf.
  // NEXORA #017 : images de la fiche Play Store (src/android/listing.js, ListingAssets). Sur le bureau, elles
  // sont rangées par application sur le disque ; l'aperçu les garde en mémoire le temps de la page.
  const LISTING_KINDS = [
    "icon",
    "featureGraphic",
    "phoneScreenshots",
    "sevenInchScreenshots",
    "tenInchScreenshots",
  ]
  const listingStore = new Map()
  const listingOf = (appId) => {
    if (!listingStore.has(appId)) listingStore.set(appId, {})
    const s = listingStore.get(appId)
    for (const k of LISTING_KINDS) s[k] = s[k] || []
    return s
  }
  const listingCopy = (appId) =>
    Object.fromEntries(
      Object.entries(listingOf(appId)).map(([k, v]) => [k, [...v]]),
    )
  const imageSize = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => reject(new Error("Image illisible."))
      img.src = src
    })
  const handlers = {
    "settings:load": loadSettings,
    "settings:save": (data) => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(data || {}))
      } catch {
        // Stockage plein ou bloqué : les réglages ne survivront pas au rechargement.
      }
      return true
    },
    "app:info": () => ({ version, platform: "win32", autotest: null }),
    "system:dark": () => darkScheme.matches,
    "window:titlebar": () => undefined,
    "window:zoom": () => undefined,
    "window:fullscreen": (on) => {
      const el = document.documentElement
      const action = on
        ? el.requestFullscreen && el.requestFullscreen()
        : document.fullscreenElement && document.exitFullscreen()
      return Promise.resolve(action).then(
        () => undefined,
        () => undefined,
      )
    },
    "clipboard:write": (text) =>
      navigator.clipboard.writeText(String(text ?? "")).then(() => true),
    "clipboard:read": () => navigator.clipboard.readText().catch(() => ""),
    "shell:external": openWebUrl,
    "shell:open": openWebUrl,
    "skins:list": () => ({}),
    "android:tab-icons": () =>
      fetch(previewFile("tab-icons.json")).then((r) => (r.ok ? r.json() : {})),
    "dev:templates": () =>
      fetch(previewFile("dev-templates.json")).then((r) =>
        r.ok ? r.json() : [],
      ),
    // PC neuf : aucun dossier de projet n'existe encore, le nom demandé est libre (nettoyé comme sur le bureau).
    "dev:free-name": ({ name } = {}) =>
      String(name || "")
        .trim()
        .replace(/[<>:"/\\|?*]+/g, "-") || "mon-site",
    "android:tools": () => ({
      buildTools: null,
      platform: null,
      platformTools: null,
      java: null,
      bundletool: null,
      missing: ["build-tools", "platform", "java"],
      ready: false,
      home: "",
      licenseUrl: "https://developer.android.com/studio/terms",
      targetApi: 36,
      permissions: {},
    }),
    "android:push-status": () => ({
      installed: false,
      serviceAccount: false,
      dir: "",
      customDir: false,
    }),
    // NEXORA #017 : fiche Play Store (src/android/ipc.js). Aucune clé de compte de service sur un PC neuf.
    "android:play-status": () => ({ serviceAccount: false }),
    // NEXORA #019 : kit d'achats intégrés pas encore préparé sur un PC neuf (src/android/billing.js, status()).
    "android:billing-status": () => ({ installed: false, dir: "" }),
    // NEXORA #115 : modules de l'App Builder (kits jamais préparés dans l'aperçu : « Préparer maintenant » proposé).
    "android:module-status": () => ({
      onesignal: { installed: false, label: "OneSignal", size: "≈ 6 Mo" },
      admob: { installed: false, label: "Google AdMob", size: "≈ 8 Mo" },
      analytics: { installed: false, label: "Google Analytics", size: "≈ 3 Mo" },
      meta: { installed: false, label: "Meta", size: "≈ 2 Mo" },
    }),
    "android:listing-assets": (appId) => listingCopy(appId),
    "android:listing-asset-put": async ({ appId, kind, dataUrl, replace }) => {
      const s = listingOf(appId)
      const one = kind === "icon" || kind === "featureGraphic"
      if (!LISTING_KINDS.includes(kind)) throw new Error("Emplacement inconnu.")
      if (!one && !replace && s[kind].length >= 8)
        throw new Error("8 images au maximum.")
      const { w, h } = await imageSize(dataUrl)
      const im = {
        id: `${kind}-${Date.now().toString(36)}`,
        w,
        h,
        size: Math.round((dataUrl.length * 3) / 4),
        dataUrl,
      }
      s[kind] = one || replace ? [im] : [...s[kind], im]
      return listingCopy(appId)
    },
    "android:listing-asset-del": ({ appId, kind, id }) => {
      const s = listingOf(appId)
      s[kind] = s[kind].filter((im) => im.id !== id)
      return listingCopy(appId)
    },
    "android:listing-asset-move": ({ appId, kind, id, delta }) => {
      const list = listingOf(appId)[kind]
      const i = list.findIndex((im) => im.id === id)
      const j = i + Number(delta || 0)
      if (i >= 0 && j >= 0 && j < list.length)
        [list[i], list[j]] = [list[j], list[i]]
      return listingCopy(appId)
    },
    "dev:vscode-status": () => ({
      installed: null,
      own: null,
      cli: null,
      accepted: false,
      running: false,
      url: null,
    }),
    // NEXORA #120 : démarrage anticipé de Code Editor au lancement : rien à démarrer dans l'aperçu.
    "dev:vscode-warm": () => ({ warmed: false }),
    // NEXORA #120 : App Builder, projet à serveur (scripts/reglages-captures/app-laravel.json) : un dossier dont le
    // nom contient « laravel » est un projet Laravel + Inertia + Vue prêt, sans fichiers construits ; le serveur de
    // test est simulé (journal de construction puis adresse sur le réseau local), sans rien lancer.
    "android:inspect-dir": (dir) => {
      const name = String(dir || "").split(/[\\/]/).pop() || "projet"
      const laravel = /laravel/i.test(String(dir || ""))
      return {
        ok: true, dir, www: null, candidates: [], canBuild: true, flutter: false, name,
        server: laravel ? { kind: "laravel", label: "Laravel + Inertia + Vue", name: "Laravel", php: true, vite: true, canServe: true } : null,
      }
    },
    "android:server-check": (dir) => ({
      server: /laravel/i.test(String(dir || "")) ? { kind: "laravel", label: "Laravel + Inertia + Vue", name: "Laravel", php: true, vite: true, canServe: true } : null,
      php: { path: "C:\\laragon\\bin\\php\\php-8.3.14-Win32-vs16-x64\\php.exe", version: "8.3.14" },
      checks: { vendor: true, env: true, envExample: true, key: true, built: Boolean(window.__nxDemoServer), hot: false, nodeModules: true },
      running: window.__nxDemoServer || null,
      addresses: [{ name: "Wi-Fi", address: "192.168.1.20" }],
    }),
    "android:server-start": () => new Promise((resolve) => {
      const lines = ["Fichiers de l’interface absents (public/build) : construction avec Vite.", "> npm run build", "vite v6.1.1 building for production...", "✓ 1032 modules transformed.", "public/build/manifest.json  0.78 kB", "✓ built in 6.42s", "> php.exe artisan serve --host=0.0.0.0 --port=8000  (PHP 8.3.14)", "INFO  Server running on [http://0.0.0.0:8000]."]
      lines.forEach((l, i) => setTimeout(() => emit("android:log", l), 120 * i))
      setTimeout(() => {
        window.__nxDemoServer = {
          running: true, kind: "laravel", label: "Laravel + Inertia + Vue", port: 8000, local: "http://127.0.0.1:8000/",
          url: "http://192.168.1.20:8000/", addresses: [{ name: "Wi-Fi", url: "http://192.168.1.20:8000/" }], since: new Date().toISOString(),
        }
        resolve(window.__nxDemoServer)
      }, 120 * lines.length + 200)
    }),
    "android:server-stop": () => { window.__nxDemoServer = null; return true },
    "tunnel:list": () => ({
      tunnels: [],
      names: [],
      relay: false,
      system: false,
      cloudflared: false,
    }),
    // Supervision (onglet de Sécurité) : aucun site surveillé ni canal d'alerte sur un PC neuf
    // (src/monitor.js, config() et summary()), réglages des alertes par défaut, aucun incident ni
    // test de charge (NEXORA #015 : overview(), incidentsQuery(), src/loadtest.js history()).
    // NEXORA #030 : session du compte pour les alertes e-mail (gardée par le processus principal) : rien
    // à garder dans un navigateur.
    "mon:cloud-session": () => false,
    // NEXORA #037 : offre vue par le processus principal (src/plan.js) ; sans compte transmis, offre Gratuite.
    "plan:status": () => ({
      plan: "free",
      plan_name: "Gratuit",
      admin: false,
      perms: {},
      limits: {},
      usage: {},
      source: "invite",
      at: Date.now(),
      gates: 41,
    }),
    "plan:refresh": () => ({
      plan: "free",
      plan_name: "Gratuit",
      admin: false,
      perms: {},
      limits: {},
      usage: {},
      source: "invite",
      at: Date.now(),
    }),
    // NEXORA #076 : licence (src/license.js) : l'aperçu n'est pas l'application empaquetée, rien n'est verrouillé.
    // Pour voir un écran de verrouillage : localStorage « nexora-preview:licence » = état JSON ({"status":"auth"}…).
    "license:state": () => {
      try {
        const forced = JSON.parse(localStorage.getItem("nexora-preview:licence") || "null")
        if (forced) return { active: true, site: "https://nexoradevs.online/licence", ...forced }
      } catch { /* état simulé invalide */ }
      return { status: "ok", active: false, dev: true }
    },
    "license:check": () => handlers["license:state"](),
    "license:log": () => true,
    // NEXORA #112 : « Passer à Pro » (nx/offres/upsell.js, nx/licence) : page « Ma licence » du site dans un nouvel
    // onglet, comme src/license.js dans le navigateur du PC (aperçu et NEXORA web, sans demande au support).
    "license:open-site": (hash = "") => {
      window.open(`https://nexoradevs.online/${String(hash || "licence").replace(/^#?\/?/, "")}`, "_blank", "noopener")
      return true
    },
    // NEXORA #076 : fichiers .novx : aucun fichier reçu au lancement, Google Drive pour ordinateur absent.
    "novx:pending": () => null,
    "novx:drive": () => ({ folders: [], web: "https://drive.google.com/drive/my-drive" }),
    // NEXORA #053 : NEX-DESIGN, onglet Importer : aucun jeton Figma enregistré sur un PC neuf
    // (src/designplus/ipc.js, dzx:figma-token sans argument).
    "dzx:figma-token": () => ({ saved: false }),
    // NEXORA #054 : PDF vectoriel : pas de téléchargement de police dans l'aperçu (polices livrées seulement).
    "dzx:font-ttf": () => null,
    "mon:config": () => ({
      endpoints: [],
      channels: { email: { enabled: false } },
      settings: { ...MON_SETTINGS },
    }),
    "mon:summary": () => [],
    "mon:settings": () => ({ ...MON_SETTINGS }),
    "mon:overview": ({ range = "24h" } = {}) => emptyOverview(range),
    "mon:incidents": ({ range = "30j" } = {}) => {
      const to = Date.now() + 1
      return {
        from: to - (RANGE_MS[range] || RANGE_MS["30j"]),
        to,
        list: [],
        stats: NO_INCIDENT,
      }
    },
    "mon:alerts-log": () => [],
    // NEXORA #048 : maintenance et repères de déploiement (src/monitor.js), aucun sur un PC neuf.
    "mon:maintenance": () => [],
    "mon:marks": () => [],
    // Espace Sécurité (src/securite/index.js) : aucun audit, risque accepté ni audit programmé sur un PC neuf.
    "sec:history": () => [],
    "sec:latest": () => null,
    "sec:accepted": () => [],
    "sec:schedules": () => [],
    "sec:summary": () => ({ latest: [], accepted: [], schedules: [] }),
    "mon:loadtests": () => [],
    "mon:loadtest-running": () => false,
    // Santé de NEXORA (src/telemetry.js) : pas de relevé des processus dans un navigateur ; les services
    // en ligne de NEXORA sont vérifiés pour de vrai depuis la page (mêmes adresses que le bureau).
    "tel:services-config": (cfg) => {
      telemetry.config = cfg && cfg.url && cfg.key ? cfg : null
      return Boolean(telemetry.config)
    },
    "tel:check-services": () => checkServices().then(servicesView),
    "tel:snapshot": () => telSnapshot(),
    "tel:clear-events": () => true,
    // Volet GitHub du Dev Lab : aucun compte connecté sur un PC neuf (src/dev/git.js, me()).
    "git:me": () => null,
    // NEXORA #016 : session web du projet ouvert (src/isolation.js, activate) ; rien à effacer dans l'aperçu.
    "project:isolate": ({ part } = {}) => part,
    "project:isolation-drop": () => false,
    // Gestionnaire d'outils : aucun outil installé sur un PC neuf (src/tools.js, status()).
    "tools:status": () =>
      fetch(previewFile("dev-tools.json")).then((r) =>
        r.ok ? r.json() : { platform: "win32", tools: [] },
      ),
    // Desktop Builder (NEXORA #023) : ni Node.js, ni kit, ni moteur Electron sur un PC neuf
    // (src/desktop/builder.js, status()) ; aucun certificat de signature enregistré (certInfo()).
    "desktop:status": () =>
      fetch(previewFile("desktop-status.json")).then((r) =>
        r.ok
          ? r.json()
          : {
              platform: "win32",
              node: { ok: false },
              kit: {},
              electron: { cached: [] },
            },
      ),
    "desktop:cert-info": () => ({ ok: false }),
    // NEXORA #058 : PC neuf, aucun jeton GitHub ni identifiant Azure enregistré.
    "desktop:gh-token-info": () => ({ ok: false }),
    "desktop:azure-info": () => ({ ok: false }),
    // Calendrier des versions d'Electron : lu en ligne par le processus principal, absent de l'aperçu.
    "desktop:electron-support": () => ({ error: "Calendrier lu par l’application NEXORA pour Windows.", newest: "", versions: {} }),
  }

  window.vitrine = {
    platform: "win32",
    chromeVersion:
      (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || "",
    invoke(channel, ...args) {
      if (
        DEMO &&
        /^(mon|tel|sec):/.test(channel) &&
        !DIALOG_CHANNELS.has(channel)
      )
        return demoInvoke(channel, args)
      if (
        DEMO_DEV &&
        /^(dev|git|devx|gh|tunnel):/.test(channel) &&
        !DIALOG_CHANNELS.has(channel)
      )
        return demoInvoke(channel, args)
      const handler = handlers[channel]
      if (!handler) {
        const acted = userActed()
        if (DIALOG_CHANNELS.has(channel)) {
          if (acted) showNotice()
          return Promise.resolve(null)
        }
        // L'interface affiche souvent elle-même le message d'erreur ; sinon, l'aperçu l'affiche.
        if (acted) setTimeout(showNotice, 250)
        return Promise.reject(new Error(DESKTOP_ONLY))
      }
      try {
        return Promise.resolve(handler(...args))
      } catch (err) {
        return Promise.reject(err)
      }
    },
    on(channel, cb) {
      if (!listeners.has(channel)) listeners.set(channel, new Set())
      listeners.get(channel).add(cb)
      return () => listeners.get(channel).delete(cb)
    },
    pathForFile() {
      return ""
    },
  }
})()
