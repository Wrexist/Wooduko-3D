import { defineConfig } from 'vite';

export default defineConfig({
  base: './',            // relative paths so the build works inside Capacitor's WKWebView
  build: { chunkSizeWarningLimit: 900, target: 'es2019' }
});
