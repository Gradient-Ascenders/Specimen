import { OpeningTrailerScene } from './OpeningTrailerScene.ts';
import { OPENING_TRAILER_DURATION_SECONDS, sampleOpeningTrailer } from './OpeningTrailerTimeline.ts';
import { startTrailerPlayer } from './TrailerPlayer.ts';

export function startOpeningTrailer(host: HTMLElement): () => void {
  return startTrailerPlayer(host, {
    id: 'opening',
    label: 'opening shot',
    title: 'A specimen wakes.',
    description: 'Outside the door. Into the dark. Something stirs.',
    playLabel: 'Play opening',
    durationSeconds: OPENING_TRAILER_DURATION_SECONDS,
    createScene: () => new OpeningTrailerScene(),
    sample: sampleOpeningTrailer,
  });
}
