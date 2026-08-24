import * as THREE from 'three';

import type { DissolveTarget } from '../abilities/DissolveTarget.ts';
import {
  RadioactiveFloorHazard,
  type RadioactiveFloorOccupant,
  type RadioactiveFloorSlimeId,
} from '../hazards/RadioactiveFloorHazard.ts';
import { GreyboxDropPreview } from './GreyboxDropPreview.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';

export const LEVEL_TWO_ROOM_ONE_BOB_SPAWN = new THREE.Vector3(-11, 0.66, 5.5);
export const LEVEL_TWO_ROOM_ONE_GOOP_SPAWN = new THREE.Vector3(-9, 0.66, 5.5);

interface PlatformAssemblyDefinition {
  readonly id: string;
  readonly landingPosition: readonly [number, number, number];
  readonly suspendedPosition: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

const PLATFORM_ASSEMBLIES: readonly PlatformAssemblyDefinition[] = [
  {
    id: 'cultivation-room-1-platform-1',
    landingPosition: [-3, 0.55, 15.5],
    suspendedPosition: [-3, 13, 15.5],
    size: [5, 0.6, 5],
  },
  {
    id: 'cultivation-room-1-platform-2',
    landingPosition: [2, 1.15, 25],
    suspendedPosition: [2, 15, 25],
    size: [5, 0.6, 5],
  },
  {
    id: 'cultivation-room-1-platform-3',
    landingPosition: [-1, 1.75, 35],
    suspendedPosition: [-1, 12.5, 35],
    size: [5, 0.6, 5],
  },
];

export interface LevelTwoRoomOneHazardFailure {
  readonly roomId: 1;
  readonly hazardId: string;
  readonly slimeId: RadioactiveFloorSlimeId;
}

/** Large Room 1 cooperation chamber with real suspended initial platform state. */
export class LevelTwoRoomOneGreybox {
  readonly builder = new GreyboxRoomBuilder('cultivation-room-1-greybox');
  readonly root = this.builder.root;
  readonly collisionMeshes = this.builder.collisionMeshes;
  readonly solubleTargetMeshes: THREE.Mesh[] = [];
  readonly platformDrops: GreyboxDropPreview[] = [];
  readonly radiationHazard: RadioactiveFloorHazard;

  constructor(
    requestFailure: (failure: LevelTwoRoomOneHazardFailure) => void,
  ) {
    this.root.userData.levelId = 'cultivation';
    this.root.userData.roomId = 1;
    const radiationFloor = this.buildShell();
    this.radiationHazard = new RadioactiveFloorHazard({
      id: radiationFloor.name,
      mesh: radiationFloor,
      lethalSlimeIds: ['bob'],
      requestRecovery: (slimeId) =>
        requestFailure({
          roomId: 1,
          hazardId: radiationFloor.name,
          slimeId,
        }),
    });
    this.buildSuspendedPlatformRoute();
    this.buildEntranceVent();
    this.buildRoomTwoConnection();
    this.addProgressionAnchors();
  }

  bindDissolveTargets(targets: readonly DissolveTarget[]): void {
    for (const drop of this.platformDrops) drop.bind(targets);
  }

  update(deltaSeconds: number): void {
    for (const drop of this.platformDrops) drop.update(deltaSeconds);
  }

  updateRadiation(
    occupants: Iterable<RadioactiveFloorOccupant>,
  ): void {
    this.radiationHazard.update(occupants);
  }

  reset(): void {
    for (const drop of this.platformDrops) drop.reset();
    this.radiationHazard.reset();
  }

  dispose(): void {
    for (const drop of this.platformDrops) drop.dispose();
    this.platformDrops.length = 0;
    this.radiationHazard.dispose();
    this.solubleTargetMeshes.length = 0;
    this.builder.dispose();
  }

