import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Using base:'./' makes built asset paths relative—works on GitHub Pages project sites.
export default defineConfig({
  plugins: [react()],
  base: './',
})
