export interface CameraLookSettings {
  /** Radians of orbit per horizontal pointer pixel. */
  horizontalSensitivityRadiansPerPixel: number;
  /** Radians of orbit per vertical pointer pixel. */
  verticalSensitivityRadiansPerPixel: number;
  invertHorizontal: boolean;
  invertVertical: boolean;
}

/**
 * Map one browser pointer-motion axis into an orbit angle.
 *
 * The default sign matches the orbit-yaw convention: positive browser pointer
 * movement produces a negative orbit angle. CameraRig translates that sign at
 * the pitch boundary because positive rig pitch raises the camera.
 */
export function mapPointerAxisToOrbitRadians(
  pointerDeltaPixels: number,
  sensitivityRadiansPerPixel: number,
  inverted: boolean,
): number {
  const inversionSign = inverted ? 1 : -1;
  return pointerDeltaPixels * sensitivityRadiansPerPixel * inversionSign;
}

/** Frame-rate-independent exponential damping factor in [0, 1]. */
export function exponentialDampingAlpha(
  dampingPerSecond: number,
  deltaSeconds: number,
): number {
  if (dampingPerSecond <= 0 || deltaSeconds <= 0) return 0;
  return 1 - Math.exp(-dampingPerSecond * deltaSeconds);
}

/**
 * Resolve the camera boom distance for this rendered frame.
 *
 * Obstructions contract immediately so render smoothing cannot carry the
 * camera through a wall. Outward movement is exponentially damped. The normal
 * minimum distance is deliberately allowed to be overridden by a nearer
 * obstruction; preserving clearance is safer than forcing the camera through
 * geometry when the target is in a very tight space.
 */
export function resolveCameraDistance(
  currentDistanceMetres: number,
  desiredDistanceMetres: number,
  obstructionLimitMetres: number | undefined,
  minimumDistanceMetres: number,
  recoveryDampingPerSecond: number,
  deltaSeconds: number,
): number {
  const normalDistance = Math.max(
    minimumDistanceMetres,
    desiredDistanceMetres,
  );
  const targetDistance =
    obstructionLimitMetres === undefined
      ? normalDistance
      : Math.min(normalDistance, Math.max(0, obstructionLimitMetres));

  if (targetDistance <= currentDistanceMetres) return targetDistance;

  const alpha = exponentialDampingAlpha(
    recoveryDampingPerSecond,
    deltaSeconds,
  );
  return (
    currentDistanceMetres +
    (targetDistance - currentDistanceMetres) * alpha
  );
}

/**
 * Fade a followed character only when obstruction forces the boom very close.
 * The smoothstep avoids a visible pop as the camera enters or leaves a vent.
 */
export function resolveCameraTargetOpacity(
  cameraDistanceMetres: number,
  fadeStartDistanceMetres: number,
  fadeEndDistanceMetres: number,
  minimumOpacity: number,
): number {
  const safeDistance = Number.isFinite(cameraDistanceMetres)
    ? cameraDistanceMetres
    : fadeStartDistanceMetres;
  const range = fadeStartDistanceMetres - fadeEndDistanceMetres;
  if (
    !Number.isFinite(range) ||
    range <= 0 ||
    !Number.isFinite(minimumOpacity)
  ) {
    return 1;
  }

  const clampedMinimumOpacity = Math.min(1, Math.max(0, minimumOpacity));
  const linear = Math.min(
    1,
    Math.max(0, (safeDistance - fadeEndDistanceMetres) / range),
  );
  const smooth = linear * linear * (3 - 2 * linear);
  return clampedMinimumOpacity + (1 - clampedMinimumOpacity) * smooth;
}
