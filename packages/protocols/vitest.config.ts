import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'protocols',
    include: ['test/**/*.test.ts'],
  },
});
