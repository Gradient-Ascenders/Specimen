import * as THREE from 'three';

import type {
  ElevatorSequence,
  ElevatorSequenceState,
} from '../../puzzle/ElevatorSequence.ts';

export interface ElevatorPresentationDiagnostics {
  readonly state: ElevatorSequenceState;
  readonly progress: number;
  readonly warningLightIntensity: number;
  readonly arrivalCueVisible: boolean;
  readonly exitRouteVisible: boolean;
}

/**
 * Industrial, presentation-only view of an ElevatorSequence.
 *
 * The platform decoration follows the runtime-owned root. All status cues are
 * a direct mapping of sequence state/timers and therefore cannot outlive a
 * runtime reset.
 */
export class ElevatorPresentation {
  readonly root = new THREE.Group();
  readonly cameraObstructionMeshes: THREE.Mesh[] = [];

  private readonly sequence: ElevatorSequence;
  private readonly platformDecoration = new THREE.Group();
  private readonly exitRoute = new THREE.Group();
  private readonly closedShutter: THREE.Mesh;
  private readonly arrivalBeacon: THREE.Mesh;
  private readonly lampMaterial = new THREE.MeshStandardMaterial({
    color: 0x292b27,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.38,
    metalness: 0.25,
  });
  private readonly arrivalMaterial = new THREE.MeshStandardMaterial({
    color: 0x183128,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.4,
    metalness: 0.18,
  });
  private readonly warningLights: readonly THREE.PointLight[];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();

  private warningLightIntensityValue = 0;
  private arrivalCueVisibleValue = false;

  constructor(sequence: ElevatorSequence) {
    this.sequence = sequence;
    this.root.name = `${sequence.id}-presentation`;
    this.root.userData.presentationOnly = true;
    this.platformDecoration.name = `${sequence.id}-roof-presentation`;
    this.platformDecoration.userData.presentationOnly = true;

    this.materials.add(this.lampMaterial);
    this.materials.add(this.arrivalMaterial);

    this.warningLights = this.buildPlatformRoof();
    const { shutter, beacon } = this.buildShaftAndExit();
    this.closedShutter = shutter;
    this.arrivalBeacon = beacon;

    this.sequence.root.add(this.platformDecoration);
    this.sync();
  }

  get diagnostics(): ElevatorPresentationDiagnostics {
    return {
      state: this.sequence.state,
      progress: this.sequence.ascentProgress,
      warningLightIntensity: this.warningLightIntensityValue,
      arrivalCueVisible: this.arrivalCueVisibleValue,
      exitRouteVisible: this.exitRoute.visible,
    };
  }

  /** Derive every transient cue directly from current runtime state. */
  sync(): void {
    const state = this.sequence.state;
    let colour = 0x222622;
    let emissive = 0x000000;
    let materialIntensity = 0;
    let lightIntensity = 0;

    if (state === 'warning') {
      const pulse =
        0.55 +
        0.45 *
          Math.sin(this.sequence.stateElapsedSeconds * Math.PI * 6) ** 2;
      colour = 0xffb323;
      emissive = 0xff7a08;
      materialIntensity = 2.2 * pulse;
      lightIntensity = 2.8 * pulse;
    } else if (state === 'ascending') {
      colour = 0xff9e1b;
      emissive = 0xff6508;
      materialIntensity = 1.5;
      lightIntensity = 1.8;
    } else if (state === 'arrivalPause') {
      colour = 0x7bffb0;
      emissive = 0x28ff77;
      materialIntensity = 2.5;
      lightIntensity = 2.4;
    } else if (state === 'exitReady') {
      colour = 0x62e89a;
      emissive = 0x20d968;
      materialIntensity = 1.1;
      lightIntensity = 0.9;
    }

    this.lampMaterial.color.setHex(colour);
    this.lampMaterial.emissive.setHex(emissive);
    this.lampMaterial.emissiveIntensity = materialIntensity;
    for (const light of this.warningLights) {
      light.color.setHex(colour);
      light.intensity = lightIntensity;
    }

    const arrived = state === 'arrivalPause' || state === 'exitReady';
    this.arrivalMaterial.color.setHex(arrived ? 0x68f5a0 : 0x183128);
    this.arrivalMaterial.emissive.setHex(arrived ? 0x20e870 : 0x000000);
    this.arrivalMaterial.emissiveIntensity = arrived ? 2 : 0;
    this.arrivalBeacon.visible = arrived;
    this.exitRoute.visible = state === 'exitReady';
    this.closedShutter.visible = state !== 'exitReady';

    this.warningLightIntensityValue = lightIntensity;
    this.arrivalCueVisibleValue = arrived;
  }

