/*
 * Mode web de NEXORA (#025) : chargé seulement par la version publiée (scripts/build-web.mjs), juste
 * après preview/bridge.js et avant les modules de l'interface. L'aperçu Figma Make reste en mode
 * bureau (« PC neuf ») et ne charge pas ce fichier.
 *
 * - `window.__NEXORA_WEB__` : mode prévu par NEXORA (connexion Supabase qui lit les liens des
 *   e-mails, liens de partage et d'invitation vers l'adresse de la page, ni mises à jour ni
 *   préparation des outils de développement).
 * - Élément `nx-webview` attendu par les appareils du Responsive Lab en mode web : une iframe qui
 *   imite la partie de l'API <webview> d'Electron dont ils se servent. Les sites qui refusent d'être
 *   affichés dans une iframe (X-Frame-Options, frame-ancestors) restent blancs, comme dans un
 *   navigateur.
 * - En mode web, dist/main.js ne lance pas le compte NEXORA (session, interface du compte,
 *   synchronisation) : ce fichier le lance au même moment que l'application de bureau, c'est-à-dire
 *   au moment où l'interface demande `app:info`. Les modules sont passés par `data-cloud` (noms à
 *   empreinte lus dans dist/main.js au moment de la publication).
 */
;(() => {
  if (!window.vitrine || window.__NEXORA_WEB__) return
  window.__NEXORA_WEB__ = true

  const script = document.currentScript
  const DESKTOP_ONLY =
    "Disponible uniquement dans l’application NEXORA pour Windows."

  // Compte NEXORA : mêmes appels que dist/main.js dans l'application de bureau.
  const cloud = ((script && script.dataset.cloud) || "")
    .split(",")
    .filter(Boolean)
  let cloudStarted = false
  const startCloud = () => {
    if (cloudStarted || cloud.length !== 3) return
    cloudStarted = true
    Promise.all(cloud.map((file) => import(new URL(file, location.href).href)))
      .then(async ([session, ui, sync]) => {
        ui.initCloudUi()
        sync.startSync()
        await session.initCloud()
      })
      .catch((err) => console.warn("[cloud]", err))
  }

  // Canaux appelés par les appareils du Responsive Lab. Sans processus principal, la page affichée
  // garde l'agent utilisateur et la densité d'écran du navigateur ; sa largeur est celle de l'appareil.
  const views = new Map()
  const WEB_HANDLERS = {
    "device:emulate": ({ wcId, emu } = {}) => {
      const view = views.get(wcId)
      if (view && emu) view.fit(emu)
      return true
    },
    "device:set-scale": () => true,
  }
  const bridgeInvoke = window.vitrine.invoke
  window.vitrine.invoke = (channel, ...args) => {
    if (channel === "app:info") setTimeout(startCloud, 0)
    const handler = WEB_HANDLERS[channel]
    if (handler) return Promise.resolve(handler(...args))
    return bridgeInvoke(channel, ...args)
  }

  let nextId = 1
  const event = (name, data) => Object.assign(new Event(name), data)

  class NxWebview extends HTMLElement {
    static get observedAttributes() {
      return ["src"]
    }

    constructor() {
      super()
      this.wcId = nextId++
      this.frame = null
      this.current = "about:blank"
      this.pending = null
      this.settle = null
    }

    connectedCallback() {
      views.set(this.wcId, this)
      if (!this.frame) {
        const frame = document.createElement("iframe")
        // Pas de navigation de la fenêtre de NEXORA par le site affiché (pas d'allow-top-navigation).
        frame.setAttribute(
          "sandbox",
          "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads",
        )
        frame.setAttribute("allow", "fullscreen; clipboard-write")
        frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin")
        frame.style.cssText =
          "display:block;width:100%;height:100%;border:0;background:#fff"
        frame.addEventListener("load", () => this.loaded())
        this.frame = frame
        this.append(frame)
      }
      // Comme une <webview> remise dans le document (changement de session de projet, #016).
      setTimeout(
        () => this.isConnected && this.dispatchEvent(event("dom-ready")),
      )
    }

    disconnectedCallback() {
      views.delete(this.wcId)
    }

    // L'appareil dessine l'élément à `scale` fois la taille de l'écran puis le réduit d'autant (écran
    // net en haute densité) : l'iframe garde la largeur CSS de l'appareil et est agrandie d'autant.
    fit({ width, height, scale = 1 }) {
      if (!this.frame || !(width > 0) || !(height > 0)) return
      Object.assign(this.frame.style, {
        width: `${width}px`,
        height: `${height}px`,
        transform: scale === 1 ? "" : `scale(${scale})`,
        transformOrigin: "0 0",
      })
    }

    attributeChangedCallback(name, before, value) {
      if (
        name === "src" &&
        value &&
        value !== "about:blank" &&
        value !== before
      )
        this.loadURL(value)
    }

    loaded() {
      const url = this.pending
      // Première page vide de l'iframe, avant tout chargement.
      if (!url && this.current === "about:blank") return
      if (url) {
        this.pending = null
        this.current = url
        this.dispatchEvent(event("did-navigate", { url, isMainFrame: true }))
      }
      this.dispatchEvent(event("dom-ready"))
      this.dispatchEvent(event("did-stop-loading"))
      this.dispatchEvent(event("did-finish-load"))
      const settle = this.settle
      this.settle = null
      if (settle) settle()
    }

    loadURL(url) {
      const target = String(url || "about:blank")
      if (this.settle) this.settle()
      this.pending = target
      this.dispatchEvent(event("did-start-loading"))
      return new Promise((resolve) => {
        this.settle = resolve
        if (this.frame) this.frame.src = target
        else this.setAttribute("src", target)
      })
    }

    reload() {
      if (this.current !== "about:blank") this.loadURL(this.current)
    }

    reloadIgnoringCache() {
      this.reload()
    }

    stop() {
      if (this.frame && this.pending) this.frame.src = this.current
    }

    getWebContentsId() {
      return this.wcId
    }

    getURL() {
      return this.current
    }

    getTitle() {
      return ""
    }

    isLoading() {
      return Boolean(this.pending)
    }

    canGoBack() {
      return false
    }

    canGoForward() {
      return false
    }

    // Le contenu d'un autre site n'est pas accessible depuis la page (même origine exigée).
    executeJavaScript() {
      return Promise.reject(new Error(DESKTOP_ONLY))
    }

    insertCSS() {
      return Promise.resolve("")
    }

    send() {}

    setZoomFactor() {}

    setAudioMuted() {}

    openDevTools() {}
  }

  if (!customElements.get("nx-webview"))
    customElements.define("nx-webview", NxWebview)
})()
