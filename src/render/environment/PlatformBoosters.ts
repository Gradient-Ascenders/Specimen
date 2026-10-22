import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WorldAudioSource } from '../../audio/WorldAudio.ts';
import { optimizeFiniteLightEvaluation } from './cultivation/FiniteLightEvaluation.ts';

export interface BoosterPlatform {
  readonly id: string;
  /** Walking-surface centre in the attachment parent's local coordinates. */
  readonly top: readonly [number, number, number];
  /** Compact the same unit assembly only where floor clearance requires it. */
  readonly scale?: number;
  readonly mountOffsetY?: number;
  /** Localize unshadowed spill near enclosing walls/decks; default is 6 m. */
  readonly spillRangeMetres?: number;
  /** Parent-local deck underside Y: use a depth-tested surface glow instead of
   * an unshadowed point-light contribution near enclosing solid geometry. */
  readonly surfaceGlowY?: number;
}
interface Batch { root: THREE.Group; visible: boolean }
interface Jet { position: THREE.Vector3; world: THREE.Vector3; batch: Batch; id: number; score: number; spillRangeMetres: number; spillEnabled: boolean }

/** Shared Cultivation engine/exhaust, with four submissions per attachment group,
 * plus an optional surface-glow submission, two non-shadowed spill lights and
 * one nearest-engine hover source per owner.
 * Attachment groups inherit their parent's presentation transform verbatim. */
export class PlatformBoosters {
  readonly root = new THREE.Group();
  private readonly materials: THREE.Material[];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private surfaceGlowGeometry?: THREE.BufferGeometry;
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly batches: Batch[] = [];
  private readonly ids = new Set<string>();
  private readonly jets: Jet[] = [];
  private readonly lamps: { light: THREE.PointLight; jet: number }[] = [];
  private readonly clock = { value: 0 };
  private readonly observer = new THREE.Vector3();
  private readonly initialObserver = new THREE.Vector3(-12, 10.66, 23);
  private readonly hoverAudio: WorldAudioSource;
  private disposed = false;

