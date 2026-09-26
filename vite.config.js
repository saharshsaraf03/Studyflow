import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Fail instead of silently moving to 3001: Google sign-in redirects back to this
    // exact origin, and Cognito rejects any port not in its allowed callback URLs.
    strictPort: true,
    open: true
  }
})
