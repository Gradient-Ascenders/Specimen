import type { CageConfig } from './DeformableBody.ts';

/** Multipliers use the original lab's link-family compliances as their units. */
export const MATERIAL_CONTROLS = [
  { id: 'stretch', key: 'edgeCompliance', label: 'Surface / stretch compliance', base: .0015, min: .25, max: 24, step: .25 },
  { id: 'bend', key: 'bendCompliance', label: 'Bending / shear compliance', base: .015, min: .25, max: 48, step: .25 },
  { id: 'diameter', key: 'diameterCompliance', label: 'Cross-body / diameter compliance', base: .06, min: .25, max: 48, step: .25 },
] as const;
export const AXIAL_DAMPING_RANGE = { min: 0, max: 40, step: .25 } as const;

// Human accepted after manual comparison, 2026-09-13. Do not retune to mask
// collision regressions. The original solver defaults remain historical data.
export const ACCEPTED_GROUND_REFERENCE_ID = 'accepted-ground-v1';
export const ACCEPTED_GROUND_CONFIG: Readonly<CageConfig> = Object.freeze({
  radius: .4, nodeRadius: .05, mass: 1, substeps: 4, iterations: 8,
  gravity: 18, dynamicFriction: .65, motorGain: 14, drag: .08,
  motorInAir: false,
  angularSpeed: 7.78,
  maxAngularAcceleration: 85,
  edgeCompliance: .0015 * 13,
  bendCompliance: .015 * 25.25,
  diameterCompliance: .06 * 16,
  volumeCompliance: .000002,
  bondDamping: 13,
  friction: .9,
});
export const PREFERRED_MATERIAL_CONFIG = ACCEPTED_GROUND_CONFIG;

export interface MaterialPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly config: Readonly<CageConfig>;
}
export const MATERIAL_PRESETS: readonly MaterialPreset[] = Object.freeze([
  Object.freeze({
    id: ACCEPTED_GROUND_REFERENCE_ID, name: 'Accepted ground reference · v1',
    description: 'Human accepted: 13× stretch, 25.25× bending, 16× diameter, damping 13. Material locked for collision work.',
    config: PREFERRED_MATERIAL_CONFIG,
  }),
]);

/** Infer from complete numeric configuration, including restored replay state. */
export function matchingMaterialPreset(config: Readonly<CageConfig>): MaterialPreset | undefined {
  return MATERIAL_PRESETS.find(preset => (Object.keys(preset.config) as (keyof CageConfig)[])
    .every(key => preset.config[key] === config[key]));
}
