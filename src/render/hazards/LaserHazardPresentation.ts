import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { LaserHazard } from '../../hazards/LaserHazard';

const SEGMENT_EPSILON_SQ = 1e-12;
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const COLLAR_QUATERNION = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2,
);
const SHUTTER_A_QUATERNION = new THREE.Quaternion().setFromAxisAngle(
  UP_AXIS,
  Math.PI / 4,
);
const SHUTTER_B_QUATERNION = new THREE.Quaternion().setFromAxisAngle(
  UP_AXIS,
  -Math.PI / 4,
);

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
  private readonly emitterBodyGeometries = new Map<
    number,
    THREE.BufferGeometry
  >();
  private readonly inactiveShutterGeometries = new Map<
    number,
    THREE.BufferGeometry
  >();

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
  private readonly emitterBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.75,
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
    for (const geometry of this.emitterBodyGeometries.values()) {
      geometry.dispose();
    }
    for (const geometry of this.inactiveShutterGeometries.values()) {
      geometry.dispose();
    }
    this.emitterBodyGeometries.clear();
    this.inactiveShutterGeometries.clear();
    this.coreMaterial.dispose();
    this.haloMaterial.dispose();
    this.emitterBodyMaterial.dispose();
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

    const emitterRadius = Math.max(source.beamRadiusMetres * 3.2, 0.18);
    const startEmitter = this.createEmitter(
      `${source.id}-presentation-emitter-start`,
      source.id,
      emitterRadius,
    );
    const endEmitter = this.createEmitter(
      `${source.id}-presentation-emitter-end`,
      source.id,
      emitterRadius,
    );

    const proxyVisibility: ProxyVisibility[] = [];
    source.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.userData.runtimeProxy) {
        return;
      }
      proxyVisibility.push({ object, visible: object.visible });
      object.visible = false;
    });

    this.root.add(beamHalo, beamCore, startEmitter.root, endEmitter.root);

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

  private createEmitter(
    name: string,
    hazardId: string,
    radius: number,
  ): EmitterVisual {
    const root = new THREE.Group();
    root.name = name;
    root.userData.laserHazardId = hazardId;
    root.userData.presentationOnly = true;

    const body = new THREE.Mesh(
      this.getEmitterBodyGeometry(radius),
      this.emitterBodyMaterial,
    );
    body.name = `${name}-housing-collar`;

    const activeIndicator = new THREE.Mesh(
      this.housingGeometry,
      this.activeMaterial,
    );
    activeIndicator.name = `${name}-active-aperture`;
    activeIndicator.scale.set(radius * 0.56, 0.045, radius * 0.56);
    activeIndicator.position.y = 0.19;

    const inactiveAperture = new THREE.Mesh(
      this.housingGeometry,
      this.inactiveMaterial,
    );
    inactiveAperture.name = `${name}-inactive-aperture`;
    inactiveAperture.scale.copy(activeIndicator.scale);
    inactiveAperture.position.copy(activeIndicator.position);

    const inactiveShutters = new THREE.Mesh(
      this.getInactiveShutterGeometry(radius),
      this.inactiveMaterial,
    );
    inactiveShutters.name = `${name}-inactive-shutters`;

    root.add(
      body,
      activeIndicator,
      inactiveAperture,
      inactiveShutters,
    );

    return {
      root,
      activeIndicator,
      inactiveIndicators: [inactiveAperture, inactiveShutters],
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

  private getEmitterBodyGeometry(radius: number): THREE.BufferGeometry {
    const cached = this.emitterBodyGeometries.get(radius);
    if (cached) return cached;

    const housing = this.housingGeometry.clone();
    housing.applyMatrix4(
      new THREE.Matrix4().makeScale(radius, 0.34, radius),
    );
    this.setGeometryColour(housing, 0x252a2f);

    const collar = this.collarGeometry.clone();
    collar.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0.13, 0),
        COLLAR_QUATERNION,
        new THREE.Vector3().setScalar(radius * 0.94),
      ),
    );
    this.setGeometryColour(collar, 0x79838b);

    const merged = mergeGeometries([housing, collar], false);
    housing.dispose();
    collar.dispose();
    if (!merged) throw new Error('Failed to merge laser emitter body.');
    merged.computeBoundingSphere();
    this.emitterBodyGeometries.set(radius, merged);
    return merged;
  }

  private getInactiveShutterGeometry(radius: number): THREE.BufferGeometry {
    const cached = this.inactiveShutterGeometries.get(radius);
    if (cached) return cached;

    const position = new THREE.Vector3(0, 0.235, 0);
    const scale = new THREE.Vector3(
      radius * 1.05,
      0.035,
      radius * 0.13,
    );
    const shutterA = this.shutterGeometry.clone();
    shutterA.applyMatrix4(
      new THREE.Matrix4().compose(
        position,
        SHUTTER_A_QUATERNION,
        scale,
      ),
    );
    const shutterB = this.shutterGeometry.clone();
    shutterB.applyMatrix4(
      new THREE.Matrix4().compose(
        position,
        SHUTTER_B_QUATERNION,
        scale,
      ),
    );

    const merged = mergeGeometries([shutterA, shutterB], false);
    shutterA.dispose();
    shutterB.dispose();
    if (!merged) throw new Error('Failed to merge inactive laser shutters.');
    merged.computeBoundingSphere();
    this.inactiveShutterGeometries.set(radius, merged);
    return merged;
  }

  private setGeometryColour(
    geometry: THREE.BufferGeometry,
    colourHex: number,
  ): void {
    const colour = new THREE.Color(colourHex);
    const colours = new Float32Array(
      geometry.getAttribute('position').count * 3,
    );
    for (let offset = 0; offset < colours.length; offset += 3) {
      colours[offset] = colour.r;
      colours[offset + 1] = colour.g;
      colours[offset + 2] = colour.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  }
}
