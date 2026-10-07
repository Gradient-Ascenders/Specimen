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
    const result = scene.withEnclosedRoomOcclusion(player, camera, () => {
      let meshes = 0;
      rooms.forEach(room => room.traverseVisible(object => { if (object instanceof THREE.Mesh) meshes++; }));
      assert.equal(meshes, 0, 'distant geometry is skipped');
      assert.equal(scene.teaching.root.visible, true, 'local room and duct remain rendered');
      assert.deepEqual(visibleLights(), lightsBefore, 'light signatures including elevator lamps stay unchanged');
      return 42;
    });
    assert.equal(result, 42);
    assert.deepEqual(objects.map(object => object.visible), before);
    assert.throws(() => scene.withEnclosedRoomOcclusion(player, camera, () => {
      throw new Error('draw failed');
    }), /draw failed/);
    assert.deepEqual(objects.map(object => object.visible), before);

    for (const [body, view] of [
      [{ ...player, z: 24 }, camera],
      [player, { ...camera, z: 24 }],
      [{ ...player, y: 14 }, camera],
      [player, { ...camera, y: 14 }],
    ]) {
      scene.withEnclosedRoomOcclusion(body, view, () => {
        assert.deepEqual(objects.map(object => object.visible), before, 'portal and upper views are untouched');
      });
    }
    scene.lighting.setActiveRoom(2);
    scene.withEnclosedRoomOcclusion(player, camera, () => {
      assert.deepEqual(objects.map(object => object.visible), before, 'other rooms are untouched');
    });
  } finally {
    scene.dispose();
  }
});

test('Room 3 final-wall views skip the hidden Room 5 laboratory without hiding the elevator', () => {
  const scene = new ContainmentLevelScene(() => {});
  try {
    scene.lighting.setActiveRoom(3);
    const player = { x: 7.4, y: 26.75, z: 76.17 };
    const camera = { x: 7.4, y: 25.72, z: 73.81 };
    const objects: THREE.Object3D[] = [];
    scene.root.traverse(object => objects.push(object));
    // Retain independently hidden objects as well as the visible laboratory.
    scene.roomFive.goopWoodenDoor.visible = false;
    const before = objects.map(object => object.visible);
    const visibleLights = () => {
      const lights: string[] = [];
      scene.root.traverseVisible(object => { if (object instanceof THREE.Light) lights.push(object.uuid); });
      return lights;
    };
    const lightsBefore = visibleLights();
    scene.withEnclosedRoomOcclusion(player, camera, () => {
      assert.equal(scene.roomThree.root.visible, true);
      assert.equal(scene.roomFour.root.visible, true, 'keep the adjacent elevator and duct');
      assert.equal(scene.roomFive.root.visible, false, 'the upper laboratory is behind solid walls');
      assert.deepEqual(visibleLights(), lightsBefore, 'local lighting and shadows remain unchanged');
    });
    assert.deepEqual(objects.map(object => object.visible), before);
    assert.throws(() => scene.withEnclosedRoomOcclusion(player, camera, () => {
      throw new Error('draw failed');
    }), /draw failed/);
    assert.deepEqual(objects.map(object => object.visible), before);
    for (const [body, view] of [
      [{ ...player, z: 78 }, camera],
      [player, { ...camera, z: 78 }],
      [{ ...player, y: 34 }, camera],
      [player, { ...camera, y: 34 }],
    ]) {
      scene.withEnclosedRoomOcclusion(body, view, () => {
        assert.deepEqual(objects.map(object => object.visible), before, 'exit and upper views are untouched');
      });
    }
    scene.lighting.setActiveRoom(4);
    const elevatorVisibility = objects.map(object => object.visible);
    scene.withEnclosedRoomOcclusion(player, camera, () => {
      assert.deepEqual(objects.map(object => object.visible), elevatorVisibility, 'the elevator can see its upper destination');
    });
  } finally {
    scene.dispose();
  }
});
