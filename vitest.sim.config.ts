import { defineConfig } from 'vitest/config';

// Bot playtest simulation (slow): `npm run sim`. Not part of `npm test`.
export default defineConfig({
  test: { include: ['tests/sim/**/*.sim.ts'], environment: 'node', testTimeout: 0 },
});
