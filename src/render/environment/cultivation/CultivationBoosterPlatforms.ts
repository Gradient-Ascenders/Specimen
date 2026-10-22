import * as THREE from 'three';
import type { LevelTwoRoomThreeGreybox } from '../../../levels/LevelTwoRoomThreeGreybox.ts';
import type { CultivationPlatformBoosters } from './CultivationPlatformBoosters.ts';

/** Independent upper-route islands; the entrance service deck, sticky-wall
 * landings, the three column-supported exits, soluble cover, tethers and
 * structural passages are not hover decks. */
export const CULTIVATION_ROOM_THREE_BOOSTER_IDS = [
  'launch-island', 'cross-beam', 'offset-island', 'west-runup',
  'west-return-island', 'cross-room-a', 'cross-room-b', 'last-island', 'drop-launch',
].map(id => `cultivation-room-3-bob-${id}`);

export function addCultivationRoomThreeBoosters(boosters: CultivationPlatformBoosters, room: LevelTwoRoomThreeGreybox): void {
  const platforms = CULTIVATION_ROOM_THREE_BOOSTER_IDS.map(id => {
    const mesh = room.collisionMeshes.find(candidate => candidate.name === id);
    if (!mesh || !(mesh.geometry instanceof THREE.BoxGeometry)) throw new Error(`Missing booster platform: ${id}`);
    return { id, top: [mesh.position.x, mesh.position.y + mesh.geometry.parameters.height / 2, mesh.position.z] as const };
  });
  boosters.addPlatforms(room.root, platforms, 'cultivation-room-3');
}
