import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const generators = [
  'generate-blackout-maintenance-maps.ts',
  'generate-cultivation-assets.ts',
  'generate-character-lods.ts',
  'generate-acid-noise.ts',
  'generate-extermination-maps.ts',
  'generate-containment-lighting.ts',
  'generate-containment-radiance.ts',
  'generate-room-one-compressed-maps.mjs',
  'generate-escape-drone-model.ts',
  'generate-laser-emitter-model.ts',
  'generate-cultivation-radiance.ts',
  'generate-blackout-maintenance-art.ts',
  'generate-blackout-radiance.ts',
  'generate-delivery-assets.mjs',
];

for (const generator of generators) {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL(generator, import.meta.url)), '--check',
  ], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
