import { CultivationLightLayout } from './CultivationLightLayout.ts';
import * as THREE from 'three';
import type { LevelTwoPreviewScene } from '../levels/LevelTwoPreviewScene.ts';
import type { RenderLayer } from './RenderLayer.ts';

type Drawable = THREE.Mesh | THREE.Points | THREE.Line | THREE.Sprite;
interface Configuration { key: string; visible: boolean[]; dark: boolean; z: number; ready: boolean; }
interface Step { label?: string; run: () => void | Promise<unknown>; }

/** A single bounded GPU preparation queue. It never changes the live room hierarchy. */
export class CultivationPreparationQueue {
  readonly diagnostics = { constructionMs: 0, initialMs: 0, workMs: 0, textureMs: 0, compileWaitMs: 0, primeMs: 0, maxStepMs: 0,
    slowSteps: [] as {label: string; ms: number; z: number; dark: boolean}[], completed: 0, total: 0, pending: false, configurations: [] as {z: number; dark: boolean; elapsedMs: number}[] };
  private readonly roots: THREE.Group[];
  private readonly configurations: Configuration[] = [];
  private readonly textures = new Set<THREE.Texture>();
  private readonly uploaded = new Set<THREE.BufferGeometry>();
  private readonly retained: THREE.Material[] = [];
  private readonly temporaryInstances: THREE.InstancedMesh[] = [];
  private readonly target = new THREE.WebGLRenderTarget(1, 1);
  private readonly camera: THREE.Camera;
  private readonly backgroundSupported: boolean;
  private active: Configuration | undefined;
  private iterator: Generator<Step> | undefined;
  private busy = false;
  private disposed = false;
  private failure: unknown;
  private priority: Configuration | undefined;
  private configStarted = 0;
  private lastTick = -1;
  private readonly overlay: HTMLDivElement | undefined;

  private readonly layer: RenderLayer;
  private readonly preview: LevelTwoPreviewScene;
  constructor(layer: RenderLayer, preview: LevelTwoPreviewScene, host?: HTMLElement) {
    this.layer = layer; this.preview = preview;
    this.backgroundSupported = layer.renderer.extensions.has('KHR_parallel_shader_compile');
    this.roots = [preview.roomOne.root, preview.roomOneToTwoPassage.root, preview.roomTwo.root,
      preview.roomTwoToThreeGoopPassage.root, preview.roomTwoToThreeBobAirDuct.root,
      preview.roomThree.root, preview.roomFour.root, preview.roomFive.root];
    this.camera = layer.cameraRig.camera.clone();
    const saved = this.roots.map(root => root.visible);
    const add = (z: number, dark: boolean) => {
      const visible = this.roots.map(root => root.visible), key = this.key(visible, dark);
      if (!this.configurations.some(c => c.key === key)) this.configurations.push({key, visible, dark, z, ready: false});
    };
    for (let z = 0; z <= 270; z++) for (const offset of [-12, 0, 12]) {
      preview.updatePresentationVisibility({z:z + offset}, {z}); add(z, z >= 242);
      if (this.roots[6].visible) { this.roots[5].visible = false; add(z, z >= 242); }
      if (z >= 230 && this.roots[6].visible) {
        this.roots[7].visible = true; add(z, z >= 242);
        // Arrival lighting now starts before either slime enters the lower vent.
        add(z, true);
      }
    }
    this.roots.forEach((root, i) => root.visible = saved[i]);
    this.diagnostics.total = this.configurations.length;
    preview.root.userData.preparation = this.diagnostics;
    if (host && typeof document !== 'undefined') {
      this.overlay = document.createElement('div'); this.overlay.setAttribute('role', 'status'); this.overlay.hidden = true;
      Object.assign(this.overlay.style, {position:'absolute', inset:'0', background:'#07110f', color:'#dbe9e4',
        zIndex:'80', display:'none', placeItems:'center', fontFamily:'sans-serif'});
      host.append(this.overlay);
    }
  }
  private key(visible: boolean[], dark: boolean): string { return visible.join(',') + ':' + dark; }

