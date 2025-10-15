import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  server: {
    host: true,                // listen on all interfaces
    port: 5173,
    strictPort: true,
    allowedHosts: ['sinewy-yvette-overheavily.ngrok-free.dev'], // <- your ngrok host
    hmr: {
      protocol: 'wss',         // HMR over HTTPS tunnel
      host: 'sinewy-yvette-overheavily.ngrok-free.dev',
      port: 443
    }
  }
});
