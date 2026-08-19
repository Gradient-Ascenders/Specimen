import * as THREE from 'three';

import type { LaserHazard } from '../../hazards/LaserHazard';

const SEGMENT_EPSILON_SQ = 1e-12;
const UP_AXIS = new THREE.Vector3(0, 1, 0);

interface ProxyVisibility {
  readonly object: THREE.Object3D;
  readonly visible: boolean;
}

interface LaserVisual {
  readonly source: LaserHazard;
  readonly beamCore: THREE.Mesh;
  readonly beamHalo: THREE.Mesh;
  readonly startEmitter: THREE.Group;
  readonly endEmitter: THREE.Group;
  readonly activeIndicators: readonly THREE.Mesh[];
  readonly inactiveIndicators: readonly THREE.Mesh[];
  readonly proxyVisibility: readonly ProxyVisibility[];
}

interface EmitterVisual {
  readonly root: THREE.Group;
  readonly activeIndicator: THREE.Mesh;
  readonly inactiveIndicators: readonly THREE.Mesh[];
}

/**
 * Presentation-only adapter for the deterministic laser runtime.
 *
 * Every visible pose and active/inactive choice is re-derived from the
 * authoritative LaserHazard on sync. The adapter owns no timing, collision,
 * recovery or reset state.
 */
export class LaserHazardPresentation {
  readonly root = new THREE.Group();

  private readonly visuals: readonly LaserVisual[];
  private readonly segment = new THREE.Vector3();
  private readonly midpoint = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly reverseDirection = new THREE.Vector3();
  private readonly beamQuaternion = new THREE.Quaternion();
  private readonly reverseQuaternion = new THREE.Quaternion();

  private readonly beamGeometry = new THREE.CylinderGeometry(
    1,
    1,
    1,
    14,
    1,
    false,
  );
  private readonly housingGeometry = new THREE.CylinderGeometry(
    1,
    1,
    1,
    16,
    1,
    false,
  );
  private readonly collarGeometry = new THREE.TorusGeometry(1, 0.15, 8, 20);
  private readonly shutterGeometry = new THREE.BoxGeometry(1, 1, 1);

