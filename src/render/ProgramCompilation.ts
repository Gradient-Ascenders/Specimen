import * as THREE from 'three';
import { withIsolatedPrewarmState } from './IsolatedResourcePrewarm.ts';
import { clonePrewarmDrawable } from './ShadowPrewarmMaterial.ts';

type Drawable = THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite;
interface PendingProgram { isReady(): boolean; }

/** Three's compile() uses the last draw's clipping state instead of each
 * material's planes. Seed each distinct state with an isolated cheap draw
 * before compiling that group, including the zero-plane group. */
export class ProgramCompilation {
  private readonly original: THREE.WebGLRenderer['compile'];
  private readonly originalAsync: THREE.WebGLRenderer['compileAsync'];
  private readonly target = new THREE.WebGLRenderTarget(1, 1);
  private readonly geometry = new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute([-1,-1,-1, 1,-1,-1, 0,1,-1],3));
  private readonly material = new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false});
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private preparedClipping = false;
  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer; this.original = renderer.compile; this.originalAsync = renderer.compileAsync;
    const mesh = new THREE.Mesh(this.geometry, this.material); mesh.frustumCulled = false; mesh.layers.enableAll(); this.scene.add(mesh);
    const owner = this;
    renderer.compile = function(scene, camera, targetScene) {
      if (!this.localClippingEnabled && !this.clippingPlanes.length) {
        if (owner.preparedClipping) {
          owner.material.clippingPlanes = null;
          owner.material.clipIntersection = false;
          withIsolatedPrewarmState(this, () => this.render(owner.scene, camera), owner.target);
          owner.preparedClipping = false;
        }
        return owner.original.call(this, scene, camera, targetScene);
      }
      owner.preparedClipping = true;
      const groups = new Map<string, {group:THREE.Group; planes:THREE.Plane[] | null; intersection:boolean}>();
      const disposers:(()=>void)[] = [];
      const lights:THREE.Light[] = [];
      if (targetScene && scene !== targetScene) scene.traverseVisible(object => {
        if (object instanceof THREE.Light) lights.push(object);
      });
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
        for (const material of [object.material].flat()) {
          const planes = this.localClippingEnabled ? material.clippingPlanes : null;
          const intersection = !!planes?.length && material.clipIntersection;
          const key = `${planes?.length ?? 0}:${intersection}`;
          let batch = groups.get(key);
          if (!batch) {
            batch = {group:new THREE.Group(),planes,intersection};
            for (const light of lights) batch.group.add(light.clone(false));
            groups.set(key,batch);
          }
          const proxy = clonePrewarmDrawable(object,disposers) as Drawable; proxy.material = material;
          batch.group.add(proxy);
        }
      });
      const materials = new Set<THREE.Material>();
      try {
        // Resolve the tiny state-setting shaders before scene compilation can
        // queue expensive work ahead of their synchronous first use. Retain
        // every per-group seed below to establish the correct clipping state.
        if (groups.size > 1) {
          const beforeSeeds = new Set(this.info.programs);
          for (const {planes,intersection} of groups.values()) {
            owner.material.clippingPlanes = planes; owner.material.clipIntersection = intersection;
            withIsolatedPrewarmState(this, () => this.render(owner.scene,camera), owner.target);
          }
          // Observe real completion now, rather than first querying already
          // drawn seeds behind the later scene-program queue. Never force ready.
          for (const program of this.info.programs ?? []) if (!beforeSeeds.has(program))
            (program as unknown as PendingProgram).isReady();
        }
        for (const {group,planes,intersection} of groups.values()) {
          owner.material.clippingPlanes = planes; owner.material.clipIntersection = intersection;
          withIsolatedPrewarmState(this, () => this.render(owner.scene,camera), owner.target);
          for (const material of owner.original.call(this,group,camera,targetScene ?? scene as THREE.Scene)) materials.add(material);
        }
      } finally {
        for (const {group} of groups.values()) group.clear();
        for (const dispose of disposers) dispose();
      }
      return materials;
    };
    renderer.compileAsync = async function(scene, camera, targetScene) {
      if (!this.extensions.has('KHR_parallel_shader_compile'))
        return owner.originalAsync.call(this, scene, camera, targetScene);
      const before = new Set(this.info.programs);
      const materials = this.compile(scene, camera, targetScene);
      // Snapshot program identities now. Later passes can select another
      // currentProgram on the same material, and one material can submit both
      // faces or several geometry variants. Await every newly submitted one.
      const pending = new Set<PendingProgram>([
        ...(this.info.programs?.filter(program => !before.has(program)) ?? []) as unknown as PendingProgram[],
        ...Array.from(materials, material => (this.properties.get(material) as {currentProgram: PendingProgram}).currentProgram),
      ]);
      // Hundreds of material copies often reference the same program. Poll
      // each distinct program once instead of repeating driver queries.
      while (pending.size) {
        for (const program of pending) if (program.isReady()) pending.delete(program);
        if (pending.size) await new Promise(resolve => setTimeout(resolve, 10));
      }
      return scene;
    };
  }

  dispose(): void {
    this.renderer.compile = this.original;
    this.renderer.compileAsync = this.originalAsync;
    this.scene.clear(); this.geometry.dispose(); this.material.dispose(); this.target.dispose();
  }
}
