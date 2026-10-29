import * as THREE from 'three';
import type { GraphicsSettings } from '../../GraphicsProfiles.ts';
import { readGzipResponse } from '../ReadGzipResponse.ts';
import { withIsolatedPrewarmState } from '../../IsolatedResourcePrewarm.ts';
import { installContainmentSoftShadows } from '../containment/ContainmentSoftShadows.ts';
import { CULTIVATION_RADIANCE_LAYOUT as ZONES, CULTIVATION_RADIANCE_VERSION as VERSION,
  CULTIVATION_CAPTURE_SIZE as SIZE, CULTIVATION_ATLAS_WIDTH as WIDTH, CULTIVATION_ATLAS_HEIGHT as HEIGHT,
  CULTIVATION_ATLAS_DEPTH as DEPTH, CULTIVATION_REFLECTION_COLUMNS as COLUMNS } from './CultivationRadianceLayout.ts';
import { installCultivationRadianceShader, type CultivationRadianceUniforms } from './CultivationRadianceShader.ts';

export const CULTIVATION_RADIANCE_URL = new URL('../../../../assets/environments/cultivation-lighting/radiance.bin', import.meta.url).href;
export interface CultivationRadianceBank {
  readonly probes: number;
  readonly invalidProbes: number;
  readonly irradiance: Uint16Array;
  readonly captures: readonly Uint8Array[];
}

export function readCultivationRadiance(buffer: ArrayBuffer): CultivationRadianceBank {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 16 || new TextDecoder().decode(bytes.subarray(0, 8)) !== VERSION) throw Error('Invalid Cultivation radiance bank.');
  const length = new DataView(buffer).getUint32(8, true);
  if (length > 4096 || length + 12 > bytes.length) throw Error('Invalid Cultivation radiance header.');
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + length)));
  const probes = ZONES.reduce((n, p) => n + p.grid[0] * p.grid[1] * p.grid[2], 0);
  if (header.probes !== probes || header.zones !== ZONES.length || header.states !== 2 ||
      JSON.stringify(header.atlas) !== JSON.stringify([WIDTH, HEIGHT, DEPTH]) || JSON.stringify(header.captureSize) !== JSON.stringify(SIZE))
    throw Error('Unsupported Cultivation radiance layout.');
  const offset = (12 + length + 3) & ~3, count = WIDTH * HEIGHT * DEPTH * 4, imageBytes = SIZE[0] * SIZE[1] * 4;
  if (bytes.length !== offset + count * 2 + imageBytes * ZONES.length * 2) throw Error('Truncated Cultivation radiance pixels.');
  const irradiance = new Uint16Array(buffer, offset, count);
  const captures = Array.from({ length: ZONES.length * 2 }, (_, i) => new Uint8Array(buffer, offset + count * 2 + i * imageBytes, imageBytes));
  return { probes, invalidProbes: header.invalidProbes, irradiance, captures };
}

interface MaterialBinding {
  readonly material: THREE.MeshStandardMaterial;
  readonly compile: THREE.Material['onBeforeCompile'];
  readonly key: THREE.Material['customProgramCacheKey'];
  readonly environment: THREE.Texture | null;
}

/** One validity-weighted, two-state SH volume plus a packed local PMREM atlas.
 * Captures are baked from actual static meshes. Loading filters them once;
 * gameplay changes only uniform state, with no ray queries or live captures. */
export class CultivationRadiance {
  private readonly abort = new AbortController();
  private preparation: Promise<void> | undefined;
  private volume: THREE.Data3DTexture | undefined;
  private reflections: THREE.WebGLRenderTarget | undefined;
  private readonly bindings = new Map<THREE.MeshStandardMaterial, MaterialBinding>();
  private tileWidth = 0;
  private tileHeight = 0;
  private probes = 0;
  private invalidProbes = 0;
  private disposed = false;
  private readonly uniforms: CultivationRadianceUniforms = {
    cvVolume: { value: null as unknown as THREE.Data3DTexture }, cvOrigin: { value: new THREE.Vector3() },
    cvPower: { value: ZONES.map(() => 1) }, cvDirectional: { value: 0 }, cvTime: { value: 0 },
    cvLift: { value: 0 }, cvLiquidStrength: { value: .5 }, cvAtmosphere: { value: .5 },
  };

  constructor(origin: THREE.Vector3) { this.uniforms.cvOrigin.value.copy(origin); }