  constructor(parent: THREE.Object3D, name: string,
    maps?: { bumpMap: THREE.Texture | null; roughnessMap: THREE.Texture | null },
    scope?: THREE.Object3D) {
    this.root.name = name; this.root.userData.presentationOnly = true; this.root.userData.visualOnly = true;
    parent.add(this.root);
    const iron = new THREE.MeshStandardMaterial({ color: 0x89725b, roughness: .94, metalness: .4,
      bumpMap: maps?.bumpMap ?? null, roughnessMap: maps?.roughnessMap ?? null, bumpScale: .02 });
    const soot = new THREE.MeshStandardMaterial({ color: 0x222622, roughness: .9, metalness: .35 });
    const hot = new THREE.MeshBasicMaterial({ color: 0xffb36a, toneMapped: false });
    const flame = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .8,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    optimizeFiniteLightEvaluation(iron); optimizeFiniteLightEvaluation(soot);
    this.materials = [iron, soot, hot, flame];
    flame.onBeforeCompile = shader => {
      shader.uniforms.uBoosterTime = this.clock;
      shader.vertexShader = 'uniform float uBoosterTime; varying float vBoosterPulse; varying float vBoosterEdge;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = instanceMatrix[3].x * 3.7 + instanceMatrix[3].z * 1.9;
        vBoosterPulse = .94 + .06 * sin(uBoosterTime * 13.0 + phase) * sin(uBoosterTime * 7.0 + phase);
        transformed.y *= vBoosterPulse;
        transformed.x += .025 * sin(uBoosterTime * 17.0 + phase - position.y * 8.0) * -position.y;
      `);
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec3 jetNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vBoosterEdge = pow(abs(dot(jetNormal, normalize(-mvPosition.xyz))), .7);
      `);
      shader.fragmentShader = 'varying float vBoosterPulse; varying float vBoosterEdge;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= vBoosterPulse * vBoosterEdge;');
    };
    flame.customProgramCacheKey = () => 'cultivation-platform-exhaust-v1';
    // Exact original dimensions and finishes. Unit hardware is uploaded once,
    // then shared by stationary room batches and moving presentation parents.
    const parts: THREE.BufferGeometry[][] = [[], [], []];
    parts[0].push(new THREE.CylinderGeometry(.27, .34, .42, 12, 1, true).translate(0, -.91, 0));
    parts[1].push(new THREE.CylinderGeometry(.34, .27, .18, 12, 1, true).translate(0, -1.21, 0));
    parts[0].push(new THREE.TorusGeometry(.34, .04, 6, 12).rotateX(Math.PI / 2).translate(0, -1.13, 0));
    parts[2].push(new THREE.TorusGeometry(.25, .022, 5, 12).rotateX(Math.PI / 2).translate(0, -1.30, 0));
    for (const side of [-1, 1]) {
      parts[1].push(new THREE.BoxGeometry(.075, .33, .12).translate(side * .29, -.88, 0));
      parts[0].push(new THREE.CylinderGeometry(.045, .045, .04, 6).rotateZ(Math.PI / 2).translate(side * .35, -.86, 0));
    }
    for (const pieces of parts) {
      this.geometries.push(mergeGeometries(pieces)!); pieces.forEach(piece => piece.dispose());
    }
    const flames: THREE.BufferGeometry[] = [];
    for (const core of [false, true]) {
      const length = core ? .38 : .85;
      const geometry = new THREE.ConeGeometry(core ? .09 : .23, length, 9, 1, true)
        .rotateZ(Math.PI).translate(0, -length / 2, 0);
      const positions = geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3);
      const base = new THREE.Color(core ? 0xd8f2ff : 0xff8a32), color = new THREE.Color();
      for (let i = 0; i < positions.count; i++) {
        const fade = THREE.MathUtils.clamp(1 + positions.getY(i) / length, 0, 1);
        color.copy(base).multiplyScalar(fade).toArray(colors, i * 3);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); flames.push(geometry);
    }
    this.geometries.push(mergeGeometries(flames)!); flames.forEach(geometry => geometry.dispose());
    const effectScope = scope ?? this.root;
    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight(0xffa65b, 0, 6, 2);
      light.name = `${name.replace(/boosters$/, 'booster')}-spill-${i}`;
      // Scope can span rooms, while each visual batch retains room visibility.
      effectScope.add(light); this.lamps.push({ light, jet: -1 });
    }
    this.hoverAudio = new WorldAudioSource({ root: effectScope, kind: 'hover', enabled: () => this.hasVisibleBatch(),
      closestPoint: (listener, out) => {
        let nearest = Infinity;
        for (const jet of this.jets) {
          if (!isVisible(jet.batch.root)) continue;
          jet.batch.root.localToWorld(jet.world.copy(jet.position));
          const distance = (jet.world.x - listener.x) ** 2 + (jet.world.y - listener.y) ** 2 + (jet.world.z - listener.z) ** 2;
          if (distance < nearest) { nearest = distance; out.copy(jet.world); }
        }
      } });
  }

  get platformCount(): number { return this.jets.length; }
  get batchCount(): number { return this.batches.length; }

  /** Idempotent by authored platform ID, never by an arbitrary mesh name scan. */
  addPlatforms(parent: THREE.Object3D, platforms: readonly BoosterPlatform[], name: string): void {
    if (this.disposed) throw new Error('Cannot attach disposed platform boosters.');
    const additions: BoosterPlatform[] = [];
    for (const platform of platforms) {
      if (this.ids.has(platform.id)) continue;
      this.ids.add(platform.id); additions.push(platform);
    }
    if (!additions.length) return;
    const root = new THREE.Group(); root.name = `${name}-booster-batch`; root.userData.presentationOnly = true;
    root.userData.visualOnly = true;
    root.userData.platformBoosterIds = additions.map(platform => platform.id);
    parent.add(root);
    const batch = { root, visible: true }; this.batches.push(batch);
    const matrix = new THREE.Matrix4();
    for (let part = 0; part < this.geometries.length; part++) {
      const mesh = new THREE.InstancedMesh(this.geometries[part], this.materials[part], additions.length);
      mesh.name = part === 3 ? `${name}-platform-booster-flames` : `${name}-booster-engine-hardware`;
      mesh.userData.presentationOnly = true;
      mesh.userData.visualOnly = true;
      if (part < 3) { mesh.userData.shadowProxyReceiver = true; mesh.receiveShadow = part < 2; }
      additions.forEach((platform, index) => {
        const scale = platform.scale ?? 1;
        matrix.makeScale(scale, scale, scale);
        matrix.setPosition(platform.top[0], platform.top[1] + (platform.mountOffsetY ?? 0) - (part === 3 ? 1.32 * scale : 0), platform.top[2]);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.computeBoundingSphere(); root.add(mesh); this.meshes.push(mesh);
    }
    const glows = additions.filter(platform => platform.surfaceGlowY !== undefined);
    if (glows.length) {
      // One shared, texture-free disk; reuse the existing animated additive
      // exhaust material. This illuminates no other surface and tests depth.
      const mesh = new THREE.InstancedMesh(this.surfaceGlowGeometry ??= createSurfaceGlowGeometry(), this.materials[3], glows.length);
      mesh.name = `${name}-platform-booster-surface-glow`;
      mesh.userData.presentationOnly = true; mesh.userData.visualOnly = true;
      glows.forEach((platform, index) => {
        const scale = platform.scale ?? 1;
        matrix.makeScale(scale, scale, scale);
        matrix.setPosition(platform.top[0], platform.surfaceGlowY!, platform.top[2]);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.computeBoundingSphere(); root.add(mesh); this.meshes.push(mesh);
    }
    for (const platform of additions) this.jets.push({
      position: new THREE.Vector3(platform.top[0], platform.top[1] + (platform.mountOffsetY ?? 0) - 1.32 * (platform.scale ?? 1), platform.top[2]),
      world: new THREE.Vector3(), batch, id: this.jets.length, score: 0,
      spillRangeMetres: platform.spillRangeMetres ?? 6,
      spillEnabled: platform.surfaceGlowY === undefined,
    });
  }

  update(dt: number, observer?: { readonly x: number; readonly y: number; readonly z: number }): void {
    if (this.disposed) return;
    this.clock.value += dt;
    if (observer) this.observer.copy(observer);
    for (const batch of this.batches) {
      batch.root.updateWorldMatrix(true, false);
      batch.visible = isVisible(batch.root);
    }
    let first: Jet | undefined, second: Jet | undefined;
    for (const jet of this.jets) {
      jet.world.copy(jet.position).applyMatrix4(jet.batch.root.matrixWorld);
      jet.score = jet.batch.visible ? jet.world.distanceToSquared(this.observer) : Infinity;
      if (!jet.batch.visible || !jet.spillEnabled) continue;
      if (!first || jet.score < first.score) { second = first; first = jet; }
      else if (!second || jet.score < second.score) second = jet;
    }
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i], nearest = i === 0 ? first : second;
      const target = nearest && nearest.score < 14 * 14 ? nearest.id : -1;
      if (lamp.jet !== target) {
        lamp.light.intensity = Math.max(0, lamp.light.intensity - dt * 24);
        if (lamp.light.intensity === 0) lamp.jet = target;
      } else {
        const power = target < 0 ? 0 : 6 * (.96 + .04 * Math.sin(this.clock.value * 9 + target));
        lamp.light.intensity = THREE.MathUtils.damp(lamp.light.intensity, power, 8, dt);
      }
      if (lamp.jet >= 0) {
        const jet = this.jets[lamp.jet];
        // Follow the currently assigned jet through fade-out, then restore the
        // next jet's authored range when this pooled slot changes ownership.
        lamp.light.distance = jet.spillRangeMetres;
        lamp.light.position.copy(jet.world); lamp.light.position.y -= .15;
        lamp.light.parent!.worldToLocal(lamp.light.position);
      }
    }
    this.syncVisibility();
  }

  /** Room workload visibility can change during presentation, after fixed updates.
   * Keep the shared pool out of unrelated room lighting profiles. */
  syncVisibility(): void {
    const visible = this.hasVisibleBatch();
    for (const lamp of this.lamps) lamp.light.visible = visible;
  }

  reset(): void {
    this.clock.value = 0;
    this.root.localToWorld(this.observer.copy(this.initialObserver));
    for (const lamp of this.lamps) { lamp.jet = -1; lamp.light.intensity = 0; }
    this.hoverAudio.reset(); this.update(0);
  }

  private hasVisibleBatch(): boolean {
    for (const batch of this.batches) if (isVisible(batch.root)) return true;
    return false;
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.hoverAudio.dispose();
    for (const batch of this.batches) { batch.root.removeFromParent(); batch.root.clear(); }
    for (const mesh of this.meshes) mesh.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.surfaceGlowGeometry?.dispose();
    for (const material of this.materials) material.dispose();
    for (const lamp of this.lamps) { lamp.light.removeFromParent(); lamp.light.dispose(); }
    this.root.removeFromParent(); this.root.clear();
  }
}

function createSurfaceGlowGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(1.2, 24).rotateX(Math.PI / 2);
  // Keep local Y exactly zero: the exhaust shader's flicker cannot move this
  // disk through its receiver. Down-facing normals hide it from above.
  const positions = geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3);
  const warm = new THREE.Color(0xff8a32), color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, 0);
    const strength = .6 * Math.max(0, 1 - Math.hypot(positions.getX(i), positions.getZ(i)) / 1.2);
    color.copy(warm).multiplyScalar(strength).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function isVisible(object: THREE.Object3D): boolean {
  for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return false;
  return true;
}
