/// <reference types="vite/client" />

/** App version from package.json, injected at build time (see electron.vite.config.ts) */
declare const __APP_VERSION__: string
/** ISO timestamp of the renderer build, injected at build time */
declare const __BUILD_DATE__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    Record<string, unknown>
  >
  export default component
}