  /** Fetch and filter lighting while the character and authored models load.
   * Material binding still waits until their complete hierarchy is available. */
  preload(renderer: THREE.WebGLRenderer): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.preparation ??= this.load(renderer).catch(error => { this.preparation = undefined; if (!this.disposed) throw error; });
  }

  async prepare(renderer: THREE.WebGLRenderer, root: THREE.Object3D): Promise<void> {
    await this.preload(renderer);
    if (this.disposed || !this.reflections) return;
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object.userData.lightingOnly) return;
      for (const material of [object.material].flat()) {
        if (!(material instanceof THREE.MeshStandardMaterial) || !material.visible || this.bindings.has(material)) continue;
        this.bindings.set(material, { material, compile: material.onBeforeCompile, key: material.customProgramCacheKey, environment: material.envMap });
        if (material.envMap || material.userData.cultivationLocalReflection || material instanceof THREE.MeshPhysicalMaterial ||
            material.transparent || material.metalness >= .2 || material.roughness < .5)
          material.envMap = this.reflections!.texture;
        installContainmentSoftShadows(material);
        installCultivationRadianceShader(material, this.uniforms, this.tileWidth, this.tileHeight);
      }
    });
  }

  get texture(): THREE.Texture | null { return this.reflections?.texture ?? null; }
  get ready(): boolean { return !!this.reflections && !this.disposed; }
  setQuality(settings: GraphicsSettings): void {
    this.uniforms.cvDirectional.value = settings.shadowMapSizeCap > 512 ? 1 : 0;
    this.uniforms.cvLiquidStrength.value = settings.effectsDensity;
    this.uniforms.cvAtmosphere.value = settings.effectsDensity;
  }
  setState(power: readonly number[], liftProgress: number, elapsed: number): void {
    if (power.length !== ZONES.length) throw Error('Incorrect Cultivation lighting zone count.');
    for (let i = 0; i < power.length; i++) this.uniforms.cvPower.value[i] = THREE.MathUtils.clamp(power[i], 0, 1);
    this.uniforms.cvLift.value = THREE.MathUtils.clamp(liftProgress, 0, 1);
    this.uniforms.cvTime.value = elapsed % 4096;
  }

  private async load(renderer: THREE.WebGLRenderer): Promise<void> {
    const response = await fetch(CULTIVATION_RADIANCE_URL, { signal: this.abort.signal });
    if (!response.ok) throw Error('Could not load Cultivation radiance.');
    const bank = readCultivationRadiance(await readGzipResponse(response, this.abort.signal));
    if (this.disposed) return;
    const volume = new THREE.Data3DTexture(bank.irradiance, WIDTH, HEIGHT, DEPTH);
    volume.name = 'cultivation-validity-weighted-two-state-L1'; volume.type = THREE.HalfFloatType; volume.format = THREE.RGBAFormat;
    volume.minFilter = volume.magFilter = THREE.LinearFilter; volume.generateMipmaps = false; volume.unpackAlignment = 1; volume.needsUpdate = true;
    const generator = new THREE.PMREMGenerator(renderer);
    let atlas: THREE.WebGLRenderTarget | undefined;
    try {
      withIsolatedPrewarmState(renderer, () => {
        for (const [tile, pixels] of bank.captures.entries()) {
          const half = new Uint16Array(pixels.length);
          for (let i = 0; i < pixels.length; i += 4) {
            const scale = pixels[i + 3] === 0 ? 0 : 2 ** (pixels[i + 3] - 128) / 256;
            for (let channel = 0; channel < 3; channel++) half[i + channel] = THREE.DataUtils.toHalfFloat(pixels[i + channel] * scale);
            half[i + 3] = THREE.DataUtils.toHalfFloat(1);
          }
          const source = new THREE.DataTexture(half, ...SIZE, THREE.RGBAFormat, THREE.HalfFloatType);
          source.mapping = THREE.EquirectangularReflectionMapping; source.colorSpace = THREE.LinearSRGBColorSpace; source.needsUpdate = true;
          let filtered: THREE.WebGLRenderTarget | undefined;
          try {
            filtered = generator.fromEquirectangular(source);
            if (!atlas) {
              this.tileWidth = filtered.width; this.tileHeight = filtered.height;
              atlas = new THREE.WebGLRenderTarget(filtered.width * COLUMNS, filtered.height * Math.ceil(bank.captures.length / COLUMNS),
                { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
              atlas.texture.name = 'cultivation-local-two-state-reflections'; atlas.texture.mapping = THREE.CubeUVReflectionMapping;
              renderer.initRenderTarget(atlas);
            }
            renderer.copyTextureToTexture(filtered.texture, atlas.texture, null,
              new THREE.Vector2((tile % COLUMNS) * filtered.width, Math.floor(tile / COLUMNS) * filtered.height));
          } finally { filtered?.dispose(); source.dispose(); }
        }
        renderer.initTexture(volume);
      });
      this.volume = volume; this.reflections = atlas; this.uniforms.cvVolume.value = volume;
      this.probes = bank.probes; this.invalidProbes = bank.invalidProbes;
    } catch (error) { volume.dispose(); atlas?.dispose(); throw error; }
    finally { generator.dispose(); }
  }

  get diagnostics() {
    return { ready: this.ready, zones: ZONES.length, states: 2, probes: this.probes, invalidProbes: this.invalidProbes,
      textureCount: this.ready ? 2 : 0, runtimeCaptures: 0, captures: this.ready ? ZONES.length * 2 : 0,
      textureBytes: (this.volume?.image.data?.byteLength ?? 0) + (this.reflections ? this.reflections.width * this.reflections.height * 8 : 0),
      materialCount: this.bindings.size, powers: [...this.uniforms.cvPower.value], lift: this.uniforms.cvLift.value,
      directional: this.uniforms.cvDirectional.value === 1 };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort();
    // Shared optical materials can survive a level handoff. Restore borrowed
    // hooks and environments before releasing this level's textures.
    for (const { material, compile, key, environment } of this.bindings.values()) {
      material.onBeforeCompile = compile; material.customProgramCacheKey = key; material.envMap = environment; material.needsUpdate = true;
    }
    this.bindings.clear(); this.volume?.dispose(); this.reflections?.dispose(); this.volume = undefined; this.reflections = undefined;
  }
}
