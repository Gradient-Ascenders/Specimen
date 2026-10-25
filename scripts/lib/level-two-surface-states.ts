import { RoomThreeDroneEncounter } from '../../src/hazards/RoomThreeDroneEncounter.ts';
import { ElevatorDroneEncounter } from '../../src/hazards/ElevatorDroneEncounter.ts';
import { RoomFiveDroneEncounter } from '../../src/hazards/RoomFiveDroneEncounter.ts';
import { KinematicBody } from '../../src/physics/KinematicBody.ts';
import { DissolveSystem } from '../../src/abilities/DissolveSystem.ts';
import { CULTIVATION_ROOM_THREE_DRONE_AUTHORING } from '../../src/levels/CultivationRoomThreeAuthoring.ts';
import * as THREE from 'three';
import type { LevelTwoPreviewScene } from '../../src/levels/LevelTwoPreviewScene.ts';
import { CollisionWorld } from '../../src/physics/CollisionWorld.ts';
import { SurfaceRegistry } from '../../src/physics/SurfaceRegistry.ts';
import { createAuthoredDissolveTarget } from '../../src/abilities/DissolveTarget.ts';
import {VOLT_FINALE} from '../../src/cinematics/CultivationFinaleTimeline.ts';
import {visitCultivationRoomTwoSurfaceStates} from './cultivation-room-two-surface-states.ts';

/** Deterministic authored poses; every state is scanned after updating world matrices. */
export function visitLevelTwoSurfaceStates(scene: LevelTwoPreviewScene, visit: (name: string) => void): void {
  const world = new CollisionWorld(), surfaces = new SurfaceRegistry();
  world.registerAll(scene.collisionMeshes); surfaces.registerAll(scene.collisionMeshes);
  const targets = scene.solubleTargetMeshes.map(mesh => createAuthoredDissolveTarget(mesh, world, surfaces));
  scene.bindDissolveTargets(targets);
  const bob = new KinematicBody({world, surfaces, initialPosition: scene.copyRoomSpawnPosition(3, 'bob', new THREE.Vector3())});
  const goop = new KinematicBody({world, surfaces, initialPosition: scene.copyRoomSpawnPosition(3, 'goop', new THREE.Vector3())});
  const roomThree = new RoomThreeDroneEncounter({config: CULTIVATION_ROOM_THREE_DRONE_AUTHORING,
    supportsById: new Map(targets.map(t => [t.id, t])), collisionWorld: world, surfaceRegistry: surfaces,
    bobBody: bob, goopBody: goop, requestDeath: () => true, radiationSurface: scene.roomThree.radiationHazard,
    surfaceMaps: scene.coverArt.droneSurfaceMaps});
  scene.roomThree.root.add(roomThree.root);
  const dissolve = new DissolveSystem(targets);
  const roomFour = new ElevatorDroneEncounter(scene.roomFour, world, surfaces, bob, goop, targets, dissolve, () => {});
  const roomFive = new RoomFiveDroneEncounter(scene.roomFive, world, surfaces, bob, goop, () => true);
  const sample = (name: string) => {
    // An assembled-level audit includes every room's submitted static geometry
    // even after reset applies distance culling. Descendant mechanism/actor
    // visibility remains authoritative for the sampled state.
    const roots=[...scene.root.children,scene.roomFourGeometry];
    const saved=roots.map(root=>root.visible);
    try{for(const root of roots)root.visible=true;scene.root.updateWorldMatrix(true,true);visit(name);}
    finally{roots.forEach((root,i)=>root.visible=saved[i]);}
  };
  try {
    sample('initial');
    for (const target of targets) if (target.mesh.userData.roomId !== 4 && target.mesh.userData.roomId !== 5) target.advance(target.dissolveDurationSeconds);
    for (const time of [.2, .45, 2]) {
      scene.roomOne.update(time); scene.roomTwo.update(time, []); scene.roomThree.update(time, []);
      sample(`drops-${time}`);
    }
    const passages=[scene.roomOneToTwoPassage, scene.roomTwoToThreeGoopPassage];
    const doors=passages.flatMap(passage=>[...passage.doors]);
    const openDoor=(door:typeof doors[number],dt:number)=>{
      door.setLocked(false);
      const centre = door.root.getWorldPosition(new THREE.Vector3()); centre.y += 1;
      door.update(dt, [{id: 'bob', position: centre, radiusMetres: .45}]);
    };
    for(const door of doors)openDoor(door,.24);
    sample('doors-opening');
    for(const door of doors)openDoor(door,2);
    sample('doors-open');
    for(const door of doors)door.update(.24,[]);
    sample('doors-closing');
    for(const door of doors)door.update(2,[]);
    sample('doors-reclosed');
    for(const door of doors)openDoor(door,2);
    const occupants = ['bob', 'goop'].map((id, i) => ({id, radiusMetres: .45, position: scene.roomFour.root.localToWorld(new THREE.Vector3(i ? 2 : -2, .66, 9))}));
    scene.roomFour.update(1.5, occupants);
    for (const dt of [1, 15, 17, 27, .4, 1.1]) {scene.roomFour.update(dt, occupants); roomFour.update(dt, 'goop'); sample(`lift-${scene.roomFour.controller.readModel.elapsed}-${scene.roomFour.controller.readModel.arrivalElapsed}`);}
    scene.roomFive.restoreCheckpoint('rescued'); sample('volt-rescued');
    scene.voltFinaleSet.annex.visible=true;
    for(const [name,time] of [['closed',VOLT_FINALE.ductRun],['buckling',VOLT_FINALE.brake],['breaking',VOLT_FINALE.grateBreak+.3],['open',VOLT_FINALE.ductSilence]] as const){
      scene.voltFinaleSet.present(time);sample(`volt-escape-duct-${name}`);
    }
    scene.voltFinaleSet.reset();
    for (const target of targets) target.reset();
    scene.reset(); roomThree.reset(); roomFour.reset(); roomFive.reset(); sample('reset');
    // Supplemental mechanism histories follow the original fixture so its
    // existing collision/light fingerprints remain directly comparable.
    scene.roomFive.restoreCheckpoint('controls');
    for(const network of ['red','blue','green'] as const){
      scene.roomFive.controller.security.select(network);scene.roomFive.syncPresentation(.08);
      sample(`network-${network}-switching`);
    }
    scene.roomFive.controller.security.release();
    for(const elapsed of [1.6,3.2,3.6]){
      scene.roomFive.controller.releaseElapsed=elapsed;scene.roomFive.syncPresentation(.1);
      sample(`volt-release-${elapsed}`);
    }
    scene.reset();roomThree.reset();roomFour.reset();roomFive.reset();sample('release-reset');
    visitCultivationRoomTwoSurfaceStates(scene,targets,sample);
  } finally { roomFive.dispose(); roomFour.dispose(); roomThree.dispose(); dissolve.dispose(); for (const target of targets) target.dispose(); }
}
