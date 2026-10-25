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

test('Room 2 skips the upper rooms while its checkpoint lags and restores every visibility and light owner',()=>{
  const scene=new ContainmentLevelScene(()=>{});
  try{
    const objects:THREE.Object3D[]=[];
    scene.root.traverse(object=>objects.push(object));
    scene.roomFive.goopWoodenDoor.visible=false;
    const visibleLights=()=>{
      const lights:string[]=[];
      scene.root.traverseVisible(object=>{if(object instanceof THREE.Light)lights.push(object.uuid);});
      return lights;
    };
    for(const room of [1,2,3] as const){
      scene.lighting.setActiveRoom(room);
      const before=objects.map(object=>object.visible);
      const lights=visibleLights();
      for(const [body,camera] of [
        [{x:-8.797,y:10.945,z:25.98},{x:-8.289,y:11.671,z:24.008}],
        [{x:4.951,y:6.21,z:32.55},{x:5.439,y:5.384,z:27.847}],
        [{x:14.215,y:10.005,z:39.983},{x:14.293,y:4.6,z:39.287}],
      ]){
        scene.withEnclosedRoomOcclusion(body,camera,()=>{
          for(const root of [scene.roomFour.root,scene.roomFive.root]){
            let submitted=0;root.traverseVisible(object=>{if(object instanceof THREE.Mesh)submitted++;});
            assert.equal(submitted,0);
          }
          assert.equal(scene.roomThree.root.visible,true,'the next room stays visible through the exit');
          assert.equal(scene.teaching.roomTwoArt.root.visible,true);
          assert.deepEqual(visibleLights(),lights,'preserve the shader light layout');
        });
        assert.deepEqual(objects.map(object=>object.visible),before);
        assert.throws(()=>scene.withEnclosedRoomOcclusion(body,camera,()=>{throw new Error('draw failed');}),/draw failed/);
        assert.deepEqual(objects.map(object=>object.visible),before);
      }
    }
  }finally{scene.dispose();}
});

test('the old pod is culled beyond the duct bends, including the captured Room 3 hitch pose and backtracking',()=>{
  const scene=new ContainmentLevelScene(()=>{});
  try{
    const oldRoom=scene.teaching.roomOneArt.root;
    const states=[
      {room:1 as const,body:{x:.256,y:3.26,z:35.572},camera:{x:-3.143,y:5.197,z:39.649}},
      {room:3 as const,body:{x:-.243,y:11.36,z:51.734},camera:{x:1.824,y:12.741,z:54.31}},
      {room:4 as const,body:{x:9,y:30.21,z:85.5},camera:{x:9,y:40.8,z:89.9}},
      {room:4 as const,body:{x:9,y:75.21,z:85.5},camera:{x:9,y:77.2,z:90.4}},
      {room:5 as const,body:{x:9,y:75.21,z:94},camera:{x:9,y:77,z:98}},
      {room:5 as const,body:{x:-10,y:97.96,z:129.6},camera:{x:-10,y:99,z:124.7}},
    ];
    for(const {room,body,camera} of states){
      scene.lighting.setActiveRoom(room);
      scene.withEnclosedRoomOcclusion(body,camera,()=>{
        let submitted=0;oldRoom.traverseVisible(object=>{if(object instanceof THREE.Mesh)submitted++;});
        assert.equal(submitted,0,'pod and its unique label material cannot enter the later-room draw');
        if(room<=3 || body.y<36 || camera.y<36)assert.equal(scene.teaching.roomTwoArt.root.visible,true);
      });
      assert.equal(oldRoom.visible,true);
    }
    scene.lighting.setActiveRoom(1);
    for(const [body,camera] of [[{x:-8.4,y:11,z:25.2},{x:-8.4,y:11,z:25}],
      [{x:-8.4,y:11,z:25},{x:-8.4,y:11,z:25.2}]]){
      scene.withEnclosedRoomOcclusion(body,camera,()=>assert.equal(oldRoom.visible,true,'restore the earlier view while backtracking'));
    }
  }finally{scene.dispose();}
});

test('upper lift culling preserves the entry portal, light layout and visibility after failure',()=>{
  const scene=new ContainmentLevelScene(()=>{});
  try{
    scene.lighting.setActiveRoom(4);
    const root=scene.teaching.roomTwoArt.root;
    const lights=()=>{const names:string[]=[];scene.root.traverseVisible(o=>{if(o instanceof THREE.Light)names.push(o.uuid);});return names;};
    const originalLights=lights(),body={x:9,y:53,z:85.5},camera={x:9,y:54,z:88};
    scene.withEnclosedRoomOcclusion(body,camera,()=>{assert.equal(root.visible,false);assert.deepEqual(lights(),originalLights);});
    assert.equal(root.visible,true);
    assert.throws(()=>scene.withEnclosedRoomOcclusion(body,camera,()=>{throw new Error('draw failed');}),/draw failed/);
    assert.equal(root.visible,true);assert.deepEqual(lights(),originalLights);
    for(const [player,view] of [[{...body,y:33},camera],[body,{...camera,y:33}],
      [{...body,z:79.5},camera],[body,{...camera,z:79.5}],[{...body,x:0},camera],
      [body,{...camera,x:0}],[{...body,z:92},camera],[body,{...camera,z:92}]]){
      scene.withEnclosedRoomOcclusion(player,view,()=>assert.equal(root.visible,true,'a trailing view through the entrance must keep the earlier rooms'));
    }
  }finally{scene.dispose();}
});
