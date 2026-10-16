import type { RenderLayer } from '../render/RenderLayer.ts';
import { TitleScreenScene } from './TitleScreenScene.ts';

export const TITLE_PIXEL_BUDGET = 1280 * 720;
export const TITLE_FRAME_INTERVAL_SECONDS = 1 / 30;
type TitleSceneView = Pick<TitleScreenScene, 'scene' | 'camera' | 'update' | 'dispose'>;

/** Shares the game's renderer, not its camera/scene or simulation. */
export class TitleScreenPresentation {
  readonly scene: TitleSceneView;
  private readonly renderLayer: RenderLayer;
  private readonly host: HTMLElement;
  private readonly hostWindow: Window;
  private readonly motionPreference: MediaQueryList;
  private ready = false;
  private disposed = false;
  private seconds = 0;
  private accumulator = 0;
  private width = 0;
  private height = 0;
  private dpr = 0;
  private bufferWidth = 0;
  private bufferHeight = 0;
  private lastWobbling = false;
  private needsRender = true;

  constructor(options: { renderLayer: RenderLayer; host: HTMLElement; window?: Window; scene?: TitleSceneView }) {
    this.renderLayer = options.renderLayer;
    this.host = options.host;
    this.hostWindow = options.window ?? window;
    this.scene = options.scene ?? new TitleScreenScene();
    this.motionPreference = this.hostWindow.matchMedia('(prefers-reduced-motion: reduce)');
    this.motionPreference.addEventListener('change', this.onMotionChanged);
    this.host.dataset.titleBackdrop = 'preparing';
  }

  async prepare(): Promise<void> {
    if (this.disposed) return;
    this.scene.update(0, this.host.clientWidth / Math.max(1, this.host.clientHeight), this.motionPreference.matches);
    await this.renderLayer.withShadowPreparation(true, () => this.renderLayer.renderer.compileAsync(
      this.scene.scene, this.scene.camera));
    if (this.disposed) return;
    // Level 1's loading primers have finished before this sub-native cap applies.
    this.renderLayer.setPresentationPixelBudget(TITLE_PIXEL_BUDGET);
    this.ready = true;
    this.render(0);
    this.host.dataset.titleBackdrop = 'ready';
  }

  render(deltaSeconds: number): void {
    if (this.disposed || !this.ready || this.host.ownerDocument.hidden) return;
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.1)) : 0;
    this.seconds += delta;
    this.accumulator += delta;
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    const resized = width !== this.width || height !== this.height || this.dpr !== this.hostWindow.devicePixelRatio;
    const canvas = this.renderLayer.canvas;
    // Changing the density setting clears the buffer even at unchanged CSS/DPR.
    const bufferChanged = canvas.width !== this.bufferWidth || canvas.height !== this.bufferHeight;
    if (!this.needsRender && !resized && !bufferChanged && (this.motionPreference.matches ||
      this.accumulator + 1e-10 < TITLE_FRAME_INTERVAL_SECONDS)) return;
    if (resized) this.renderLayer.setPresentationPixelBudget(TITLE_PIXEL_BUDGET);
    const wobbling = this.scene.update(this.seconds, width / height, this.motionPreference.matches);
    const refreshShadow = this.needsRender || wobbling || this.lastWobbling;
    this.renderLayer.withShadowPreparation(true, () => {
      // Only the egg moves. Reuse the room's one 512px shadow map at rest;
      // update during a wobble and once more when the shell settles.
      this.renderLayer.renderer.shadowMap.needsUpdate = refreshShadow;
      this.renderLayer.renderer.render(this.scene.scene, this.scene.camera);
    });
    this.lastWobbling = wobbling;
    this.accumulator %= TITLE_FRAME_INTERVAL_SECONDS;
    this.width = width; this.height = height; this.dpr = this.hostWindow.devicePixelRatio;
    this.bufferWidth = canvas.width; this.bufferHeight = canvas.height;
    this.needsRender = false;
    const motion = this.motionPreference.matches ? 'still' : 'orbiting';
    if (this.host.dataset.titleMotion !== motion) this.host.dataset.titleMotion = motion;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.motionPreference.removeEventListener('change', this.onMotionChanged);
    this.renderLayer.setPresentationPixelBudget(undefined);
    this.scene.dispose();
    delete this.host.dataset.titleBackdrop;
    delete this.host.dataset.titleMotion;
  }

  private readonly onMotionChanged = (): void => { this.needsRender = true; };
}
