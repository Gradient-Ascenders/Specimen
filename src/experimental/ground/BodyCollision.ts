import type { DeformableBody } from './DeformableBody.ts';

/** Optional finite-world owner. The accepted plane reference never constructs it. */
export interface BodyCollision {
  readonly penetration: number;
  reset(body: DeformableBody): void;
  beginTick(): void;
  beginSubstep(body: DeformableBody, h: number, start: Float64Array): void;
  project(body: DeformableBody, h: number): void;
  finishSubstep(body: DeformableBody, h: number): void;
  snapshot(): unknown;
}
