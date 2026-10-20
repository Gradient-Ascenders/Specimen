import type * as THREE from 'three';

interface FrameHost {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
}

/** Submit one drawable, then poll the public KHR status without blocking.
 * Unlike renderer.compileAsync's internal timer, this wait can be cancelled
 * before its materials/renderer are disposed on a level change. */
export function prepareCinematicProgram(
  renderer: THREE.WebGLRenderer, object: THREE.Object3D, camera: THREE.Camera,
  scene: THREE.Scene, host: FrameHost, signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  const prior = new Set(renderer.info.programs ?? []);
  renderer.compile(object, camera, scene);
  const programs = (renderer.info.programs ?? []).filter(program => !prior.has(program));
  const gl = renderer.getContext();
  const extension = gl.getExtension('KHR_parallel_shader_compile');
  if (!extension || programs.length === 0) return Promise.resolve();
  return new Promise<void>(resolve => {
    let frame: number | undefined;
    const finish = () => {
      if (frame !== undefined) host.cancelAnimationFrame(frame);
      frame = undefined; signal.removeEventListener('abort', finish); resolve();
    };
    const check = () => {
      frame = undefined;
      if (signal.aborted || gl.isContextLost()) { finish(); return; }
      if (programs.every(program => gl.getProgramParameter(program.program as WebGLProgram, extension.COMPLETION_STATUS_KHR))) finish();
      else frame = host.requestAnimationFrame(check);
    };
    signal.addEventListener('abort', finish, { once: true });
    check();
  });
}
