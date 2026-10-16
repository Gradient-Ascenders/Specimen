import { GoopIntroScene } from './GoopIntroScene.ts';
import { GOOP_INTRO_DURATION_SECONDS, sampleGoopIntro } from './GoopIntroTimeline.ts';
import { startTrailerPlayer } from './TrailerPlayer.ts';

export function startGoopIntroTrailer(host: HTMLElement): () => void {
  return startTrailerPlayer(host, {
    id: 'goop',
    label: 'Goop introduction',
    title: 'Not on his watch.',
    description: 'A drone takes aim. Goop steps in. One acid shot settles it.',
    playLabel: 'Play Goop introduction',
    durationSeconds: GOOP_INTRO_DURATION_SECONDS,
    createScene: () => new GoopIntroScene(),
    sample: sampleGoopIntro,
  });
}
