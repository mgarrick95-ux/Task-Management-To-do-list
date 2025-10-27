import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: must match your repo name exactly (case-sensitive)
export default defineConfig({
  plugins: [react()],
  base: '/Task-Management-To-do-list/',
})
