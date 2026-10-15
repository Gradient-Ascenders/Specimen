import * as THREE from 'three';
import { disposeShadowLight } from './ShadowLightResources.ts';

/** Provisional low-cost layouts, not a qualification of the assessment GPU.
 * A small fixed signature avoids recompilation when the selected sources change.
 * Zero-radiance fillers occupy only the unused part of these budgets. */
export const CULTIVATION_LIGHT_BUDGETS = {
  lift: { points: 2, pointShadows: 0, spots: 1 },
  ordinary: { points: 4, pointShadows: 0, spots: 2 },
  maintenance: { points: 4, pointShadows: 1, spots: 3 },
} as const;

type Profile = keyof typeof CULTIVATION_LIGHT_BUDGETS;
type SourceLight = THREE.PointLight | THREE.SpotLight;
interface Source {
  light: SourceLight;
  score: number;
  order: number;
  position: THREE.Vector3;
  mask: number;
  masked: boolean;
}

const authoredMasks = new WeakMap<THREE.Light, Source>();

/** Preparation may start during a bounded draw. Clone the source's authored
 * mask, never the temporary exclusion belonging to that camera/frame. */
export function cultivationAuthoredLightMask(light: THREE.Light): number {
  const source = authoredMasks.get(light);
  return source?.masked ? source.mask : light.layers.mask;
}

/** Render-only selection: never power down a gameplay light, change its colour,
 * detach it, or hide children such as an emitter. Call restore() synchronously
 * after a draw/compile. Level owners retain all authored shadow resources. */
