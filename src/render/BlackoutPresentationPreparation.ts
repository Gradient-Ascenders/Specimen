import * as THREE from 'three';
import type { RenderLayer } from './RenderLayer.ts';
import { renderIsolatedPrewarmResources, withIsolatedPrewarmState } from './IsolatedResourcePrewarm.ts';
import { copyPrewarmMaterial, createShadowPrewarmMaterial } from './ShadowPrewarmMaterial.ts';

/** Blackout has one retained light signature through power, switching and merge.
 * Prepare hidden forms and caster passes without advancing encounter authority. */
export class BlackoutPresentationPreparation {
  readonly diagnostics = { durationMs: 0, visibleVariants: 0, shadowVariants: 0, programsAfter: 0 };
  private readonly materials: THREE.Material[] = [];
  private readonly instances: THREE.InstancedMesh[] = [];
  private readonly target = new THREE.WebGLRenderTarget(1, 1);
  private disposed = false;
  private busy = false;
  private released = false;

  async prepare(layer: RenderLayer, camera: THREE.Camera): Promise<void> {
    if (this.disposed) return;
    const started = performance.now();
    const visible = new THREE.Group(), shadows = new THREE.Group();
    const shadowScene = new THREE.Scene();
    // Shadow draws use a null scene in Three.js: no visible-pass fog/environment.
    layer.scene.traverseVisible(object => {
      if (object instanceof THREE.Light) shadowScene.add(object.clone(false));
    });
    const hasDepth = shadowScene.children.some(o => o instanceof THREE.Light && o.castShadow && !(o instanceof THREE.PointLight));
    const point = shadowScene.children.find(o => o instanceof THREE.PointLight && o.castShadow);
    const clone = (source: THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite, material: THREE.Material) => {
      const proxy = source.clone(false) as typeof source;
      source.updateWorldMatrix(true, false);
      proxy.matrix.copy(source.matrixWorld); proxy.matrixAutoUpdate = false;
      proxy.visible = true; proxy.frustumCulled = false; proxy.castShadow = false;
      proxy.material = material;
      if (proxy instanceof THREE.InstancedMesh) this.instances.push(proxy);
      return proxy;
    };
    layer.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material.visible) continue;
        const copy = copyPrewarmMaterial(material); this.materials.push(copy);
        visible.add(clone(object, copy));
        // Camera fade changes Bob's eyes from opaque to transparent. Shader
        // hooks/uniforms remain borrowed, and no fade value is changed on Bob.
        if (object.name.startsWith('Bob-Eye') && !copy.transparent) {
          const faded = copyPrewarmMaterial(copy); faded.transparent = true;
          this.materials.push(faded); visible.add(clone(object, faded));
        }
        if (copy.transparent && copy.side === THREE.DoubleSide && !copy.forceSinglePass) {
          const back = copyPrewarmMaterial(copy); back.side = THREE.BackSide; back.forceSinglePass = true;
          this.materials.push(back); visible.add(clone(object, back));
        }
        if (!(object instanceof THREE.Mesh) || !object.castShadow) continue;
        for (const distance of [false, true]) {
          if (distance ? !point : !hasDepth) continue;
          const shadow = createShadowPrewarmMaterial(object, material, distance);
          this.materials.push(shadow);
          if (distance) (layer.renderer.properties.get(shadow) as {light?: THREE.Object3D}).light = point;
          shadows.add(clone(object, shadow));
        }
      }
    });
    this.diagnostics.visibleVariants = visible.children.length;
    this.diagnostics.shadowVariants = shadows.children.length;
    this.busy = true;
    try {
      for (const [group, scene, target] of [[visible, layer.scene, undefined], [shadows, shadowScene, this.target]] as const) {
        if (this.disposed) return;
        await withIsolatedPrewarmState(layer.renderer, () => layer.withShadowPreparation(true,
          () => layer.renderer.compileAsync(group, camera, scene)), target);
        if (this.disposed) return;
        // Compile the transmission target's linear-output variants separately.
        if (group === visible) {
          await withIsolatedPrewarmState(layer.renderer, () => layer.withShadowPreparation(true,
            () => layer.renderer.compileAsync(group, camera, scene)), this.target);
          if (this.disposed) return;
        }
        if (group === visible) {
          // PCF receivers use comparison samplers in r185. Preparation suppresses
          // shadow updates, so allocate the level-owned maps with a live draw
          // before submitting receiver proxies; null fallback textures cannot
          // satisfy those samplers on SwiftShader.
          withIsolatedPrewarmState(layer.renderer, () => layer.renderer.render(layer.scene, camera));
        }
        scene.add(group);
        try {
          withIsolatedPrewarmState(layer.renderer, () => layer.withShadowPreparation(true,
            () => renderIsolatedPrewarmResources(layer.renderer, scene, camera, [group])), target);
        } finally { group.removeFromParent(); }
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
    for (const instance of this.instances) instance.dispose();
    this.materials.length = 0; this.instances.length = 0;
    this.target.dispose();
  }
}
