const TITLE_SCREEN_LINES = [
  'Escape was never part of the experiment.',
  'Containment is a temporary arrangement.',
  'Please remain calm and slightly gelatinous.',
  'Three bodies. One escape plan.',
  'The floor is only a suggestion.',
  'Side effects may include freedom.',
  'No bones. No problem.',
  'Adaptation was the easy part.',
  'Someone forgot to lock the specimens.',
  'Your cooperation is no longer required.',
] as const;

const LAST_LINE_KEY = 'specimen.title-screen.last-line';

/** Pick once per launch, avoiding the previous launch when storage is available. */
export function chooseTitleScreenLine(hostWindow: Window): string {
  let storage: Storage | undefined;
  let previous: string | null = null;
  try {
    storage = hostWindow.localStorage;
    previous = storage.getItem(LAST_LINE_KEY);
  } catch { /* Browser storage is optional. */ }

  const candidates = TITLE_SCREEN_LINES.filter(line => line !== previous);
  const line = candidates[Math.floor(Math.random() * candidates.length)]!;
  try { storage?.setItem(LAST_LINE_KEY, line); } catch { /* Browser storage is optional. */ }
  return line;
}
