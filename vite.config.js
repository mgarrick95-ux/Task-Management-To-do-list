import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For GitHub Pages project sites, relative base prevents asset 404s.
export default defineConfig({
  plugins: [react()],
  base: './',
})
