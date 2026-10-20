import { defineConfig } from 'vite';
import {buildManifestPlugin,createBuildMetadata} from './scripts/lib/build-provenance.mjs';
const build=createBuildMetadata();

export default defineConfig({
  base: './',
  define: {__SPECIMEN_BUILD__:JSON.stringify(build)},
  plugins:[buildManifestPlugin(build)],
  build: {
    // WebGL 2 is the renderer floor. Keep the emitted JavaScript compatible
    // with the oldest evergreen releases that provide it reliably.
    target: ['chrome80', 'edge80', 'firefox78', 'safari15'],
  },
});
