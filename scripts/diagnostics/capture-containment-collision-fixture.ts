import { mkdir, writeFile } from 'node:fs/promises';

import { ContainmentLevelScene } from '../../src/levels/ContainmentLevelScene.ts';
import { captureContainmentCollisionFingerprint } from '../../src/levels/ContainmentCollisionFingerprint.ts';

const fixtureUrl = new URL(
  '../../artifacts/collision/containment-colliders.json',
  import.meta.url,
);
const scene = new ContainmentLevelScene(() => {}, {
  includeDevelopmentHelpers: true,
});

try {
  await mkdir(new URL('.', fixtureUrl), { recursive: true });
  const fingerprint = captureContainmentCollisionFingerprint(
    scene.collisionMeshes,
  );
  await writeFile(fixtureUrl, `${JSON.stringify(fingerprint, null, 2)}\n`);
  console.log(
    `Captured ${fingerprint.length} Containment colliders at ${fixtureUrl.pathname}`,
  );
} finally {
  scene.dispose();
}
