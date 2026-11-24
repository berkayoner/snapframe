import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  // Resolves WXT's path aliases and auto-imports, and provides an in-memory `browser` API.
  plugins: [WxtVitest()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
