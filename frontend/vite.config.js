import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Allow JSX inside .js files (custom feature components live in components/*.js
  // per the bespoke-feature spec, while the rest of the app uses .jsx).
  plugins: [react({ include: /\.(jsx?|tsx?)$/ })],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3091',
        changeOrigin: true,
      },
    },
  },
});
