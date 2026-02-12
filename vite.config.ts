import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  esbuild: {
    drop: ['console', 'debugger'],  // Remove console.* and debugger in production
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: [
            '@codemirror/lang-xml',
            '@codemirror/autocomplete',
            '@codemirror/lint',
            '@codemirror/view',
            '@codemirror/state',
            'codemirror',
            '@uiw/react-codemirror',
          ],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
