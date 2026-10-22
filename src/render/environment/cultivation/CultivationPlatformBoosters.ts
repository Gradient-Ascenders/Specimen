import * as THREE from 'three';
import type { LevelTwoRoomFiveGreybox } from '../../../levels/LevelTwoRoomFiveGreybox.ts';
import { PlatformBoosters, type BoosterPlatform } from '../PlatformBoosters.ts';

/** The original Room 5 selection and coordinates, using the shared effect. */
export class CultivationPlatformBoosters extends PlatformBoosters {
  constructor(room: LevelTwoRoomFiveGreybox,
    maps?: { bumpMap: THREE.Texture | null; roughnessMap: THREE.Texture | null },
    scope?: THREE.Object3D) {
    super(room.root, 'room-5-platform-boosters', maps, scope);
    const platforms: BoosterPlatform[] = [];
    for (const object of room.root.children) {
      if (!(object instanceof THREE.Mesh) || !/^room-5-(route-\d+-jump-\d+|safe-\d+-deck|release-quiet-walk)$/.test(object.name)) continue;
      const top = object.geometry instanceof THREE.BoxGeometry ? object.geometry.parameters.height / 2 : 0;
      platforms.push({ id: object.name, top: [object.position.x, object.position.y + top, object.position.z] });
    }
    this.addPlatforms(this.root, platforms, 'room-5'); this.reset();
  }
}
