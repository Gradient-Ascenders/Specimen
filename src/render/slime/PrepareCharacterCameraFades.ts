interface CameraFadePresentation {
  prepareCameraFadePrograms(compile: () => unknown | Promise<unknown>): Promise<void>;
}

/** Borrow live materials for all characters, restoring every fade on failure. */
export function prepareCharacterCameraFades(
  presentations: readonly CameraFadePresentation[],
  compile: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const next = (index: number): Promise<unknown> => index < presentations.length
    ? presentations[index]!.prepareCameraFadePrograms(() => next(index + 1))
    : Promise.resolve().then(compile);
  return next(0);
}
