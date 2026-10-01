import * as THREE from 'three';

import type { PerformanceRenderSnapshot } from '../core/PerformanceSnapshot.ts';
import { CameraRig } from './CameraRig.ts';
import {
  DEFAULT_RENDER_PIXEL_RATIO_CAP,
  type RenderPixelRatioCap,
  resolveRenderPixelRatio,
} from './RenderResolution.ts';

export const RENDER_EXPOSURE = 1;

const BACKGROUND_COLOUR = 0x07110f;

export interface RenderShadowConfiguration {
  readonly enabled: boolean;
}

export interface RenderShadowRequest {
  update(configuration: RenderShadowConfiguration): void;
  dispose(): void;
}

/** Renderer policy only. Requesters retain ownership of lights and their maps. */
export class RenderShadowPolicy {
  private readonly shadowMap: THREE.WebGLRenderer['shadowMap'];
  private disposed = false;
  private readonly requests: {
    owner: string;
    enabled: boolean;
  }[] = [];

  constructor(shadowMap: THREE.WebGLRenderer['shadowMap']) {
    this.shadowMap = shadowMap;
    this.apply();
  }

  get activeOwner(): string | undefined {
    return this.requests.at(-1)?.owner;
  }

  /** Compilation/draw setup is synchronous even when the action returns a promise. */
  withPreparation<T>(enabled: boolean, action: () => T): T {
    if (this.disposed) throw new Error('Cannot prepare a disposed shadow policy.');
    const { enabled: previousEnabled, type, autoUpdate, needsUpdate } = this.shadowMap;
    this.shadowMap.enabled = enabled;
    this.shadowMap.type = THREE.PCFShadowMap;
    this.shadowMap.autoUpdate = false;
    this.shadowMap.needsUpdate = false;
    try {
      return action();
    } finally {
      Object.assign(this.shadowMap, { enabled: previousEnabled, type, autoUpdate, needsUpdate });
    }
  }

  request(owner: string, configuration: RenderShadowConfiguration): RenderShadowRequest {
    if (this.disposed) throw new Error('Cannot request a disposed shadow policy.');
    const entry = { owner, enabled: configuration.enabled };
    this.requests.push(entry);
    this.apply();
    let released = false;
    return {
      update: (next) => {
        if (released || this.disposed || entry.enabled === next.enabled) return;
        entry.enabled = next.enabled;
        this.apply();
      },
      dispose: () => {
        if (released) return;
        released = true;
        if (this.disposed) return;
        this.requests.splice(this.requests.indexOf(entry), 1);
        this.apply();
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.requests.length = 0;
    this.apply();
    this.disposed = true;
  }

  private apply(): void {
    const enabled = this.requests.at(-1)?.enabled ?? false;
    const changed = this.shadowMap.enabled !== enabled ||
      this.shadowMap.type !== THREE.PCFShadowMap || !this.shadowMap.autoUpdate;
    this.shadowMap.enabled = enabled;
    this.shadowMap.type = THREE.PCFShadowMap;
    // Characters and hatch geometry move: static caching is not safe here.
    this.shadowMap.autoUpdate = true;
    if (changed) this.shadowMap.needsUpdate = true;
  }
}

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
  private readonly shadowPolicy: RenderShadowPolicy;

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
    this.shadowPolicy = new RenderShadowPolicy(this.renderer.shadowMap);
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

  requestShadowConfiguration(
    owner: string,
    configuration: RenderShadowConfiguration,
  ): RenderShadowRequest {
    if (this.disposed) throw new Error('Cannot configure a disposed RenderLayer.');
    return this.shadowPolicy.request(owner, configuration);
  }

  get shadowConfigurationOwner(): string | undefined {
    return this.shadowPolicy.activeOwner;
  }

  withShadowPreparation<T>(enabled: boolean, action: () => T): T {
    return this.shadowPolicy.withPreparation(enabled, action);
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
    this.shadowPolicy.dispose();
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
