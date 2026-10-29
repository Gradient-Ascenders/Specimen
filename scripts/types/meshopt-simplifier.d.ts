/** The Three.js vendored simplifier has no declarations; cover the offline API we use. */
declare module 'three/addons/libs/meshopt_simplifier.module.js' {
  export const MeshoptSimplifier: {
    ready: Promise<void>;
    simplifyWithAttributes<T extends Uint16Array | Uint32Array>(
      indices: T, positions: Float32Array, positionStride: number,
      attributes: Float32Array, attributeStride: number, weights: number[],
      vertexLock: Uint8Array | null, targetIndexCount: number, targetError: number,
      flags: ('LockBorder' | 'Sparse' | 'ErrorAbsolute' | 'Prune' | 'Regularize')[],
    ): [T, number];
  };
}
