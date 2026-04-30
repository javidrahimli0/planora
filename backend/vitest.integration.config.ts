import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globals: true,
    clearMocks: true,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    testTimeout: 30000,
    setupFiles: ['tests/integration/setup.ts'],
  },
});