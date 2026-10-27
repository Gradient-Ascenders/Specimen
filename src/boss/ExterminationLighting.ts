import * as THREE from 'three';
import { disposeShadowLight } from '../render/ShadowLightResources.ts';
import { FINAL_ARENA, FINAL_ARENA_RING } from './FinalBossConfig.ts';
import { ExterminationMoonlight } from './ExterminationMoonlight.ts';

/** One directional depth pass covers nearby combat; decorative spill never
 * allocates cube maps. Keep the light signature stable through power/retry. */
export class ExterminationLighting {
  readonly root = new THREE.Group();
  readonly key = new THREE.DirectionalLight(0xcde5ef, 0);
  readonly moonlight = new ExterminationMoonlight();
  private readonly ambient = new THREE.HemisphereLight(0x718ba7, 0x19242b, 0);
  private readonly fill = new THREE.SpotLight(0xc5dce9, 0, 150, .62, .55, 2);
  private readonly reactor = new THREE.PointLight(0xff301a, 0, 108, 2);
  private readonly emergency = new THREE.PointLight(0xff492c, 0, 100, 2);
  private readonly offset = new THREE.Vector3(-24, 72, -18);
  private readonly right = new THREE.Vector3().crossVectors(this.offset, THREE.Object3D.DEFAULT_UP).normalize();
  private readonly up = new THREE.Vector3().crossVectors(this.offset, this.right).normalize();
  private readonly focus = new THREE.Vector3();
  private powered = false;
  private roofOpening = 0;
  private disposed = false;

  constructor() {
    this.root.name = 'extermination-lighting';
    this.key.name = 'extermination-combat-key';
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024); // Low caps to 512; the near field needs no 2048px map.
    const camera = this.key.shadow.camera;
    camera.left = camera.bottom = -30;
    camera.right = camera.top = 30;
    camera.near = 1; camera.far = 160; camera.updateProjectionMatrix();
    this.key.shadow.bias = -.00008;
    this.key.shadow.normalBias = .045;
    this.key.shadow.autoUpdate = false;
    this.key.shadow.needsUpdate = true; // Allocate a valid comparison sampler during preparation.
    this.ambient.name = 'extermination-bounce-fill';
    this.fill.name = 'extermination-boss-fill'; this.fill.position.set(-22, 38, FINAL_ARENA.centreZ - 62);
    this.fill.target.position.set(0, 18, FINAL_ARENA.centreZ);
    this.reactor.name = 'extermination-reactor-spill'; this.reactor.position.set(-82, 30, FINAL_ARENA.centreZ);
    this.emergency.name = 'extermination-emergency-spill'; this.emergency.position.set(60, 24, FINAL_ARENA.centreZ + 52);
    this.root.add(this.key, this.key.target, this.ambient, this.fill, this.fill.target, this.reactor, this.moonlight.root, this.emergency);
    this.prepareFrame({ x: 0, z: FINAL_ARENA.centreZ - FINAL_ARENA_RING.radius });
  }

  setPowered(powered: boolean, phaseTwo = false): void {
    if (this.disposed) return;
    const changed = this.powered !== powered;
    this.powered = powered;
    this.key.intensity = powered ? (phaseTwo ? 1.85 : 2.15) : 0;
    this.ambient.intensity = powered ? .24 : 0;
    this.fill.intensity = powered ? (phaseTwo ? 14500 : 16500) : 0;
    this.reactor.intensity = powered ? (phaseTwo ? 5600 : 4200) : 0;
    this.moonlight.setStrength(powered ? this.roofOpening : 0);
    this.emergency.intensity = powered && phaseTwo ? 2400 : 0;
    this.key.shadow.autoUpdate = powered;
    this.key.shadow.needsUpdate ||= changed && powered || this.key.shadow.map === null;
  }

  setRoofOpening(progress: number): void {
    this.roofOpening = THREE.MathUtils.smoothstep(progress, .55, .9);
    this.moonlight.setStrength(this.powered ? this.roofOpening : 0);
  }

  /** Translation never changes the key's direction. Quantise in light space,
   * keeping sub-texel player motion from crawling across stationary cover. */
  prepareFrame(position: Pick<THREE.Vector3, 'x' | 'z'>, animate = true): void {
    if (this.disposed) return;
    this.focus.set(position.x, FINAL_ARENA.floorY, position.z);
    const texel = 60 / this.key.shadow.mapSize.x;
    const x = this.focus.dot(this.right), y = this.focus.dot(this.up);
    this.focus.addScaledVector(this.right, Math.round(x / texel) * texel - x);
    this.focus.addScaledVector(this.up, Math.round(y / texel) * texel - y);
    const moved = !this.key.target.position.equals(this.focus);
    this.key.target.position.copy(this.focus);
    this.key.position.copy(this.focus).add(this.offset);
    this.key.target.updateWorldMatrix(true, false);
    this.key.shadow.autoUpdate = this.powered && animate;
    this.key.shadow.needsUpdate ||= this.powered && moved || this.key.shadow.map === null;
  }

  get diagnostics() {
    return { shadowMaps: 1, pointShadowMaps: 0, pointLights: 2, spotLights: 2, shaftDraws: 1, shadowWidthMetres: 60,
      mapSize: this.key.shadow.mapSize.x, powered: this.powered };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.moonlight.dispose();
    for (const light of [this.key, this.ambient, this.fill, this.reactor, this.emergency]) disposeShadowLight(light);
    this.root.removeFromParent(); this.root.clear();
  }
}
