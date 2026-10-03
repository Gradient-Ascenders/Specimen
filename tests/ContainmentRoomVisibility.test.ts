import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';

test('Room 1 occludes distant geometry only during rendering, including on a failed draw', () => {
  const scene = new ContainmentLevelScene(() => {});
  try {
    const rooms = [scene.roomThree.root, scene.roomFour.root, scene.roomFive.root];
    const player = { x: -4.8, y: 2, z: 5.5 };
    const camera = { x: -4.8, y: 1, z: 1 };
    scene.roomFive.root.visible = false; // Preserve another system's choice.
    const objects: THREE.Object3D[] = [];
    rooms.forEach(room => room.traverse(object => objects.push(object)));
    const before = objects.map(object => object.visible);
    const visibleLights = () => {
      const lights: string[] = [];
      scene.root.traverseVisible(object => { if (object instanceof THREE.Light) lights.push(object.uuid); });
      return lights;
    };
    const lightsBefore = visibleLights();
    const result = scene.withRoomOneOcclusion(player, camera, () => {
      let meshes = 0;
      rooms.forEach(room => room.traverseVisible(object => { if (object instanceof THREE.Mesh) meshes++; }));
      assert.equal(meshes, 0, 'distant geometry is skipped');
      assert.equal(scene.teaching.root.visible, true, 'local room and duct remain rendered');
      assert.deepEqual(visibleLights(), lightsBefore, 'light signatures including elevator lamps stay unchanged');
      return 42;
    });
    assert.equal(result, 42);
    assert.deepEqual(objects.map(object => object.visible), before);
    assert.throws(() => scene.withRoomOneOcclusion(player, camera, () => {
      throw new Error('draw failed');
    }), /draw failed/);
    assert.deepEqual(objects.map(object => object.visible), before);

    for (const [body, view] of [
      [{ ...player, z: 24 }, camera],
      [player, { ...camera, z: 24 }],
      [{ ...player, y: 14 }, camera],
      [player, { ...camera, y: 14 }],
    ]) {
      scene.withRoomOneOcclusion(body, view, () => {
        assert.deepEqual(objects.map(object => object.visible), before, 'portal and upper views are untouched');
      });
    }
    scene.lighting.setActiveRoom(2);
    scene.withRoomOneOcclusion(player, camera, () => {
      assert.deepEqual(objects.map(object => object.visible), before, 'other rooms are untouched');
    });
  } finally {
    scene.dispose();
  }
});
