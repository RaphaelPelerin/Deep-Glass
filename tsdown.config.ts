import { defineConfig } from 'tsdown';

export default defineConfig([
  // ES module for bundlers, with types
  {
    entry: { index: 'src/index.ts' },
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    dts: true,
    clean: false,
  },
  // <script> tag build: global `DeepGlass`, glass applied to the page on load
  {
    entry: { 'deep-glass': 'src/cdn.ts' },
    format: 'iife',
    globalName: 'DeepGlass',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    dts: false,
    clean: false,
    outputOptions: { entryFileNames: '[name].iife.js' },
  },
]);
