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

export interface GameSettingsSnapshot extends GraphicsSettings {
  readonly mouseSensitivity: number;
  readonly invertVerticalLook: boolean;
  readonly masterVolume: number;
  readonly soundEffectsVolume: number;
  readonly cameraDistanceMetres: number;
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
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/** In-memory application-session settings. Level restart never recreates it. */
export class GameSettings {
  private readonly listeners = new Set<GameSettingsListener>();
  private current: GameSettingsSnapshot = { ...DEFAULT_GAME_SETTINGS };

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
      next.renderPixelRatioCap === this.current.renderPixelRatioCap
    ) {
      return;
    }

    this.current = next;
    for (const listener of this.listeners) listener(this.current);
  }
}
