import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // must match your repo name exactly (case-sensitive)
  base: '/Task-Management-To-do-list/',
})
