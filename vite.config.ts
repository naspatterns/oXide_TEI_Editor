import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
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
