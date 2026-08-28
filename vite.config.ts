import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    // Keep the warning meaningful: Three.js is intentionally isolated into its
    // own cacheable vendor chunk, while game code should remain small.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
