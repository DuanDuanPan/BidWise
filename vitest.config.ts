import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: [
            'tests/unit/main/**/*.test.ts',
            'tests/unit/shared/**/*.test.ts',
            'tests/unit/preload/**/*.test.ts',
          ],
        },
        resolve: {
          alias: {
            '@main': resolve('src/main'),
            '@shared': resolve('src/shared'),
          },
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
        },
        resolve: {
          alias: {
            '@main': resolve('src/main'),
            '@shared': resolve('src/shared'),
          },
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/unit/renderer/**/*.test.ts', 'tests/unit/renderer/**/*.test.tsx'],
          setupFiles: ['tests/unit/renderer/setup.ts'],
          css: false,
        },
        resolve: {
          alias: {
            '@renderer': resolve('src/renderer/src'),
            '@shared': resolve('src/shared'),
            '@modules': resolve('src/renderer/src/modules'),
          },
        },
      },
    ],
  },
})
