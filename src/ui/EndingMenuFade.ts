export const ENDING_MENU_FADE_SECONDS = .4;

/** App-owned cover survives the movie's release and the old level's disposal. */
export function setEndingMenuFade(host: HTMLElement, opacity: number): void {
  host.dataset.endingMenuFade = 'true';
  host.style.setProperty('--ending-menu-opacity', String(Math.max(0, Math.min(1, opacity))));
}

export function clearEndingMenuFade(host: HTMLElement): void {
  delete host.dataset.endingMenuFade;
  host.style.removeProperty('--ending-menu-opacity');
}

/** Use display frames for menu preparation/reveal; no gameplay or browser timers. */
export async function fadeEndingMenu(host: HTMLElement, opacity: number, reducedMotion: boolean): Promise<void> {
  const from = Number(host.style.getPropertyValue('--ending-menu-opacity')) || 0;
  const view = host.ownerDocument.defaultView;
  if (!view || reducedMotion || Math.abs(from - opacity) < .001) {
    setEndingMenuFade(host, opacity);
  } else {
    await new Promise<void>(resolve => {
      let start: number | undefined;
      const frame = (now: number) => {
        start ??= now;
        const p = Math.min(1, (now - start) / (ENDING_MENU_FADE_SECONDS * 1000));
        const eased = p * p * (3 - 2 * p);
        setEndingMenuFade(host, from + (opacity - from) * eased);
        if (p < 1) view.requestAnimationFrame(frame);
        else resolve();
      };
      view.requestAnimationFrame(frame);
    });
  }
  if (opacity === 0) clearEndingMenuFade(host);
}
