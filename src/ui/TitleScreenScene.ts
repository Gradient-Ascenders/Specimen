import * as THREE from 'three';

import { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import { createBorrowedBox, createBorrowedCylinder, createInstancedBoxes,
  createInstancedChamferedBoxes } from '../render/environment/containment/ContainmentModularComponents.ts';
import { createContainmentSpecimenLabelTexture } from '../render/environment/containment/ContainmentProceduralTextures.ts';

export const TITLE_ORBIT_SECONDS = 72;
export const TITLE_WOBBLE_INTERVAL_SECONDS = 5.5;
export const TITLE_WOBBLE_START_SECONDS = 2;
export const TITLE_WOBBLE_DURATION_SECONDS = 1.4;
export const TITLE_ORBIT_RADIUS_METRES = 4.4;
export const TITLE_EGG_CENTRE = Object.freeze({ x: 0, y: 2.22, z: -0.5 });

/** Bespoke menu observatory: Room 1's material language, no gameplay-room props. */
export class TitleScreenScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 24);
  readonly resources = new ContainmentArtResources();
  readonly pod = new THREE.Group();
  readonly eggRoot = new THREE.Group();
  readonly shell: THREE.Mesh;
  readonly keyLight = new THREE.SpotLight(0xd9f8f2, 205, 17, 0.85, 0.65, 2);

  private readonly target = new THREE.Vector3(TITLE_EGG_CENTRE.x, TITLE_EGG_CENTRE.y, TITLE_EGG_CENTRE.z);
  private readonly rockRotation = new THREE.Matrix4();
  private readonly ringGeometry = new THREE.TorusGeometry(1, 0.018, 8, 64);
  private readonly uniqueGeometries = new Set<THREE.BufferGeometry>([this.ringGeometry]);
  private readonly uniqueMaterials = new Set<THREE.Material>();
  private readonly uniqueTextures = new Set<THREE.Texture>();
  private readonly dustGeometry = new THREE.BufferGeometry();
  private readonly dustMaterial = new THREE.PointsMaterial({ color: 0xa4d9d5, size: 0.017,
    transparent: true, opacity: 0.32, depthWrite: false });
  private readonly dust = new THREE.Points(this.dustGeometry, this.dustMaterial);
  private readonly lights: THREE.Light[];
  private disposed = false;

  constructor() {
    this.scene.name = 'title-bob-observation-room';
    this.scene.background = new THREE.Color(0x080f13);
    this.scene.fog = new THREE.FogExp2(0x080f13, 0.035);
    this.buildShell();
    this.shell = this.buildPod();

    this.resources.materials.neutralFixture.emissiveIntensity = 1.4;
    this.resources.materials.staticCyanEmissive.emissiveIntensity = 0.6;
    this.resources.materials.specimenShell.emissiveIntensity = 0.025;
    this.resources.materials.containmentGlass.opacity = 0.085;
    const fill = new THREE.HemisphereLight(0xb7d5d6, 0x18202d, 0.68);
    this.keyLight.name = 'title-laboratory-key';
    // Enter below the opaque chamber lid, rather than shadowing the hero egg.
    this.keyLight.position.set(4, 4.7, 3.8);
    this.keyLight.target.position.set(0, 1.1, -0.5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(512, 512);
    this.keyLight.shadow.camera.near = 0.3;
    this.keyLight.shadow.camera.far = 17;
    this.keyLight.shadow.normalBias = 0.025;
    const rim = new THREE.PointLight(0xaca2e6, 36, 9, 2);
    rim.name = 'title-laboratory-rim';
    rim.position.set(-3.4, 3.8, -2.8);
    const specimen = new THREE.PointLight(0x99e6d7, 3.5, 3, 2);
    specimen.name = 'title-chamber-diffuser';
    specimen.position.set(0.3, 3.12, -0.78);
    this.lights = [fill, this.keyLight, rim, specimen];
    this.scene.add(...this.lights, this.keyLight.target);

    const positions = new Float32Array(32 * 3);
    for (let index = 0; index < 32; index++) {
      const angle = index * 2.3999632297;
      const radius = 1 + (index % 9) * 0.47;
      positions.set([Math.sin(angle) * radius, 0.8 + (index * 0.37) % 4.5,
        -0.5 + Math.cos(angle) * radius], index * 3);
    }
    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust.name = 'title-pooled-dust';
    this.scene.add(this.dust);
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.receiveShadow = true;
      object.castShadow = !object.userData.titleShadowlessSupport && materials.every(material => !material.transparent &&
        material !== this.resources.materials.neutralFixture);
    });
    this.scene.getObjectByName('title-observatory-wall')!.castShadow = false;
    this.update(0, 1);
  }

  /** Absolute-time poses: no cumulative drift, random timers or frame allocations. */
  update(seconds: number, aspect: number, reducedMotion = false): boolean {
    if (this.disposed) return false;
    const time = reducedMotion || !Number.isFinite(seconds) ? 0 : Math.max(0, seconds);
    const angle = time % TITLE_ORBIT_SECONDS / TITLE_ORBIT_SECONDS * Math.PI * 2 + 0.6;
    this.camera.position.set(Math.sin(angle) * TITLE_ORBIT_RADIUS_METRES,
      2.95 + Math.sin(angle * 2) * 0.12,
      TITLE_EGG_CENTRE.z + Math.cos(angle) * TITLE_ORBIT_RADIUS_METRES);
    this.camera.lookAt(this.target);
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const fov = Math.min(78, THREE.MathUtils.radToDeg(2 * Math.atan(
      Math.tan(THREE.MathUtils.degToRad(50 / 2)) / Math.min(1, safeAspect / 1.25))));
    if (this.camera.aspect !== safeAspect || this.camera.fov !== fov) {
      this.camera.aspect = safeAspect;
      this.camera.fov = fov;
      // Keep the optical axis aimed at the egg, but frame it clear of the menu:
      // right of the controls on wide screens, above them on portrait screens.
      this.camera.setViewOffset(safeAspect * 1000, 1000,
        safeAspect >= 1.3 ? -safeAspect * 150 : 0,
        safeAspect < 1.3 ? 180 : 0, safeAspect * 1000, 1000);
    }

    const wobbleTime = time % TITLE_WOBBLE_INTERVAL_SECONDS - TITLE_WOBBLE_START_SECONDS;
    const wobbling = wobbleTime > 0 && wobbleTime < TITLE_WOBBLE_DURATION_SECONDS;
    const envelope = wobbling ? Math.sin(wobbleTime / TITLE_WOBBLE_DURATION_SECONDS * Math.PI) ** 2 : 0;
    // Soften the strongest part by 20%, leaving the gentler lead-in/out almost unchanged.
    const softenedEnvelope = envelope * (1 - 0.2 * envelope);
    // Rock from the bottom rather than translating the entire shell. The top
    // gets the long lever arm while the bottom stays laterally anchored.
    this.eggRoot.rotation.set(wobbling ? (Math.sin(wobbleTime * 17) + Math.sin(wobbleTime * 31) * 0.22) * softenedEnvelope * 0.1 : 0,
      0, wobbling ? (Math.sin(wobbleTime * 23) + Math.sin(wobbleTime * 41) * 0.28) * softenedEnvelope * 0.22 : 0);
    if (wobbling) {
      const e = this.rockRotation.makeRotationFromQuaternion(this.eggRoot.quaternion).elements;
      const scale = this.eggRoot.scale, halfHeight = scale.y * 0.5;
      const positions = this.shell.geometry.getAttribute('position');
      let lowestY = Infinity;
      // Reuse the fixed vertex buffer only to find contact height. No vertices
      // are animated/uploaded; this prevents rocking through the solid deck.
      for (let index = 0; index < positions.count; index++) {
        lowestY = Math.min(lowestY, e[1] * positions.getX(index) * scale.x +
          e[5] * positions.getY(index) * scale.y + e[9] * positions.getZ(index) * scale.z);
      }
      this.eggRoot.position.set(e[4] * halfHeight, TITLE_EGG_CENTRE.y - halfHeight - lowestY,
        TITLE_EGG_CENTRE.z + e[6] * halfHeight);
    } else this.eggRoot.position.copy(this.target);
    this.dust.rotation.y = time * 0.008;
    return wobbling;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    for (const geometry of this.uniqueGeometries) geometry.dispose();
    for (const material of this.uniqueMaterials) material.dispose();
    for (const texture of this.uniqueTextures) texture.dispose();
    this.dustGeometry.dispose();
    this.dustMaterial.dispose();
    for (const light of this.lights) light.dispose();
    this.resources.dispose();
    this.eggRoot.clear();
    this.pod.clear();
    this.scene.clear();
  }

  private buildShell(): void {
    const { clinicalFloor, mainCeramic, mechanicalBacking, graphite, neutralFixture } = this.resources.materials;
    for (const [name, size, position, material] of [
      ['floor', [14, 0.3, 14], [0, -0.15, -0.5], clinicalFloor],
      ['ceiling', [14, 0.2, 14], [0, 7.1, -0.5], mechanicalBacking],
    ] as const) {
      this.scene.add(createBorrowedBox(this.resources, { name: `title-room-${name}`, size, position, material }));
    }
    this.scene.add(createInstancedBoxes(this.resources, 'title-floor-panel-seams', graphite,
      [-5, -3, -1, 1, 3, 5].map(z => ({ position: [0, 0.004, z] as const,
        size: [13.8, 0.006, 0.012] as const }))));

    const wallGeometry = new THREE.CylinderGeometry(6.1, 6.1, 7, 64, 1, true);
    const wallMaterial = mechanicalBacking.clone(); wallMaterial.side = THREE.BackSide;
    this.uniqueGeometries.add(wallGeometry); this.uniqueMaterials.add(wallMaterial);
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.name = 'title-observatory-wall'; wall.position.set(0, 3.5, -0.5); this.scene.add(wall);
    const panels = [], strips = [], ceilingLights = [];
    for (let index = 0; index < 12; index++) {
      const angle = index / 12 * Math.PI * 2;
      panels.push({ position: [Math.sin(angle) * 5.86, 3.25, -0.5 + Math.cos(angle) * 5.86] as const,
        rotation: [0, angle, 0] as const });
      const between = angle + Math.PI / 12;
      if (index % 2 === 0) strips.push({
        position: [Math.sin(between) * 5.6, 3.35, -0.5 + Math.cos(between) * 5.6] as const,
        rotation: [0, between, 0] as const, size: [0.025, 2.6, 0.035] as const,
      });
      ceilingLights.push({ position: [Math.sin(angle) * 3.7, 6.84, -0.5 + Math.cos(angle) * 3.7] as const,
        rotation: [0, angle, 0] as const, size: [1.35, 0.035, 0.3] as const });
    }
    this.scene.add(createInstancedChamferedBoxes(this.resources, { name: 'title-observatory-ceramic-panels',
      size: [2.6, 5.5, 0.14], radius: 0.045, material: mainCeramic, transforms: panels }),
    createInstancedBoxes(this.resources, 'title-recessed-wall-lights', neutralFixture, strips),
    createInstancedBoxes(this.resources, 'title-ceiling-light-panels', neutralFixture, ceilingLights));
  }

  private buildPod(): THREE.Mesh {
    const { mainCeramic, graphite, serviceMetal, structuralSteel, gasket,
      staticCyanEmissive, containmentGlass, specimenShell } = this.resources.materials;
    this.pod.name = 'title-custom-containment-pod';
    this.pod.position.z = TITLE_EGG_CENTRE.z;
    for (const [name, radius, height, y, material] of [
      ['floor-mount', 1.5, 0.16, 0.09, graphite],
      ['pedestal-shell', 1.22, 1.24, 0.79, mainCeramic],
      ['pedestal-service-belt', 1.235, 0.19, 0.61, structuralSteel],
      ['instrument-deck', 1.35, 0.17, 1.49, serviceMetal],
      ['lower-gasket', 1.12, 0.08, 1.61, gasket],
      ['upper-gasket', 1.12, 0.08, 3.3, gasket],
      ['upper-crown', 1.25, 0.18, 3.42, mainCeramic],
      ['overhead-feed-neck', 0.18, 0.34, 3.68, structuralSteel],
    ] as const) {
      this.pod.add(createBorrowedCylinder(this.resources, { name: `title-pod-${name}`,
        size: [radius, height, radius], position: [0, y, 0], material }));
    }
    const glassGeometry = new THREE.CylinderGeometry(1.08, 1.08, 1.61, 64, 1, true);
    this.uniqueGeometries.add(glassGeometry);
    const glass = new THREE.Mesh(glassGeometry, containmentGlass);
    glass.name = 'title-pod-curved-glass'; glass.position.y = 2.455; this.pod.add(glass);
    for (const [name, radius, y, material] of [
      ['lower-seal-light', 1.09, 1.655, staticCyanEmissive],
      ['upper-seal-light', 1.09, 3.26, staticCyanEmissive],
      ['deck-edge', 1.34, 1.52, graphite],
      ['crown-edge', 1.24, 3.48, graphite],
    ] as const) {
      const ring = new THREE.Mesh(this.ringGeometry, material);
      ring.name = `title-pod-${name}`; ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(radius); ring.position.y = y; this.pod.add(ring);
    }
    for (let index = 0; index < 4; index++) {
      const angle = Math.PI / 4 + index * Math.PI / 2;
      const support = createBorrowedCylinder(this.resources, { name: `title-pod-stanchion-${index}`,
        size: [0.026, 1.62, 0.026], position: [Math.sin(angle) * 1.085, 2.46, Math.cos(angle) * 1.085],
        material: structuralSteel });
      // These hairline casters produce a distracting stripe across the egg.
      // Keep their visible geometry and all other room/egg shadows intact.
      support.userData.titleShadowlessSupport = true;
      this.pod.add(support);
    }
    this.buildSpecimenLabel();
    this.scene.add(this.pod);

    // A closed, slightly tapered shell, not a hatch or a character placeholder.
    const eggGeometry = this.resources.geometries.unitSphere.clone();
    this.uniqueGeometries.add(eggGeometry);
    const positions = eggGeometry.getAttribute('position');
    const normals = eggGeometry.getAttribute('normal'), normal = new THREE.Vector3();
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
      const taper = 1 - y * 0.25;
      positions.setX(index, x * taper);
      positions.setZ(index, z * taper);
      // Analytic normal of the tapered sphere. Re-averaging indexed triangles
      // treats duplicated UV-seam/pole vertices separately, creating hard bands.
      normal.set(x, y * taper + 0.25 * (x * x + z * z), z).normalize();
      normals.setXYZ(index, normal.x, normal.y, normal.z);
    }
    positions.needsUpdate = true; normals.needsUpdate = true;
    eggGeometry.computeBoundingBox(); eggGeometry.computeBoundingSphere();
    const shell = new THREE.Mesh(eggGeometry, specimenShell);
    shell.name = 'title-intact-egg'; this.eggRoot.name = 'title-egg-root';
    this.eggRoot.position.copy(this.target); this.eggRoot.scale.set(0.9, 1.12, 0.9);
    this.eggRoot.add(shell); this.scene.add(this.eggRoot);
    return shell;
  }

  private buildSpecimenLabel(): void {
    const texture = createContainmentSpecimenLabelTexture('Bob', 'Unknown');
    this.uniqueTextures.add(texture);
    const material = new THREE.MeshStandardMaterial({ name: 'title-specimen-label-material',
      map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.28,
      roughness: 0.5, metalness: 0.08 });
    this.uniqueMaterials.add(material);
    // Replace the front indicator panel with a fixed plaque, flush with the pedestal.
    // No billboard rotation, DOM/canvas work, font fetch or texture updates.
    for (const [name, radius, height, arc, surface] of [
      ['frame', 1.25, 0.49, 1.08, this.resources.materials.graphite],
      ['label', 1.265, 0.45, 1, material],
    ] as const) {
      const geometry = new THREE.CylinderGeometry(radius, radius, height, 32, 1, true, -arc / 2, arc);
      this.uniqueGeometries.add(geometry);
      const uv = geometry.getAttribute('uv');
      for (let index = 0; index < uv.count; index++) uv.setY(index, 1 - uv.getY(index));
      uv.needsUpdate = true;
      const plate = new THREE.Mesh(geometry, surface);
      plate.name = `title-pod-specimen-${name}`;
      plate.position.y = 1.05;
      this.pod.add(plate);
    }
  }
}
