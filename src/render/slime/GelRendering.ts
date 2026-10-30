import type * as THREE from 'three';

export const GEL_RENDERING_MODES = ['physical', 'balanced-transmission', 'reduced-transmission', 'minimum'] as const;
export type GelRenderingMode = (typeof GEL_RENDERING_MODES)[number];
export const DEFAULT_GEL_RENDERING_MODE: GelRenderingMode = 'physical';
export const isGelRenderingMode = (value: string): value is GelRenderingMode =>
  GEL_RENDERING_MODES.some(mode => mode === value);

/** High captures at 75% per dimension; Medium also accepts level-specific
 * reductions. Ultra retains native capture resolution. */
export function resolveGelTransmissionResolutionScale(mode: GelRenderingMode, cap: number): number {
  return Math.min(cap, mode === 'reduced-transmission' || mode === 'balanced-transmission' ? 0.75 : 1);
}

/** Session-owned policy. Materials unregister on disposal, including failed loads. */
export class GelRendering {
  private readonly bodies = new Map<THREE.MeshPhysicalMaterial, number>();
  private mode: GelRenderingMode = DEFAULT_GEL_RENDERING_MODE;
  private transmissionResolutionScaleCap = 1;
  private readonly reducedTransmissionCaps = new Map<symbol,number>();

  private readonly renderer: Pick<THREE.WebGLRenderer, 'transmissionResolutionScale'>;

  constructor(renderer: Pick<THREE.WebGLRenderer, 'transmissionResolutionScale'>) {
    this.renderer = renderer;
  }

  get value(): GelRenderingMode { return this.mode; }
  get materialCount(): number { return this.bodies.size; }
  owns(material: THREE.MeshPhysicalMaterial): boolean { return this.bodies.has(material); }

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
    this.applyTransmissionResolutionScale();
    for (const [body, transmission] of this.bodies) this.apply(body, transmission);
  }

  /** Compose the graphics preset with gel quality, regardless of setting order. */
  setTransmissionResolutionScaleCap(cap: number): void {
    this.transmissionResolutionScaleCap = cap;
    this.applyTransmissionResolutionScale();
  }

  /** A level can budget its reduced-gel capture before first-use preparation.
   * The full physical mode keeps its requested quality. Each borrower releases
   * independently, including failed loads, restarts and level handoffs. */
  requestReducedTransmissionCap(cap:number):()=>void{
    if(!Number.isFinite(cap)||cap<=0||cap>1)throw new RangeError('Transmission cap must be in (0, 1].');
    const token=Symbol();this.reducedTransmissionCaps.set(token,cap);this.applyTransmissionResolutionScale();
    let released=false;
    return ()=>{
      if(released)return;released=true;
      this.reducedTransmissionCaps.delete(token);this.applyTransmissionResolutionScale();
    };
  }

  private applyTransmissionResolutionScale(): void {
    let cap=this.transmissionResolutionScaleCap;
    if(this.mode==='reduced-transmission')for(const limit of this.reducedTransmissionCaps.values())cap=Math.min(cap,limit);
    this.renderer.transmissionResolutionScale = resolveGelTransmissionResolutionScale(
      this.mode, cap);
  }

  private apply(body: THREE.MeshPhysicalMaterial, authoredTransmission: number): void {
    // Clearcoat, Fresnel specular, PMREM reflections, tint and authored emission
    // retain a wet gel surface without a screen-space refraction capture.
    body.transmission = this.mode === 'minimum' ? 0 : authoredTransmission;
  }
}
