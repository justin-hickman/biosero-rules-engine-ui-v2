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
    host: '0.0.0.0',          // listen on all interfaces to allow ngrok
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'localhost',
      'sinewy-yvette-overheavily.ngrok-free.dev',
      '.ngrok-free.dev'       // Allow all ngrok subdomains
    ],
    hmr: {
      protocol: 'ws',         // HMR over regular WebSocket
      host: 'localhost',
      port: 5173
    }
  }
});
