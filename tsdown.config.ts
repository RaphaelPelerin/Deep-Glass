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
  // <script> tag build: global `Vitre`, glass applied to the page on load
  {
    entry: { vitre: 'src/cdn.ts' },
    format: 'iife',
    globalName: 'Vitre',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    dts: false,
    clean: false,
    outputOptions: { entryFileNames: '[name].iife.js' },
  },
]);
