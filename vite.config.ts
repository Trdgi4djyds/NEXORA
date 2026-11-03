import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import { nexoraPreview } from "./preview/server.mjs"

// Vite sert uniquement l'aperçu navigateur de NEXORA (voir preview/server.mjs) : l'interface est
// déjà compilée, elle est servie telle quelle, sans bundling. `pnpm build` passe par
// scripts/build-web.mjs. Le back office web (admin/, React) est servi par Vite sous /admin/.
export default defineConfig({
  base: process.env.FIGMA_PUBLIC_URL ? `${process.env.FIGMA_PUBLIC_URL}/` : "/",
  publicDir: false,
  plugins: [nexoraPreview(), react(), figmaErrorOverlayReplay()],
  optimizeDeps: {
    noDiscovery: true,
    // Dépendances du back office, pré-assemblées (pas de découverte automatique dans ce projet).
    include: [
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom/client",
      "@supabase/supabase-js",
    ],
  },
  server: {
    host: process.env.FIGMA_DEV_SERVER_HOST || "0.0.0.0",
    port: parseInt(process.env.PORT || "8443"),
    strictPort: true,
    watch: {
      ignored: [
        "**/.figma/**",
        "**/dist/**",
        "**/nexora/NEXORA-win32-x64/**",
        "**/nexora/*.zip",
      ],
    },
  },
  preview: {
    host: process.env.FIGMA_DEV_SERVER_HOST || "0.0.0.0",
    port: parseInt(process.env.PORT || "8443"),
  },
})

/**
 * Replay the most recent build error to clients that connect after
 * it was first broadcast. Vite buffers an error payload only while
 * no clients are connected and clears the buffer on the first
 * reconnect (see `bufferedMessage` in `createWebSocketServer`), so
 * if the preview iframe reloads after Vite already delivered an
 * error to a live socket, the new socket misses the payload and
 * the overlay stays hidden even though the build is still broken.
 * We intercept `ws.send` to remember the latest error and replay
 * it on every new connection; the cache clears on a successful
 * `update` or `full-reload` so a stale overlay can't survive a
 * fixed build.
 */
function figmaErrorOverlayReplay(): Plugin {
  return {
    name: "figma-error-overlay-replay",
    apply: "serve",
    configureServer(server) {
      let lastError: object | null = null

      const origSend = server.ws.send.bind(server.ws) as (
        ...args: any[]
      ) => void
      server.ws.send = (((...args: any[]) => {
        const payload = args[0]
        if (payload && typeof payload === "object" && !Array.isArray(payload)) {
          const type = (payload as { type?: string }).type
          if (type === "error") {
            lastError = (payload as object)
          } else if (type === "update" || type === "full-reload") {
            lastError = null
          }
        }
        return origSend(...args)
      }) as typeof server.ws.send)

      server.ws.on("connection", (socket) => {
        if (lastError !== null) {
          socket.send(JSON.stringify(lastError))
        }
      })
    },
  }
}
