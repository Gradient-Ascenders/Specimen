import type { SlimeId } from '../slimes/SlimeRoster.ts';

/** Still renders of the authored models; the HUD needs no extra 3D views. */
export const SLIME_PORTRAITS: Readonly<Record<SlimeId, string>> = {
  bob: new URL('../assets/ui/portraits/bob.webp', import.meta.url).href,
  goop: new URL('../assets/ui/portraits/goop.webp', import.meta.url).href,
  volt: new URL('../assets/ui/portraits/volt.webp', import.meta.url).href,
};
