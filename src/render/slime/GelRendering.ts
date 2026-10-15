import type * as THREE from 'three';

export const GEL_RENDERING_MODES = ['physical', 'reduced-transmission', 'minimum'] as const;
export type GelRenderingMode = (typeof GEL_RENDERING_MODES)[number];
export const DEFAULT_GEL_RENDERING_MODE: GelRenderingMode = 'physical';
export const isGelRenderingMode = (value: string): value is GelRenderingMode =>
  GEL_RENDERING_MODES.some(mode => mode === value);

/** Session-owned policy. Materials unregister on disposal, including failed loads. */
export class GelRendering {
  private readonly bodies = new Map<THREE.MeshPhysicalMaterial, number>();
  private mode: GelRenderingMode = DEFAULT_GEL_RENDERING_MODE;

  private readonly renderer: Pick<THREE.WebGLRenderer, 'transmissionResolutionScale'>;

  constructor(renderer: Pick<THREE.WebGLRenderer, 'transmissionResolutionScale'>) {
    this.renderer = renderer;
  }

  get value(): GelRenderingMode { return this.mode; }
  get materialCount(): number { return this.bodies.size; }

  register(body: THREE.MeshPhysicalMaterial): void {
    if (this.bodies.has(body)) return;
    this.bodies.set(body, body.transmission);
    const release = () => {
      this.bodies.delete(body);
      body.removeEventListener('dispose', release);
    };
    body.addEventListener('dispose', release);
    this.apply(body, this.bodies.get(body)!);
  }

  setMode(mode: GelRenderingMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    // Half width and height: one quarter of the transmission target's pixels.
    this.renderer.transmissionResolutionScale = mode === 'reduced-transmission' ? 0.5 : 1;
    for (const [body, transmission] of this.bodies) this.apply(body, transmission);
  }

  private apply(body: THREE.MeshPhysicalMaterial, authoredTransmission: number): void {
    // Clearcoat, Fresnel specular, PMREM reflections, tint and authored emission
    // retain a wet gel surface without a screen-space refraction capture.
    body.transmission = this.mode === 'minimum' ? 0 : authoredTransmission;
  }
}
