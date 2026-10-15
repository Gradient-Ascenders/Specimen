import type { RenderPixelRatioCap } from './RenderResolution.ts';

export type GraphicsPreset = 'normal' | 'performance';

/** Normal retains the user's resolution choice; Performance is explicitly opt-in. */
export const resolveGraphicsQuality = (
  preset: GraphicsPreset,
  normalPixelRatioCap: RenderPixelRatioCap,
): { pixelRatioCap: RenderPixelRatioCap; transmissionResolutionScale: number } => ({
  pixelRatioCap: preset === 'performance' && normalPixelRatioCap > 1 ? 1 : normalPixelRatioCap,
  transmissionResolutionScale: preset === 'performance' ? 0.5 : 1,
});
