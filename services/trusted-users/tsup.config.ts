import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/api.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
});
