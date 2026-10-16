export const RENDER_PIXEL_RATIO_CAPS = [1, 1.5, 2] as const;

export type RenderPixelRatioCap = (typeof RENDER_PIXEL_RATIO_CAPS)[number];

export const DEFAULT_RENDER_PIXEL_RATIO_CAP: RenderPixelRatioCap = 2;

export const isRenderPixelRatioCap = (
  value: number,
): value is RenderPixelRatioCap =>
  RENDER_PIXEL_RATIO_CAPS.some((cap) => cap === value);

/** Resolve the physical-pixel density used by the 3D canvas. */
export const resolveRenderPixelRatio = (
  devicePixelRatio: number,
  cap: RenderPixelRatioCap,
): number => {
  const safeDevicePixelRatio = Number.isFinite(devicePixelRatio)
    ? devicePixelRatio
    : 1;
  return Math.min(Math.max(1, safeDevicePixelRatio), cap);
};

/** A temporary presentation cap never overwrites the player's graphics setting. */
export function resolveBudgetedPixelRatio(width: number, height: number, requested: number, pixelBudget?: number): number {
  if (pixelBudget === undefined) return requested;
  if (!Number.isFinite(pixelBudget) || pixelBudget < 1) throw new RangeError('Pixel budget must be positive.');
  const budget = Math.floor(pixelBudget);
  return Math.min(requested, Math.sqrt(budget / width / height), budget / Math.max(width, height));
}
