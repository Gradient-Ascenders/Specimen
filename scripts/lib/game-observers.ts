export type Observers = { session?: string; runtime?: string };

/** Shared entry transform for regression probes that also observe other modules. */
export function observeGameSource(source: string, observers: Observers): string {
  const replaceOnce = (pattern: RegExp, replacement: (...parts: string[]) => string): void => {
    const matches = [...source.matchAll(new RegExp(pattern.source, 'g'))];
    if (matches.length !== 1) throw new Error(`Expected one game entry observer match, got ${matches.length}: ${pattern}`);
    source = source.replace(pattern, replacement);
  };
  if (observers.session) {
    const key = JSON.stringify(observers.session);
    replaceOnce(/\bnew ([\w$]+)\(\{\s*initialRuntime:/,
      (_match, constructor) => `globalThis[${key}]=new ${constructor}({initialRuntime:`);
  }
  if (observers.runtime) {
    const key = JSON.stringify(observers.runtime);
    replaceOnce(/\binitialRuntime:\s*([\w$]+)/,
      (_match, runtime) => `initialRuntime:globalThis[${key}]=${runtime}`);
  }
  return source;
}
