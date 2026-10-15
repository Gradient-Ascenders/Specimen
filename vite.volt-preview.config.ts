import { defineConfig } from 'vite';

/** Separate review build: the production game's entry point stays unchanged. */
export default defineConfig({
  base: './',
  build: {
    outDir: 'artifacts/volt-preview-build',
    rolldownOptions: { input: 'tools/volt-preview.html' },
  },
});
