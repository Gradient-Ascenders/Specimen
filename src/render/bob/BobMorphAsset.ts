import * as THREE from 'three';
import { validateBobGateOneAsset, type BobGateOneAsset } from './BobGateOneAsset.ts';

export const BOB_BODY_POSES = [
  'move-reach', 'move-gather', 'squash', 'flatten', 'launch', 'airborne', 'stress',
] as const;
export const BOB_EXPRESSIONS = ['blink', 'effort', 'surprise', 'stress-expression'] as const;
export type BobBodyPose = typeof BOB_BODY_POSES[number];
export type BobExpression = typeof BOB_EXPRESSIONS[number];

/** Preserve the approved neutral contract while requiring real authored deltas. */
export function validateBobMorphAsset(root: THREE.Group): BobGateOneAsset {
  return validateBobGateOneAsset(root, (mesh) => {
    const names = mesh.name === 'Bob-Body'
      ? [...BOB_BODY_POSES]
      : [...BOB_BODY_POSES, ...BOB_EXPRESSIONS];
    const dictionary = mesh.morphTargetDictionary ?? {};
    const targets = mesh.geometry.morphAttributes.position ?? [];
    if (
      !mesh.geometry.morphTargetsRelative ||
      Object.keys(dictionary).length !== names.length ||
      targets.length !== names.length ||
      mesh.morphTargetInfluences?.length !== names.length ||
      names.some((name, index) => dictionary[name] !== index)
    ) {
      throw new Error(`Bob morph contract: invalid targets on ${mesh.name}.`);
    }
    for (const [index, target] of targets.entries()) {
      if (
        target.count !== mesh.geometry.getAttribute('position').count ||
        !Array.from(target.array).every(Number.isFinite) ||
        // Gather redistributes rear mass only, so its frontal seat is a
        // deliberate zero correction. Every other key must contain work.
        ((mesh.name === 'Bob-Body' || names[index] !== 'move-gather') &&
          !Array.from(target.array).some(value => Math.abs(value) > 1e-6))
      ) {
        throw new Error(`Bob morph contract: invalid geometry on ${mesh.name}.`);
      }
    }
  });
}
