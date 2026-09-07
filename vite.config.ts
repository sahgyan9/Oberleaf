import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'monaco-editor/esm/vs/editor/editor.api.js': path.resolve(__dirname, './node_modules/monaco-editor/esm/vs/editor/editor.api.js'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'lucide-react',
      'clsx',
      'tailwind-merge',
      'katex',
      'pdfjs-dist',
      '@monaco-editor/react',
      'yjs',
      'y-monaco',
      'y-webrtc',
    ],
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            // Gracefully handle transient ECONNREFUSED during server boot or restart
            if ((err as any).code === 'ECONNREFUSED') {
              if (res && 'writeHead' in res && !(res as any).headersSent) {
                (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                (res as any).end(JSON.stringify({ error: 'Backend server warming up...', code: 'SERVER_BOOTING' }));
              }
              return;
            }
          });
        },
      },
    },
  },
});
