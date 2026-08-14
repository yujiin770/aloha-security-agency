import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Rolldown (Vite 8) takes only the function form of manualChunks.
        // Splitting these two out keeps them cached across app deploys.
        manualChunks(id) {
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('framer-motion') || id.includes('motion-dom')) return 'motion'
          return undefined
        },
      },
    },
  },
})