  private readonly coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xff1838,
    toneMapped: false,
  });
  private readonly haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xff3048,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly housingMaterial = new THREE.MeshStandardMaterial({
    color: 0x252a2f,
    roughness: 0.48,
    metalness: 0.72,
  });
  private readonly collarMaterial = new THREE.MeshStandardMaterial({
    color: 0x79838b,
    roughness: 0.42,
    metalness: 0.78,
  });
  private readonly activeMaterial = new THREE.MeshStandardMaterial({
    color: 0xff2842,
    emissive: 0xff1028,
    emissiveIntensity: 3.2,
    roughness: 0.32,
    metalness: 0.08,
    toneMapped: false,
  });
  private readonly inactiveMaterial = new THREE.MeshStandardMaterial({
    color: 0x26323a,
    emissive: 0x10191d,
    emissiveIntensity: 0.25,
    roughness: 0.78,
    metalness: 0.28,
  });

  constructor(hazards: readonly LaserHazard[]) {
    this.root.name = 'laser-hazard-presentation';
    this.root.userData.presentationOnly = true;
    this.visuals = hazards.map((hazard) => this.createVisual(hazard));
    this.sync();
  }

  /** Re-read all authoritative endpoints and enabled states. */
  sync(): void {
    for (const visual of this.visuals) {
      this.syncVisual(visual);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.clear();

    for (const visual of this.visuals) {
      for (const proxy of visual.proxyVisibility) {
        proxy.object.visible = proxy.visible;
      }
    }

    this.beamGeometry.dispose();
    this.housingGeometry.dispose();
    this.collarGeometry.dispose();
    this.shutterGeometry.dispose();
    this.coreMaterial.dispose();
    this.haloMaterial.dispose();
    this.housingMaterial.dispose();
    this.collarMaterial.dispose();
    this.activeMaterial.dispose();
    this.inactiveMaterial.dispose();
  }

  private createVisual(source: LaserHazard): LaserVisual {
    const beamCore = new THREE.Mesh(this.beamGeometry, this.coreMaterial);
    beamCore.name = `${source.id}-presentation-beam-core`;
    beamCore.userData.laserHazardId = source.id;
    beamCore.userData.presentationOnly = true;

    const beamHalo = new THREE.Mesh(this.beamGeometry, this.haloMaterial);
    beamHalo.name = `${source.id}-presentation-beam-halo`;
    beamHalo.userData.laserHazardId = source.id;
    beamHalo.userData.presentationOnly = true;
    beamHalo.renderOrder = 1;

    const startEmitter = this.createEmitter(
      `${source.id}-presentation-emitter-start`,
      source.id,
    );
    const endEmitter = this.createEmitter(
      `${source.id}-presentation-emitter-end`,
      source.id,
    );

    const proxyVisibility: ProxyVisibility[] = [];
    source.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.userData.runtimeProxy) {
        return;
      }
      proxyVisibility.push({ object, visible: object.visible });
      object.visible = false;
    });

    this.root.add(
      beamHalo,
      beamCore,
      startEmitter.root,
      endEmitter.root,
    );

    return {
      source,
      beamCore,
      beamHalo,
      startEmitter: startEmitter.root,
      endEmitter: endEmitter.root,
      activeIndicators: [
        startEmitter.activeIndicator,
        endEmitter.activeIndicator,
      ],
      inactiveIndicators: [
        ...startEmitter.inactiveIndicators,
        ...endEmitter.inactiveIndicators,
      ],
      proxyVisibility,
    };
  }

  private createEmitter(name: string, hazardId: string): EmitterVisual {
    const root = new THREE.Group();
    root.name = name;
    root.userData.laserHazardId = hazardId;
    root.userData.presentationOnly = true;

    const housing = new THREE.Mesh(
      this.housingGeometry,
      this.housingMaterial,
    );
    housing.name = `${name}-housing`;

    const collar = new THREE.Mesh(
      this.collarGeometry,
      this.collarMaterial,
    );
    collar.name = `${name}-collar`;
    collar.rotation.x = Math.PI / 2;

    const activeIndicator = new THREE.Mesh(
      this.housingGeometry,
      this.activeMaterial,
    );
    activeIndicator.name = `${name}-active-aperture`;

    const inactiveAperture = new THREE.Mesh(
      this.housingGeometry,
      this.inactiveMaterial,
    );
    inactiveAperture.name = `${name}-inactive-aperture`;

    const shutterA = new THREE.Mesh(
      this.shutterGeometry,
      this.inactiveMaterial,
    );
    shutterA.name = `${name}-inactive-shutter-a`;
    shutterA.rotation.y = Math.PI / 4;

    const shutterB = new THREE.Mesh(
      this.shutterGeometry,
      this.inactiveMaterial,
    );
    shutterB.name = `${name}-inactive-shutter-b`;
    shutterB.rotation.y = -Math.PI / 4;

    root.add(
      housing,
      collar,
      activeIndicator,
      inactiveAperture,
      shutterA,
      shutterB,
    );

    return {
      root,
      activeIndicator,
      inactiveIndicators: [inactiveAperture, shutterA, shutterB],
    };
  }

  private syncVisual(visual: LaserVisual): void {
    for (const proxy of visual.proxyVisibility) proxy.object.visible = false;

    this.segment.set(
      visual.source.end.x - visual.source.start.x,
      visual.source.end.y - visual.source.start.y,
      visual.source.end.z - visual.source.start.z,
    );
    const lengthSquared = this.segment.lengthSq();
    const hasLength = lengthSquared > SEGMENT_EPSILON_SQ;
    const enabled = visual.source.enabled && hasLength;

    visual.beamCore.visible = enabled;
    visual.beamHalo.visible = enabled;
    for (const indicator of visual.activeIndicators) {
      indicator.visible = visual.source.enabled;
    }
    for (const indicator of visual.inactiveIndicators) {
      indicator.visible = !visual.source.enabled;
    }

    visual.startEmitter.visible = hasLength;
    visual.endEmitter.visible = hasLength;
    if (!hasLength) return;

    const beamLength = Math.sqrt(lengthSquared);
    this.direction.copy(this.segment).multiplyScalar(1 / beamLength);
    this.reverseDirection.copy(this.direction).multiplyScalar(-1);
    this.midpoint
      .set(visual.source.start.x, visual.source.start.y, visual.source.start.z)
      .addScaledVector(this.segment, 0.5);
    this.beamQuaternion.setFromUnitVectors(UP_AXIS, this.direction);
    this.reverseQuaternion.setFromUnitVectors(
      UP_AXIS,
      this.reverseDirection,
    );

    const coreRadius = Math.max(visual.source.beamRadiusMetres * 0.72, 0.035);
    const haloRadius = Math.max(visual.source.beamRadiusMetres * 2.7, 0.11);
    visual.beamCore.position.copy(this.midpoint);
    visual.beamCore.quaternion.copy(this.beamQuaternion);
    visual.beamCore.scale.set(coreRadius, beamLength, coreRadius);
    visual.beamHalo.position.copy(this.midpoint);
    visual.beamHalo.quaternion.copy(this.beamQuaternion);
    visual.beamHalo.scale.set(haloRadius, beamLength, haloRadius);

    const emitterRadius = Math.max(
      visual.source.beamRadiusMetres * 3.2,
      0.18,
    );
    this.scaleEmitter(visual.startEmitter, emitterRadius);
    this.scaleEmitter(visual.endEmitter, emitterRadius);
    visual.startEmitter.position.set(
      visual.source.start.x,
      visual.source.start.y,
      visual.source.start.z,
    );
    visual.startEmitter.quaternion.copy(this.beamQuaternion);
    visual.endEmitter.position.set(
      visual.source.end.x,
      visual.source.end.y,
      visual.source.end.z,
    );
    visual.endEmitter.quaternion.copy(this.reverseQuaternion);
  }

  private scaleEmitter(emitter: THREE.Group, radius: number): void {
    const housing = emitter.children[0]!;
    const collar = emitter.children[1]!;
    const activeAperture = emitter.children[2]!;
    const inactiveAperture = emitter.children[3]!;
    const shutterA = emitter.children[4]!;
    const shutterB = emitter.children[5]!;

    housing.scale.set(radius, 0.34, radius);
    collar.scale.setScalar(radius * 0.94);
    collar.position.y = 0.13;
    activeAperture.scale.set(radius * 0.56, 0.045, radius * 0.56);
    activeAperture.position.y = 0.19;
    inactiveAperture.scale.copy(activeAperture.scale);
    inactiveAperture.position.copy(activeAperture.position);
    shutterA.scale.set(radius * 1.05, 0.035, radius * 0.13);
    shutterA.position.y = 0.235;
    shutterB.scale.copy(shutterA.scale);
    shutterB.position.copy(shutterA.position);
  }
}
