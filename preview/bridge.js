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

  // Mêmes formes de réponse que nexora/app/main.js et nexora/app/src/**/ipc.js sur un PC neuf.
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
    "dev:vscode-status": () => ({
      installed: null,
      own: null,
      cli: null,
      accepted: false,
      running: false,
      url: null,
    }),
    "tunnel:list": () => ({
      tunnels: [],
      names: [],
      relay: false,
      system: false,
      cloudflared: false,
    }),
    // Supervision (onglet de Sécurité) : aucun site surveillé ni canal d'alerte sur un PC neuf
    // (src/monitor.js, config() et summary()).
    "mon:config": () => ({ endpoints: [], channels: {} }),
    "mon:summary": () => [],
  }

  window.vitrine = {
    platform: "win32",
    chromeVersion:
      (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || "",
    invoke(channel, ...args) {
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
