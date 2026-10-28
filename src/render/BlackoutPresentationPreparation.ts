import * as THREE from 'three';
import type { RenderLayer } from './RenderLayer.ts';
import { prepareShadowSamplerMaps, renderIsolatedPrewarmResources, withIsolatedPrewarmState } from './IsolatedResourcePrewarm.ts';
import { copyPrewarmMaterial, createShadowPrewarmMaterial, clonePrewarmDrawable, prewarmDrawableFeatures } from './ShadowPrewarmMaterial.ts';
import { requiresTransmissionPreparation } from './TransmissionPreparation.ts';
import type {BlackoutLightLayout} from './environment/blackout/BlackoutLightLayout.ts';

/** Blackout has one retained light signature through power, switching and merge.
 * Prepare hidden forms and caster passes without advancing encounter authority. */
export class BlackoutPresentationPreparation {
  readonly diagnostics = { durationMs: 0, visibleVariants: 0, shadowVariants: 0, programsAfter: 0,
    materialCopies: 0, compileBatches: 0, primeBatches: 0, maxCompileObjects: 0, maxPrimeObjects: 0 };
  private readonly materials: THREE.Material[] = [];
  private readonly instanceDisposers: (() => void)[] = [];
  private readonly target = new THREE.WebGLRenderTarget(1, 1);
  private disposed = false;
  private busy = false;
  private released = false;

