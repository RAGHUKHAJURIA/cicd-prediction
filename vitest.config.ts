import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    testTimeout: 15000,
    // Use tsx (already installed) as the transform runner for CJS projects
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--import', 'tsx/esm'],
      },
    },
  },
});
