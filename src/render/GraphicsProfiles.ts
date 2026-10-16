import type { GelRenderingMode } from './slime/GelRendering.ts';
import type { RenderPixelRatioCap, RenderScale } from './RenderResolution.ts';

export const GRAPHICS_PROFILE_IDS = ['minimum', 'standard'] as const;
export type GraphicsProfileId = (typeof GRAPHICS_PROFILE_IDS)[number];

/** Session-wide presentation settings; no hardware-name guessing or gameplay LOD. */
export interface GraphicsSettings {
  readonly graphicsProfile: GraphicsProfileId;
  readonly renderPixelRatioCap: RenderPixelRatioCap;
  readonly renderScale: RenderScale;
  readonly gelRenderingMode: GelRenderingMode;
}

export const GRAPHICS_PROFILES = {
  minimum: {
    label: 'Minimum hardware',
    pixelBudget: 1280 * 720,
    shadowMapSizeCap: 512,
    effectsDensity: 0.5,
    settings: { graphicsProfile: 'minimum', renderPixelRatioCap: 1, renderScale: 0.75, gelRenderingMode: 'minimum' },
  },
  standard: {
    label: 'Standard',
    pixelBudget: 1920 * 1080,
    shadowMapSizeCap: 1024,
    effectsDensity: 1,
    settings: { graphicsProfile: 'standard', renderPixelRatioCap: 1.5, renderScale: 1, gelRenderingMode: 'reduced-transmission' },
  },
} as const satisfies Record<GraphicsProfileId, {
  label: string; pixelBudget: number; shadowMapSizeCap: number; effectsDensity: number; settings: GraphicsSettings;
}>;

// Provisional engineering defaults, not an assessment-PC performance guarantee.
export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = GRAPHICS_PROFILES.minimum.settings;
export const GRAPHICS_LIGHTING_POLICY = 'authored-room-scopes; Cultivation 4 point/3 spot maximum';

export const isGraphicsProfileId = (value: string): value is GraphicsProfileId =>
  GRAPHICS_PROFILE_IDS.some(id => id === value);

export function graphicsProfileName(settings: GraphicsSettings, gelMode = settings.gelRenderingMode): GraphicsProfileId | 'custom' {
  const preset = GRAPHICS_PROFILES[settings.graphicsProfile].settings;
  return preset.renderPixelRatioCap === settings.renderPixelRatioCap && preset.renderScale === settings.renderScale &&
    preset.gelRenderingMode === gelMode ? settings.graphicsProfile : 'custom';
}
