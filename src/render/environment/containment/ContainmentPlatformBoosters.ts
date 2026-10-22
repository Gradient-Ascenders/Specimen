import * as THREE from 'three';
import type { ContainmentLevelScene } from '../../../levels/ContainmentLevelScene.ts';
import { PlatformBoosters, type BoosterPlatform } from '../PlatformBoosters.ts';

/** Explicit traversal-platform family, including the screenshot-requested
 * landings. Permanent machinery/decks and the shaft lift stay unchanged. */
export const CONTAINMENT_BOOSTER_PLATFORMS = {
  2: ['room-2-platform-a-height-lesson', 'room-2-platform-b-gap-lesson', 'room-2-platform-c-side-jump', 'room-2-platform-d-sticky-launch',
    'room-2-top-of-sticky-wall-ledge', 'room-2-upper-step-a', 'room-2-upper-step-b', 'room-2-exit-balcony'],
  3: ['room-3-entry-platform', 'room-3-platform-a-bounce', 'room-3-platform-b-gap', 'room-3-wall-exit-ledge', 'room-3-platform-c', 'room-3-platform-d', 'room-3-platform-e', 'room-3-platform-f'],
  5: ['room-5-lower-platform-c', 'room-5-central-rest-platform', 'room-5-upper-platform-a', 'room-5-upper-platform-a.001',
    'room-5-upper-platform-a.003', 'room-5-final-approach-platform', 'room-5-final-bounce-platform'],
} as const;

export function createContainmentPlatformBoosters(scene: ContainmentLevelScene): PlatformBoosters {
  const boosters = new PlatformBoosters(scene.root, 'containment-platform-boosters', scene.artResources.materials.serviceMetal);
  const groups = [
    [2, scene.teaching.roomTwoArt.root, scene.teaching.collisionMeshes],
    [3, scene.roomThree.art.root, scene.roomThree.collisionMeshes],
    [5, scene.roomFive.art.root, scene.roomFive.collisionMeshes],
  ] as const;
  for (const [room, parent, colliders] of groups) {
    const platforms: BoosterPlatform[] = CONTAINMENT_BOOSTER_PLATFORMS[room].map(id => {
      const mesh = colliders.find(candidate => candidate.name === id);
      if (!mesh || !(mesh.geometry instanceof THREE.BoxGeometry)) throw new Error(`Missing booster platform: ${id}`);
      const point = mesh.localToWorld(new THREE.Vector3(0, mesh.geometry.parameters.height / 2, 0));
      parent.worldToLocal(point);
      return { id, top: [point.x, point.y, point.z],
        ...(id === 'room-2-platform-a-height-lesson' ? { scale: .6, mountOffsetY: -.35 } : {}),
        ...(id === 'room-5-lower-platform-c' ? { scale: .9, mountOffsetY: -.08 } : {}),
      };
    });
    boosters.addPlatforms(parent, platforms, `containment-room-${room}`);
  }
  for (const [index, platform] of [scene.roomFive.movingPlatformOne, scene.roomFive.movingPlatformTwo].entries()) {
    const parent = platform.root.getObjectByName(`room-5-moving-platform-${index + 1}-production-dressing`)!;
    boosters.addPlatforms(parent, [{ id: platform.root.name, top: [0, platform.size.y / 2, 0] }], `containment-moving-${index + 1}`);
  }
  boosters.reset();
  return boosters;
}
