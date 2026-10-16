export const RENDER_PIXEL_RATIO_CAPS = [0.75, 1, 1.5, 2] as const;

export type RenderPixelRatioCap = (typeof RENDER_PIXEL_RATIO_CAPS)[number];

export const DEFAULT_RENDER_PIXEL_RATIO_CAP: RenderPixelRatioCap = 1;

export const RENDER_SCALES = [0.5, 0.75, 1] as const;
export type RenderScale = (typeof RENDER_SCALES)[number];
export const isRenderScale = (value: number): value is RenderScale =>
  RENDER_SCALES.some(scale => scale === value);

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

export interface RenderResolution {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly devicePixelRatio: number;
  readonly effectivePixelRatio: number;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
}

/** Bound physical pixels independently of CSS/UI size, DPI and aspect ratio.
 * Uniform scaling preserves camera framing; rounding only loses pixels. The
 * extra longest-edge bound reserves the short side's physical minimum, including
 * the texel needed by fractional-resolution transmission captures. */
export function resolveRenderResolution(width: number, height: number, devicePixelRatio: number, options: {
  readonly pixelRatioCap: RenderPixelRatioCap;
  readonly renderScale: RenderScale;
  readonly pixelBudget: number;
  readonly maximumWidth?: number;
  readonly maximumHeight?: number;
  readonly minimumDrawingBufferDimension?: number;
}): RenderResolution {
  const dimension = (value: number) => Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
  const viewportWidth = dimension(width), viewportHeight = dimension(height);
  const pixelBudget = dimension(options.pixelBudget);
  const maximumWidth = dimension(options.maximumWidth ?? 16384);
  const maximumHeight = dimension(options.maximumHeight ?? 16384);
  const minimumDimension = dimension(options.minimumDrawingBufferDimension ?? 1);
  if (minimumDimension > maximumWidth || minimumDimension > maximumHeight || minimumDimension ** 2 > pixelBudget) {
    throw new RangeError('The minimum drawing-buffer dimension cannot fit the pixel or device limits.');
  }
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const effectivePixelRatio = Math.min(
    resolveRenderPixelRatio(dpr, options.pixelRatioCap) * options.renderScale,
    Math.sqrt(pixelBudget / viewportWidth / viewportHeight),
    pixelBudget / Math.max(viewportWidth, viewportHeight) / minimumDimension,
    maximumWidth / viewportWidth,
    maximumHeight / viewportHeight,
  );
  // WebGLRenderer floors logical size * pixelRatio. Keep the shortest side at
  // enough physical pixels for both the canvas and its scaled capture targets.
  const minimumLogicalDimension = minimumDimension * (1 + Number.EPSILON * 2) / effectivePixelRatio;
  const logicalWidth = Math.max(viewportWidth, minimumLogicalDimension);
  const logicalHeight = Math.max(viewportHeight, minimumLogicalDimension);
  return { viewportWidth, viewportHeight, devicePixelRatio: dpr, effectivePixelRatio,
    drawingBufferWidth: Math.max(minimumDimension, Math.floor(logicalWidth * effectivePixelRatio)),
    drawingBufferHeight: Math.max(minimumDimension, Math.floor(logicalHeight * effectivePixelRatio)),
    logicalWidth, logicalHeight };
}
