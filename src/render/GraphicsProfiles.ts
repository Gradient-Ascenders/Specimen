import { resolveGelTransmissionResolutionScale, type GelRenderingMode } from './slime/GelRendering.ts';
import { isRenderPixelRatioCap, isRenderScale, type RenderPixelRatioCap, type RenderScale } from './RenderResolution.ts';
import type { GraphicsPreset } from './GraphicsQuality.ts';
import { resolveGraphicsQuality } from './GraphicsQuality.ts';

export const GRAPHICS_PROFILE_IDS = ['minimum', 'standard', 'high'] as const;
export type GraphicsProfileId = (typeof GRAPHICS_PROFILE_IDS)[number];

export const GRAPHICS_PIXEL_BUDGETS = [921600, 2073600, 3686400] as const;
export const SHADOW_MAP_CAPS = [512, 1024, 2048] as const;
export const EFFECTS_DENSITIES = [0.5, 0.75, 1] as const;
export type GraphicsPixelBudget = (typeof GRAPHICS_PIXEL_BUDGETS)[number];
export type ShadowMapCap = (typeof SHADOW_MAP_CAPS)[number];
export type EffectsDensity = (typeof EFFECTS_DENSITIES)[number];

/** Session-wide presentation settings; no hardware-name guessing or gameplay LOD. */
export interface GraphicsSettings {
  /** Retain the last base preset for diagnostics when controls are customised. */
  readonly graphicsProfile: GraphicsProfileId;
  readonly customGraphicsProfile: boolean;
  readonly pixelBudget: GraphicsPixelBudget;
  readonly shadowMapSizeCap: ShadowMapCap;
  readonly effectsDensity: EffectsDensity;
  readonly graphicsPreset: GraphicsPreset;
  readonly renderPixelRatioCap: RenderPixelRatioCap;
  readonly renderScale: RenderScale;
  readonly gelRenderingMode: GelRenderingMode;
}

/** Gel shader features change only when transmission crosses zero. High's
 * opted-in raw-depth shadow programs are covered by graphicsPreparationKey's
 * shadow cap. Physical and reduced transmission share gel programs. */
export function graphicsShaderKey(settings: Pick<GraphicsSettings, 'gelRenderingMode'>): string {
  return settings.gelRenderingMode === 'minimum' ? 'opaque-gel' : 'transmissive-gel';
}

/** Full preparation also owns shadow targets. A cap change disposes their
 * storage even when shader source is unchanged, so retain the full loading
 * path for that change. Transmission-scale-only changes keep the lighter path. */
export function graphicsPreparationKey(settings: GraphicsSettings): string {
  return `${graphicsShaderKey(settings)}:shadow-cap:${settings.shadowMapSizeCap}`;
}

/** Target storage can change without shader source changing. Include requested
 * capture dimensions as well as scale; harmless input/audio settings stay free. */
export function graphicsTransmissionResourceKey(settings: GraphicsSettings): string {
  if (settings.gelRenderingMode === 'minimum') return 'no-transmission';
  const quality = resolveGraphicsQuality(settings.graphicsPreset, settings.renderPixelRatioCap);
  const scale = resolveGelTransmissionResolutionScale(settings.gelRenderingMode, quality.transmissionResolutionScale);
  return [scale, quality.pixelRatioCap, settings.renderScale, settings.pixelBudget].join(':');
}

function profile<T extends GraphicsSettings>(label: string, settings: T) {
  return { label, pixelBudget: settings.pixelBudget, shadowMapSizeCap: settings.shadowMapSizeCap,
    effectsDensity: settings.effectsDensity, settings };
}

// Keep the established internal IDs so saved benchmark tooling remains valid.
export const GRAPHICS_PROFILES = {
  minimum: profile('Low', {
    graphicsProfile: 'minimum', customGraphicsProfile: false, graphicsPreset: 'normal',
    renderPixelRatioCap: 1, renderScale: 0.75, gelRenderingMode: 'minimum',
    pixelBudget: 921600, shadowMapSizeCap: 512, effectsDensity: 0.5,
  }),
  standard: profile('Medium', {
    graphicsProfile: 'standard', customGraphicsProfile: false, graphicsPreset: 'normal',
    renderPixelRatioCap: 1.5, renderScale: 1, gelRenderingMode: 'reduced-transmission',
    pixelBudget: 2073600, shadowMapSizeCap: 1024, effectsDensity: 1,
  }),
  high: profile('High', {
    graphicsProfile: 'high', customGraphicsProfile: false, graphicsPreset: 'normal',
    renderPixelRatioCap: 2, renderScale: 1, gelRenderingMode: 'physical',
    pixelBudget: 3686400, shadowMapSizeCap: 2048, effectsDensity: 1,
  }),
} as const;

// Provisional engineering defaults, not an assessment-PC performance guarantee.
export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = GRAPHICS_PROFILES.minimum.settings;
export const GRAPHICS_LIGHTING_POLICY = 'authored-room-scopes; Cultivation 4 point/3 spot maximum';

export const isGraphicsProfileId = (value: string): value is GraphicsProfileId =>
  GRAPHICS_PROFILE_IDS.some(id => id === value);

export function graphicsProfileName(settings: GraphicsSettings, gelMode = settings.gelRenderingMode): GraphicsProfileId | 'custom' {
  const preset = GRAPHICS_PROFILES[settings.graphicsProfile].settings;
  return !settings.customGraphicsProfile && preset.pixelBudget === settings.pixelBudget &&
    preset.shadowMapSizeCap === settings.shadowMapSizeCap && preset.effectsDensity === settings.effectsDensity &&
    preset.graphicsPreset === settings.graphicsPreset && preset.renderPixelRatioCap === settings.renderPixelRatioCap && preset.renderScale === settings.renderScale &&
    preset.gelRenderingMode === gelMode ? settings.graphicsProfile : 'custom';
}

/** Accept only supported controls from optional local preferences. */
export function readGraphicsSettings(value: unknown): GraphicsSettings | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const s = value as Record<string, unknown>;
  if (typeof s.graphicsProfile !== 'string' || !isGraphicsProfileId(s.graphicsProfile) ||
    typeof s.customGraphicsProfile !== 'boolean' ||
    (s.graphicsPreset !== 'normal' && s.graphicsPreset !== 'performance') ||
    !isRenderScale(s.renderScale as number) || !isRenderPixelRatioCap(s.renderPixelRatioCap as number) ||
    !GRAPHICS_PIXEL_BUDGETS.includes(s.pixelBudget as GraphicsPixelBudget) ||
    !SHADOW_MAP_CAPS.includes(s.shadowMapSizeCap as ShadowMapCap) ||
    !EFFECTS_DENSITIES.includes(s.effectsDensity as EffectsDensity) ||
    !['minimum', 'physical', 'reduced-transmission'].includes(s.gelRenderingMode as string)) return undefined;
  return { graphicsProfile: s.graphicsProfile, customGraphicsProfile: s.customGraphicsProfile,
    graphicsPreset: s.graphicsPreset, renderScale: s.renderScale as RenderScale,
    renderPixelRatioCap: s.renderPixelRatioCap as RenderPixelRatioCap, pixelBudget: s.pixelBudget as GraphicsPixelBudget,
    shadowMapSizeCap: s.shadowMapSizeCap as ShadowMapCap, effectsDensity: s.effectsDensity as EffectsDensity,
    gelRenderingMode: s.gelRenderingMode as GelRenderingMode };
}
