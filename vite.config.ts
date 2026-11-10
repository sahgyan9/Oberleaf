import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Monaco's package entry registers ~80 built-in languages plus the CSS, HTML,
// JSON and TypeScript language services and an LSP client. The editor only
// uses its own `latex` language (src/utils/latexLanguage.ts), so the build
// drops those imports: fewer chunks and workers to emit, a faster `vite build`
// (which the launcher runs after every update) and a smaller editor chunk.
// Dependency pre-bundling in dev does not run this plugin; dev keeps the full
// package.
const MONACO_ENTRY = /monaco-editor[\\/]esm[\\/]vs[\\/](index|editor[\\/]editor\.main)\.js$/;
const MONACO_UNUSED = /languages\/(definitions|features)\/|monaco-lsp-client|^export \{ (index as lsp|__src_languages)/;

function monacoLatexOnly(): Plugin {
  return {
    name: 'oberleaf:monaco-latex-only',
    enforce: 'pre',
    apply: 'build',
    transform(code, id) {
      if (!MONACO_ENTRY.test(id)) return null;
      const kept = code.split('\n').filter((line) => !MONACO_UNUSED.test(line));
      return { code: kept.join('\n'), map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), monacoLatexOnly()],
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
        // Stamp X-Forwarded-For. Without it every proxied request reaches the
        // API as loopback and a LAN visitor would be treated as the local
        // owner, bypassing the session token (see server/auth.ts).
        xfwd: true,
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
