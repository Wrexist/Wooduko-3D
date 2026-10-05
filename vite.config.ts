import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) }, // relative paths so the build works inside Capacitor's WKWebView
  build: { chunkSizeWarningLimit: 900, target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
