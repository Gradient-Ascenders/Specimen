import { calibrateGraphics, type GraphicsCalibrationResult } from './GraphicsCalibration.ts';
import { DEFAULT_USER_KEY_BINDINGS, type UserKeyBindings } from '../core/KeyBindings.ts';
import * as THREE from 'three';
import { renderIsolatedPrewarmResources, withIsolatedPrewarmState } from './IsolatedResourcePrewarm.ts';
import { GelRendering, type GelRenderingMode } from './slime/GelRendering.ts';

import type { PerformanceRenderSnapshot } from '../core/PerformanceSnapshot.ts';
import { CameraRig } from './CameraRig.ts';
import { resolveGraphicsQuality } from './GraphicsQuality.ts';
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
    return this.requests[this.requests.length - 1]?.owner;
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
    const enabled = this.requests[this.requests.length - 1]?.enabled ?? false;
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
  readonly requestedPixelRatioCap: RenderPixelRatioCap;
  readonly graphicsPreset: string;
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
  cameraShakeScale = 1;
  keyBindings: UserKeyBindings = DEFAULT_USER_KEY_BINDINGS;
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
  private presentationPixelBudget: number | undefined;
  private effectivePixelRatioCap: RenderPixelRatioCap = 1;
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
      // All quality presets use the same conservative, non-MSAA canvas.
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

  get graphicsConfiguration(): GraphicsSettings { return { ...this.graphicsSettings }; }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Active allocation budget, including a temporary title/menu cap. */
  get pixelBudget(): number {
    const profileBudget = this.graphicsSettings.pixelBudget;
    return Math.min(profileBudget, this.presentationPixelBudget ?? profileBudget);
  }

  get activePixelRatioCap(): RenderPixelRatioCap {
    return this.presentationPixelBudget === undefined ? this.effectivePixelRatioCap : 1;
  }

  get activeRenderScale(): RenderScale {
    return this.presentationPixelBudget === undefined ? this.graphicsSettings.renderScale : 1;
  }

  render(): void {
    // A numeric check is also needed when display emulation/browser changes
    // update DPR without delivering a resolution media-query event.
    if (this.lastDevicePixelRatio !== this.hostWindow.devicePixelRatio) {
      this.resize(); this.watchDevicePixelRatio();
    }
    this.graphicsResources.sync();
    if (this.preparingRenderResources) {
      // A running camera may see no gel at all (aiming hides the active body).
      // Three skips transmission storage in that case. Force one owned body
      // into the retained camera's render list, preserving bounded live lights
      // and restoring every visibility/layer/culling change synchronously.
      let primer: THREE.Mesh | undefined;
      this.scene.traverse(object => {
        if (primer || !(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some(material => material instanceof THREE.MeshPhysicalMaterial &&
          material.visible && material.transmission > 0 && this.gelRendering.owns(material))) primer = object;
      });
      if (!primer) throw new Error('No owned transmissive body is available for resource preparation.');
      const resource = primer;
      // A gel-only layer mask must never clear/update cached live shadow maps.
      this.withShadowPreparation(this.renderer.shadowMap.enabled, () =>
        renderIsolatedPrewarmResources(this.renderer, this.scene, this.cameraRig.camera, [resource], {includeHidden:true}));
      return;
    }
    withGameplayUiVisibility(this.cameraRig.camera, !this.cleanGameplay, () => {
      this.renderer.render(this.scene, this.cameraRig.camera);
    });
  }

  setCleanGameplayMode(clean: boolean): void {
    this.cleanGameplay = clean;
  }

  private preparingRenderResources = false;
  /** Exercise Three's camera-owned storage at gameplay dimensions, behind the
   * session gate. Keep the live framebuffer untouched and restore GPU state. */
  prepareRenderResources(draw: () => void): void {
    const viewport = this.renderer.getViewport(new THREE.Vector4());
    const scale = this.renderer.transmissionResolutionScale;
    withIsolatedPrewarmState(this.renderer, () => {
      this.renderer.setViewport(viewport);
      this.renderer.transmissionResolutionScale = scale;
      this.preparingRenderResources = true;
      try { draw(); }
      finally { this.preparingRenderResources = false; }
    });
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

  /** Recheck an already-loaded later level using its real current camera view. */
  async calibrateCurrentView(isCurrent: () => boolean): Promise<GraphicsCalibrationResult> {
    const previous = this.graphicsConfiguration, renderer = this.renderer, camera = this.cameraRig.camera;
    const target = new THREE.WebGLRenderTarget(1, 1);
    try {
      this.setGraphicsSettings(GRAPHICS_PROFILES.standard.settings);
      const viewport = this.getGameplayPrewarmViewport(new THREE.Vector4()), ratio = renderer.getPixelRatio();
      target.setSize(Math.max(1, Math.round(viewport.z * ratio)), Math.max(1, Math.round(viewport.w * ratio)));
      const draw = (): void => withIsolatedPrewarmState(renderer, () => {
        renderer.setViewport(0, 0, target.width / ratio, target.height / ratio);
        renderer.setScissorTest(false);
        renderer.transmissionResolutionScale = 0.5;
        // Quality changes can release shadow maps. Recreate them with normal
        // updates before sampling receivers or timing the live workload.
        this.render();
      }, target);
      let warmed = false;
      const view = { warm: async () => {
        if (warmed) return;
        await withIsolatedPrewarmState(renderer, () => renderer.compileAsync(this.scene, camera), target);
        draw(); warmed = true;
      }, draw };
      return await calibrateGraphics({ context: renderer.getContext() as WebGL2RenderingContext,
        views: [view, view], now: () => this.hostWindow.performance.now(),
        yieldTask: () => new Promise(resolve => this.hostWindow.setTimeout(resolve, 0)), isCurrent });
    } finally { target.dispose(); this.setGraphicsSettings(previous); }
  }

  setBrightness(value: number): void {
    this.renderer.toneMappingExposure = RENDER_EXPOSURE * THREE.MathUtils.clamp(value, 0.7, 1.3);
  }

  setPixelRatioCap(cap: RenderPixelRatioCap): void {
    this.setGraphicsSettings({ ...this.graphicsSettings, renderPixelRatioCap: cap });
  }

  setGraphicsSettings(settings: GraphicsSettings): void {
    if (this.disposed) return;
    this.graphicsSettings = { ...settings };
    const quality = resolveGraphicsQuality(settings.graphicsPreset, settings.renderPixelRatioCap);
    this.effectivePixelRatioCap = quality.pixelRatioCap;
    this.gelRendering.setTransmissionResolutionScaleCap(quality.transmissionResolutionScale);
    this.gelRendering.setMode(settings.gelRenderingMode);
    this.graphicsResources.setQuality(settings.shadowMapSizeCap, settings.effectsDensity);
    this.resize();
  }

  /** Bounded 1:1 CSS-pixel presentation, independent of gameplay's render scale. */
  setPresentationResolution(pixelBudget: number | undefined): void {
    if (this.disposed) return;
    if (pixelBudget !== undefined && (!Number.isFinite(pixelBudget) || pixelBudget < 1)) {
      throw new RangeError('Pixel budget must be positive.');
    }
    this.presentationPixelBudget = pixelBudget === undefined ? undefined : Math.floor(pixelBudget);
    this.resize();
  }

  /** Logical viewport for a retained-camera primer while a bounded cinematic
   * still owns the canvas. Do not resize/clear its visible framebuffer. */
  getGameplayPrewarmViewport(out: THREE.Vector4): THREE.Vector4 {
    const size = resolveRenderResolution(this.host.clientWidth, this.host.clientHeight,
      this.hostWindow.devicePixelRatio, {
        pixelRatioCap: this.effectivePixelRatioCap, renderScale: this.graphicsSettings.renderScale,
        pixelBudget: this.graphicsSettings.pixelBudget,
        maximumWidth: this.maximumWidth, maximumHeight: this.maximumHeight,
        minimumDrawingBufferDimension: Math.ceil(1 / this.renderer.transmissionResolutionScale),
      });
    const ratio = this.renderer.getPixelRatio();
    return out.set(0, 0, size.drawingBufferWidth / ratio, size.drawingBufferHeight / ratio);
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
    const settings = this.graphicsSettings;
    return {
      viewportWidth: this.viewportWidth, viewportHeight: this.viewportHeight,
      drawingBufferWidth: this.drawingBufferSize.x, drawingBufferHeight: this.drawingBufferSize.y,
      pixelRatio: this.renderer.getPixelRatio(), pixelRatioCap: this.activePixelRatioCap,
      requestedPixelRatioCap: settings.renderPixelRatioCap, graphicsPreset: settings.graphicsPreset,
      devicePixelRatio: this.hostWindow.devicePixelRatio, renderScale: this.activeRenderScale,
      graphicsProfile: graphicsProfileName(settings, this.gelRendering.value), graphicsProfileBase: settings.graphicsProfile,
      pixelBudget: this.pixelBudget, shadowMapSizeCap: settings.shadowMapSizeCap,
      effectsDensity: settings.effectsDensity, lightingPolicy: GRAPHICS_LIGHTING_POLICY,
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
    target.resolutionTier = this.activePixelRatioCap;
    target.requestedPixelRatioCap = this.graphicsSettings.renderPixelRatioCap;
    target.graphicsPreset = this.graphicsSettings.graphicsPreset;
    target.graphicsProfile = graphicsProfileName(this.graphicsSettings, this.gelRendering.value);
    target.graphicsProfileBase = this.graphicsSettings.graphicsProfile;
    target.devicePixelRatio = this.hostWindow.devicePixelRatio;
    target.renderScale = this.activeRenderScale;
    target.pixelBudget = this.pixelBudget;
    target.gelRenderingMode = this.gelRendering.value;
    target.transmissionResolutionScale = this.renderer.transmissionResolutionScale;
    target.shadowMapSizeCap = this.graphicsSettings.shadowMapSizeCap;
    target.effectsDensity = this.graphicsSettings.effectsDensity;
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
    this.removeDevicePixelRatioListener();
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
        pixelRatioCap: this.activePixelRatioCap,
        renderScale: this.activeRenderScale,
        pixelBudget: this.pixelBudget,
        maximumWidth: this.maximumWidth, maximumHeight: this.maximumHeight,
        minimumDrawingBufferDimension: Math.ceil(1 / this.renderer.transmissionResolutionScale),
      });
    const { viewportWidth: width, viewportHeight: height, effectivePixelRatio: pixelRatio } = size;
    // Refraction quality can change the physical minimum at unchanged CSS/DPR.
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);

    if (
      width === this.viewportWidth &&
      height === this.viewportHeight &&
      pixelRatio === this.renderer.getPixelRatio() &&
      size.drawingBufferWidth === this.drawingBufferSize.x &&
      size.drawingBufferHeight === this.drawingBufferSize.y
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
    this.removeDevicePixelRatioListener();
    this.dprQuery = this.hostWindow.matchMedia(`(resolution: ${this.hostWindow.devicePixelRatio}dppx)`);
    if (typeof this.dprQuery.addEventListener === 'function') {
      this.dprQuery.addEventListener('change', this.onDevicePixelRatioChange);
    } else {
      this.dprQuery.addListener(this.onDevicePixelRatioChange);
    }
  }

  private removeDevicePixelRatioListener(): void {
    if (!this.dprQuery) return;
    if (typeof this.dprQuery.removeEventListener === 'function') {
      this.dprQuery.removeEventListener('change', this.onDevicePixelRatioChange);
    } else {
      this.dprQuery.removeListener(this.onDevicePixelRatioChange);
    }
  }

  private notifyGraphicsDiagnostics(): void {
    for (const listener of this.graphicsListeners) listener();
  }
}
