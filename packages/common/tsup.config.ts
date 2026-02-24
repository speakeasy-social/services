import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  outDir: 'dist',
  treeshake: false,
  outExtension: () => ({ js: '.js' }),
});
