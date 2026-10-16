import type { GelRenderingMode } from './slime/GelRendering.ts';
import type { RenderPixelRatioCap, RenderScale } from './RenderResolution.ts';
import type { GraphicsPreset } from './GraphicsQuality.ts';
import { resolveGraphicsQuality } from './GraphicsQuality.ts';

export const GRAPHICS_PROFILE_IDS = ['minimum', 'standard'] as const;
export type GraphicsProfileId = (typeof GRAPHICS_PROFILE_IDS)[number];

/** Session-wide presentation settings; no hardware-name guessing or gameplay LOD. */
export interface GraphicsSettings {
  readonly graphicsProfile: GraphicsProfileId;
  readonly graphicsPreset: GraphicsPreset;
  readonly renderPixelRatioCap: RenderPixelRatioCap;
  readonly renderScale: RenderScale;
  readonly gelRenderingMode: GelRenderingMode;
}

/** Current profiles change shader source only when transmission crosses zero.
 * Capture scale, canvas scale, shadow-map dimensions and point draw counts are
 * resource/uniform changes. Physical and reduced transmission share programs. */
export function graphicsShaderKey(settings: Pick<GraphicsSettings, 'gelRenderingMode'>): string {
  return settings.gelRenderingMode === 'minimum' ? 'opaque-gel' : 'transmissive-gel';
}

/** Full preparation also owns shadow targets. A cap change disposes their
 * storage even when shader source is unchanged, so retain the full loading
 * path for that change. Transmission-scale-only changes keep the lighter path. */
export function graphicsPreparationKey(settings: GraphicsSettings): string {
  return `${graphicsShaderKey(settings)}:shadow-cap:${GRAPHICS_PROFILES[settings.graphicsProfile].shadowMapSizeCap}`;
}

/** Target storage can change without shader source changing. Include requested
 * capture dimensions as well as scale; harmless input/audio settings stay free. */
export function graphicsTransmissionResourceKey(settings: GraphicsSettings): string {
  if (settings.gelRenderingMode === 'minimum') return 'no-transmission';
  const quality = resolveGraphicsQuality(settings.graphicsPreset, settings.renderPixelRatioCap);
  const scale = Math.min(quality.transmissionResolutionScale, settings.gelRenderingMode === 'reduced-transmission' ? .5 : 1);
  return [scale, quality.pixelRatioCap, settings.renderScale, GRAPHICS_PROFILES[settings.graphicsProfile].pixelBudget].join(':');
}

export const GRAPHICS_PROFILES = {
  minimum: {
    label: 'Minimum hardware',
    pixelBudget: 1280 * 720,
    shadowMapSizeCap: 512,
    effectsDensity: 0.5,
    settings: { graphicsProfile: 'minimum', graphicsPreset: 'normal', renderPixelRatioCap: 1, renderScale: 0.75, gelRenderingMode: 'minimum' },
  },
  standard: {
    label: 'Standard',
    pixelBudget: 1920 * 1080,
    shadowMapSizeCap: 1024,
    effectsDensity: 1,
    settings: { graphicsProfile: 'standard', graphicsPreset: 'normal', renderPixelRatioCap: 1.5, renderScale: 1, gelRenderingMode: 'reduced-transmission' },
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
  return preset.graphicsPreset === settings.graphicsPreset && preset.renderPixelRatioCap === settings.renderPixelRatioCap && preset.renderScale === settings.renderScale &&
    preset.gelRenderingMode === gelMode ? settings.graphicsProfile : 'custom';
}
