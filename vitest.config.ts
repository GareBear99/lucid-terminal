import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment: the command router / tool registry run in the
    // Electron main process, not a browser.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // The existing tests use Jest-style globals (describe/test/expect)
    // without importing them; enable vitest globals so they run as-is.
    globals: true,
    // The router/tool tests are deterministic and fast; 10s is generous.
    testTimeout: 10000,
  },
});
