import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/backend/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
