import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './', // relative paths so the build works inside Capacitor's WKWebView
  build: { chunkSizeWarningLimit: 900, target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
