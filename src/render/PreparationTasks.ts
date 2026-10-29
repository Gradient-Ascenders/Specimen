/** Join independent owners before propagating failure. A sibling must never
 * publish resources after the caller has started unloading the failed level. */
export async function prepareTogether(tasks: readonly Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(tasks);
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
