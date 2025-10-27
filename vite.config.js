import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Task-Management-To-do-list/', // must match your GitHub repo name exactly
})
