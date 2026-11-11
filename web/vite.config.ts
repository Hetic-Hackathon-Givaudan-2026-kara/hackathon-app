import { defineConfig } from 'vite';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  server: {
    // Toutes les interfaces, comme --host : par défaut, Vite n'écoute que sur
    // localhost, et le port n'est pas joignable hors du conteneur
    host: true,
    // Dans Compose, API_PROXY_TARGET vaut http://api:3000. Hors Docker, localhost est le repli.
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
