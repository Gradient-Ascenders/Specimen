import * as THREE from 'three';
import { LEVEL_TWO_BLENDER_LAYOUT } from './LevelTwoBlenderLayout.ts';
import type { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';

/** Apply saved Blender box authoring once, before collision registration. */
export function applyBlenderRoomLayout(builder: GreyboxRoomBuilder, room: 2 | 3): void {
  for (const edit of LEVEL_TWO_BLENDER_LAYOUT[room]) {
    if (edit.added) {
      const mesh = builder.addCollider({
        name: edit.name,
        position: edit.position,
        size: edit.size,
        material: builder.materials[edit.material],
      });
      Object.assign(mesh.userData, { levelId: 'cultivation', roomId: room, routeOwner: 'bob' });
      continue;
    }
    const mesh = builder.root.getObjectByName(edit.name);
    if (!(mesh instanceof THREE.Mesh) || !builder.collisionMeshes.includes(mesh)) {
      throw new Error(`Missing Blender layout collider: ${edit.name}`);
    }
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BoxGeometry(...edit.size);
    mesh.position.set(edit.position[0], edit.position[1], edit.position[2]);
    mesh.userData.sizeMetres = [...edit.size];
  }
}
