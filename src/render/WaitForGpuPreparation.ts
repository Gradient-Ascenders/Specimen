type PreparationContext = Pick<WebGL2RenderingContext,
  'SYNC_GPU_COMMANDS_COMPLETE' | 'ALREADY_SIGNALED' | 'CONDITION_SATISFIED' | 'WAIT_FAILED' |
  'fenceSync' | 'clientWaitSync' | 'deleteSync' | 'flush' | 'isContextLost'>;

/** Drain queued uploads/shader work before revealing an animated presentation.
 * Never finish()/busy-wait: let the browser paint and handle input while the GPU
 * completes the commands submitted before this fence. */
export async function waitForGpuPreparation(
  context: PreparationContext | WebGLRenderingContext,
  yieldFrame: () => Promise<void>,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!isCurrent()) return;
  // Three r185 requires WebGL2, although its context return type still includes
  // WebGL1. Do not silently reveal while an unsupported context is still busy.
  if (!('fenceSync' in context)) throw new Error('Graphics preparation requires WebGL2.');
  const fence = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) throw new Error('Could not finish graphics preparation.');
  try {
    context.flush();
    while (isCurrent()) {
      if (context.isContextLost()) throw new Error('Graphics context lost during preparation.');
      const status = context.clientWaitSync(fence, 0, 0);
      if (status === context.ALREADY_SIGNALED || status === context.CONDITION_SATISFIED) return;
      if (status === context.WAIT_FAILED) throw new Error('Graphics preparation failed.');
      await yieldFrame();
    }
  } finally { context.deleteSync(fence); }
}
