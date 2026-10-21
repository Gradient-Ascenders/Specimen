import * as THREE from 'three';

import { RenderLayer } from '../render/RenderLayer.ts';
import { menuIconMarkup as icon } from '../ui/MenuIcons.ts';
import './opening-trailer.css';

export interface TrailerFrame {
  readonly seconds: number;
  readonly stage: string;
  readonly cameraShot?: string;
}

export interface TrailerScene<Frame extends TrailerFrame> {
  readonly root: THREE.Group;
  apply(frame: Frame, camera?: THREE.PerspectiveCamera): void;
  prepare(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<void>;
  dispose(): void;
}

export interface TrailerPlayerOptions<Frame extends TrailerFrame> {
  readonly id: 'opening' | 'goop';
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly playLabel: string;
  readonly durationSeconds: number;
  readonly createScene: () => TrailerScene<Frame>;
  readonly sample: (seconds: number) => Frame;
}

/** Standalone recording surface; deliberately does not boot the gameplay runtime. */
export function startTrailerPlayer<Frame extends TrailerFrame>(host: HTMLElement, options: TrailerPlayerOptions<Frame>): () => void {
  const { durationSeconds } = options;
  const render = new RenderLayer({ host, pixelRatioCap: 1 });
  render.setPresentationResolution(1280 * 720);
  render.scene.background = new THREE.Color(0x010305);
  const scene = options.createScene();
  render.scene.add(scene.root);
  const camera = render.cameraRig.camera;
  scene.apply(options.sample(0), camera);
  const shadows = render.requestShadowConfiguration(`trailer-${options.id}`, { enabled: true });
  const ui = document.createElement('section');
  ui.className = 'opening-trailer';
  ui.dataset.trailer = options.id;
  host.dataset.trailerShot = options.id;
  ui.dataset.state = 'loading';
  ui.innerHTML = `
    <div class="opening-trailer-start">
      <p class="system-label">${options.label}</p>
      <h1>${options.title}</h1>
      <p>${options.description}</p>
      <button type="button" class="system-action primary-action" data-trailer-action="play" disabled>${icon('Play')}<span data-trailer-play-label>Preparing scene…</span></button>
      <p class="opening-trailer-hint"><kbd>Space</kbd> Pause <kbd>R</kbd> Replay <kbd>H</kbd> Controls</p>
      <nav class="trailer-shot-links" aria-label="Trailer shots">
        <a href="?trailer=opening">01 / Bob wakes</a>
        <a href="?trailer=goop">02 / Goop steps in</a>
      </nav>
    </div>
    <div class="opening-trailer-controls" hidden>
      <button type="button" class="system-action" data-trailer-action="pause">${icon('Pause')}${icon('Play', true)}<span data-trailer-pause-label>Pause</span></button>
      <button type="button" class="system-action" data-trailer-action="replay">${icon('RotateCcw')}<span>Replay</span></button>
      <label>Preview <input type="range" data-trailer-seek min="0" max="${durationSeconds}" value="0" step="0.01" aria-label="${options.label} time"></label>
      <output data-trailer-time>0.0 / ${durationSeconds}s</output>
      <button type="button" class="system-action" data-trailer-action="hide">${icon('EyeOff')}<span>Hide controls</span></button>
      <a class="system-action" href="./">${icon('ArrowLeft')}<span>Back to game</span></a>
    </div>`;
  host.replaceChildren(render.canvas, ui);
  const startPanel = ui.querySelector<HTMLElement>('.opening-trailer-start')!;
  const controls = ui.querySelector<HTMLElement>('.opening-trailer-controls')!;
  const playButton = ui.querySelector<HTMLButtonElement>('[data-trailer-action="play"]')!;
  const pauseButton = ui.querySelector<HTMLButtonElement>('[data-trailer-action="pause"]')!;
  const playLabel = ui.querySelector<HTMLElement>('[data-trailer-play-label]')!;
  const pauseLabel = ui.querySelector<HTMLElement>('[data-trailer-pause-label]')!;
  const pauseIcon = pauseButton.querySelector('[data-ui-icon=Pause]')!;
  const resumeIcon = pauseButton.querySelector('[data-ui-icon=Play]')!;
  const seek = ui.querySelector<HTMLInputElement>('[data-trailer-seek]')!;
  const output = ui.querySelector<HTMLOutputElement>('[data-trailer-time]')!;
  let seconds = 0;
  let playing = false;
  let ready = false;
  let disposed = false;
  let previousTimestamp: number | undefined;

  const releaseControlFocus = (): void => {
    const focused = ui.ownerDocument.activeElement;
    if (focused instanceof HTMLElement && ui.contains(focused)) focused.blur();
  };

  const present = (): void => {
    const frame = options.sample(seconds);
    scene.apply(frame, camera);
    host.dataset.trailerStage = frame.stage;
    host.dataset.trailerSeconds = frame.seconds.toFixed(3);
    if (frame.cameraShot) host.dataset.trailerCameraShot = frame.cameraShot;
    seek.value = String(seconds);
    output.value = `${seconds.toFixed(1)} / ${durationSeconds}s`;
    ui.dataset.state = !ready ? 'loading' : playing ? 'playing'
      : seconds >= durationSeconds ? 'complete' : 'paused';
    pauseLabel.textContent = playing ? 'Pause' : 'Play';
    pauseIcon.toggleAttribute('hidden', !playing);
    resumeIcon.toggleAttribute('hidden', playing);
    render.render();
  };

  const play = (replay = false): void => {
    if (!ready || disposed) return;
    if (replay || seconds >= durationSeconds) seconds = 0;
    startPanel.hidden = true;
    controls.hidden = true;
    releaseControlFocus();
    previousTimestamp = undefined;
    playing = true;
    present();
  };
  const togglePause = (): void => {
    if (!ready) return;
    if (!playing) play();
    else {
      playing = false;
      previousTimestamp = undefined;
      present();
    }
  };
  const click = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    switch (target.closest<HTMLElement>('[data-trailer-action]')?.dataset.trailerAction) {
      case 'play': play(); break;
      case 'pause': togglePause(); break;
      case 'replay': play(true); break;
      case 'hide': controls.hidden = true; releaseControlFocus(); break;
    }
  };
  const scrub = (): void => {
    if (!ready) return;
    playing = false;
    previousTimestamp = undefined;
    startPanel.hidden = true;
    seconds = Math.max(0, Math.min(durationSeconds, Number(seek.value)));
    present();
  };
  const keydown = (event: KeyboardEvent): void => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    // Range/button keyboard interaction should not also control playback.
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    if (event.code === 'Space') { event.preventDefault(); togglePause(); }
    else if (event.code === 'KeyR') play(true);
    else if (event.code === 'KeyH' && ready) {
      startPanel.hidden = true;
      controls.hidden = !controls.hidden;
    }
  };
  const visibilityChanged = (): void => {
    if (!document.hidden || !playing) return;
    playing = false;
    previousTimestamp = undefined;
    present();
  };

  ui.addEventListener('click', click);
  seek.addEventListener('input', scrub);
  window.addEventListener('keydown', keydown);
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('resize', present);

  void scene.prepare(render.renderer, render.scene, camera).then(() => {
    if (disposed) return;
    ready = true;
    playButton.disabled = false;
    playLabel.textContent = options.playLabel;
    present();
    render.setAnimationLoop((timestamp) => {
      if (playing && previousTimestamp !== undefined) {
        seconds = Math.min(durationSeconds,
          seconds + Math.max(0, timestamp - previousTimestamp) / 1000);
        if (seconds >= durationSeconds) playing = false;
      }
      previousTimestamp = playing ? timestamp : undefined;
      // Avoid redrawing a fully prepared paused frame on every animation tick.
      if (playing || ui.dataset.state === 'playing') present();
    });
  }).catch((error: unknown) => {
    if (disposed) return;
    console.error(`${options.label} preparation failed.`, error);
    ui.dataset.state = 'failed';
    playLabel.textContent = 'Unable to prepare scene. Reload to retry.';
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    render.setAnimationLoop(null);
    ui.removeEventListener('click', click);
    seek.removeEventListener('input', scrub);
    window.removeEventListener('keydown', keydown);
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('resize', present);
    window.removeEventListener('pagehide', dispose);
    shadows.dispose();
    scene.dispose();
    render.dispose();
    ui.remove();
    delete host.dataset.trailerStage;
    delete host.dataset.trailerSeconds;
    delete host.dataset.trailerShot;
    delete host.dataset.trailerCameraShot;
  };
  window.addEventListener('pagehide', dispose);
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  return dispose;
}
