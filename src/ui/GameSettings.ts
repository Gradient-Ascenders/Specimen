import type { GelRenderingMode } from '../render/slime/GelRendering.ts';
import { DEFAULT_GRAPHICS_SETTINGS, GRAPHICS_PROFILES, type GraphicsProfileId, type GraphicsSettings } from '../render/GraphicsProfiles.ts';
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

export interface GameSettingsSnapshot extends GraphicsSettings {
  readonly mouseSensitivity: number;
  readonly invertVerticalLook: boolean;
  readonly masterVolume: number;
  readonly soundEffectsVolume: number;
  readonly cameraDistanceMetres: number;
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
  showFPS: false,
  reduceMenuMotion: false,
};

export const PRESENTATION_PREFERENCES_KEY = 'specimen.presentation-preferences.v1';
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/** Gameplay quality stays session-scoped; lightweight display preferences persist. */
export class GameSettings {
  private readonly listeners = new Set<GameSettingsListener>();
  private current: GameSettingsSnapshot = { ...DEFAULT_GAME_SETTINGS };
  private readonly storage: SettingsStorage | undefined;

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
      }
    } catch {
      // Private browsing, blocked storage and malformed preferences are optional.
    }
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
    this.update({ gelRenderingMode: value });
  }

  setGraphicsProfile(value: GraphicsProfileId): void {
    // One atomic notification; do not briefly render mixed preset settings.
    this.update(GRAPHICS_PROFILES[value].settings);
  }

  setRenderScale(value: RenderScale): void {
    this.update({ renderScale: value });
  }

  setRenderPixelRatioCap(value: RenderPixelRatioCap): void {
    this.update({ renderPixelRatioCap: value });
  }

  setGraphicsPreset(value: GraphicsPreset): void {
    this.update({ graphicsPreset: value });
  }

  setShowFPS(value: boolean): void {
    this.update({ showFPS: value });
  }

  setReduceMenuMotion(value: boolean): void {
    this.update({ reduceMenuMotion: value });
  }

  resetToDefaults(): void {
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
    if (
      next.gelRenderingMode === this.current.gelRenderingMode &&
      next.graphicsProfile === this.current.graphicsProfile &&
      next.renderScale === this.current.renderScale &&
      next.mouseSensitivity === this.current.mouseSensitivity &&
      next.invertVerticalLook === this.current.invertVerticalLook &&
      next.masterVolume === this.current.masterVolume &&
      next.soundEffectsVolume === this.current.soundEffectsVolume &&
      next.cameraDistanceMetres === this.current.cameraDistanceMetres &&
      next.renderPixelRatioCap === this.current.renderPixelRatioCap &&
      next.showFPS === this.current.showFPS &&
      next.reduceMenuMotion === this.current.reduceMenuMotion &&
      next.graphicsPreset === this.current.graphicsPreset
    ) {
      return;
    }

    const persist = next.showFPS !== this.current.showFPS || next.reduceMenuMotion !== this.current.reduceMenuMotion;
    this.current = next;
    if (persist) try {
      this.storage?.setItem(PRESENTATION_PREFERENCES_KEY,
        JSON.stringify({ showFPS: next.showFPS, reduceMenuMotion: next.reduceMenuMotion }));
    } catch { /* Optional storage never blocks an in-memory setting. */ }
    for (const listener of this.listeners) listener(this.current);
  }
}
