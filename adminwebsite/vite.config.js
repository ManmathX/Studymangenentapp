import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API allows this origin through CORS_ORIGINS (backend/.env), so keep the port fixed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
})
