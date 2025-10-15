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
    host: 'localhost',        // listen on localhost only
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',         // HMR over regular WebSocket
      host: 'localhost',
      port: 5173
    }
  }
});
