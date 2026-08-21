import * as THREE from 'three';

import { CameraRig } from './CameraRig';

export const MAX_DEVICE_PIXEL_RATIO = 2;
export const RENDER_EXPOSURE = 1;

const BACKGROUND_COLOUR = 0x07110f;

export interface RenderDiagnostics {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  readonly pixelRatio: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly sceneObjects: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

export interface RenderLayerOptions {
  host: HTMLElement;
  window?: Window;
}

/**
 * Shared rendering boundary for the application.
 *
 * It owns the WebGL renderer, the game camera, the persistent inspection
 * lights, and viewport sizing. Levels remain responsible for every resource
 * below their own scene root.
 */
export class RenderLayer {
  readonly scene = new THREE.Scene();
  readonly cameraRig = new CameraRig();
  readonly renderer: THREE.WebGLRenderer;

  private readonly host: HTMLElement;
  private readonly hostWindow: Window;
  private readonly lighting = new THREE.Group();
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly resizeObserver: ResizeObserver | undefined;

  private viewportWidth = 0;
  private viewportHeight = 0;
  private disposed = false;

  constructor(options: RenderLayerOptions) {
    this.host = options.host;
    this.hostWindow = options.window ?? window;

    this.scene.name = 'game-scene';
    this.scene.background = new THREE.Color(BACKGROUND_COLOUR);

    this.renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = RENDER_EXPOSURE;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(BACKGROUND_COLOUR, 1);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');

    this.addInspectionLighting();

    this.hostWindow.addEventListener('resize', this.resize);
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(this.resize);
      resizeObserver.observe(this.host);
      this.resizeObserver = resizeObserver;
    }

    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  render(): void {
    this.renderer.render(this.scene, this.cameraRig.camera);
  }

  setAnimationLoop(callback: XRFrameRequestCallback | null): void {
    this.renderer.setAnimationLoop(callback);
  }

  getDiagnostics(): RenderDiagnostics {
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    let sceneObjects = 0;
    this.scene.traverse(() => {
      sceneObjects += 1;
    });

    return {
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      drawingBufferWidth: this.drawingBufferSize.x,
      drawingBufferHeight: this.drawingBufferSize.y,
      pixelRatio: this.renderer.getPixelRatio(),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      sceneObjects,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length ?? 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.renderer.setAnimationLoop(null);
    this.hostWindow.removeEventListener('resize', this.resize);
    this.resizeObserver?.disconnect();
    this.lighting.removeFromParent();
    this.lighting.clear();
    this.renderer.dispose();
  }

  private addInspectionLighting(): void {
    this.lighting.name = 'clinical-inspection-lighting';

    const ambientLight = new THREE.HemisphereLight(0xddeeff, 0x25332e, 1.35);
    ambientLight.name = 'clinical-ambient-fill';
    this.lighting.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.name = 'clinical-directional-key';
    keyLight.position.set(8, 14, 10);
    keyLight.target.position.set(0, 0.5, 1.5);
    keyLight.target.name = 'clinical-directional-key-target';
    this.lighting.add(keyLight, keyLight.target);

    this.scene.add(this.lighting);
  }

  private readonly resize = (): void => {
    if (this.disposed) return;

    const width = Math.max(1, Math.floor(this.host.clientWidth));
    const height = Math.max(1, Math.floor(this.host.clientHeight));
    const pixelRatio = Math.min(
      Math.max(1, this.hostWindow.devicePixelRatio),
      MAX_DEVICE_PIXEL_RATIO,
    );

    if (
      width === this.viewportWidth &&
      height === this.viewportHeight &&
      pixelRatio === this.renderer.getPixelRatio()
    ) {
      return;
    }

    this.viewportWidth = width;
    this.viewportHeight = height;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.cameraRig.resize(width, height);
  };
}
