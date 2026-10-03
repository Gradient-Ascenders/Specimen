import * as THREE from 'three';

export interface TrackedShadowCaster {
  readonly root: THREE.Object3D;
  /** Conservative local bounding radius, including any animated children. */
  readonly radiusMetres: number;
  readonly animated?: boolean;
}

export type ShadowParticipantPosition = Pick<THREE.Vector3, 'x' | 'y' | 'z'>;

/** Cache fixed spotlights' depth maps, not their changing colour/intensity.
 * Characters and animated casters inside a cone retain per-frame shadows.
 * Moving objects invalidate both their old and new footprints. */
export class SpatialShadowCache {
  private readonly sphere = new THREE.Sphere();
  private readonly origin = new THREE.Vector3();
  private readonly sources;
  private readonly casters;

  constructor(lights: readonly THREE.SpotLight[], casters: readonly TrackedShadowCaster[] = []) {
    this.sources = lights.map(light => ({
      light,
      matrix: new THREE.Matrix4(),
      targetMatrix: new THREE.Matrix4(),
      angle: NaN,
      distance: NaN,
      previouslyDynamic: false,
    }));
    this.casters = casters.map(caster => ({
      ...caster,
      matrix: new THREE.Matrix4(),
      centre: new THREE.Vector3(),
      previousCentre: new THREE.Vector3(),
      radius: caster.radiusMetres,
      previousRadius: caster.radiusMetres,
      visible: false,
      changed: true,
    }));
  }

  prepareFrame(participants: readonly ShadowParticipantPosition[]): void {
    for (const caster of this.casters) {
      caster.root.updateWorldMatrix(true, false);
      let visible = true;
      for (let ancestor: THREE.Object3D | null = caster.root; ancestor; ancestor = ancestor.parent) {
        if (!ancestor.visible) { visible = false; break; }
      }
      caster.changed = !caster.matrix.equals(caster.root.matrixWorld) || caster.visible !== visible;
      caster.previousCentre.copy(caster.centre);
      caster.previousRadius = caster.radius;
      caster.root.getWorldPosition(caster.centre);
      caster.radius = caster.radiusMetres * caster.root.matrixWorld.getMaxScaleOnAxis();
      caster.matrix.copy(caster.root.matrixWorld);
      caster.visible = visible;
    }

    for (const source of this.sources) {
      const { light } = source;
      light.updateWorldMatrix(true, false);
      light.target.updateWorldMatrix(true, false);
      const moved = !source.matrix.equals(light.matrixWorld) ||
        !source.targetMatrix.equals(light.target.matrixWorld) ||
        source.angle !== light.angle || source.distance !== light.distance;
      light.shadow.updateMatrices(light);
      light.getWorldPosition(this.origin);
      const intersects = (centre: ShadowParticipantPosition, radius: number): boolean => {
        this.sphere.center.set(centre.x, centre.y, centre.z);
        this.sphere.radius = radius;
        if (light.distance > 0 && this.origin.distanceToSquared(this.sphere.center) > (light.distance + radius) ** 2) return false;
        return light.shadow.getFrustum().intersectsSphere(this.sphere);
      };
      const dynamic = participants.some(position => intersects(position, 1.5)) ||
        this.casters.some(caster => caster.animated && caster.visible && intersects(caster.centre, caster.radius));
      light.shadow.autoUpdate = dynamic;
      if (!light.shadow.map || moved || (source.previouslyDynamic && !dynamic) ||
        this.casters.some(caster => caster.changed && (
          intersects(caster.previousCentre, caster.previousRadius) || intersects(caster.centre, caster.radius)))) {
        light.shadow.needsUpdate = true;
      }
      source.matrix.copy(light.matrixWorld);
      source.targetMatrix.copy(light.target.matrixWorld);
      source.angle = light.angle;
      source.distance = light.distance;
      source.previouslyDynamic = dynamic;
    }
  }

  invalidate(): void {
    for (const { light } of this.sources) light.shadow.needsUpdate = true;
  }
}
