/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "1" in test builds (`npm run build:test`) to expose `window.__grain`. */
  readonly VITE_DEBUG_HOOKS?: string;
}
