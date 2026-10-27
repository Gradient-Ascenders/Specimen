import * as THREE from 'three';
import data from '../../assets/hazards/laser-emitter.geometry.json' with { type: 'json' };

export const LASER_EMITTER_ASSET = 'containment-room-three-laser-v1';
export interface LaserEmitterVisual {
  readonly root: THREE.Group;
  readonly activeIndicator: THREE.Mesh;
  readonly inactiveIndicators: readonly THREE.Mesh[];
}

function createResources() {
  const parts = new Map<string, THREE.BufferGeometry>();
  for (const [name, part] of Object.entries(data.parts)) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(part.attributes))
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(attribute.values, attribute.itemSize));
    geometry.setIndex(part.index); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    parts.set(name, geometry);
  }
  // These are the same linear colours and physical finishes as Level 1's bank.
  const graphite = new THREE.MeshStandardMaterial({ name: 'laser-emitter-graphite',
    color: new THREE.Color(.028, .043, .052), roughness: .65, metalness: .25 });
  const alloy = new THREE.MeshStandardMaterial({ name: 'laser-emitter-alloy',
    color: new THREE.Color(.28, .35, .37), roughness: .37, metalness: .7 });
  const active = new THREE.MeshStandardMaterial({ name: 'laser-emitter-active',
    color: 0xff2842, emissive: 0xff1028, emissiveIntensity: 3.2, roughness: .32, metalness: .08, toneMapped: false });
  const inactive = new THREE.MeshStandardMaterial({ name: 'laser-emitter-inactive',
    color: 0x26323a, emissive: 0x10191d, emissiveIntensity: .25, roughness: .78, metalness: .28 });
  return { parts, graphite, alloy, active, inactive, borrowers: 0 };
}
let shared: ReturnType<typeof createResources> | undefined;

/** Identical Level 1 geometry for room adapters and standalone/boss hazards.
 * All hardware sits behind local +Y=0, the authoritative beam origin. Buffers
 * and finishes are shared until the last hazard/presentation unloads. */
export class LaserEmitterModel {
  private readonly resources = shared ??= createResources();
  private disposed = false;
  constructor() { this.resources.borrowers++; }

  create(name: string, hazardId: string): LaserEmitterVisual {
    if (this.disposed) throw Error('Laser emitter model is disposed.');
    const r = this.resources, root = new THREE.Group();
    root.name = name;
    const mesh = (part: string, material: THREE.Material, suffix: string) => {
      const result = new THREE.Mesh(r.parts.get(part)!, material);
      result.name = `${name}-${suffix}`;
      Object.assign(result.userData, { laserHazardId: hazardId, presentationOnly: true,
        sharedLaserEmitter: true, laserEmitterAsset: LASER_EMITTER_ASSET });
      return result;
    };
    const housing = mesh('R3_Batch_Emitter_Graphite', r.graphite, 'housing-collar');
    housing.add(mesh('R3_Batch_Emitter_Alloy', r.alloy, 'housing-alloy'));
    const activeIndicator = mesh('R3_LaserAperture', r.active, 'active-aperture');
    const inactiveAperture = mesh('R3_LaserAperture', r.inactive, 'inactive-aperture');
    const shutters = mesh('R3_LaserShutter', r.inactive, 'inactive-shutters');
    Object.assign(root.userData, { laserHazardId: hazardId, presentationOnly: true,
      sharedLaserEmitter: true, laserEmitterAsset: LASER_EMITTER_ASSET });
    root.add(housing, activeIndicator, inactiveAperture, shutters);
    return { root, activeIndicator, inactiveIndicators: [inactiveAperture, shutters] };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const r = this.resources;
    if (--r.borrowers > 0) return;
    for (const geometry of r.parts.values()) geometry.dispose();
    for (const material of [r.graphite, r.alloy, r.active, r.inactive]) material.dispose();
    shared = undefined;
  }
}
