import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'iife'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
  target: 'es2020',
  outDir: 'dist',
  // Generate UMD build for script tag usage
  globalName: 'VisitorContext',
  outExtension({ format }) {
    if (format === 'iife') {
      return { js: '.min.js' };
    }
    return { js: `.${format === 'cjs' ? 'cjs' : 'js'}` };
  },
});