export class CultivationLightLayout {
  readonly root = new THREE.Group();
  readonly diagnostics = {
    profile: 'ordinary' as Profile,
    pointSlots: 0, spotSlots: 0, pointShadowSlots: 0, spotShadowSlots: 0,
    authoredPoints: 0, authoredSpots: 0,
    selectedPoints: 0, selectedSpots: 0,
    zeroRadiance: 0, outsideView: 0,
    scheduledShadowPasses: 0,
    selectedNames: [] as string[],
  };
  private readonly points = Array.from({ length: 4 }, () => new THREE.PointLight(0, 0, .2));
  private readonly pointShadows = [new THREE.PointLight(0, 0, .2)];
  private readonly spots = Array.from({ length: 3 }, () => new THREE.SpotLight(0, 0, .2, .001));
  private readonly sources: Source[] = [];
  private readonly masked: Source[] = [];
  private readonly previous = new Set<SourceLight>();
  private readonly selected = new Set<SourceLight>();
  private readonly regularCandidates: Source[] = [];
  private readonly pointShadowCandidates: Source[] = [];
  private readonly spotCandidates: Source[] = [];
  private readonly projection = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  private readonly sphere = new THREE.Sphere();
  private readonly target = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly ray = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly samples = Array.from({ length: 3 }, () => new THREE.Vector3());
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.root.name = 'cultivation-shader-light-padding';
    this.root.userData.lightBudget = this.diagnostics;
    for (const light of [...this.points, ...this.pointShadows, ...this.spots]) {
      light.position.set(100000, 100000, 100000);
      if (light instanceof THREE.SpotLight) {
        light.target.position.set(100000, 99999, 100000);
        this.root.add(light.target);
      }
      if (light instanceof THREE.SpotLight || this.pointShadows.includes(light)) {
        light.castShadow = true;
        light.shadow.mapSize.set(1, 1);
        light.shadow.camera.near = .1;
        light.shadow.camera.far = .2;
        light.shadow.autoUpdate = false;
        light.shadow.needsUpdate = true;
      }
      this.root.add(light);
    }
    scene.add(this.root);
    this.refreshSources(scene);
    this.sync(scene);
  }

  /** Sources are constructed before preparation. Explicitly refresh if a future
   * owner adds/removes lights; normal frames scan lights, not every scene mesh. */
  refreshSources(scene: THREE.Scene): void {
    this.restore();
    for (const source of this.sources) authoredMasks.delete(source.light);
    this.sources.length = 0;
    scene.traverse(object => {
      if (object.parent === this.root) return;
      if (object instanceof THREE.PointLight || object instanceof THREE.SpotLight && object.castShadow) {
        const source = { light: object, score: 0, order: this.sources.length, position: new THREE.Vector3(), mask: object.layers.mask, masked: false };
        this.sources.push(source); authoredMasks.set(object, source);
      }
    });
    const retained = new Set(this.sources.map(source => source.light));
    for (const light of this.previous) if (!retained.has(light)) this.previous.delete(light);
  }

  get signature(): string {
    const d = this.diagnostics;
    return `${d.pointSlots}:${d.pointShadowSlots}:${d.spotSlots}:${d.spotShadowSlots}`;
  }

  sync(_scene: THREE.Scene, camera?: THREE.Camera, focus?: Pick<THREE.Vector3, 'x' | 'y' | 'z'>): void {
    this.restore();
    if (this.disposed) return;
    const d = this.diagnostics;
    d.authoredPoints = d.authoredSpots = d.zeroRadiance = d.outsideView = d.scheduledShadowPasses = 0;
    this.regularCandidates.length = this.pointShadowCandidates.length = this.spotCandidates.length = 0;
    this.selected.clear();
    if (camera) {
      camera.updateWorldMatrix(true, false);
      this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projection, camera.coordinateSystem);
      camera.getWorldDirection(this.forward);
      this.samples[0].copy(focus ?? camera.position);
      this.samples[1].copy(this.samples[0]).addScaledVector(this.forward, 6);
      this.samples[2].copy(this.samples[0]).addScaledVector(this.forward, 12);
    }
    let maintenance = false;
    for (const source of this.sources) {
      const { light } = source;
      if (!this.isVisible(light) || camera && !light.layers.test(camera.layers)) continue;
      if (light instanceof THREE.PointLight) d.authoredPoints++;
      else {
        d.authoredSpots++;
        maintenance ||= !light.userData.cultivationTraversalShadowLight;
      }
      // Presence determines the stable layout; powered-off sources do not
      // participate in selection or consume their full original shader arrays.
      source.score = 0;
      if (light.intensity <= 0 || light.color.r + light.color.g + light.color.b <= 0) d.zeroRadiance++;
      else {
        light.getWorldPosition(source.position);
        this.sphere.center.copy(source.position); this.sphere.radius = light.distance;
        if (camera && light.distance > 0 && !this.frustum.intersectsSphere(this.sphere)) d.outsideView++;
        else source.score = camera ? this.score(source) : light.intensity;
      }
      if (source.score > 0) {
        if (this.previous.has(light)) source.score *= 1.25; // Avoid selection jitter at equal-distance boundaries.
        (light instanceof THREE.SpotLight ? this.spotCandidates : light.castShadow ? this.pointShadowCandidates : this.regularCandidates).push(source);
      }
      source.mask = light.layers.mask;
      this.masked.push(source);
    }
    d.profile = maintenance ? 'maintenance' : d.authoredPoints <= 2 && d.authoredSpots <= 1 ? 'lift' : 'ordinary';
    const budget = CULTIVATION_LIGHT_BUDGETS[d.profile];
    d.pointSlots = budget.points; d.pointShadowSlots = budget.pointShadows;
    d.spotSlots = d.spotShadowSlots = budget.spots;
    const choose = (candidates: Source[], count: number): number => {
      candidates.sort((a, b) => b.score - a.score || a.order - b.order);
      for (let i = 0; i < Math.min(count, candidates.length); i++) {
        const { light } = candidates[i];
        this.selected.add(light);
        if (light.castShadow && !this.previous.has(light)) light.shadow.needsUpdate = true;
      }
      return Math.min(count, candidates.length);
    };
    const regular = choose(this.regularCandidates, budget.points - budget.pointShadows);
    const shadowedPoints = choose(this.pointShadowCandidates, budget.pointShadows);
    const spots = choose(this.spotCandidates, budget.spots);
    d.selectedPoints = regular + shadowedPoints; d.selectedSpots = spots;
    d.selectedNames.length = 0;
    for (const source of this.masked) {
      const { light } = source;
      source.masked = true;
      if (!this.selected.has(light)) light.layers.mask = 0;
      else {
        d.selectedNames.push(light.name);
        if (light.castShadow && (light.shadow.autoUpdate || light.shadow.needsUpdate)) {
          d.scheduledShadowPasses += light instanceof THREE.PointLight ? 6 : 1;
        }
      }
    }
    this.points.forEach((light, i) => light.visible = i < budget.points - budget.pointShadows - regular);
    this.pointShadows.forEach((light, i) => light.visible = i < budget.pointShadows - shadowedPoints);
    this.spots.forEach((light, i) => light.visible = i < budget.spots - spots);
    this.root.visible = true;
    this.previous.clear();
    for (const light of this.selected) this.previous.add(light);
  }

  /** Restore layer masks rather than visibility: power state and visual children
   * continue to belong to their original owner, even if a draw throws. */
  restore(): void {
    for (const source of this.masked) {
      source.light.layers.mask = source.mask;
      source.masked = false;
    }
    this.masked.length = 0;
    this.root.visible = false;
  }

  withLayout<T>(scene: THREE.Scene, camera: THREE.Camera, focus: Pick<THREE.Vector3, 'x' | 'y' | 'z'>, action: () => T): T {
    this.sync(scene, camera, focus);
    try { return action(); } finally { this.restore(); }
  }

  dispose(): void {
    if (this.disposed) return;
    this.restore(); this.disposed = true;
    this.root.removeFromParent();
    for (const light of [...this.pointShadows, ...this.spots]) disposeShadowLight(light);
    for (const source of this.sources) authoredMasks.delete(source.light);
    this.sources.length = 0; this.previous.clear(); this.selected.clear();
  }

  private isVisible(light: THREE.Light): boolean {
    for (let object: THREE.Object3D | null = light; object; object = object.parent) if (!object.visible) return false;
    return light.parent !== null;
  }

  private score(source: Source): number {
    const { light, position } = source;
    let score = 0;
    if (light instanceof THREE.SpotLight) {
      light.target.getWorldPosition(this.target);
      this.axis.copy(this.target).sub(position).normalize();
    }
    for (let i = 0; i < this.samples.length; i++) {
      this.ray.copy(this.samples[i]).sub(position);
      const distance = this.ray.length();
      if (light.distance > 0 && distance > light.distance + 1.5) continue;
      let cone = 1;
      if (light instanceof THREE.SpotLight && distance > .001) {
        // Include a body's/platform's footprint instead of testing a single
        // infinitesimal point at the edge of a searchlight cone.
        const allowance = Math.atan2(1.5, distance);
        cone = this.ray.multiplyScalar(1 / distance).dot(this.axis) >= Math.cos(light.angle + allowance) ? 1 : .05;
      }
      const attenuation = 1 / Math.max(1, distance ** light.decay);
      const cutoff = light.distance > 0 ? Math.max(0, 1 - (distance / light.distance) ** 4) ** 2 : 1;
      score = Math.max(score, light.intensity * attenuation * cutoff * cone * (i === 0 ? 1 : i === 1 ? .7 : .35));
    }
    return score;
  }
}