  private buildShell(): THREE.Mesh {
    const { acid, floor, wall } = this.builder.materials;

    this.builder.addCollider({
      name: 'cultivation-room-1-start-floor',
      size: [35.6, 0.4, 9],
      position: [0, 0, 4.5],
      material: floor,
    });
    const radiation = this.builder.addCollider({
      name: 'cultivation-room-1-radioactive-floor',
      size: [35.6, 0.3, 34],
      position: [0, -0.15, 26],
      material: acid,
      textureRole: 'acid-floor',
    });
    this.markRadiation(radiation);
    this.builder.addCollider({
      name: 'cultivation-room-1-far-floor',
      size: [35.6, 0.4, 7],
      position: [0, 0, 46.5],
      material: floor,
    });

    this.builder.addCollider({
      name: 'cultivation-room-1-west-wall',
      size: [0.4, 20, 50],
      position: [-18, 10, 25],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-1-east-wall',
      size: [0.4, 20, 50],
      position: [18, 10, 25],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-1-entry-wall',
      size: [36, 20, 0.4],
      position: [0, 10, 0],
      material: wall,
    });

    // Four ceiling pieces leave a true 4 x 4 metre vent opening.
    this.builder.addCollider({
      name: 'cultivation-room-1-ceiling-west',
      size: [6, 0.4, 50],
      position: [-15, 20, 25],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-1-ceiling-east',
      size: [26, 0.4, 50],
      position: [5, 20, 25],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-1-ceiling-before-vent',
      size: [4, 0.4, 2],
      position: [-10, 20, 1],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-1-ceiling-after-vent',
      size: [4, 0.4, 44],
      position: [-10, 20, 28],
      material: wall,
    });

    this.builder.addLight(
      'cultivation-room-1-radiation-light-near',
      [-7, 3.5, 18],
      0xa7ff32,
      18,
      25,
    );
    this.builder.addLight(
      'cultivation-room-1-radiation-light-far',
      [7, 3.5, 34],
      0xa7ff32,
      18,
      25,
    );
    this.builder.addLight(
      'cultivation-room-1-exit-light',
      [0, 5, 49],
      0x7dffe0,
      14,
      15,
    );
    return radiation;
  }

  private buildSuspendedPlatformRoute(): void {
    const { etch, platform, support, wood } = this.builder.materials;

    for (const definition of PLATFORM_ASSEMBLIES) {
      const [x, suspendedY, z] = definition.suspendedPosition;
      const platformCollider = this.builder.addCollider({
        name: `${definition.id}-platform`,
        size: definition.size,
        position: definition.suspendedPosition,
        material: platform,
      });
      platformCollider.userData.levelId = 'cultivation';
      platformCollider.userData.roomId = 1;
      platformCollider.userData.assemblyId = definition.id;
      platformCollider.userData.suspendedPosition = [
        ...definition.suspendedPosition,
      ];
      platformCollider.userData.landingPosition = [...definition.landingPosition];

      this.builder.addVisualBox({
        name: `${definition.id}-ceiling-mount`,
        size: [1.8, 0.55, 1.8],
        position: [x, 19.55, z],
        material: support,
      });

      const ropeBottom = suspendedY + definition.size[1] * 0.5;
      const ropeTop = 19.25;
      const ropeLength = ropeTop - ropeBottom;
      const rope = this.builder.addCollider({
        name: `${definition.id}-soluble-rope`,
        size: [0.48, ropeLength, 0.48],
        position: [x, ropeBottom + ropeLength * 0.5, z],
        material: wood,
        interactionRole: 'goop-dissolvable',
      });
      rope.userData.soluble = true;
      rope.userData.solubleId = rope.name;
      rope.userData.textureRole = 'soluble-rope';
      rope.userData.levelId = 'cultivation';
      rope.userData.roomId = 1;
      rope.userData.assemblyId = definition.id;
      rope.userData.releaseMode = 'fall-to-radiation';
      this.solubleTargetMeshes.push(rope);

      const marker = this.builder.addVisualBox({
        name: `${definition.id}-soluble-marker-band`,
        size: [0.68, 0.42, 0.68],
        position: [x, rope.position.y, z],
        material: etch,
      });
      marker.userData.presentationOnly = true;
      marker.userData.targetId = rope.name;
      rope.add(marker);
      marker.position.set(0, 0, 0);

      this.platformDrops.push(
        new GreyboxDropPreview({
          id: definition.id,
          mesh: platformCollider,
          solubleTargetId: rope.name,
          suspendedPosition: new THREE.Vector3(...definition.suspendedPosition),
          landingPosition: new THREE.Vector3(...definition.landingPosition),
          fallDurationSeconds: 0.85,
          fallTiltRadians: 0.06,
        }),
      );
    }
  }

