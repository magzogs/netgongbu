import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'llm',
    include: ['test/**/*.test.ts'],
  },
});
