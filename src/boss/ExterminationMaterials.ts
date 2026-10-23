import * as THREE from 'three';
import { EXTERMINATION_SURFACES, loadExterminationMaps, type ExterminationMapData, type ExterminationSurface } from './ExterminationSurfaceMaps.ts';

export type ExterminationFinish = 'ivory' | 'coolPanel' | 'servicePanel' | 'floor' | 'repairDeck' | 'floorTrim' |
  'steel' | 'bareSteel' | 'rubber' | 'grate' | 'shaft' | 'cover' | 'coverRepair' | 'hazard' | 'glass';
const finishes: Record<ExterminationFinish, { family: ExterminationSurface; color: number; metalness: number; wear: number }> = {
  ivory: { family: 'wall', color: 0x8c9ba2, metalness: .48, wear: .45 },
  coolPanel: { family: 'wall', color: 0x536771, metalness: .6, wear: .35 },
  servicePanel: { family: 'wall', color: 0x627a80, metalness: .3, wear: .65 },
  floor: { family: 'floor', color: 0xc1cacc, metalness: .3, wear: .5 },
  repairDeck: { family: 'floor', color: 0xa6b4b4, metalness: .38, wear: .15 },
  floorTrim: { family: 'floor', color: 0x596b71, metalness: .45, wear: .7 },
  steel: { family: 'steel', color: 0x6a7c86, metalness: .72, wear: .45 },
  bareSteel: { family: 'steel', color: 0xd3dddd, metalness: .8, wear: .18 },
  rubber: { family: 'steel', color: 0x253037, metalness: .02, wear: .2 },
  grate: { family: 'grate', color: 0xffffff, metalness: .62, wear: .6 },
  shaft: { family: 'shaft', color: 0xffffff, metalness: .36, wear: .9 },
  cover: { family: 'wall', color: 0xc3c9ba, metalness: .2, wear: .85 },
  coverRepair: { family: 'wall', color: 0x8ca9aa, metalness: .3, wear: .5 },
  hazard: { family: 'steel', color: 0xe5ae48, metalness: .12, wear: .65 },
  glass: { family: 'steel', color: 0x1d4755, metalness: .28, wear: .1 },
};

/** One room owns all GPU resources. Its reflection probe is borrowed from the level. */
export class ExterminationMaterials {
  readonly ready: Promise<void>;
  private readonly abort = new AbortController();
  private readonly materials = new Map<ExterminationFinish, THREE.MeshStandardMaterial>();
  private readonly maps = new Map<ExterminationSurface, readonly [THREE.DataTexture, THREE.DataTexture, THREE.DataTexture]>();
  private data: ExterminationMapData | undefined;
  private environment: THREE.Texture | null = null;
  private disposed = false;

  constructor(data?: ExterminationMapData) {
    this.data = data;
    const url = new URL('../assets/blackout/extermination-maps.bin', import.meta.url);
    this.ready = !data && typeof window !== 'undefined' && url.protocol !== 'file:'
      ? loadExterminationMaps(url, this.abort.signal).then(loaded => {
        if (this.disposed) return;
        this.data = loaded;
        for (const [family, textures] of this.maps) this.upload(family, textures);
      }) : Promise.resolve();
    // Disposal can cancel preparation before the level begins awaiting it.
    void this.ready.catch(() => {});
  }

  get(finish: ExterminationFinish): THREE.MeshStandardMaterial {
    if (this.disposed) throw new Error('Extermination materials have been disposed.');
    const existing = this.materials.get(finish); if (existing) return existing;
    const f = finishes[finish], surface = EXTERMINATION_SURFACES[f.family], [map, roughnessMap, normalMap] = this.textures(f.family);
    const m = new THREE.MeshStandardMaterial();
    m.name = `extermination-${finish}`; m.color.setHex(f.color); m.metalness = f.metalness;
    m.map = finish === 'glass' ? null : map; m.roughnessMap = roughnessMap; m.normalMap = normalMap;
    m.roughness = finish === 'glass' ? .24 : finish === 'rubber' ? 1.65 : 1;
    m.normalScale.setScalar(finish === 'glass' ? .05 : .45);
    if (finish === 'glass') { m.transparent = true; m.opacity = .32; m.depthWrite = false; }
    m.envMap = this.environment; m.envMapIntensity = finish === 'glass' ? .45 : .16;
    m.userData.tileSizeMetres = surface.tile; m.userData.exterminationFinish = finish;
    if (finish === 'shaft') { m.emissive.setHex(0x152c33); m.emissiveIntensity = .12; }
    m.onBeforeCompile = shader => {
      shader.uniforms.uArenaWear = { value: f.wear };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        varying vec3 vArenaWorld;
      `).replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 arenaPoint=vec4(position,1.);
        #ifdef USE_INSTANCING
          arenaPoint=instanceMatrix*arenaPoint;
        #endif
        vArenaWorld=(modelMatrix*arenaPoint).xyz;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vArenaWorld;uniform float uArenaWear;
        float arenaHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
        float arenaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(arenaHash(i),arenaHash(i+vec2(1,0)),f.x),mix(arenaHash(i+vec2(0,1)),arenaHash(i+1.),f.x),f.y);}
      `).replace('#include <map_fragment>', `#include <map_fragment>
        float arenaGrime=arenaNoise(vArenaWorld.xz*.075+vArenaWorld.y*.017);
        diffuseColor.rgb*=.985+arenaGrime*.03;
      `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor+(arenaGrime-.5)*uArenaWear*.06,.12,1.);
      `).replace('#include <opaque_fragment>', `
        outgoingLight*=mix(.01,1.,exp(min(vArenaWorld.y,0.)*.022));
        #include <opaque_fragment>
      `);
    };
    m.customProgramCacheKey = () => 'vault-authored-uv-pbr-v2';
    this.materials.set(finish, m); return m;
  }

  setEnvironment(texture: THREE.Texture | null): void {
    this.environment = texture;
    for (const m of this.materials.values()) { if (Boolean(m.envMap) !== Boolean(texture)) m.needsUpdate = true; m.envMap = texture; }
  }
  get diagnostics() {
    return { materials: this.materials.size, textures: this.maps.size * 3, ready: Boolean(this.data),
      textureBytes: [...this.maps.keys()].reduce((sum, family) => sum + EXTERMINATION_SURFACES[family].size ** 2 * 4 * 3 * 4 / 3, 0) };
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.abort.abort();
    for (const m of this.materials.values()) m.dispose();
    for (const textures of this.maps.values()) for (const t of textures) t.dispose();
    this.materials.clear(); this.maps.clear(); this.data = undefined;
  }
  private textures(family: ExterminationSurface) {
    const existing = this.maps.get(family); if (existing) return existing;
    const textures = [0, 1, 2].map(i => {
      const t = new THREE.DataTexture(new Uint8Array(i === 2 ? [128, 128, 255, 255] : [255, 255, 255, 255]), 1, 1);
      t.name = `extermination-${family}-${['albedo', 'roughness', 'normal'][i]}`;
      t.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      const tile = EXTERMINATION_SURFACES[family].tile; t.repeat.set(1 / tile[0], 1 / tile[1]); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t;
    }) as [THREE.DataTexture, THREE.DataTexture, THREE.DataTexture];
    this.maps.set(family, textures); this.upload(family, textures); return textures;
  }
  private upload(family: ExterminationSurface, textures: readonly THREE.DataTexture[]): void {
    if (!this.data) return;
    const size = EXTERMINATION_SURFACES[family].size;
    textures.forEach((t, i) => { t.image = { data: this.data!.maps[family][i]!, width: size, height: size }; t.needsUpdate = true; });
  }
}
