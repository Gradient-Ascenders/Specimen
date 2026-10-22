import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CultivationAssetGenerator } from './lib/cultivation-asset-generator.ts';

const generator = new CultivationAssetGenerator();
const scene = new LevelTwoPreviewScene(() => {}, generator);
try {
  // The production scene now authors the button ledge's standard deck recipe.
  const bundle = Buffer.from(generator.bundle());
  const output = new URL('../src/assets/cultivation/authored-assets.bin', import.meta.url);
  if (process.argv.includes('--check')) {
    if (!bundle.equals(await readFile(output))) throw new Error('Cultivation assets are stale. Run npm run generate:cultivation-assets.');
    console.log(`Cultivation assets reproduce exactly (${bundle.length} bytes).`);
  } else {
    await mkdir(new URL('../src/assets/cultivation/', import.meta.url), { recursive: true });
    await writeFile(output, bundle);
    console.log(`Wrote lossless Cultivation assets (${bundle.length} bytes; ${scene.surfaceCleanup.repairedMeshes} repair steps).`);
  }
} finally {
  scene.dispose(); generator.dispose();
}
