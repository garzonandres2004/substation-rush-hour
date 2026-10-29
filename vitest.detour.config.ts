import { defineConfig } from 'vitest/config';

// Runs DETOUR's own tests (copied unchanged from upstream with the code they cover) against the vendored
// code under src/detour.
export default defineConfig({
  test: { include: ['src/detour/**/*.spec.ts'], globals: true, environment: 'node' },
});
