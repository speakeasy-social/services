import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/api.ts'],
  format: ['esm'],
  target: 'node20',
  sourcemap: true,
  clean: true,
  dts: true,
  splitting: false,
  bundle: true,
  minify: false,
  external: ['@speakeasy-services/common', '@speakeasy-services/crypto'],
});