  /** Called after visibility selection, before any unprepared scene can be rendered. */
  requireCurrent(dark: boolean): boolean {
    const key = this.key(this.roots.map(root => root.visible), dark);
    let config = this.configurations.find(c => c.key === key);
    if (!config) {
      config = {key, visible:this.roots.map(root => root.visible), dark, z: this.preview.root.worldToLocal(this.layer.cameraRig.camera.position.clone()).z, ready:false};
      this.configurations.push(config); this.diagnostics.total++;
    }
    this.priority = config.ready ? undefined : config;
    this.diagnostics.pending = !config.ready;
    if (this.overlay) {
      this.overlay.hidden = config.ready; this.overlay.style.display = config.ready ? 'none' : 'grid';
      this.overlay.textContent = this.failure ? 'Room preparation failed. Reload to retry.' : 'Preparing the next laboratory section…';
    }
    return config.ready;
  }

  async prepareInitial(): Promise<void> {
    const started = performance.now();
    this.priority = this.configurations[0];
    while (!this.disposed && !this.configurations[0].ready) {
      if (this.failure) throw this.failure;
      this.tick(0, true);
      // RAF yields to painting and the browser's asynchronous shader compiler.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    this.diagnostics.initialMs = performance.now() - started;
  }

  tick(frameMs: number, foreground = false): void {
    if (this.disposed || this.busy || this.failure) return;
    const now = performance.now();
    if (!foreground && (!this.backgroundSupported || frameMs > 20 || now - this.lastTick < 15)) return;
    this.lastTick = now;
    const budget = foreground ? 5 : 1.5;
    while (performance.now() - now < budget && !this.busy && !this.disposed) {
      if (!this.iterator) {
        this.active = this.priority && !this.priority.ready ? this.priority : this.configurations.find(c => !c.ready);
        if (!this.active) return;
        this.configStarted = performance.now(); this.iterator = this.steps(this.active);
      }
      const started = performance.now(); let label = 'collect';
      try {
        const step = this.iterator.next();
        if (step.done) {
          this.active!.ready = true; this.diagnostics.completed++;
          this.diagnostics.configurations.push({z:this.active!.z, dark:this.active!.dark, elapsedMs:performance.now()-this.configStarted});
          this.iterator = undefined; continue;
        }
        label = step.value.label ?? label;
        const result = step.value.run();
        if (result instanceof Promise) {
          this.busy = true;
          void result.then(() => { this.busy = false; if (this.disposed) this.releaseResources(); }, error => { this.failure = error; this.busy = false; if (this.disposed) this.releaseResources(); });
        }
      } catch (error) { this.failure = error; return; }
      const elapsed = performance.now() - started;
      if (elapsed > 20) this.diagnostics.slowSteps.push({label,ms:elapsed,z:this.active!.z,dark:this.active!.dark});
      this.diagnostics.workMs += elapsed; this.diagnostics.maxStepMs = Math.max(this.diagnostics.maxStepMs, elapsed);
    }
  }

  private *steps(config: Configuration): Generator<Step> {
    const scene = new THREE.Scene(); scene.fog = this.layer.scene.fog; scene.environment = this.layer.scene.environment;
    const drawables: Drawable[] = [];
    const visit = (o: THREE.Object3D, foundation = false) => {
      foundation ||= o.name === 'cultivation-level-2-foundation';
      const index = this.roots.indexOf(o as THREE.Group);
      if (index !== -1 && !config.visible[index]) return;
      if (o.name === 'cultivation-shader-light-padding') return;
      if (o.name.startsWith('cultivation-room-3-drone-') && !config.visible[5]) return;
      if (o instanceof THREE.Light) {
        const clone = o.clone(false); o.updateWorldMatrix(true, false); clone.matrix.copy(o.matrixWorld); clone.matrixAutoUpdate = false;
        scene.add(clone);
      }
      if (!foundation && (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line || o instanceof THREE.Sprite)) drawables.push(o);
      for (const child of o.children) visit(child, foundation);
    };
    visit(this.layer.scene);
    const padding = new CultivationLightLayout(scene);
    const seen = new Set<string>();
    const materialCopies = new Map<string, THREE.Material>();
    const programs: Drawable[] = [], primes: Drawable[] = [], shadows: THREE.Mesh[] = [];
    let collected = 0;
    for (const source of drawables) {
      const materials = Array.isArray(source.material) ? source.material : [source.material];
      const geometry = source.geometry;
      const feature = source.type + ':' + (source instanceof THREE.InstancedMesh ? 'instanced:' + !!source.instanceColor : 'ordinary') + ':' +
        Object.entries(geometry.attributes).map(([name, a]) => name + a.itemSize).sort().join(',') + ':' + Object.keys(geometry.morphAttributes).join(',');
      const proxy = source.clone(false) as Drawable; proxy.visible = true; proxy.frustumCulled = false; proxy.castShadow = false;
      source.updateWorldMatrix(true, false); proxy.matrix.copy(source.matrixWorld); proxy.matrixAutoUpdate = false;
      if (proxy instanceof THREE.InstancedMesh) this.temporaryInstances.push(proxy);
      const needsBuffer = !this.uploaded.has(geometry);
      let needsProgram = false;
      const copies = materials.map(material => {
        const key = material.uuid + ':' + feature;
        if (material.visible && !seen.has(key)) { seen.add(key); needsProgram = true; }
        // compileAsync reads currentProgram later. Isolate it from live rendering.
        const existing = materialCopies.get(key); if (existing) return existing;
        const copy = material instanceof THREE.MeshPhysicalMaterial ? new THREE.MeshPhysicalMaterial().copy(material) :
          material instanceof THREE.MeshStandardMaterial ? new THREE.MeshStandardMaterial().copy(material) :
          material instanceof THREE.ShaderMaterial ? new THREE.ShaderMaterial().copy(material) : material.clone();
        if (copy instanceof THREE.ShaderMaterial && material instanceof THREE.ShaderMaterial) copy.uniforms = material.uniforms;
        materialCopies.set(key, copy); copy.onBeforeCompile = material.onBeforeCompile;
        const cacheKey = material.customProgramCacheKey(); copy.customProgramCacheKey = () => cacheKey;
        this.retained.push(copy); return copy;
      });
      proxy.material = Array.isArray(source.material) ? copies : copies[0];
      for (const material of materials) for (const value of Object.values(material)) if (value instanceof THREE.Texture && !this.textures.has(value)) {
        this.textures.add(value);
        yield {run: () => { const start = performance.now(); this.layer.renderer.initTexture(value); this.diagnostics.textureMs += performance.now()-start; }};
      }
      if (needsProgram) {
        programs.push(proxy);
        // Three's two-pass transparent preparation waits on the last side only.
        // Give the back-face program its own material so both sides are awaited.
        for (const copy of copies) if (copy.transparent && copy.side === THREE.DoubleSide && !copy.forceSinglePass) {
          const back = copy.clone(); back.onBeforeCompile = copy.onBeforeCompile; back.customProgramCacheKey = copy.customProgramCacheKey;
          back.side = THREE.BackSide; back.forceSinglePass = true; this.retained.push(back);
          const backProxy = proxy.clone(false) as Drawable; backProxy.material = back;
          if (backProxy instanceof THREE.InstancedMesh) this.temporaryInstances.push(backProxy);
          programs.push(backProxy);
        }
      }
      if (needsProgram || needsBuffer) { primes.push(proxy); this.uploaded.add(geometry); }
      if (++collected % 8 === 0) yield {label:'collect', run: () => {}};
      // Shadow programs also encode light counts. Compile their real depth/distance
      // configurations asynchronously, without rendering nine whole-room shadow passes.
      if (config.dark && source instanceof THREE.Mesh && source.castShadow) for (const material of materials) {
        for (const distance of [false, true]) {
          const m = material as THREE.MeshStandardMaterial;
          const side = m.shadowSide ?? (m.side === THREE.FrontSide ? THREE.BackSide : m.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
          const custom = distance ? source.customDistanceMaterial : source.customDepthMaterial;
          const key = (custom?.customProgramCacheKey() ?? '') + 'shadow:' + distance + ':' + side + ':' + feature + ':' + m.alphaTest + ':' + (m.displacementMap?.uuid ?? '');
          if (seen.has(key)) continue; seen.add(key);
          const shadow = (custom ? custom.clone() : distance ? new THREE.MeshDistanceMaterial() : new THREE.MeshDepthMaterial()) as THREE.MeshDepthMaterial | THREE.MeshDistanceMaterial;
          if (custom) { shadow.onBeforeCompile = custom.onBeforeCompile; const key = custom.customProgramCacheKey(); shadow.customProgramCacheKey = () => key; }
          shadow.side = side; shadow.map = m.map; shadow.alphaMap = m.alphaMap; shadow.alphaTest = m.alphaTest;
          shadow.displacementMap = m.displacementMap; shadow.displacementScale = m.displacementScale; shadow.displacementBias = m.displacementBias;
          this.retained.push(shadow);
          const shadowProxy = source.clone(false) as THREE.Mesh; shadowProxy.material = shadow; shadowProxy.castShadow = false; shadowProxy.frustumCulled = false; shadowProxy.visible = true;
          if (shadowProxy instanceof THREE.InstancedMesh) this.temporaryInstances.push(shadowProxy);
          if (distance) (this.layer.renderer.properties.get(shadow) as {light?: THREE.Object3D}).light = scene.children.find(o => o instanceof THREE.PointLight);
          shadows.push(shadowProxy);
        }
      }
    }
    for (const [objects, shadowTarget] of [[programs, false], [shadows, true]] as const) {
      for (let i = 0; i < objects.length; i += 8) {
        const group = new THREE.Group(); group.add(...objects.slice(i, i + 8));
        yield {label: shadowTarget ? 'shadow-compile' : 'compile', run: () => {
          const start = performance.now();
          return this.withState(config.dark, shadowTarget, () => this.layer.renderer.compileAsync(group, this.camera, scene)).then(() => {
            this.diagnostics.compileWaitMs += performance.now()-start; group.clear();
          });
        }};
      }
    }
    for (const [objects, shadowTarget] of [[primes, false], [shadows, true]] as const) for (const proxy of objects) {
      yield {label:(shadowTarget ? 'shadow-prime:' : 'prime:') + proxy.name, run: () => {
        const start = performance.now(); scene.add(proxy);
        try { this.withState(config.dark, shadowTarget, () => this.layer.renderer.render(scene, this.camera)); }
        finally { proxy.removeFromParent(); }
        this.diagnostics.primeMs += performance.now()-start;
      }};
    }
    padding.dispose(); scene.clear();
  }

  /** State is restored synchronously, before compileAsync yields to gameplay. */
  private withState<T>(dark: boolean, shadowTarget: boolean, action: () => T): T {
    const r = this.layer.renderer;
    const counters = r.info ? {calls:r.info.render.calls, triangles:r.info.render.triangles, points:r.info.render.points, lines:r.info.render.lines} : undefined;
    const enabled = r.shadowMap.enabled, type = r.shadowMap.type, auto = r.shadowMap.autoUpdate;
    const viewport = r.getViewport(new THREE.Vector4()), scissor = r.getScissor(new THREE.Vector4()), test = r.getScissorTest(), target = r.getRenderTarget();
    r.shadowMap.enabled = dark; r.shadowMap.type = THREE.PCFShadowMap; r.shadowMap.autoUpdate = false;
    if (shadowTarget) r.setRenderTarget(this.target);
    r.setViewport(-2, -2, 1, 1); r.setScissor(-2, -2, 1, 1); r.setScissorTest(true);
    try { return action(); } finally {
      r.setRenderTarget(target); r.setViewport(viewport); r.setScissor(scissor); r.setScissorTest(test);
      r.shadowMap.enabled = enabled; r.shadowMap.type = type; r.shadowMap.autoUpdate = auto;
      if (counters) Object.assign(r.info.render, counters);
    }
  }
  dispose(): void {
    this.disposed = true; this.iterator?.return(undefined); this.iterator = undefined;
    this.overlay?.remove();
    if (!this.busy) this.releaseResources();
  }
  private releaseResources(): void {
    for (const m of this.retained) m.dispose();
    for (const mesh of this.temporaryInstances) mesh.dispose();
    this.retained.length = 0; this.temporaryInstances.length = 0;
    this.target.dispose(); this.overlay?.remove();
  }
}
