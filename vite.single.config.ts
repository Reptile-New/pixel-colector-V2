import { defineConfig } from 'vite'

/**
 * Single-file build. Emits a classic (IIFE) script and one CSS file, which
 * `scripts/bundle-single.mjs` then inlines into one self-contained .html.
 *
 * IIFE rather than ESM on purpose: a `type="module"` script is subject to CORS
 * rules that browsers apply to `file://` origins, so the double-click-to-play
 * build would silently do nothing.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-single',
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'game.js',
        assetFileNames: 'game.[ext]',
      },
    },
  },
})
