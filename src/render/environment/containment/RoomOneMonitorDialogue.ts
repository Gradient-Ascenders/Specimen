export const ROOM_ONE_MONITOR_SCRIPT = Object.freeze([
  'Interesting...',
  'Specimen: Bob has awoken',
  'We are observing',
]);

export const ROOM_ONE_MONITOR_TIMING = Object.freeze({
  delaySeconds: 6,
  characterSeconds: .09,
  pageHoldSeconds: 2,
  sectionHoldSeconds: 3,
});

export const ROOM_ONE_MONITOR_COLUMNS = 18;
export const ROOM_ONE_MONITOR_ROWS = 3;

interface MonitorPage {
  readonly sectionIndex: number;
  readonly text: string;
  readonly startsAt: number;
}

/** Fixed-size word wrapping, never smaller text or an ever-growing transcript. */
export function paginateMonitorSections(
  sections: readonly string[],
  columns = ROOM_ONE_MONITOR_COLUMNS,
  rows = ROOM_ONE_MONITOR_ROWS,
): readonly { readonly sectionIndex: number; readonly text: string }[] {
  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
    throw new RangeError('Monitor dimensions must be positive integers.');
  }
  const pages: { sectionIndex: number; text: string }[] = [];
  sections.forEach((section, sectionIndex) => {
    const lines: string[] = [];
    let line = '';
    for (let word of section.trim().toUpperCase().split(/\s+/)) {
      if (!word) continue;
      if (line && line.length + 1 + word.length <= columns) {
        line += ` ${word}`;
        continue;
      }
      if (line) lines.push(line);
      while (word.length > columns) {
        lines.push(word.slice(0, columns));
        word = word.slice(columns);
      }
      line = word;
    }
    if (line) lines.push(line);
    for (let start = 0; start < lines.length; start += rows) {
      pages.push({ sectionIndex, text: lines.slice(start, start + rows).join('\n') });
    }
  });
  return pages;
}

/** Gameplay-time authority: preloading, pause and the opening cannot consume the delay. */
export class RoomOneMonitorDialogue {
  private readonly pages: readonly MonitorPage[];
  private elapsedSeconds = 0;
  private pageIndex = 0;
  private readonly model = { text: '', typing: false, sectionIndex: 0, pageIndex: 0, complete: false };

  constructor(
    sections: readonly string[] = ROOM_ONE_MONITOR_SCRIPT,
    columns = ROOM_ONE_MONITOR_COLUMNS,
    rows = ROOM_ONE_MONITOR_ROWS,
  ) {
    const pages = paginateMonitorSections(sections, columns, rows);
    let startsAt = ROOM_ONE_MONITOR_TIMING.delaySeconds;
    this.pages = pages.map((page, index) => {
      const scheduled = { ...page, startsAt };
      const sameSection = pages[index + 1]?.sectionIndex === page.sectionIndex;
      startsAt += (page.text.length - 1) * ROOM_ONE_MONITOR_TIMING.characterSeconds +
        (sameSection ? ROOM_ONE_MONITOR_TIMING.pageHoldSeconds : ROOM_ONE_MONITOR_TIMING.sectionHoldSeconds);
      return scheduled;
    });
  }

  get readModel(): Readonly<typeof this.model> { return this.model; }

  /** Returns true only when the visible text or cursor changes. */
  update(deltaSeconds: number): boolean {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Invalid monitor timestep.');
    if (this.model.complete || this.pages.length === 0) return false;
    this.elapsedSeconds += deltaSeconds;
    const epsilon = 1e-8;
    if (this.elapsedSeconds + epsilon < this.pages[0].startsAt) return false;
    while (this.pageIndex + 1 < this.pages.length &&
      this.elapsedSeconds + epsilon >= this.pages[this.pageIndex + 1].startsAt) this.pageIndex++;
    const page = this.pages[this.pageIndex];
    const count = Math.min(page.text.length,
      1 + Math.floor((this.elapsedSeconds - page.startsAt + epsilon) / ROOM_ONE_MONITOR_TIMING.characterSeconds));
    if (this.pageIndex === this.model.pageIndex && count === this.model.text.length) return false;
    const text = page.text.slice(0, count);
    const typing = count < page.text.length;
    const changed = text !== this.model.text || typing !== this.model.typing;
    Object.assign(this.model, { text, typing, sectionIndex: page.sectionIndex, pageIndex: this.pageIndex,
      complete: !typing && this.pageIndex === this.pages.length - 1 });
    return changed;
  }

  reset(): void {
    this.elapsedSeconds = 0; this.pageIndex = 0;
    Object.assign(this.model, { text: '', typing: false, sectionIndex: 0, pageIndex: 0, complete: false });
  }
}
