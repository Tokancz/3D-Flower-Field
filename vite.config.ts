import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages servíruje web v podsložce: tokancz.github.io/3D-Flower-Field/
  // → při buildu musí všechny cesty začínat /3D-Flower-Field/.
  // Při `npm run dev` necháme '/', ať je adresa pořád localhost:5173/
  base: command === 'build' ? '/3D-Flower-Field/' : '/',
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