  async prepare(layer: RenderLayer, camera: THREE.Camera,layout?:BlackoutLightLayout): Promise<void> {
    if (this.disposed) return;
    const started = performance.now();
    const visible = new THREE.Group(), shadows = new THREE.Group();
    const copies = new Map<string, THREE.Material>();
    const copy = (key: string, create: () => THREE.Material): THREE.Material => {
      let material = copies.get(key);
      if (!material) { material = create(); copies.set(key, material); this.materials.push(material); }
      return material;
    };
    const shadowScene = new THREE.Scene();
    // Shadow draws use a null scene in Three.js: no visible-pass fog/environment.
    const withLights=<T>(action:()=>T):T=>layout?layout.withLayout(camera,camera.position,action):action();
    withLights(()=>layer.scene.traverseVisible(object => {
      if (object instanceof THREE.Light) shadowScene.add(object.clone(false));
    }));
    const hasDepth = shadowScene.children.some(o => o instanceof THREE.Light && o.castShadow && !(o instanceof THREE.PointLight));
    const point = shadowScene.children.find(o => o instanceof THREE.PointLight && o.castShadow);
    const clone = (source: THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite, material: THREE.Material) => {
      const proxy = clonePrewarmDrawable(source, this.instanceDisposers) as typeof source;
      source.updateWorldMatrix(true, false);
      proxy.matrix.copy(source.matrixWorld); proxy.matrixAutoUpdate = false;
      proxy.visible = true; proxy.frustumCulled = false; proxy.castShadow = false;
      proxy.material = material;
      return proxy;
    };
    layer.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
      const feature = prewarmDrawableFeatures(object);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material.visible) continue;
        // Shared finishes/layouts own one currentProgram per preparation pass.
        // Cloning per mesh made compileAsync poll thousands of duplicate entries.
        const key = material.uuid + ':' + feature;
        const surface = copy(key, () => copyPrewarmMaterial(material));
        visible.add(clone(object, surface));
        // Camera fade changes Bob's eyes from opaque to transparent. Shader
        // hooks/uniforms remain borrowed, and no fade value is changed on Bob.
        if ((object.userData.characterCameraFade || object.userData.cameraFadeEye || object.name.startsWith('Bob-Eye')) && !surface.transparent) {
          const faded = copy(key + ':fade', () => { const m = copyPrewarmMaterial(surface); m.transparent = true; return m; });
          visible.add(clone(object, faded));
        }
        if (surface.transparent && surface.side === THREE.DoubleSide && !surface.forceSinglePass) {
          const back = copy(key + ':back', () => { const m = copyPrewarmMaterial(surface); m.side = THREE.BackSide; m.forceSinglePass = true; return m; });
          visible.add(clone(object, back));
        }
        if (!(object instanceof THREE.Mesh) || !(object.castShadow || object.userData.characterShadowCaster)) continue;
        for (const distance of [false, true]) {
          if (distance ? !point : !hasDepth) continue;
          const custom = distance ? object.customDistanceMaterial : object.customDepthMaterial;
          const shadow = copy(key + ':shadow:' + distance + ':' + custom?.uuid, () => createShadowPrewarmMaterial(object, material, distance));
          if (distance) (layer.renderer.properties.get(shadow) as {light?: THREE.Object3D}).light = point;
          shadows.add(clone(object, shadow));
        }
      }
    });
    const variants = (group: THREE.Group) => [...new Map(group.children.map(object => [(object as THREE.Mesh).material, object])).values()];
    this.diagnostics.visibleVariants = variants(visible).length;
    this.diagnostics.shadowVariants = variants(shadows).length;
    this.diagnostics.materialCopies = copies.size;
    const liveCamera = layer.cameraRig?.camera ?? camera;
    const transmission = requiresTransmissionPreparation(layer.scene);
    const primeVisible = (transmissive: boolean, action: () => void): void => {
      const viewport = layer.renderer.getViewport(new THREE.Vector4());
      const scale = layer.renderer.transmissionResolutionScale;
      withLights(()=>withIsolatedPrewarmState(layer.renderer, () => {
        if (transmissive) { layer.renderer.setViewport(viewport); layer.renderer.transmissionResolutionScale = scale; }
        action();
      }));
    };
    const yieldFrame = () => typeof requestAnimationFrame === 'function'
      ? new Promise<void>(resolve => requestAnimationFrame(() => resolve())) : Promise.resolve();
    const compile = async (objects: readonly THREE.Object3D[], scene: THREE.Scene, target?: THREE.WebGLRenderTarget) => {
      for (let i = 0; i < objects.length && !this.disposed; i += 128) {
        const batch = new THREE.Group(); batch.add(...objects.slice(i, i + 128));
        this.diagnostics.compileBatches++;
        this.diagnostics.maxCompileObjects = Math.max(this.diagnostics.maxCompileObjects, batch.children.length);
        try { await withLights(() => withIsolatedPrewarmState(layer.renderer, () => layer.withShadowPreparation(true,
          () => layer.renderer.compileAsync(batch, camera, scene)), target)); }
        finally { batch.clear(); }
        await yieldFrame();
      }
    };
    const prime = async (objects: readonly THREE.Object3D[], scene: THREE.Scene, target?: THREE.WebGLRenderTarget) => {
      for (let i = 0; i < objects.length && !this.disposed; i += 16) {
        await yieldFrame(); if (this.disposed) return;
        const batch = new THREE.Group(); batch.add(...objects.slice(i, i + 16));
        this.diagnostics.primeBatches++;
        this.diagnostics.maxPrimeObjects = Math.max(this.diagnostics.maxPrimeObjects, batch.children.length);
        scene.add(batch);
        try {
          const draw = () => layer.withShadowPreparation(true, () => renderIsolatedPrewarmResources(layer.renderer, scene, liveCamera, [batch]));
          if (target) withLights(() => withIsolatedPrewarmState(layer.renderer, draw, target));
          else primeVisible(batch.children.some(object => {
            const material = (object as THREE.Mesh).material;
            return material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0;
          }), draw);
        } finally { batch.removeFromParent(); batch.clear(); }
      }
    };
    // Retain only one upload per shared geometry/instance storage and program.
    // Compiler representatives are independent of which mesh owns the buffer.
    const buffers = new Set<THREE.BufferGeometry>(), instances = new Set<THREE.InstancedBufferAttribute>();
    const primed = new Set<THREE.Material>();
    const resources = (objects: readonly THREE.Object3D[]) => objects.filter(object => {
      const mesh = object as THREE.Mesh, material = mesh.material as THREE.Material;
      const needs = !buffers.has(mesh.geometry) || !primed.has(material) || mesh instanceof THREE.InstancedMesh &&
        (!instances.has(mesh.instanceMatrix) || !!mesh.instanceColor && !instances.has(mesh.instanceColor));
      buffers.add(mesh.geometry); primed.add(material);
      if (mesh instanceof THREE.InstancedMesh) { instances.add(mesh.instanceMatrix); if (mesh.instanceColor) instances.add(mesh.instanceColor); }
      return needs;
    });
    this.busy = true;
    try {
      for (const [group, scene, target] of [[visible, layer.scene, undefined], [shadows, shadowScene, this.target]] as const) {
        if (this.disposed) return;
        const objects = [...group.children], programs = variants(group);
        group.clear();
        await compile(programs, scene, target);
        if (this.disposed) return;
        // Resolve selected samplers before exposing receiver proxies, including
        // linear primers. The empty draw avoids uploading the whole room.
        if (group === visible) withLights(() => prepareShadowSamplerMaps(layer.renderer, layer.scene, liveCamera));
        // Compile the transmission target's linear-output variants separately.
        if (group === visible && transmission) {
          const opaque = programs.filter(object => !(object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>).material.transparent);
          await compile(opaque, scene, this.target);
          await prime(opaque, scene, this.target);
          if (this.disposed) return;
        }
        await prime(resources(objects), scene, target);
      }
      // Invalidate the loading maps so later powered/moving state cannot reuse them.
      layer.scene.traverse(object => {
        if ((object instanceof THREE.SpotLight || object instanceof THREE.PointLight) && object.castShadow) object.shadow.needsUpdate = true;
      });
      this.diagnostics.programsAfter = layer.renderer.info.programs?.length ?? 0;
      this.diagnostics.durationMs = performance.now() - started;
    } finally {
      visible.clear(); shadows.clear(); shadowScene.clear();
      this.busy = false;
      if (this.disposed) this.release();
    }
  }

  dispose(): void { this.disposed = true; if (!this.busy) this.release(); }
  private release(): void {
    if (this.released) return;
    this.released = true;
    for (const material of this.materials) material.dispose();
    for (const dispose of this.instanceDisposers) dispose();
    this.materials.length = 0; this.instanceDisposers.length = 0;
    this.target.dispose();
  }
}
