import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** The demo site (`npm run dev`, `npm run build:demo`) */
export default defineConfig({
  root: 'demo',
  resolve: {
    alias: [
      { find: /^deep-glass$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
      { find: /^deep-glass\/style\.css$/, replacement: fileURLToPath(new URL('./src/deep-glass.css', import.meta.url)) },
    ],
  },
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
