import * as THREE from 'three';

import type { PerformanceRenderSnapshot } from '../core/PerformanceSnapshot.ts';
import { CameraRig } from './CameraRig';
import {
  DEFAULT_RENDER_PIXEL_RATIO_CAP,
  type RenderPixelRatioCap,
  resolveRenderPixelRatio,
} from './RenderResolution.ts';

export const RENDER_EXPOSURE = 1;

const BACKGROUND_COLOUR = 0x07110f;

export interface RenderDiagnostics {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  readonly pixelRatio: number;
  readonly pixelRatioCap: RenderPixelRatioCap;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly sceneObjects: number;
  readonly sceneLights: number;
  readonly uniqueMaterials: number;
  readonly instancedMeshes: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

export interface RenderLayerOptions {
  host: HTMLElement;
  window?: Window;
  pixelRatioCap?: RenderPixelRatioCap;
}

/**
 * Shared rendering boundary for the application.
 *
 * It owns the WebGL renderer, the game camera, and viewport sizing. Levels own
 * their authored lighting below their own scene roots.
 */
export class RenderLayer {
  readonly scene = new THREE.Scene();
  readonly cameraRig = new CameraRig();
  readonly renderer: THREE.WebGLRenderer;

  private readonly host: HTMLElement;
  private readonly hostWindow: Window;
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly resizeObserver: ResizeObserver | undefined;

  private pixelRatioCap: RenderPixelRatioCap;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private disposed = false;

  constructor(options: RenderLayerOptions) {
    this.host = options.host;
    this.hostWindow = options.window ?? window;
    this.pixelRatioCap =
      options.pixelRatioCap ?? DEFAULT_RENDER_PIXEL_RATIO_CAP;

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

  setPixelRatioCap(cap: RenderPixelRatioCap): void {
    if (this.disposed || cap === this.pixelRatioCap) return;
    this.pixelRatioCap = cap;
    this.resize();
  }

  getDiagnostics(): RenderDiagnostics {
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    let sceneObjects = 0;
    let sceneLights = 0;
    let instancedMeshes = 0;
    const uniqueMaterials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      sceneObjects += 1;
      if (object instanceof THREE.Light) sceneLights += 1;
      if (object instanceof THREE.InstancedMesh) instancedMeshes += 1;
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) uniqueMaterials.add(material);
      }
    });

    return {
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      drawingBufferWidth: this.drawingBufferSize.x,
      drawingBufferHeight: this.drawingBufferSize.y,
      pixelRatio: this.renderer.getPixelRatio(),
      pixelRatioCap: this.pixelRatioCap,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      sceneObjects,
      sceneLights,
      uniqueMaterials: uniqueMaterials.size,
      instancedMeshes,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length ?? 0,
    };
  }

  /** Write cheap renderer counters without the scene traversal used by the debug panel. */
  writePerformanceSnapshot(
    target: PerformanceRenderSnapshot,
    drawingBufferSize: THREE.Vector2,
  ): void {
    this.renderer.getDrawingBufferSize(drawingBufferSize);
    target.viewportWidth = this.viewportWidth;
    target.viewportHeight = this.viewportHeight;
    target.drawingBufferWidth = drawingBufferSize.x;
    target.drawingBufferHeight = drawingBufferSize.y;
    target.effectiveDpr = this.renderer.getPixelRatio();
    target.resolutionTier = this.pixelRatioCap;
    target.drawCalls = this.renderer.info.render.calls;
    target.triangles = this.renderer.info.render.triangles;
    target.programs = this.renderer.info.programs?.length ?? 0;
    target.geometries = this.renderer.info.memory.geometries;
    target.textures = this.renderer.info.memory.textures;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.renderer.setAnimationLoop(null);
    this.hostWindow.removeEventListener('resize', this.resize);
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    if (this.disposed) return;

    const width = Math.max(1, Math.floor(this.host.clientWidth));
    const height = Math.max(1, Math.floor(this.host.clientHeight));
    const pixelRatio = resolveRenderPixelRatio(
      this.hostWindow.devicePixelRatio,
      this.pixelRatioCap,
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
