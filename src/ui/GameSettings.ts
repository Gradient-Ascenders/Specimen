import { DEFAULT_USER_KEY_BINDINGS, isBindableKey, reconcileUserKeyBindings, type RebindableAction, type UserKeyBindings } from '../core/KeyBindings.ts';
import type { GelRenderingMode } from '../render/slime/GelRendering.ts';
import {
  DEFAULT_GRAPHICS_SETTINGS, GRAPHICS_PROFILES, readGraphicsSettings, type GraphicsProfileId, type GraphicsSettings,
  type GraphicsPixelBudget, type ShadowMapCap, type EffectsDensity,
} from '../render/GraphicsProfiles.ts';
import {
  DEFAULT_CAMERA_RIG_CONFIG,
  MAX_FOLLOW_DISTANCE_METRES,
  MIN_FOLLOW_DISTANCE_METRES,
} from '../render/CameraRig.ts';
import {
  type RenderPixelRatioCap,
  type RenderScale,
} from '../render/RenderResolution.ts';
import type { GraphicsPreset } from '../render/GraphicsQuality.ts';

export type FrameRateLimit = 0 | 30 | 60 | 120;
export type HUDVisibility = 'automatic' | 'always' | 'minimal';
export type CameraShake = 0 | 0.35 | 1;

export interface GameSettingsSnapshot extends GraphicsSettings {
  readonly mouseSensitivity: number;
  readonly invertVerticalLook: boolean;
  readonly masterVolume: number;
  readonly soundEffectsVolume: number;
  readonly cameraDistanceMetres: number;
  readonly musicVolume: number;
  readonly frameRateLimit: FrameRateLimit;
  readonly brightness: number;
  readonly fieldOfViewDegrees: number;
  readonly cameraShake: CameraShake;
  readonly hudVisibility: HUDVisibility;
  readonly interfaceScale: number;
  readonly pauseInBackground: boolean;
  readonly muteInBackground: boolean;
  readonly keyBindings: UserKeyBindings;
  readonly showFPS: boolean;
  readonly reduceMenuMotion: boolean;
}

export type GameSettingsListener = (
  settings: Readonly<GameSettingsSnapshot>,
) => void;

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettingsSnapshot> = {
  ...DEFAULT_GRAPHICS_SETTINGS,
  mouseSensitivity: 1,
  invertVerticalLook: false,
  masterVolume: 1,
  soundEffectsVolume: 0.8,
  cameraDistanceMetres: DEFAULT_CAMERA_RIG_CONFIG.followDistanceMetres,
  musicVolume: 1,
  frameRateLimit: 0,
  brightness: 1,
  fieldOfViewDegrees: 48,
  cameraShake: 1,
  hudVisibility: 'automatic',
  interfaceScale: 1,
  pauseInBackground: true,
  muteInBackground: true,
  keyBindings: DEFAULT_USER_KEY_BINDINGS,
  showFPS: false,
  reduceMenuMotion: false,
};

export const GRAPHICS_PREFERENCES_KEY = 'specimen.graphics-preferences.v1';
export const PRESENTATION_PREFERENCES_KEY = 'specimen.presentation-preferences.v1';
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PERSISTED_KEYS = ['mouseSensitivity', 'invertVerticalLook', 'masterVolume', 'soundEffectsVolume', 'cameraDistanceMetres',
  'showFPS', 'reduceMenuMotion', 'musicVolume', 'frameRateLimit', 'brightness',
  'fieldOfViewDegrees', 'cameraShake', 'hudVisibility', 'interfaceScale', 'pauseInBackground', 'muteInBackground', 'keyBindings'] as const;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

/** Saved graphics choices and presentation preferences; optional storage never blocks play. */
export class GameSettings {
  private readonly listeners = new Set<GameSettingsListener>();
  private current: GameSettingsSnapshot = { ...DEFAULT_GAME_SETTINGS };
  private readonly storage: SettingsStorage | undefined;
  private calibrationPending = true;
  private graphicsSelectionRevision = 0;

