import {
  DEFAULT_CAMERA_RIG_CONFIG,
  MAX_FOLLOW_DISTANCE_METRES,
  MIN_FOLLOW_DISTANCE_METRES,
} from '../render/CameraRig.ts';

export interface GameSettingsSnapshot {
  readonly mouseSensitivity: number;
  readonly invertVerticalLook: boolean;
  readonly masterVolume: number;
  readonly cameraDistanceMetres: number;
}

export type GameSettingsListener = (
  settings: Readonly<GameSettingsSnapshot>,
) => void;

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettingsSnapshot> = {
  mouseSensitivity: 1,
  invertVerticalLook: false,
  masterVolume: 1,
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

  setCameraDistanceMetres(value: number): void {
    this.update({
      cameraDistanceMetres: clamp(
        value,
        MIN_FOLLOW_DISTANCE_METRES,
        MAX_FOLLOW_DISTANCE_METRES,
      ),
    });
  }

  subscribe(listener: GameSettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<GameSettingsSnapshot>): void {
    const next = { ...this.current, ...patch };
    if (
      next.mouseSensitivity === this.current.mouseSensitivity &&
      next.invertVerticalLook === this.current.invertVerticalLook &&
      next.masterVolume === this.current.masterVolume &&
      next.cameraDistanceMetres === this.current.cameraDistanceMetres
    ) {
      return;
    }

    this.current = next;
    for (const listener of this.listeners) listener(this.current);
  }
}
