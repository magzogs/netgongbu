import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'trace',
    include: ['test/**/*.test.ts'],
  },
});
