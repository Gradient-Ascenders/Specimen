import * as THREE from 'three';

export type SurfaceTag = 'default' | 'sticky' | 'nonStick' | 'bouncy';

export interface SurfaceDefinition {
  readonly tag: SurfaceTag;
  /** Whether Tack may make this surface the authoritative attachment support. */
  readonly adhesive: boolean;
  /** Multiplier applied to grounded acceleration and braking. */
  readonly tractionMultiplier: number;
  /** Fixed outgoing normal speed for authored bounce pads. Zero disables bounce. */
  readonly bounceSpeedMetresPerSecond: number;
}

export const DEFAULT_SURFACE_DEFINITIONS: Readonly<
  Record<SurfaceTag, SurfaceDefinition>
> = {
  default: {
    tag: 'default',
    adhesive: false,
    tractionMultiplier: 1,
    bounceSpeedMetresPerSecond: 0,
  },
  sticky: {
    tag: 'sticky',
    adhesive: true,
    tractionMultiplier: 1,
    bounceSpeedMetresPerSecond: 0,
  },
  nonStick: {
    tag: 'nonStick',
    adhesive: false,
    tractionMultiplier: 0.22,
    bounceSpeedMetresPerSecond: 0,
  },
  bouncy: {
    tag: 'bouncy',
    adhesive: false,
    tractionMultiplier: 1,
    bounceSpeedMetresPerSecond: 8.2,
  },
};

function isSurfaceTag(value: unknown): value is SurfaceTag {
  return (
    value === 'default' ||
    value === 'sticky' ||
    value === 'nonStick' ||
    value === 'bouncy'
  );
}

/**
 * Authoring boundary between level geometry and movement behaviour.
 *
 * CollisionWorld answers "what did we hit?". SurfaceRegistry answers
 * "what gameplay behaviour did the author assign to that mesh?".
 */
export class SurfaceRegistry {
  private readonly definitions = new Map<THREE.Mesh, SurfaceDefinition>();

  register(mesh: THREE.Mesh): void {
    const authoredTag = mesh.userData.surfaceTag ?? 'default';

    if (!isSurfaceTag(authoredTag)) {
      throw new Error(
        `Collider ${mesh.name || '<unnamed>'} has unknown surfaceTag "${String(authoredTag)}".`,
      );
    }

    const defaults = DEFAULT_SURFACE_DEFINITIONS[authoredTag];
    const authoredTraction = mesh.userData.tractionMultiplier;
    const authoredBounceSpeed = mesh.userData.bounceSpeedMetresPerSecond;

    const tractionMultiplier =
      authoredTraction === undefined
        ? defaults.tractionMultiplier
        : Number(authoredTraction);
    const bounceSpeedMetresPerSecond =
      authoredBounceSpeed === undefined
        ? defaults.bounceSpeedMetresPerSecond
        : Number(authoredBounceSpeed);

    if (
      !Number.isFinite(tractionMultiplier) ||
      tractionMultiplier < 0 ||
      tractionMultiplier > 1
    ) {
      throw new Error(
        `Collider ${mesh.name || '<unnamed>'} tractionMultiplier must be within [0, 1].`,
      );
    }

    if (
      !Number.isFinite(bounceSpeedMetresPerSecond) ||
      bounceSpeedMetresPerSecond < 0
    ) {
      throw new Error(
        `Collider ${mesh.name || '<unnamed>'} bounceSpeedMetresPerSecond must be non-negative.`,
      );
    }

    this.definitions.set(mesh, {
      tag: authoredTag,
      adhesive: defaults.adhesive,
      tractionMultiplier,
      bounceSpeedMetresPerSecond,
    });
  }

  registerAll(meshes: readonly THREE.Mesh[]): void {
    for (const mesh of meshes) this.register(mesh);
  }

  get(mesh: THREE.Mesh | null | undefined): Readonly<SurfaceDefinition> {
    if (!mesh) return DEFAULT_SURFACE_DEFINITIONS.default;
    return this.definitions.get(mesh) ?? DEFAULT_SURFACE_DEFINITIONS.default;
  }

  unregister(mesh: THREE.Mesh): void {
    this.definitions.delete(mesh);
  }

  clear(): void {
    this.definitions.clear();
  }

  get registeredCount(): number {
    return this.definitions.size;
  }
}
