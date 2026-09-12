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
  const sample = (name: string) => {scene.root.updateWorldMatrix(true, true); visit(name);};
  try {
    sample('initial');
    for (const target of targets) if (target.mesh.userData.roomId !== 4 && target.mesh.userData.roomId !== 5) target.advance(target.dissolveDurationSeconds);
    for (const time of [.2, .45, 2]) {
      scene.roomOne.update(time); scene.roomTwo.update(time, []); scene.roomThree.update(time, []);
      sample(`drops-${time}`);
    }
    for (const passage of [scene.roomOneToTwoPassage, scene.roomTwoToThreeGoopPassage]) for (const door of passage.doors) {
      door.setLocked(false);
      const centre = door.root.getWorldPosition(new THREE.Vector3()); centre.y += 1;
      door.update(2, [{id: 'bob', position: centre, radiusMetres: .45}]);
    }
    sample('doors-open');
    const occupants = ['bob', 'goop'].map((id, i) => ({id, radiusMetres: .45, position: scene.roomFour.root.localToWorld(new THREE.Vector3(i ? 2 : -2, .66, 9))}));
    scene.roomFour.update(1.5, occupants);
    for (const dt of [1, 15, 17, 27, 1.5]) {scene.roomFour.update(dt, occupants); roomFour.update(dt, 'goop'); sample(`lift-${scene.roomFour.controller.readModel.elapsed}-${scene.roomFour.controller.readModel.arrivalElapsed}`);}
    scene.roomFive.restoreCheckpoint('rescued'); sample('volt-rescued');
    for (const target of targets) target.reset();
    scene.reset(); roomThree.reset(); roomFour.reset(); roomFive.reset(); sample('reset');
  } finally { roomFive.dispose(); roomFour.dispose(); roomThree.dispose(); dissolve.dispose(); for (const target of targets) target.dispose(); }
}