  private buildEntranceVent(): void {
    const { duct, support } = this.builder.materials;

    this.builder.addVisualBox({
      name: 'cultivation-room-1-broken-vent-frame-west',
      size: [0.3, 0.6, 4.6],
      position: [-12.15, 19.65, 4],
      material: support,
    });
    this.builder.addVisualBox({
      name: 'cultivation-room-1-broken-vent-frame-east',
      size: [0.3, 0.6, 4.6],
      position: [-7.85, 19.65, 4],
      material: support,
    });
    this.builder.addVisualBox({
      name: 'cultivation-room-1-broken-vent-frame-south',
      size: [4.6, 0.6, 0.3],
      position: [-10, 19.65, 1.85],
      material: duct,
    });
    this.builder.addVisualBox({
      name: 'cultivation-room-1-broken-vent-frame-north',
      size: [4.6, 0.6, 0.3],
      position: [-10, 19.65, 6.15],
      material: duct,
    });
  }

  private buildRoomTwoConnection(): void {
    const { exit, wall } = this.builder.materials;

    this.builder.addCollider({
      name: 'cultivation-room-1-far-wall-west',
      size: [16, 20, 0.4],
      position: [-10, 10, 50],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-1-far-wall-east',
      size: [16, 20, 0.4],
      position: [10, 10, 50],
      material: wall,
    });
    this.builder.addCollider({
      name: 'cultivation-room-1-far-wall-above-door',
      size: [4, 15.4, 0.4],
      position: [0, 12.3, 50],
      material: wall,
    });
    this.builder.addVisualBox({
      name: 'cultivation-room-1-room-2-exit-header',
      size: [4.4, 0.4, 0.55],
      position: [0, 4.8, 49.7],
      material: exit,
    });
  }

  private addProgressionAnchors(): void {
    this.addAnchor(
      'cultivation-room-1-bob-checkpoint-anchor',
      LEVEL_TWO_ROOM_ONE_BOB_SPAWN,
      { checkpointRole: 'bob' },
    );
    this.addAnchor(
      'cultivation-room-1-goop-checkpoint-anchor',
      LEVEL_TWO_ROOM_ONE_GOOP_SPAWN,
      { checkpointRole: 'goop' },
    );
    this.addAnchor(
      'cultivation-room-1-bob-completion-trigger-anchor',
      new THREE.Vector3(0, 2.75, 52),
      {
        triggerRole: 'room-completion',
        requiredSlimeId: 'bob',
        sizeMetres: [4, 4.6, 3],
      },
    );
  }

  private addAnchor(
    name: string,
    position: THREE.Vector3,
    metadata: Readonly<Record<string, unknown>>,
  ): void {
    const anchor = new THREE.Object3D();
    anchor.name = name;
    anchor.position.copy(position);
    Object.assign(anchor.userData, metadata, {
      levelId: 'cultivation',
      roomId: 1,
    });
    this.root.add(anchor);
  }

  private markRadiation(mesh: THREE.Mesh): void {
    mesh.userData.levelId = 'cultivation';
    mesh.userData.roomId = 1;
    mesh.userData.hazardRole = 'radioactive';
    mesh.userData.hazardPolicy = 'bob-lethal-goop-immune';
  }
}