  constructor(options: { storage?: SettingsStorage | null } = {}) {
    try {
      this.storage = options.storage === undefined
        ? typeof window === 'undefined' ? undefined : window.localStorage
        : options.storage ?? undefined;
      const saved: unknown = JSON.parse(this.storage?.getItem(PRESENTATION_PREFERENCES_KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        const preferences = saved as Record<string, unknown>;
        this.current = { ...this.current,
          showFPS: typeof preferences.showFPS === 'boolean' ? preferences.showFPS : false,
          reduceMenuMotion: typeof preferences.reduceMenuMotion === 'boolean' ? preferences.reduceMenuMotion : false };
        const savedNumber = (key: keyof GameSettingsSnapshot, min: number, max: number): number =>
          typeof preferences[key] === 'number' && Number.isFinite(preferences[key])
            ? clamp(preferences[key] as number, min, max) : DEFAULT_GAME_SETTINGS[key] as number;
        this.current = { ...this.current,
          mouseSensitivity: savedNumber('mouseSensitivity', 0.5, 2),
          invertVerticalLook: typeof preferences.invertVerticalLook === 'boolean' ? preferences.invertVerticalLook : false,
          masterVolume: savedNumber('masterVolume', 0, 1),
          soundEffectsVolume: savedNumber('soundEffectsVolume', 0, 1),
          cameraDistanceMetres: savedNumber('cameraDistanceMetres', MIN_FOLLOW_DISTANCE_METRES, MAX_FOLLOW_DISTANCE_METRES),
          musicVolume: savedNumber('musicVolume', 0, 1), brightness: savedNumber('brightness', 0.7, 1.3),
          fieldOfViewDegrees: savedNumber('fieldOfViewDegrees', 40, 75), interfaceScale: savedNumber('interfaceScale', 0.75, 1.5),
          frameRateLimit: [0, 30, 60, 120].includes(preferences.frameRateLimit as number) ? preferences.frameRateLimit as FrameRateLimit : 0,
          cameraShake: [0, 0.35, 1].includes(preferences.cameraShake as number) ? preferences.cameraShake as CameraShake : 1,
          hudVisibility: ['automatic', 'always', 'minimal'].includes(preferences.hudVisibility as string) ? preferences.hudVisibility as HUDVisibility : 'automatic',
          pauseInBackground: typeof preferences.pauseInBackground === 'boolean' ? preferences.pauseInBackground : true,
          muteInBackground: typeof preferences.muteInBackground === 'boolean' ? preferences.muteInBackground : true,
          keyBindings: reconcileUserKeyBindings(preferences.keyBindings),
        };
      }
    } catch {
      // Private browsing, blocked storage and malformed preferences are optional.
    }
    try {
      const saved = JSON.parse(this.storage?.getItem(GRAPHICS_PREFERENCES_KEY) ?? 'null');
      const graphics = readGraphicsSettings(saved?.settings);
      if ((saved?.mode === 'automatic' || saved?.mode === 'manual') && graphics) {
        this.current = { ...this.current, ...graphics };
        this.calibrationPending = false;
      }
    } catch { /* A missing or invalid cache gets one safe first-launch check. */ }
  }

  get needsGraphicsCalibration(): boolean { return this.calibrationPending; }
  get graphicsRevision(): number { return this.graphicsSelectionRevision; }

  requestGraphicsCalibration(): void {
    this.calibrationPending = true;
    ++this.graphicsSelectionRevision;
    try { this.storage?.removeItem(GRAPHICS_PREFERENCES_KEY); } catch { /* Optional. */ }
  }

  applyAutomaticGraphicsProfile(profile: GraphicsProfileId, revision: number): boolean {
    if (!this.calibrationPending || revision !== this.graphicsSelectionRevision) return false;
    this.calibrationPending = false;
    this.update(GRAPHICS_PROFILES[profile].settings);
    this.saveGraphics('automatic');
    return true;
  }

  private saveGraphics(mode: 'automatic' | 'manual'): void {
    const graphics = readGraphicsSettings(this.current)!;
    try { this.storage?.setItem(GRAPHICS_PREFERENCES_KEY, JSON.stringify({ mode, settings: graphics })); } catch { /* Optional. */ }
  }

  get value(): Readonly<GameSettingsSnapshot> {
    return this.current;
  }

  setMouseSensitivity(value: number): void {
    this.update({ mouseSensitivity: clamp(value, 0.5, 2) });
  }

  setInvertVerticalLook(value: boolean): void {
    this.update({ invertVerticalLook: value });
  }

  setMasterVolume(value: number): void {
    this.update({ masterVolume: clamp(value, 0, 1) });
  }

  setSoundEffectsVolume(value: number): void {
    this.update({ soundEffectsVolume: clamp(value, 0, 1) });
  }

  setCameraDistanceMetres(value: number): void {
    this.update({
      cameraDistanceMetres: clamp(
        value,
        MIN_FOLLOW_DISTANCE_METRES,
        MAX_FOLLOW_DISTANCE_METRES,
      ),
    });
  }

  setGelRenderingMode(value: GelRenderingMode): void {
    this.updateGraphics({ gelRenderingMode: value });
  }

  setGraphicsProfile(value: GraphicsProfileId | 'custom'): void {
    // One atomic notification; do not briefly render mixed preset settings.
    this.calibrationPending = false;
    ++this.graphicsSelectionRevision;
    this.update(value === 'custom' ? { customGraphicsProfile: true } : GRAPHICS_PROFILES[value].settings);
    this.saveGraphics('manual');
  }

  setRenderScale(value: RenderScale): void {
    this.updateGraphics({ renderScale: value });
  }

  setRenderPixelRatioCap(value: RenderPixelRatioCap): void {
    this.updateGraphics({ renderPixelRatioCap: value });
  }

  setGraphicsPreset(value: GraphicsPreset): void {
    this.updateGraphics({ graphicsPreset: value });
  }

  setPixelBudget(value: GraphicsPixelBudget): void {
    this.updateGraphics({ pixelBudget: value });
  }

  setShadowMapSizeCap(value: ShadowMapCap): void {
    this.updateGraphics({ shadowMapSizeCap: value });
  }

  setEffectsDensity(value: EffectsDensity): void {
    this.updateGraphics({ effectsDensity: value });
  }

  private updateGraphics(patch: Partial<GraphicsSettings>): void {
    if (Object.entries(patch).some(([key, value]) => this.current[key as keyof GraphicsSettings] !== value)) {
      this.calibrationPending = false;
      ++this.graphicsSelectionRevision;
      this.update({ ...patch, customGraphicsProfile: true });
      this.saveGraphics('manual');
    }
  }

  setMusicVolume(value: number): void { this.update({ musicVolume: clamp(value, 0, 1) }); }
  setFrameRateLimit(value: FrameRateLimit): void { this.update({ frameRateLimit: value }); }
  setBrightness(value: number): void { this.update({ brightness: clamp(value, 0.7, 1.3) }); }
  setFieldOfViewDegrees(value: number): void { this.update({ fieldOfViewDegrees: clamp(value, 40, 75) }); }
  setCameraShake(value: CameraShake): void { this.update({ cameraShake: value }); }
  setHUDVisibility(value: HUDVisibility): void { this.update({ hudVisibility: value }); }
  setInterfaceScale(value: number): void { this.update({ interfaceScale: clamp(value, 0.75, 1.5) }); }
  setPauseInBackground(value: boolean): void { this.update({ pauseInBackground: value }); }
  setMuteInBackground(value: boolean): void { this.update({ muteInBackground: value }); }

  setKeyBinding(action: RebindableAction, code: string): boolean {
    if (!isBindableKey(code) || Object.entries(this.current.keyBindings).some(([id, bound]) => id !== action && bound === code)) return false;
    if (this.current.keyBindings[action] !== code) this.update({ keyBindings: { ...this.current.keyBindings, [action]: code } });
    return true;
  }

  setShowFPS(value: boolean): void {
    this.update({ showFPS: value });
  }

  setReduceMenuMotion(value: boolean): void {
    this.update({ reduceMenuMotion: value });
  }

  resetToDefaults(): void {
    this.requestGraphicsCalibration();
    this.update(DEFAULT_GAME_SETTINGS);
    try { this.storage?.removeItem(PRESENTATION_PREFERENCES_KEY); } catch { /* Optional storage. */ }
  }

  subscribe(listener: GameSettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<GameSettingsSnapshot>): void {
    const next = { ...this.current, ...patch };
    if (Object.keys(next).every(key => next[key as keyof GameSettingsSnapshot] === this.current[key as keyof GameSettingsSnapshot])) return;

    const persist = PERSISTED_KEYS.some(key => next[key] !== this.current[key]);
    this.current = next;
    if (persist) try {
      this.storage?.setItem(PRESENTATION_PREFERENCES_KEY,
        JSON.stringify(Object.fromEntries(PERSISTED_KEYS.map(key => [key, next[key]]))));
    } catch { /* Optional storage never blocks an in-memory setting. */ }
    for (const listener of this.listeners) listener(this.current);
  }
}
