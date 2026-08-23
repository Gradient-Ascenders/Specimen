import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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
        color: 0x929a9b,
        roughness: 0.62,
        metalness: 0.42,
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
    const seamMaterial = this.material(
      new THREE.MeshStandardMaterial({
        color: 0x525a5c,
        roughness: 0.68,
        metalness: 0.38,
      }),
    );

    const deck = new THREE.Mesh(
      this.geometry(
        new RoundedBoxGeometry(
          size.x + 0.08,
          size.y + 0.04,
          size.z + 0.08,
          2,
          0.08,
        ),
      ),
      deckMaterial,
    );
    deck.name = `${this.sequence.id}-industrial-roof`;
    deck.userData.presentationOnly = true;
    this.platformDecoration.add(deck);

    const roofY = size.y * 0.5 + 0.055;
    for (const [index, [x, z, width, depth]] of [
      [0, -size.z * 0.26, size.x * 0.72, 0.035],
      [0, size.z * 0.26, size.x * 0.72, 0.035],
      [-size.x * 0.26, 0, 0.035, size.z * 0.72],
      [size.x * 0.26, 0, 0.035, size.z * 0.72],
    ].entries()) {
      const seam = this.box(
        `${this.sequence.id}-deck-plate-seam-${index + 1}`,
        width,
        0.018,
        depth,
        seamMaterial,
      );
      seam.position.set(x, roofY + 0.01, z);
      this.platformDecoration.add(seam);
    }
    for (const [index, [x, z, width, depth]] of [
      [-size.x * 0.27, -size.z * 0.5 + 0.1, 1.05, 0.12],
      [size.x * 0.27, size.z * 0.5 - 0.1, 1.05, 0.12],
      [-size.x * 0.5 + 0.1, size.z * 0.27, 0.12, 1.05],
      [size.x * 0.5 - 0.1, -size.z * 0.27, 0.12, 1.05],
    ].entries()) {
      const trim = this.box(
        `${this.sequence.id}-roof-sparse-warning-index-${index + 1}`,
        width,
        0.065,
        depth,
        trimMaterial,
      );
      trim.position.set(x, roofY, z);
      this.platformDecoration.add(trim);
    }

    const deckSeat = this.box(
      `${this.sequence.id}-graphite-perimeter-seat`,
      size.x + 0.18,
      0.22,
      size.z + 0.18,
      darkMaterial,
    );
    deckSeat.position.y = -size.y * 0.5 - 0.08;
    this.platformDecoration.add(deckSeat);

    for (const z of [-size.z * 0.29, size.z * 0.29]) {
      const beam = this.box(
        `${this.sequence.id}-underside-longitudinal-load-frame`,
        size.x * 0.82,
        0.28,
        0.28,
        darkMaterial,
      );
      beam.position.set(0, -size.y * 0.5 - 0.34, z);
      this.platformDecoration.add(beam);
    }
    for (const x of [-size.x * 0.29, size.x * 0.29]) {
      const beam = this.box(
        `${this.sequence.id}-underside-cross-member`,
        0.28,
        0.28,
        size.z * 0.82,
        darkMaterial,
      );
      beam.position.set(x, -size.y * 0.5 - 0.34, 0);
      this.platformDecoration.add(beam);
    }
    const motorHousing = this.box(
      `${this.sequence.id}-underside-actuator-motor-housing`,
      size.x * 0.42,
      0.72,
      size.z * 0.34,
      darkMaterial,
    );
    motorHousing.position.y = -size.y * 0.5 - 0.68;
    this.platformDecoration.add(motorHousing);

    const rollerGeometry = this.geometry(
      new THREE.CylinderGeometry(0.18, 0.18, 0.16, 16),
    );
    for (const z of [-size.z * 0.28, size.z * 0.28]) {
      const underdeckBracket = this.box(
        `${this.sequence.id}-west-guide-underdeck-bracket`,
        1.0,
        0.18,
        0.32,
        darkMaterial,
      );
      underdeckBracket.position.set(-size.x * 0.5 + 0.55, -0.58, z);
      const couplingRod = this.box(
        `${this.sequence.id}-west-guide-coupling-rod`,
        2.5,
        0.08,
        0.08,
        trimMaterial,
      );
      couplingRod.position.set(-size.x * 0.5 - 0.72, -0.78, z);
      const housing = this.box(
        `${this.sequence.id}-guide-roller-housing`,
        0.3,
        0.46,
        0.5,
        darkMaterial,
      );
      housing.position.set(-size.x * 0.5 - 1.95, -0.78, z);
      const roller = new THREE.Mesh(rollerGeometry, trimMaterial);
      roller.name = `${this.sequence.id}-guide-roller`;
      roller.userData.presentationOnly = true;
      roller.rotation.x = Math.PI / 2;
      roller.position.set(-size.x * 0.5 - 2.18, -0.78, z);
      this.platformDecoration.add(
        underdeckBracket,
        couplingRod,
        housing,
        roller,
      );
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
    const end = this.sequence.routeEnd;
    const size = this.sequence.platform.size;
    const shutterMaterial = this.material(
      new THREE.MeshStandardMaterial({
        color: 0x4b555b,
        roughness: 0.55,
        metalness: 0.72,
      }),
    );

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
      end.z + (size.z * 0.5 + 1.72),
    );
    this.root.add(shutter);

    this.exitRoute.name = `${this.sequence.id}-room5-exit-route`;
    this.exitRoute.userData.presentationOnly = true;
    const walkway = this.box(
      `${this.sequence.id}-room5-exit-centre-status-guide`,
      0.32,
      0.045,
      2.5,
      this.arrivalMaterial,
    );
    walkway.position.set(
      end.x,
      roofY + 0.095,
      end.z + (size.z * 0.5 + 2.7),
    );
    this.exitRoute.add(walkway);
    this.root.add(this.exitRoute);

    const beaconGeometry = this.geometry(new THREE.BoxGeometry(1.8, 0.18, 0.12));
    const beacon = new THREE.Mesh(beaconGeometry, this.arrivalMaterial);
    beacon.name = `${this.sequence.id}-arrival-beacon`;
    beacon.position.set(
      end.x,
      roofY + 2.42,
      end.z + size.z * 0.5 + 1.45,
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
