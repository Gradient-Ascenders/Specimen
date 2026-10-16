import * as THREE from 'three';
import { GelRendering, type GelRenderingMode } from './slime/GelRendering.ts';

import type { PerformanceRenderSnapshot } from '../core/PerformanceSnapshot.ts';
import { CameraRig } from './CameraRig.ts';
import { GAMEPLAY_UI_LAYER, withGameplayUiVisibility } from './GameplayUiLayer.ts';
import { DEFAULT_GRAPHICS_SETTINGS, GRAPHICS_LIGHTING_POLICY, GRAPHICS_PROFILES, graphicsProfileName,
  type GraphicsSettings } from './GraphicsProfiles.ts';
import { GraphicsResourcePolicy } from './GraphicsResourcePolicy.ts';
import {
  type RenderPixelRatioCap,
  type RenderScale,
  resolveRenderResolution,
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

export interface GraphicsDiagnostics {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  readonly pixelRatio: number;
  readonly pixelRatioCap: RenderPixelRatioCap;
  readonly devicePixelRatio: number;
  readonly renderScale: RenderScale;
  readonly graphicsProfile: string;
  readonly graphicsProfileBase: string;
  readonly pixelBudget: number;
  readonly shadowMapSizeCap: number;
  readonly effectsDensity: number;
  readonly lightingPolicy: string;
  readonly antialias: boolean;
  readonly gelRenderingMode: GelRenderingMode;
  readonly transmissionResolutionScale: number;
}

export interface RenderDiagnostics extends GraphicsDiagnostics {
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
  graphics?: GraphicsSettings;
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
  readonly gelRendering: GelRendering;
  private readonly shadowPolicy: RenderShadowPolicy;
  private readonly graphicsResources: GraphicsResourcePolicy;

  private readonly host: HTMLElement;
  private readonly hostWindow: Window;
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly resizeObserver: ResizeObserver | undefined;

  private graphicsSettings: GraphicsSettings;
  private readonly maximumWidth: number;
  private readonly maximumHeight: number;
  private readonly antialias: boolean;
  private dprQuery: MediaQueryList | undefined;
  private lastDevicePixelRatio = 0;
  private readonly graphicsListeners = new Set<() => void>();
  private viewportWidth = 0;
  private viewportHeight = 0;
  private disposed = false;
  private cleanGameplay = false;

  constructor(options: RenderLayerOptions) {
    this.host = options.host;
    this.hostWindow = options.window ?? window;
    this.graphicsSettings = { ...(options.graphics ?? DEFAULT_GRAPHICS_SETTINGS),
      ...(options.pixelRatioCap === undefined ? {} : { renderPixelRatioCap: options.pixelRatioCap }) };

    this.scene.name = 'game-scene';
    this.cameraRig.camera.layers.enable(GAMEPLAY_UI_LAYER);
    this.scene.background = new THREE.Color(BACKGROUND_COLOUR);

    this.renderer = new THREE.WebGLRenderer({
      alpha: false,
      // Context MSAA cannot be changed without replacing the renderer/context.
      // Both bounded profiles use the same conservative, non-MSAA canvas.
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.gelRendering = new GelRendering(this.renderer);
    this.graphicsResources = new GraphicsResourcePolicy(this.scene);
    const gl = this.renderer.getContext();
    this.antialias = gl.getContextAttributes()?.antialias ?? false;
    const viewportLimits = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const maximumDimension = Math.min(this.renderer.capabilities.maxTextureSize,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
    this.maximumWidth = Math.min(maximumDimension, viewportLimits[0]);
    this.maximumHeight = Math.min(maximumDimension, viewportLimits[1]);
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

    this.setGraphicsSettings(this.graphicsSettings);
    this.watchDevicePixelRatio();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  render(): void {
    // A numeric check is also needed when display emulation/browser changes
    // update DPR without delivering a resolution media-query event.
    if (this.lastDevicePixelRatio !== this.hostWindow.devicePixelRatio) {
      this.resize(); this.watchDevicePixelRatio();
    }
    this.graphicsResources.sync();
    withGameplayUiVisibility(this.cameraRig.camera, !this.cleanGameplay, () => {
      this.renderer.render(this.scene, this.cameraRig.camera);
    });
  }

  setCleanGameplayMode(clean: boolean): void {
    this.cleanGameplay = clean;
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
    this.graphicsResources.sync();
    return this.shadowPolicy.withPreparation(enabled, action);
  }

  setAnimationLoop(callback: XRFrameRequestCallback | null): void {
    this.renderer.setAnimationLoop(callback);
  }

  setPixelRatioCap(cap: RenderPixelRatioCap): void {
    this.setGraphicsSettings({ ...this.graphicsSettings, renderPixelRatioCap: cap });
  }

  setGraphicsSettings(settings: GraphicsSettings): void {
    if (this.disposed) return;
    this.graphicsSettings = { ...settings };
    const profile = GRAPHICS_PROFILES[settings.graphicsProfile];
    this.gelRendering.setMode(settings.gelRenderingMode);
    this.graphicsResources.setQuality(profile.shadowMapSizeCap, profile.effectsDensity);
    this.resize();
  }

  /** For a future owner that adds nested lights/effects after attaching its root. */
  refreshGraphicsResources(): void {
    this.graphicsResources.refresh();
  }

  subscribeGraphicsDiagnostics(listener: () => void): () => void {
    this.graphicsListeners.add(listener);
    listener();
    return () => this.graphicsListeners.delete(listener);
  }

  getGraphicsDiagnostics(): GraphicsDiagnostics {
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    const settings = this.graphicsSettings, profile = GRAPHICS_PROFILES[settings.graphicsProfile];
    return {
      viewportWidth: this.viewportWidth, viewportHeight: this.viewportHeight,
      drawingBufferWidth: this.drawingBufferSize.x, drawingBufferHeight: this.drawingBufferSize.y,
      pixelRatio: this.renderer.getPixelRatio(), pixelRatioCap: settings.renderPixelRatioCap,
      devicePixelRatio: this.hostWindow.devicePixelRatio, renderScale: settings.renderScale,
      graphicsProfile: graphicsProfileName(settings, this.gelRendering.value), graphicsProfileBase: settings.graphicsProfile,
      pixelBudget: profile.pixelBudget, shadowMapSizeCap: profile.shadowMapSizeCap,
      effectsDensity: profile.effectsDensity, lightingPolicy: GRAPHICS_LIGHTING_POLICY,
      antialias: this.antialias,
      gelRenderingMode: this.gelRendering.value, transmissionResolutionScale: this.renderer.transmissionResolutionScale,
    };
  }

  getDiagnostics(): RenderDiagnostics {
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
      ...this.getGraphicsDiagnostics(),
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
    target.resolutionTier = this.graphicsSettings.renderPixelRatioCap;
    target.graphicsProfile = graphicsProfileName(this.graphicsSettings, this.gelRendering.value);
    target.graphicsProfileBase = this.graphicsSettings.graphicsProfile;
    target.devicePixelRatio = this.hostWindow.devicePixelRatio;
    target.renderScale = this.graphicsSettings.renderScale;
    const profile = GRAPHICS_PROFILES[this.graphicsSettings.graphicsProfile];
    target.pixelBudget = profile.pixelBudget;
    target.gelRenderingMode = this.gelRendering.value;
    target.transmissionResolutionScale = this.renderer.transmissionResolutionScale;
    target.shadowMapSizeCap = profile.shadowMapSizeCap;
    target.effectsDensity = profile.effectsDensity;
    target.antialias = this.antialias;
    target.lightingPolicy = GRAPHICS_LIGHTING_POLICY;
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
    this.dprQuery?.removeEventListener('change', this.onDevicePixelRatioChange);
    this.graphicsResources.dispose();
    this.graphicsListeners.clear();
    this.shadowPolicy.dispose();
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    this.lastDevicePixelRatio = this.hostWindow.devicePixelRatio;

    const size = resolveRenderResolution(this.host.clientWidth, this.host.clientHeight,
      this.hostWindow.devicePixelRatio, {
        pixelRatioCap: this.graphicsSettings.renderPixelRatioCap,
        renderScale: this.graphicsSettings.renderScale,
        pixelBudget: GRAPHICS_PROFILES[this.graphicsSettings.graphicsProfile].pixelBudget,
        maximumWidth: this.maximumWidth, maximumHeight: this.maximumHeight,
      });
    const { viewportWidth: width, viewportHeight: height, effectivePixelRatio: pixelRatio } = size;

    if (
      width === this.viewportWidth &&
      height === this.viewportHeight &&
      pixelRatio === this.renderer.getPixelRatio()
    ) {
      this.notifyGraphicsDiagnostics();
      return;
    }

    this.viewportWidth = width;
    this.viewportHeight = height;
    // One bounded allocation: setPixelRatio + setSize would briefly resize the
    // old large viewport with the new density before applying its pixel cap.
    this.renderer.setDrawingBufferSize(size.logicalWidth, size.logicalHeight, pixelRatio);
    this.cameraRig.resize(width, height);
    this.notifyGraphicsDiagnostics();
  };

  private readonly onDevicePixelRatioChange = (): void => {
    this.resize(); this.watchDevicePixelRatio();
  };

  private watchDevicePixelRatio(): void {
    this.dprQuery?.removeEventListener('change', this.onDevicePixelRatioChange);
    this.dprQuery = this.hostWindow.matchMedia(`(resolution: ${this.hostWindow.devicePixelRatio}dppx)`);
    this.dprQuery.addEventListener('change', this.onDevicePixelRatioChange);
  }

  private notifyGraphicsDiagnostics(): void {
    for (const listener of this.graphicsListeners) listener();
  }
}
