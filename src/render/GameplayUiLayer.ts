import type { Camera } from 'three';

/** Nonessential WebGL UI only. Layer 31 is reserved for isolated prewarming. */
export const GAMEPLAY_UI_LAYER = 30;

/** Filter presentation without changing object visibility or camera pose. */
export function withGameplayUiVisibility<T>(
  camera: Camera,
  visible: boolean,
  render: () => T,
): T {
  if (visible) return render();
  const mask = camera.layers.mask;
  camera.layers.disable(GAMEPLAY_UI_LAYER);
  try {
    return render();
  } finally {
    camera.layers.mask = mask;
  }
}
