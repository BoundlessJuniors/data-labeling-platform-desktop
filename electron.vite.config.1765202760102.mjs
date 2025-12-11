// electron.vite.config.ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
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
    plugins: [
      vue(),
      svgLoader({
        svgo: true,
        svgoConfig: {
          plugins: [
            // ikon içindeki sabit fill/stroke’ları kaldır ki currentColor çalışsın
            { name: 'removeAttrs', params: { attrs: '(fill|stroke)' } },
            { name: 'removeDimensions', active: true }
          ]
        }
      })
    ]
  }
})
export { electron_vite_config_default as default }
