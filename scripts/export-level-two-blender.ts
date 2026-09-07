import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CULTIVATION_ROOM_THREE_DRONE_AUTHORING } from '../src/levels/CultivationRoomThreeAuthoring.ts';
import { SecurityDronePresentation } from '../src/render/hazards/SecurityDronePresentation.ts';

// Evaluate the real room constructors instead of parsing source-code literals.
const preview = new LevelTwoPreviewScene(() => {});
const drones = [...CULTIVATION_ROOM_THREE_DRONE_AUTHORING.ceilingDrones, ...CULTIVATION_ROOM_THREE_DRONE_AUTHORING.groundDrones].map(({ drone }) => {
  const model = new SecurityDronePresentation(drone);
  model.root.position.copy(drone.initialPosition);
  preview.roomThree.root.add(model.root);
  return model;
});
const output = resolve(process.argv[2] ?? '../Levels/Level 2/Blender');
mkdirSync(output, { recursive: true });
for (const [roomId, room] of [[2, preview.roomTwo], [3, preview.roomThree]] as const) {
  room.root.updateWorldMatrix(true, true);
  const inverse = room.root.matrixWorld.clone().invert();
  const objects: object[] = [];
  room.root.traverse((object) => {
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    let visible = true;
    for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
      visible &&= parent.visible;
      if (parent === room.root) break;
    }
    const base = { name: object.name || object.type, matrix: matrix.toArray(), visible,
      metadata: object.userData, collider: room.collisionMeshes.includes(object as THREE.Mesh) };
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry;
      const position = geometry.getAttribute('position');
      if (!position) return;
      const vertices = Array.from({ length: position.count }, (_, i) =>
        [position.getX(i), position.getY(i), position.getZ(i)]);
      const indices = geometry.index ? Array.from(geometry.index.array) : vertices.map((_, i) => i);
      const materials = (Array.isArray(object.material) ? object.material : [object.material]).map((material) => {
        const m = material as THREE.MeshStandardMaterial;
        return { name: m.name || m.type, color: m.color?.toArray() ?? [1, 1, 1],
          roughness: m.roughness ?? 0.5, metalness: m.metalness ?? 0,
          emission: m.emissive?.toArray() ?? [0, 0, 0], emissionStrength: m.emissiveIntensity ?? 0,
          opacity: m.opacity };
      });
      base.visible &&= (Array.isArray(object.material) ? object.material : [object.material]).some(material => material.visible);
      objects.push({ ...base, type: 'mesh', vertices, indices, materials, groups: geometry.groups });
    } else if (object instanceof THREE.PointLight) {
      objects.push({ ...base, type: 'light', color: object.color.toArray(), intensity: object.intensity });
    } else if (Object.keys(object.userData).length || object.name) {
      objects.push({ ...base, type: 'empty' });
    }
  });
  if (roomId === 3) {
    for (const entry of [...CULTIVATION_ROOM_THREE_DRONE_AUTHORING.ceilingDrones,
      ...CULTIVATION_ROOM_THREE_DRONE_AUTHORING.groundDrones]) {
      objects.push({ name: entry.drone.id, type: 'drone-reference',
        position: entry.drone.initialPosition.toArray(), size: entry.drone.colliderSize.toArray(),
        metadata: { referenceOnly: true, authoringSource: 'CultivationRoomThreeAuthoring.ts' } });
    }
  }
  const path = resolve(output, `Room${roomId}.scene.json`);
  writeFileSync(path, JSON.stringify({ roomId, units: 'metres', coordinates: 'Three.js Y-up, room-local', objects }));
  console.log(`${path}: ${objects.length} objects`);
}
for (const drone of drones) drone.dispose();
preview.dispose();
