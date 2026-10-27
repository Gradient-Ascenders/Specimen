import * as THREE from 'three';

type ShadowLight = THREE.SpotLight | THREE.PointLight | THREE.DirectionalLight;
interface ShadowSource { light: ShadowLight; width: number; height: number }
interface DecorativeSource { geometry: THREE.BufferGeometry; start: number; count: number; vertices: number }

/** Explicit opt-in: never thin projectiles, aiming guides, beams or hazard cues. */
export function markDecorativeEffect(geometry: THREE.BufferGeometry): void {
  geometry.userData.graphicsDecorativeEffect = true;
}

/** Catalog on root attachment/detachment, not a mesh traversal every frame.
 * Owners keep their light/geometry lifetime. Changing map size releases the old
 * map once and invalidates it; later teardown only sees the replacement map. */
export class GraphicsResourcePolicy {
  private shadows: ShadowSource[] = [];
  private effects: DecorativeSource[] = [];
  private readonly authoredShadows = new WeakMap<ShadowLight, ShadowSource>();
  private readonly authoredEffects = new WeakMap<THREE.BufferGeometry, DecorativeSource>();
  private dirty = true;
  private shadowMapSizeCap = 512;
  private effectsDensity = 0.5;
  private disposed = false;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.addEventListener('childadded', this.invalidate);
    scene.addEventListener('childremoved', this.invalidate);
  }

  setQuality(shadowMapSizeCap: number, effectsDensity: number): void {
    const changed = this.shadowMapSizeCap !== shadowMapSizeCap || this.effectsDensity !== effectsDensity;
    this.shadowMapSizeCap = shadowMapSizeCap;
    this.effectsDensity = effectsDensity;
    if (this.dirty) this.refresh();
    else if (changed) this.apply();
  }

  sync(): void { if (this.dirty) this.refresh(); }

  /** Comparison and raw-depth samplers require different texture state. Also
   * release dormant/padding maps: they can otherwise survive a quality change
   * and become a mismatched sampler on a later room's first visible draw. */
  invalidateShadowMaps():void{
    this.sync();
    for(const {light} of this.shadows){
      light.shadow.dispose();light.shadow.map=null;light.shadow.mapPass=null;
      light.shadow.needsUpdate=true;
    }
  }

  /** Call explicitly if a future owner adds nested lights/effects after load. */
  refresh(): void {
    if (this.disposed) return;
    this.shadows = []; this.effects = [];
    const seen = new Set<THREE.BufferGeometry>();
    this.scene.traverse(object => {
      if ((object instanceof THREE.SpotLight || object instanceof THREE.PointLight || object instanceof THREE.DirectionalLight) && object.castShadow) {
        let source = this.authoredShadows.get(object);
        if (!source) {
          source = { light: object, width: object.shadow.mapSize.x, height: object.shadow.mapSize.y };
          this.authoredShadows.set(object, source);
        }
        this.shadows.push(source);
      }
      if (object instanceof THREE.Points && object.geometry.userData.graphicsDecorativeEffect && !seen.has(object.geometry)) {
        const geometry = object.geometry;
        seen.add(geometry);
        let source = this.authoredEffects.get(geometry);
        if (!source) {
          source = { geometry, start: geometry.drawRange.start, count: geometry.drawRange.count,
            vertices: geometry.getAttribute('position').count };
          this.authoredEffects.set(geometry, source);
        }
        this.effects.push(source);
      }
    });
    this.dirty = false;
    this.apply();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.removeEventListener('childadded', this.invalidate);
    this.scene.removeEventListener('childremoved', this.invalidate);
    // Scene owners, not this catalog, release the final maps and geometries.
    this.shadows.length = this.effects.length = 0;
  }

  private readonly invalidate = (): void => {
    this.dirty = true;
    // Unload can leave the session renderer idle indefinitely. Do not retain a
    // departed room through its lights/geometry while waiting for another draw.
    this.shadows.length = this.effects.length = 0;
  };

  private apply(): void {
    if (this.disposed) return;
    for (const { light, width, height } of this.shadows) {
      const nextWidth = Math.min(width, this.shadowMapSizeCap), nextHeight = Math.min(height, this.shadowMapSizeCap);
      const shadow = light.shadow;
      if (shadow.mapSize.x === nextWidth && shadow.mapSize.y === nextHeight) continue;
      shadow.dispose(); shadow.map = null; shadow.mapPass = null;
      shadow.mapSize.set(nextWidth, nextHeight);
      shadow.needsUpdate = true;
    }
    for (const { geometry, start, count, vertices } of this.effects) {
      geometry.setDrawRange(start, this.effectsDensity === 1 ? count :
        Math.ceil(Math.min(count, Math.max(0, vertices - start)) * this.effectsDensity));
    }
  }
}
