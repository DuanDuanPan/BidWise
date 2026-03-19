import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
        '@resources': resolve('resources'),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@modules': resolve('src/renderer/src/modules'),
      },
    },
    plugins: [react()],
  },
})
// Note: electron-vite 5 no longer needs externalizeDepsPlugin, build.externalizeDeps is enabled by default
