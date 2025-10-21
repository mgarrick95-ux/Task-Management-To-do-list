import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: Set 'base' to your repo name for GitHub Pages
// Example: https://<user>.github.io/<repo>/ -> base should be '/<repo>/'
export default defineConfig({
  plugins: [react()],
  base: '/Task-Management-To-do-list/',
})