  dispose(): void {
    this.platformDecoration.removeFromParent();
    this.root.removeFromParent();
    this.platformDecoration.clear();
    this.root.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.cameraObstructionMeshes.length = 0;
  }

  private buildPlatformRoof(): readonly THREE.PointLight[] {
    const size = this.sequence.platform.size;
    const deckMaterial = this.material(
      new THREE.MeshStandardMaterial({
        color: 0x343c42,
        roughness: 0.58,
        metalness: 0.68,
      }),
    );
    const trimMaterial = this.material(
      new THREE.MeshStandardMaterial({
        color: 0xe2a82f,
        roughness: 0.52,
        metalness: 0.35,
      }),
    );
    const darkMaterial = this.material(
      new THREE.MeshStandardMaterial({
        color: 0x171d21,
        roughness: 0.68,
        metalness: 0.62,
      }),
    );

    const deck = this.box(
      `${this.sequence.id}-industrial-roof`,
      size.x + 0.08,
      size.y + 0.04,
      size.z + 0.08,
      deckMaterial,
    );
    this.platformDecoration.add(deck);

    const roofY = size.y * 0.5 + 0.055;
    for (const z of [-size.z * 0.5 + 0.1, size.z * 0.5 - 0.1]) {
      const trim = this.box(
        `${this.sequence.id}-roof-warning-trim-x`,
        size.x - 0.18,
        0.07,
        0.14,
        trimMaterial,
      );
      trim.position.set(0, roofY, z);
      this.platformDecoration.add(trim);
    }
    for (const x of [-size.x * 0.5 + 0.1, size.x * 0.5 - 0.1]) {
      const trim = this.box(
        `${this.sequence.id}-roof-warning-trim-z`,
        0.14,
        0.07,
        size.z - 0.18,
        trimMaterial,
      );
      trim.position.set(x, roofY, 0);
      this.platformDecoration.add(trim);
    }

    const lightGeometry = this.geometry(
      new THREE.CylinderGeometry(0.12, 0.15, 0.16, 12),
    );
    const lights: THREE.PointLight[] = [];
    const corners: readonly [number, number][] = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    for (const [xSign, zSign] of corners) {
      const housing = this.box(
        `${this.sequence.id}-warning-light-housing`,
        0.32,
        0.1,
        0.32,
        darkMaterial,
      );
      housing.position.set(
        xSign * (size.x * 0.5 - 0.28),
        roofY + 0.06,
        zSign * (size.z * 0.5 - 0.28),
      );

      const lens = new THREE.Mesh(lightGeometry, this.lampMaterial);
      lens.name = `${this.sequence.id}-warning-light-lens`;
      lens.position.copy(housing.position);
      lens.position.y += 0.12;
      this.platformDecoration.add(housing, lens);

      if (lights.length < 2) {
        const light = new THREE.PointLight(0xffa020, 0, 3.6, 2);
        light.name = `${this.sequence.id}-warning-point-light`;
        light.position.copy(lens.position);
        light.position.y += 0.08;
        this.platformDecoration.add(light);
        lights.push(light);
      }
    }

    return lights;
  }

