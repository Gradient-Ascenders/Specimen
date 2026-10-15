import { MathUtils } from 'three';

// Shared by Goop and Volt so their elastic response has the same timing and weight.
export const GEL_LAUNCH_SECONDS = 0.18;
export const GEL_LANDING_COMPRESSION_SECONDS = 0.24;
export const GEL_LANDING_SETTLE_SECONDS = 0.18;
export const GEL_LANDING_SECONDS = GEL_LANDING_COMPRESSION_SECONDS + GEL_LANDING_SETTLE_SECONDS;
export const GEL_MAXIMUM_BASE_OFFSET_METRES = 0.08;
export const GEL_MAXIMUM_JUMP_BASE_OFFSET_METRES = 0.04;
export const GEL_CREST_LAG_METRES = 0.02;
export const GEL_LANDING_RIPPLE_METRES = 0.003;
export const GEL_LANDING_RIPPLE_SECONDS = 0.65;

export function gelLandingSquash(ageSeconds: number, strength: number): number {
  return ageSeconds < GEL_LANDING_COMPRESSION_SECONDS
    ? 0.34 * strength * (1 - MathUtils.smoothstep(ageSeconds, 0, GEL_LANDING_COMPRESSION_SECONDS))
    : -0.06 * strength * Math.sin(Math.PI * (ageSeconds - GEL_LANDING_COMPRESSION_SECONDS) / GEL_LANDING_SETTLE_SECONDS);
}

export function gelAirborneStretch(verticalSpeed: number, launchStrength: number, launchRemaining: number): number {
  return 0.07 + 0.05 * MathUtils.clamp(Math.abs(verticalSpeed) / 8.5, 0, 1) +
    0.18 * launchStrength * launchRemaining / GEL_LAUNCH_SECONDS;
}
