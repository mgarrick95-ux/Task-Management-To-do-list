import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For GitHub Pages project sites. If assets 404 after deploy, change base to '/<REPO_NAME>/'
export default defineConfig({
  plugins: [react()],
  base: './',
})