  private buildShaftAndExit(): {
    readonly shutter: THREE.Mesh;
    readonly beacon: THREE.Mesh;
  } {
    const start = this.sequence.routeStart;
    const end = this.sequence.routeEnd;
    const size = this.sequence.platform.size;
    const minimumY = Math.min(start.y, end.y) - 0.5;
    const maximumY = Math.max(start.y, end.y) + 2.3;
    const shaftHeight = maximumY - minimumY;
    const centreY = (minimumY + maximumY) * 0.5;

    const steelMaterial = this.material(
      new THREE.MeshStandardMaterial({
        color: 0x263139,
        roughness: 0.58,
        metalness: 0.78,
      }),
    );
    const markingMaterial = this.material(
      new THREE.MeshStandardMaterial({
        color: 0xe5b642,
        emissive: 0x3a2404,
        emissiveIntensity: 0.42,
        roughness: 0.62,
        metalness: 0.25,
      }),
    );
    const shutterMaterial = this.material(
      new THREE.MeshStandardMaterial({
        color: 0x4b555b,
        roughness: 0.55,
        metalness: 0.72,
      }),
    );

    const columnOffsetX = size.x * 0.5 + 0.58;
    const columnOffsetZ = size.z * 0.5 + 0.58;
    for (const xSign of [-1, 1]) {
      for (const zSign of [-1, 1]) {
        const column = this.box(
          `${this.sequence.id}-shaft-support`,
          0.2,
          shaftHeight,
          0.2,
          steelMaterial,
        );
        column.position.set(
          start.x + xSign * columnOffsetX,
          centreY,
          start.z + zSign * columnOffsetZ,
        );
        this.root.add(column);
      }
    }

    const backZ = start.z - columnOffsetZ;
    for (let y = minimumY + 0.65; y < maximumY - 0.5; y += 0.9) {
      const marker = this.box(
        `${this.sequence.id}-shaft-height-marker`,
        size.x + 1.15,
        0.09,
        0.12,
        markingMaterial,
      );
      marker.position.set(start.x, y, backZ);
      this.root.add(marker);
    }

    const topFrame = this.box(
      `${this.sequence.id}-shaft-top-frame`,
      size.x + 1.4,
      0.28,
      size.z + 1.4,
      steelMaterial,
    );
    topFrame.position.set(start.x, maximumY, start.z);
    topFrame.userData.queryRole = 'camera-obstruction';
    this.cameraObstructionMeshes.push(topFrame);
    this.root.add(topFrame);

    const roofY = end.y + size.y * 0.5;
    const shutter = this.box(
      `${this.sequence.id}-room5-closed-shutter`,
      2.5,
      2.7,
      0.18,
      shutterMaterial,
    );
    shutter.position.set(
      end.x,
      roofY + 1.35,
      end.z - (size.z * 0.5 + 0.32),
    );
    this.root.add(shutter);

    this.exitRoute.name = `${this.sequence.id}-room5-exit-route`;
    this.exitRoute.userData.presentationOnly = true;
    const walkway = this.box(
      `${this.sequence.id}-room5-exit-walkway`,
      2.35,
      0.18,
      4.2,
      steelMaterial,
    );
    walkway.position.set(
      end.x,
      roofY - 0.09,
      end.z - (size.z * 0.5 + 2.1),
    );
    this.exitRoute.add(walkway);

    const routeGuide = this.box(
      `${this.sequence.id}-room5-exit-guide`,
      0.32,
      0.05,
      4.0,
      this.arrivalMaterial,
    );
    routeGuide.position.set(end.x, roofY + 0.025, walkway.position.z);
    this.exitRoute.add(routeGuide);

    for (const zSign of [-1, 1]) {
      const routeTrim = this.box(
        `${this.sequence.id}-room5-exit-trim`,
        0.12,
        0.08,
        4.2,
        markingMaterial,
      );
      routeTrim.position.set(
        end.x + zSign * 1.08,
        roofY + 0.04,
        walkway.position.z,
      );
      this.exitRoute.add(routeTrim);
    }

    const portalZ = end.z - (size.z * 0.5 + 4.2);
    for (const xSign of [-1, 1]) {
      const portalSide = this.box(
        `${this.sequence.id}-room5-exit-portal-side`,
        0.22,
        3.0,
        0.22,
        steelMaterial,
      );
      portalSide.position.set(end.x + xSign * 1.25, roofY + 1.5, portalZ);
      this.exitRoute.add(portalSide);
    }
    const portalTop = this.box(
      `${this.sequence.id}-room5-exit-portal-top`,
      2.72,
      0.22,
      0.22,
      steelMaterial,
    );
    portalTop.position.set(end.x, roofY + 3.0, portalZ);
    this.exitRoute.add(portalTop);

    const arrowStem = this.box(
      `${this.sequence.id}-room5-exit-arrow-stem`,
      0.18,
      0.7,
      0.08,
      this.arrivalMaterial,
    );
    arrowStem.position.set(end.x, roofY + 2.28, portalZ + 0.14);
    this.exitRoute.add(arrowStem);
    for (const rotationZ of [-Math.PI / 4, Math.PI / 4]) {
      const arrowHead = this.box(
        `${this.sequence.id}-room5-exit-arrow-head`,
        0.48,
        0.16,
        0.08,
        this.arrivalMaterial,
      );
      arrowHead.position.set(
        end.x + Math.sign(rotationZ) * 0.17,
        roofY + 2.58,
        portalZ + 0.14,
      );
      arrowHead.rotation.z = rotationZ;
      this.exitRoute.add(arrowHead);
    }
    this.root.add(this.exitRoute);

    const beaconGeometry = this.geometry(new THREE.BoxGeometry(1.8, 0.18, 0.12));
    const beacon = new THREE.Mesh(beaconGeometry, this.arrivalMaterial);
    beacon.name = `${this.sequence.id}-arrival-beacon`;
    beacon.position.set(
      end.x,
      roofY + 2.42,
      end.z - size.z * 0.5 - 0.22,
    );
    this.root.add(beacon);

    return { shutter, beacon };
  }

  private box(
    name: string,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.geometry(new THREE.BoxGeometry(x, y, z)),
      material,
    );
    mesh.name = name;
    mesh.userData.presentationOnly = true;
    return mesh;
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private material<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }
}
