import * as THREE from 'three';
import type { LevelTwoPreviewScene } from '../../src/levels/LevelTwoPreviewScene.ts';
import { createCoplanarSurfaceRepairs } from '../../src/render/geometry/CoplanarSurfaceGeometry.ts';

export function generateCultivationSurfaceRepairs(scene: LevelTwoPreviewScene, install: (repairs: Map<THREE.Mesh, THREE.BufferGeometry>) => void): number {
    const moving = new Map<THREE.Object3D, object>();
    for (const mesh of [...scene.dynamicCollisionMeshes, ...scene.solubleTargetMeshes]) moving.set(mesh, mesh);
    for (const passage of [scene.roomOneToTwoPassage, scene.roomTwoToThreeGoopPassage]) {
      for (const door of passage.doors) moving.set(door.root, door.root);
    }
    const entranceDomain = {};
    moving.set(scene.roomFour.entrance.root, entranceDomain);
    for (const mesh of scene.roomFour.movingEntranceMeshes) {
      if (mesh !== scene.roomFour.boardingGuard) moving.set(mesh, entranceDomain);
    }
    for (const child of scene.roomFourGeometry.children) if (child.name.startsWith('room-4-shaft-module-')) moving.set(child, child);
    moving.set(scene.roomFive.brokenCore, scene.roomFive.brokenCore);
    moving.set(scene.roomFive.releaseCover, scene.roomFive.releaseCoverCollider);
    for(const hinge of scene.voltFinaleSet.dynamicTransformRoots)moving.set(hinge,hinge);
    moving.set(scene.filtrationArt.fan, scene.filtrationArt.fan);
    const domain = (mesh: THREE.Mesh): object => {
      let motion: object | undefined;
      for (let parent: THREE.Object3D | null = mesh; parent; parent = parent.parent) {
        motion = moving.get(parent) ?? motion;
        // Descendant colliders travel with the outer assembly, not independently.
        if (parent.parent === scene.root) return motion ?? parent;
      }
      return motion ?? mesh;
    };
    // Sliding hardware needs actual clearance, not a permanent cut based on
    // its initial pose. The authored colliders retain their exact dimensions.
    const insets = new Map<THREE.Mesh, THREE.BufferGeometry>();
    scene.root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BoxGeometry)) return;
      const name = object.name;
      let widthInset = 0, heightInset = 0, depthInset = 0;
      if (name === 'room-4-destination-vent-shutter' || name === 'room-5-reunion-floor') widthInset = .02;
      if (name === 'room-5-sewer-reunion-bridge') depthInset = .04;
      if (name === 'room-4-boarding-safety-guard') widthInset = .04;
      if (name === 'room-4-boarding-shaft-wall') widthInset = .06;
      if (name.startsWith('room-4-destination-wall-')) widthInset = .02;
      if (name === 'room-4-destination-vent-header') heightInset = .02;
      // Closed wall caps are buried in the passage floor. Lift them above the
      // neighbouring room's cap without altering the visible wall elevation.
      const passageWall = /^cultivation-room-\d-to-\d-.*lab-passage-(east|west)-wall$/.test(name);
      const liftPartition = name.startsWith('room-4-partition-');
      if (!widthInset && !heightInset && !depthInset && !passageWall && !liftPartition) return;
      const geometry = object.geometry.clone(), position = geometry.getAttribute('position');
      geometry.computeBoundingBox(); const minY = geometry.boundingBox!.min.y;
      for (let i = 0; i < position.count; i++) {
        position.setX(i, position.getX(i) - Math.sign(position.getX(i)) * widthInset / 2);
        position.setY(i, position.getY(i) - Math.sign(position.getY(i)) * heightInset / 2);
        position.setZ(i, position.getZ(i) - Math.sign(position.getZ(i)) * depthInset / 2);
        if ((passageWall || liftPartition) && Math.abs(position.getY(i) - minY) < .0001) position.setY(i, minY + .015);
      }
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      insets.set(object, geometry);
    });
    install(insets);
    const annexVisible = scene.voltFinaleSet.annex.visible;
    // This escape scenery is hidden in gameplay but still needs its static
    // seams/arrow joins repaired offline, not on the first cinematic frame.
    scene.voltFinaleSet.annex.visible = true;
    try {
      const repairs = createCoplanarSurfaceRepairs(scene.root, domain);
      install(repairs);
      return insets.size + repairs.size;
    } finally { scene.voltFinaleSet.annex.visible = annexVisible; }
}
