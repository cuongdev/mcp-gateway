import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/storage/**', 'src/identity/**', 'src/middleware/auth/**', 'src/utils/**'],
    },
    testTimeout: 10000,
  },
});
