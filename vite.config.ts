import { defineConfig } from 'vite';
import {buildManifestPlugin,createBuildMetadata} from './scripts/lib/build-provenance.mjs';
const build=createBuildMetadata();

export default defineConfig(({ mode }) => ({
  base: './',
  // Local experiment snapshots can contain their own HTML and node_modules.
  // Scan only the shipped entry and keep addons on the application's Three.js.
  optimizeDeps: { entries: ['index.html'] },
  resolve: { dedupe: ['three'] },
  define: {__SPECIMEN_BUILD__:JSON.stringify(build)},
  // Resolve the optional movie to an empty module before Vite emits assets.
  // Keep it available in development and explicit backup builds.
  plugins: [buildManifestPlugin(build), {
    name: 'submission-opening-movie',
    apply: 'build',
    enforce: 'pre',
    resolveId(id) {
      if (mode !== 'opening-backup' && id === './assets/cinematics/opening.mp4?url') {
        return '\0specimen-opening-movie';
      }
    },
    load(id) {
      if (id === '\0specimen-opening-movie') return 'export default "";';
    },
  }],
  build: {
    // WebGL 2 is the renderer floor. Keep the emitted JavaScript compatible
    // with the oldest evergreen releases that provide it reliably.
    target: ['chrome80', 'edge80', 'firefox78', 'safari15'],
  },
}));
