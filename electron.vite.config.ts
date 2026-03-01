import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          samWorker: resolve('src/main/workers/samWorker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue(),
      svgLoader({
        svgo: true,
        svgoConfig: {
          plugins: [
            // ikon içindeki sabit fill/stroke’ları kaldır ki currentColor çalışsın
            { name: 'removeAttrs', params: { attrs: '(fill|stroke)' } },
            { name: 'removeDimensions' }
          ]
        }
      })]
  }
})
