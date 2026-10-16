import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BobCharacterPresentation } from './bob/BobCharacterPresentation.ts';
import { GoopCharacterPresentation } from './goop/GoopCharacterPresentation.ts';
import { VoltCharacterPresentation } from './volt/VoltCharacterPresentation.ts';
import { loadCharacterAsset } from './slime/LoadCharacterAsset.ts';
import type { RenderLayer } from './RenderLayer.ts';
import type { GelRendering } from './slime/GelRendering.ts';
import { TitleAbilityPreview } from './TitleAbilityPreview.ts';
import { TITLE_SPECIMEN_ORDER, type TitleSpecimenId, type TitleSpecimenRegion } from '../ui/TitleSpecimenView.ts';

/** A small, visual-only specimen display. Never advances the level or its camera. */
export class TitlePresentation {
  private readonly scene = new THREE.Scene();
  private readonly background = new THREE.Color(0x090b16);
  private readonly fog = new THREE.FogExp2(0x090b16, 0.06);
  private readonly ambient = new THREE.HemisphereLight(0xc4d4ff, 0x181323, 2);
  private readonly key = new THREE.DirectionalLight(0xc8ebff, 4);
  private readonly rim = new THREE.DirectionalLight(0xa17aff, 3);
  // Keep the light in the scene at zero intensity so its shader is warmed at boot.
  private readonly voltLight = new THREE.PointLight(0xffdf8d, 0, 1.8, 2);
  private blackout = 0;
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
  private readonly bob: BobCharacterPresentation;
  private readonly goop: GoopCharacterPresentation;
  private readonly volt: VoltCharacterPresentation;
  private readonly pods: THREE.Group[] = [];
  private readonly specimens: THREE.Group[] = [];
  private readonly previews = new TitleAbilityPreview();
  private readonly restBounds = TITLE_SPECIMEN_ORDER.map(() => new THREE.Box3());
  private readonly regions: TitleSpecimenRegion[] = TITLE_SPECIMEN_ORDER.map(id => ({ id, left: 0, top: 0, width: 0, height: 0 }));
  private readonly projectedPoint = new THREE.Vector3();
  private readonly inversePod = new THREE.Matrix4();
  private interactive = false;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly stageColors = new Map<THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, THREE.Color>();
  private readonly dimmedSpecimenMaterials = new Map<THREE.MeshStandardMaterial, {
    color: THREE.Color; emissive: THREE.Color; reflection: number;
  }>();
  private readonly statusMaterial = new THREE.MeshBasicMaterial({ color: 0x87dfd1 });
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, samples: 4, depthBuffer: true,
  });
  private readonly output = new OutputPass();
  private readonly drawingBufferSize = new THREE.Vector2();
  private elapsed = 0;
  private disposed = false;

  constructor(rendering: GelRendering) {
    this.bob = new BobCharacterPresentation(0.45, rendering);
    this.goop = new GoopCharacterPresentation(0.45, rendering);
    this.volt = new VoltCharacterPresentation(0.45, rendering);
    this.target.texture.name = 'title-antialiased-color';
    this.output.renderToScreen = true;
    this.scene.name = 'title-specimen-display';
    this.scene.background = this.background;
    this.scene.fog = this.fog;
    this.materials.add(this.statusMaterial);

    const metal = this.material(new THREE.MeshStandardMaterial({
      color: 0x242a3c, metalness: 0.7, roughness: 0.33,
    }));
    const ceramic = this.material(new THREE.MeshStandardMaterial({
      color: 0x485161, metalness: 0.25, roughness: 0.5,
    }));
    const inset = this.material(new THREE.MeshStandardMaterial({
      color: 0x0e1520, metalness: 0.4, roughness: 0.5,
    }));
    const violet = this.material(new THREE.MeshBasicMaterial({ color: 0x9e7ce0 }));
    const glass = this.material(new THREE.MeshStandardMaterial({
      color: 0x83b4cb, transparent: true, opacity: 0.065,
      metalness: 0.3, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false,
    }));

    // Camera faces +Z: positive world X appears on the viewer's left.
    for (const character of [this.goop, this.bob, this.volt]) {
      const pod = new THREE.Group();
      const id = TITLE_SPECIMEN_ORDER[this.pods.length]!;
      pod.name = `title-pod-${id}`;
      this.createPod(pod, metal, ceramic, inset, violet, glass);
      const specimen = new THREE.Group();
      specimen.add(character.root);
      specimen.position.set(0, 0.94, -0.02);
      character.setShadowCasting(false);
      pod.add(specimen, this.previews.roots[id]);
      this.pods.push(pod);
      this.specimens.push(specimen);
      this.scene.add(pod);
    }

    const floor = this.mesh(new THREE.PlaneGeometry(50, 50), inset, 0, -0.03, 0);
    floor.rotation.x = -Math.PI / 2;
    for (let i = -3; i <= 3; i++) {
      this.mesh(new THREE.BoxGeometry(0.018, 0.008, 15), metal, i * 2.5, -0.02, 1);
    }
    for (const x of [-6, -4, -2, 2, 4, 6]) {
      this.mesh(new THREE.BoxGeometry(1.8, 6, 0.3), metal, x, 2.5, 3.5);
      this.mesh(new THREE.BoxGeometry(0.025, 4, 0.03), violet, x + 0.8, 2, 3.3);
    }

    this.key.position.set(-3, 4, -4);
    this.rim.position.set(3, 2, 2);
    this.voltLight.position.set(0, 1.65, -0.8);
    this.pods[2]!.add(this.voltLight);
    this.scene.add(this.ambient, this.key, this.rim);
  }

  private createPod(
    pod: THREE.Group,
    metal: THREE.Material,
    ceramic: THREE.Material,
    inset: THREE.Material,
    violet: THREE.Material,
    glass: THREE.Material,
  ): void {
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) =>
      this.mesh(geometry, material, x, y, z, pod);

    // Display plinth, a suspended cap, and two open front viewing windows.
    mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.24, 48), metal, 0, 0.12, 0);
    mesh(new THREE.CylinderGeometry(1.12, 1.2, 0.18, 48), ceramic, 0, 0.33, 0);
    mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.04, 48), inset, 0, 0.44, 0);
    mesh(new THREE.CylinderGeometry(1.18, 1.26, 0.18, 48), metal, 0, 2.78, 0);
    mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.035, 48), violet, 0, 2.67, 0);
    for (const x of [-0.95, 0.95]) {
      mesh(new THREE.BoxGeometry(0.11, 2.2, 0.13), metal, x, 1.55, 0.4);
      mesh(new THREE.BoxGeometry(0.025, 1.85, 0.025), violet, x, 1.55, 0.32);
    }
    mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 48, 1, true), glass, 0, 1.55, 0);
    for (const height of [0.48, 2.63]) {
      const ring = mesh(new THREE.TorusGeometry(1.1, 0.012, 6, 64), violet, 0, height, 0);
      ring.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 5; i++) {
      mesh(new THREE.BoxGeometry(0.055, 0.025, 0.015), this.statusMaterial, -0.18 + i * 0.09, 0.32, -1.19);
    }
  }

  async prepare(): Promise<void> {
    // Static title previews use authored meshes; gameplay owns optional LOD banks.
    const results = await Promise.allSettled([
      this.bob.prepare(),
      this.goop.prepare(() => loadCharacterAsset(new URL('../../assets/characters/goop/goop.glb', import.meta.url).href)),
      this.volt.prepare(() => loadCharacterAsset(new URL('../../assets/characters/volt/volt.glb', import.meta.url).href)),
    ]);
    if (this.disposed) return;
    this.bob.present();
    this.goop.present();
    this.volt.present();
    for (const specimen of [this.goop, this.bob]) specimen.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        this.dimmedSpecimenMaterials.set(material, { color: material.color.clone(),
          emissive: material.emissive.clone(), reflection: material.envMapIntensity });
      }
    });
    this.scene.updateMatrixWorld(true);
    for (const [index, specimen] of this.specimens.entries()) {
      this.inversePod.copy(this.pods[index]!.matrixWorld).invert();
      this.restBounds[index]!.setFromObject(specimen).applyMatrix4(this.inversePod).expandByScalar(0.07);
    }
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Title specimen preparation failed.');
  }

  render(layer: RenderLayer, deltaSeconds: number): void {
    if (this.disposed) return;
    if (!this.motion.matches) this.elapsed += Math.min(deltaSeconds, 0.1);
    this.previews.update(deltaSeconds, this.motion.matches);
    const dt = Number.isFinite(deltaSeconds) ? THREE.MathUtils.clamp(deltaSeconds, 0, 0.1) : 0;
    this.blackout = THREE.MathUtils.damp(this.blackout, this.previews.blackoutRequested ? 1 : 0, 14, dt);
    this.applyBlackout();
    for (const [index, specimen] of this.specimens.entries()) {
      const phase = this.elapsed + index * 1.7;
      const breath = Math.sin(phase * 1.5) * 0.012;
      const pose = this.previews.poses[TITLE_SPECIMEN_ORDER[index]!];
      const spread = 1 / Math.sqrt(pose.scaleY);
      specimen.scale.set((1 - breath * 0.45) * spread, (1 + breath) * pose.scaleY, (1 - breath * 0.45) * spread);
      specimen.position.y = 0.94 + breath * 0.45 + pose.lift + 0.45 * (pose.scaleY - 1);
      specimen.position.z = -0.02 + pose.recoil;
      specimen.rotation.x = -pose.recoil * 0.6;
      specimen.rotation.y = -0.1 + Math.sin(phase * 0.22) * 0.07;
    }
    this.statusMaterial.color.setHex(0x87dfd1).multiplyScalar((1 - this.blackout) * (0.85 + Math.sin(this.elapsed * 0.9) * 0.1));
    this.camera.aspect = layer.cameraRig.camera.aspect;
    const wide = this.camera.aspect > 1.25;
    const spacing = wide ? 2.65 : 2.1;
    for (const [index, pod] of this.pods.entries()) {
      const flank = index !== 1;
      pod.position.set((1 - index) * spacing, 0, flank ? 0.55 : 0);
      pod.scale.setScalar(flank ? (wide ? 0.9 : 0.78) : 1);
    }
    const distance = (wide ? 3.95 : 3.2) /
      (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * (wide ? 0.5 : 0.9));
    this.camera.position.set(0, 1.4 + distance * 0.14, -distance);
    this.camera.lookAt(0, 1.4, 0);
    this.camera.far = Math.max(40, distance + 20);
    this.fog.density = 0.38 / distance;
    this.camera.setViewOffset(this.camera.aspect, 1, wide ? -this.camera.aspect * 0.22 : 0,
      wide ? -0.04 : 0.28, this.camera.aspect, 1);
    this.camera.updateProjectionMatrix();
    this.updateRegions();
    layer.renderPresentation(this.draw);
  }

  get specimenRegions(): readonly TitleSpecimenRegion[] { return this.regions; }
  get blackoutAmount(): number { return this.blackout; }

  setInteractive(enabled: boolean): void {
    this.interactive = enabled;
    if (!enabled) {
      this.previews.reset();
      this.blackout = 0;
      this.applyBlackout();
    }
  }

  private applyBlackout(): void {
    const remaining = 1 - this.blackout;
    this.background.setHex(0x090b16).multiplyScalar(remaining);
    this.fog.color.copy(this.background);
    this.ambient.intensity = 2 * remaining;
    this.key.intensity = 4 * remaining;
    this.rim.intensity = 3 * remaining;
    this.voltLight.intensity = 12 * this.blackout;
    for (const [material, color] of this.stageColors) material.color.copy(color).multiplyScalar(remaining);
    // Fade authored emission and reflections too, without changing shader variants.
    for (const [material, original] of this.dimmedSpecimenMaterials) {
      material.color.copy(original.color).multiplyScalar(remaining);
      material.emissive.copy(original.emissive).multiplyScalar(remaining);
      material.envMapIntensity = original.reflection * remaining;
    }
    this.previews.dimForBlackout(this.blackout);
  }

  previewSpecimen(id: TitleSpecimenId | null, replay = false): void {
    if (!this.disposed && this.interactive) this.previews.select(id, replay);
  }

  private updateRegions(): void {
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    for (const [index, bounds] of this.restBounds.entries()) {
      const region = this.regions[index]!;
      if (bounds.isEmpty()) { region.width = region.height = 0; continue; }
      let left = 1, top = 1, right = 0, bottom = 0;
      // Project the resting body, so a jump never moves its own hover target.
      for (let corner = 0; corner < 8; corner++) {
        this.projectedPoint.set(corner & 1 ? bounds.max.x : bounds.min.x,
          corner & 2 ? bounds.max.y : bounds.min.y, corner & 4 ? bounds.max.z : bounds.min.z)
          .applyMatrix4(this.pods[index]!.matrixWorld).project(this.camera);
        const x = (this.projectedPoint.x + 1) / 2, y = (1 - this.projectedPoint.y) / 2;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      region.left = Math.max(0, left); region.top = Math.max(0, top);
      region.width = Math.max(0, Math.min(1, right) - region.left);
      region.height = Math.max(0, Math.min(1, bottom) - region.top);
    }
  }

  private readonly draw = (renderer: THREE.WebGLRenderer): void => {
    renderer.getDrawingBufferSize(this.drawingBufferSize);
    this.target.samples = Math.min(4, renderer.capabilities.maxSamples);
    this.target.setSize(this.drawingBufferSize.x, this.drawingBufferSize.y);
    // Linear HDR color is resolved with MSAA, then tone-mapped once for display.
    // The gameplay canvas/context keeps its original antialias configuration.
    const previousTarget = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(this.target);
      this.previews.withPrimedEffects(() => renderer.render(this.scene, this.camera));
      this.output.render(renderer, this.target, this.target, 0, false);
    } finally {
      renderer.setRenderTarget(previousTarget);
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bob.dispose();
    this.goop.dispose();
    this.volt.dispose();
    this.previews.dispose();
    this.target.dispose();
    this.output.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.scene.clear();
  }

  private material<T extends THREE.Material>(value: T): T {
    this.materials.add(value);
    if (value instanceof THREE.MeshStandardMaterial || value instanceof THREE.MeshBasicMaterial) {
      this.stageColors.set(value, value.color.clone());
    }
    return value;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.scene): THREE.Mesh {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
}
