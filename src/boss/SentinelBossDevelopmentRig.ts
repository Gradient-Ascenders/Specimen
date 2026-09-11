import * as THREE from 'three';

import type { CombatTargetRegistry } from '../combat/CombatTargetRegistry.ts';
import {
  ColliderTransformMode,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';
import { SentinelBossController } from './SentinelBossController.ts';
import { SentinelWeakPointTarget } from './SentinelWeakPointTarget.ts';
import {
  SentinelDroneAttack,
  SentinelDroneSquad,
} from './attacks/SentinelDroneAttack.ts';
import {
  SentinelRotatingLaserAttack,
  SentinelSweepLaserAttack,
} from './attacks/SentinelLaserAttacks.ts';
import { SentinelShockwaveAttack } from './attacks/SentinelShockwaveAttack.ts';

const BOSS_Z = 78;
const BOSS_CENTRE = new THREE.Vector3(0, 3.6, BOSS_Z);
const LASER_ORIGIN = new THREE.Vector3(0, 1.15, BOSS_Z - 1.5);
const SHOCKWAVE_ORIGIN = new THREE.Vector3(0, 0, BOSS_Z - 2);

export interface SentinelBossDevelopmentRigOptions {
  readonly collisionWorld: CollisionWorld;
  readonly targetRegistry: CombatTargetRegistry;
}

/**
 * Backend verification harness for #129.
 *
 * #130 replaces these positions with the final arena and #134 replaces the
 * proxy meshes. Boss state, attacks, combat target, and reset contracts remain
 * unchanged.
 */
export class SentinelBossDevelopmentRig {
  readonly root = new THREE.Group();
  readonly controller: SentinelBossController;
  readonly droneSquad: SentinelDroneSquad;
  readonly weakPointTarget: SentinelWeakPointTarget;
  readonly weakPointMesh: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshStandardMaterial
  >;
  readonly bossProxy: THREE.Mesh<
    THREE.BoxGeometry,
    THREE.MeshStandardMaterial
  >;

  private readonly unregisterWeakPoint: () => void;
  private disposed = false;

  constructor(options: SentinelBossDevelopmentRigOptions) {
    this.root.name = 'sentinel-boss-development-rig';

    const bossProxy = new THREE.Mesh(
      new THREE.BoxGeometry(7, 4.5, 2.2),
      new THREE.MeshStandardMaterial({
        color: 0x20272f,
        emissive: 0x130b10,
        emissiveIntensity: 0.45,
        roughness: 0.42,
        metalness: 0.72,
      }),
    );
    bossProxy.name = 'sentinel-boss-proxy';
    bossProxy.position.copy(BOSS_CENTRE);
    bossProxy.userData.authoringRole = 'sentinel-boss-proxy';
    this.bossProxy = bossProxy;
    this.root.add(bossProxy);

    const weakPointMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 10),
      new THREE.MeshStandardMaterial({
        color: 0xb3202d,
        emissive: 0x74131d,
        emissiveIntensity: 1.2,
        roughness: 0.28,
        metalness: 0.4,
      }),
    );
    weakPointMesh.name = 'sentinel-weak-point-hit';
    weakPointMesh.position.set(0, 3.5, BOSS_Z - 1.2);
    weakPointMesh.userData.authoringRole = 'sentinel-weak-point';
    this.weakPointMesh = weakPointMesh;
    this.root.add(weakPointMesh);

    let droneSquad: SentinelDroneSquad | undefined;
    let controller: SentinelBossController | undefined;
    let unregisterWeakPoint: (() => void) | undefined;
    const constructedAttacks: Array<{ dispose(): void }> = [];

    try {
      droneSquad = new SentinelDroneSquad({
        collisionWorld: options.collisionWorld,
        targetRegistry: options.targetRegistry,
        anchors: [
          new THREE.Vector3(-5, 3.2, BOSS_Z - 3),
          new THREE.Vector3(5, 3.2, BOSS_Z - 3),
          new THREE.Vector3(-4.5, 4.2, BOSS_Z + 1),
          new THREE.Vector3(4.5, 4.2, BOSS_Z + 1),
        ],
        maximumDrones: 4,
        droneHealthUnits: 2,
        fireIntervalSeconds: 1.25,
        projectileCapacity: 16,
      });
      this.droneSquad = droneSquad;
      this.root.add(droneSquad.root);

      const sweepPhaseOne = new SentinelSweepLaserAttack({
        id: 'sentinel-sweep-phase-1',
        start: LASER_ORIGIN,
        end: new THREE.Vector3(0, 1.15, BOSS_Z - 15),
        axisWorld: new THREE.Vector3(0, 1, 0),
        fromAngleRadians: -0.62,
        toAngleRadians: 0.62,
        durations: {
          telegraphSeconds: 1,
          activeSeconds: 2.8,
          recoverySeconds: 0.9,
        },
      });
      constructedAttacks.push(sweepPhaseOne);

      const sweepPhaseThree = new SentinelSweepLaserAttack({
        id: 'sentinel-sweep-phase-3',
        start: LASER_ORIGIN,
        end: new THREE.Vector3(0, 1.15, BOSS_Z - 15),
        axisWorld: new THREE.Vector3(0, 1, 0),
        fromAngleRadians: 0.72,
        toAngleRadians: -0.72,
        durations: {
          telegraphSeconds: 0.8,
          activeSeconds: 2.2,
          recoverySeconds: 0.8,
        },
      });
      constructedAttacks.push(sweepPhaseThree);

      const rotatePhaseTwo = new SentinelRotatingLaserAttack({
        id: 'sentinel-rotate-phase-2',
        origin: new THREE.Vector3(0, 1.1, BOSS_Z - 2),
        beamLengthMetres: 13,
        beamCount: 2,
        rotationRadians: Math.PI * 2,
        durations: {
          telegraphSeconds: 1,
          activeSeconds: 3.8,
          recoverySeconds: 1,
        },
      });
      constructedAttacks.push(rotatePhaseTwo);

      const rotatePhaseThree = new SentinelRotatingLaserAttack({
        id: 'sentinel-rotate-phase-3',
        origin: new THREE.Vector3(0, 1.1, BOSS_Z - 2),
        beamLengthMetres: 13,
        beamCount: 3,
        rotationRadians: Math.PI * 2,
        durations: {
          telegraphSeconds: 0.8,
          activeSeconds: 3.2,
          recoverySeconds: 0.8,
        },
      });
      constructedAttacks.push(rotatePhaseThree);

      const shockwavePhaseTwo = new SentinelShockwaveAttack({
        id: 'sentinel-shockwave-phase-2',
        origin: SHOCKWAVE_ORIGIN,
        maximumRadiusMetres: 13,
        durations: {
          telegraphSeconds: 1,
          activeSeconds: 1.7,
          recoverySeconds: 1,
        },
      });
      constructedAttacks.push(shockwavePhaseTwo);

      const shockwavePhaseThreeA = new SentinelShockwaveAttack({
        id: 'sentinel-shockwave-phase-3-a',
        origin: SHOCKWAVE_ORIGIN,
        maximumRadiusMetres: 13,
        durations: {
          telegraphSeconds: 0.75,
          activeSeconds: 1.4,
          recoverySeconds: 0.7,
        },
      });
      constructedAttacks.push(shockwavePhaseThreeA);

      const shockwavePhaseThreeB = new SentinelShockwaveAttack({
        id: 'sentinel-shockwave-phase-3-b',
        origin: SHOCKWAVE_ORIGIN,
        maximumRadiusMetres: 13,
        durations: {
          telegraphSeconds: 0.65,
          activeSeconds: 1.25,
          recoverySeconds: 0.7,
        },
      });
      constructedAttacks.push(shockwavePhaseThreeB);

      const dronesPhaseOne = new SentinelDroneAttack({
        id: 'sentinel-drones-phase-1',
        squad: droneSquad,
        deployCount: 2,
        durations: {
          telegraphSeconds: 0.9,
          activeSeconds: 4.2,
          recoverySeconds: 1,
        },
      });
      constructedAttacks.push(dronesPhaseOne);

      const dronesPhaseTwo = new SentinelDroneAttack({
        id: 'sentinel-drones-phase-2',
        squad: droneSquad,
        deployCount: 3,
        durations: {
          telegraphSeconds: 0.9,
          activeSeconds: 4.6,
          recoverySeconds: 1,
        },
      });
      constructedAttacks.push(dronesPhaseTwo);

      const dronesPhaseThree = new SentinelDroneAttack({
        id: 'sentinel-drones-phase-3',
        squad: droneSquad,
        deployCount: 4,
        durations: {
          telegraphSeconds: 0.8,
          activeSeconds: 5,
          recoverySeconds: 0.9,
        },
      });
      constructedAttacks.push(dronesPhaseThree);

      const attacks = [
        sweepPhaseOne,
        dronesPhaseOne,
        rotatePhaseTwo,
        shockwavePhaseTwo,
        dronesPhaseTwo,
        sweepPhaseThree,
        rotatePhaseThree,
        dronesPhaseThree,
        shockwavePhaseThreeA,
        shockwavePhaseThreeB,
      ] as const;

      for (const attack of [
        sweepPhaseOne,
        sweepPhaseThree,
        rotatePhaseTwo,
        rotatePhaseThree,
      ]) {
        this.root.add(attack.root);
      }

      controller = new SentinelBossController({
        attacks,
        phaseScripts: {
          1: [
            sweepPhaseOne.id,
            dronesPhaseOne.id,
          ],
          2: [
            rotatePhaseTwo.id,
            shockwavePhaseTwo.id,
            dronesPhaseTwo.id,
          ],
          3: [
            sweepPhaseThree.id,
            rotatePhaseThree.id,
            dronesPhaseThree.id,
            shockwavePhaseThreeA.id,
            shockwavePhaseThreeB.id,
          ],
        },
        weakPointAnchor: weakPointMesh,
        getActiveDroneCount: () => droneSquad!.activeCount,
      });
      this.controller = controller;

      this.weakPointTarget = new SentinelWeakPointTarget({
        hitMeshes: [weakPointMesh],
        authority: controller,
      });
      unregisterWeakPoint = options.targetRegistry.register(
        this.weakPointTarget,
        {
          registerCollision: true,
          transformMode: ColliderTransformMode.Dynamic,
        },
      );
      this.unregisterWeakPoint = unregisterWeakPoint;
    } catch (error) {
      unregisterWeakPoint?.();
      if (controller) {
        controller.dispose();
      } else {
        for (
          let index = constructedAttacks.length - 1;
          index >= 0;
          index -= 1
        ) {
          constructedAttacks[index]?.dispose();
        }
      }
      droneSquad?.dispose();
      this.disposeProxyGeometry();
      this.root.removeFromParent();
      this.root.clear();
      throw error;
    }

    this.syncPresentation();
  }

  syncPresentation(): void {
    if (this.disposed) return;
    const model = this.controller.readModel;
    const material = this.weakPointMesh.material;
    material.emissiveIntensity = model.weakPointOpen ? 2.2 : 0.45;
    material.opacity = model.defeated ? 0.3 : 1;
    material.transparent = model.defeated;
    this.bossProxy.visible = !model.defeated;
  }

  reset(): void {
    if (this.disposed) return;
    this.controller.reset();
    this.droneSquad.reset();
    this.syncPresentation();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.dispose();
    this.unregisterWeakPoint();
    this.droneSquad.dispose();
    this.disposeProxyGeometry();
    this.root.removeFromParent();
    this.root.clear();
  }

  private disposeProxyGeometry(): void {
    for (const mesh of [this.bossProxy, this.weakPointMesh]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) material.dispose();
    }
  }
}
