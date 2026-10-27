import * as THREE from 'three';
import { LaserEmitterModel } from './LaserEmitterModel.ts';

import type { LaserHazard } from '../../hazards/LaserHazard.ts';

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

export interface LaserHazardPresentationOptions {
  /** Scanner beams may terminate in open space without a second emitter. */
  readonly showEndEmitters?: boolean;
}

export interface AuthoredLaserEmitter {
  /** Geometry faces along local +Y, behind the authoritative beam origin. */
  readonly housing: THREE.Object3D;
  readonly aperture: THREE.BufferGeometry;
  readonly shutter: THREE.BufferGeometry;
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
  private readonly showEndEmitters: boolean;
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
  private readonly emitterModel = new LaserEmitterModel();

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

  constructor(
    hazards: readonly LaserHazard[],
    options: LaserHazardPresentationOptions = {},
  ) {
    this.root.name = 'laser-hazard-presentation';
    this.root.userData.presentationOnly = true;
    this.showEndEmitters = options.showEndEmitters ?? true;
    this.visuals = hazards.map((hazard) => this.createVisual(hazard));
    this.sync();
  }

  /** Re-read all authoritative endpoints and enabled states. */
  sync(): void {
    for (const visual of this.visuals) {
      this.syncVisual(visual);
    }
  }

  /** Borrow a rigid model while preserving the live endpoint/status owners.
   * The asset owner detaches it before releasing its shared geometry. */
  attachEmitterModel(model:AuthoredLaserEmitter):()=>void{
    const replacements:{mesh:THREE.Mesh;geometry:THREE.BufferGeometry;position:THREE.Vector3;scale:THREE.Vector3}[]=[];
    const housings:{body:THREE.Object3D;visible:boolean;model:THREE.Object3D}[]=[];
    for(const visual of this.visuals){
      for(const emitter of [visual.startEmitter,visual.endEmitter]){
        const body=emitter.getObjectByName(`${emitter.name}-housing-collar`)!;
        const housing=model.housing.clone(true);
        housing.name=`${emitter.name}-authored-housing`;
        housings.push({body,visible:body.visible,model:housing});
        body.visible=false;emitter.add(housing);
        for(const [suffix,geometry] of [['active-aperture',model.aperture],['inactive-aperture',model.aperture],
          ['inactive-shutters',model.shutter]] as const){
          const mesh=emitter.getObjectByName(`${emitter.name}-${suffix}`) as THREE.Mesh;
          replacements.push({mesh,geometry:mesh.geometry,position:mesh.position.clone(),scale:mesh.scale.clone()});
          mesh.geometry=geometry;mesh.position.set(0,0,0);mesh.scale.set(1,1,1);
        }
      }
    }
    this.sync();
    let detached=false;
    return ()=>{
      if(detached)return;detached=true;
      for(const replacement of replacements){
        replacement.mesh.geometry=replacement.geometry;
        replacement.mesh.position.copy(replacement.position);replacement.mesh.scale.copy(replacement.scale);
      }
      for(const housing of housings){housing.model.removeFromParent();housing.body.visible=housing.visible;}
    };
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
    this.emitterModel.dispose();
    this.coreMaterial.dispose();
    this.haloMaterial.dispose();
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

    const startEmitter = this.emitterModel.create(
      `${source.id}-presentation-emitter-start`,
      source.id,
    );
    const endEmitter = this.emitterModel.create(
      `${source.id}-presentation-emitter-end`,
      source.id,
    );

    const proxyVisibility: ProxyVisibility[] = [];
    source.root.traverse((object) => {
      if (object === source.root || !object.userData.runtimeProxy) {
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
    visual.endEmitter.visible = hasLength && this.showEndEmitters;
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

}
