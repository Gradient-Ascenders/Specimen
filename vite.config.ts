import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // WebGL 2 is the renderer floor. Keep the emitted JavaScript compatible
    // with the oldest evergreen releases that provide it reliably.
    target: ['chrome80', 'edge80', 'firefox78', 'safari15'],
  },
});
