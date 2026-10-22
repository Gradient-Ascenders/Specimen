import * as THREE from 'three';
import type { LevelTwoRoomThreeGreybox } from '../../../levels/LevelTwoRoomThreeGreybox.ts';
import type { LevelTwoRoomTwoGreybox } from '../../../levels/LevelTwoRoomTwoGreybox.ts';
import type { CultivationPlatformBoosters } from './CultivationPlatformBoosters.ts';

/** Only the traversal-family posts lose their visible skin. Their authored
 * collision boxes remain, as do all permanent deck/machinery supports. */
export const CULTIVATION_TRAVERSAL_SUPPORT_IDS = [
  'cultivation-room-3-first-wall-exit-support', 'cultivation-room-3-west-wall-exit-support',
  'cultivation-room-3-final-wall-exit-support',
];

/** Upper-route traversal family, including Bob's entry and former post decks. */
export const CULTIVATION_ROOM_THREE_BOOSTER_IDS = [
  'entry', 'launch-island', 'cross-beam', 'first-wall-exit', 'offset-island', 'west-runup', 'west-wall-exit',
  'west-return-island', 'cross-room-a', 'cross-room-b', 'final-wall-exit', 'last-island', 'drop-launch',
].map(id => `cultivation-room-3-bob-${id}`);

export function addCultivationRoomThreeBoosters(boosters: CultivationPlatformBoosters, room: LevelTwoRoomThreeGreybox): void {
  const platforms = CULTIVATION_ROOM_THREE_BOOSTER_IDS.map(id => {
    const mesh = room.collisionMeshes.find(candidate => candidate.name === id);
    if (!mesh || !(mesh.geometry instanceof THREE.BoxGeometry)) throw new Error(`Missing booster platform: ${id}`);
    return { id, top: [mesh.position.x, mesh.position.y + mesh.geometry.parameters.height / 2, mesh.position.z] as const };
  });
  boosters.addPlatforms(room.root, platforms, 'cultivation-room-3');
}

export function addCultivationButtonPlatformBooster(boosters: CultivationPlatformBoosters, room: LevelTwoRoomTwoGreybox): void {
  const id = 'cultivation-room-2-button-rest-ledge';
  const mesh = room.collisionMeshes.find(candidate => candidate.name === id);
  if (!mesh || !(mesh.geometry instanceof THREE.BoxGeometry)) throw new Error(`Missing booster platform: ${id}`);
  boosters.addPlatforms(room.root, [{ id, top: [mesh.position.x, mesh.position.y + mesh.geometry.parameters.height / 2, mesh.position.z] }], 'cultivation-room-2');
}
