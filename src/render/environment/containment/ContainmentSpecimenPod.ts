import * as THREE from 'three';

import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import { createBorrowedCylinder, markVisualOnly } from './ContainmentModularComponents.ts';
import { createContainmentSpecimenLabelTexture } from './ContainmentProceduralTextures.ts';

export const SPECIMEN_POD_LID_RAISE_METRES = 1.85;
/** Rendering and the static post-hatch collision shell share these dimensions. */
export const SPECIMEN_POD_GLASS = Object.freeze({ radius: 1.08, height: 1.61, y: 2.455 });
export const SPECIMEN_POD_CROWN_SECTIONS = [
  { name: 'upper-gasket', radius: 1.12, height: 0.08, y: 3.3 },
  { name: 'upper-crown', radius: 1.25, height: 0.18, y: 3.42 },
] as const;
/** Shared by the visible solids and the small compound-box gameplay collider. */
export const SPECIMEN_POD_SOLID_SECTIONS = [
  { name: 'floor-mount', radius: 1.5, height: 0.16, y: 0.09 },
  { name: 'pedestal-shell', radius: 1.22, height: 1.24, y: 0.79 },
  { name: 'instrument-deck', radius: 1.35, height: 0.17, y: 1.49 },
  { name: 'lower-gasket', radius: 1.12, height: 0.08, y: 1.61 },
] as const;

/** The same round specimen container in the menu, opening and playable Room 1.
 * Parts may be reparented for animation; this owner still disposes only its
 * unique resources, never the materials/geometries borrowed from the room.
 */
export class ContainmentSpecimenPod {
  readonly pedestal = new THREE.Group();
  readonly chamber = new THREE.Group();
  readonly ceilingMount = new THREE.Group();

  private readonly piston: THREE.Mesh;
  private pistonTop: number;
  private ceilingY: number;
  private lidLift = 0;
  private readonly uniqueGeometries = new Set<THREE.BufferGeometry>();
  private readonly labelTexture = createContainmentSpecimenLabelTexture('Bob', 'Unknown');
  private readonly labelMaterial: THREE.MeshStandardMaterial;
  private disposed = false;

  constructor(
    resources: ContainmentArtResources,
    prefix: string,
    partNames: Readonly<Record<string, string>> = {},
    ceilingYMetres = 7,
  ) {
    this.ceilingY = ceilingYMetres;
    const name = (part: string) => partNames[part] ?? `${prefix}-${part}`;
    const { mainCeramic, graphite, serviceMetal, structuralSteel, gasket,
      staticCyanEmissive, containmentGlass } = resources.materials;
    this.pedestal.name = `${prefix}-pedestal`;
    this.chamber.name = `${prefix}-chamber`;
    this.ceilingMount.name = `${prefix}-ceiling-mount`;
    markVisualOnly(this.pedestal);
    markVisualOnly(this.chamber);
    markVisualOnly(this.ceilingMount);
    for (const [index, section] of SPECIMEN_POD_SOLID_SECTIONS.entries()) {
      this.pedestal.add(createBorrowedCylinder(resources, { name: name(section.name),
        size: [section.radius, section.height, section.radius], position: [0, section.y, 0],
        material: [graphite, mainCeramic, serviceMetal, gasket][index] }));
    }
    for (const [part, radius, height, y, material, parent] of [
      ['pedestal-service-belt', 1.235, 0.19, 0.61, structuralSteel, this.pedestal],
      ...SPECIMEN_POD_CROWN_SECTIONS.map((part, index) =>
        [part.name, part.radius, part.height, part.y, index === 0 ? gasket : mainCeramic, this.chamber] as const),
      ['overhead-feed-neck', 0.18, 0.34, 3.68, structuralSteel, this.chamber],
    ] as const) {
      parent.add(createBorrowedCylinder(resources, { name: name(part),
        size: [radius, height, radius], position: [0, y, 0], material }));
    }
    const glassGeometry = new THREE.CylinderGeometry(SPECIMEN_POD_GLASS.radius, SPECIMEN_POD_GLASS.radius,
      SPECIMEN_POD_GLASS.height, 64, 1, true);
    this.uniqueGeometries.add(glassGeometry);
    const glass = new THREE.Mesh(glassGeometry, containmentGlass);
    glass.name = name('curved-glass');
    glass.position.y = SPECIMEN_POD_GLASS.y;
    markVisualOnly(glass);
    this.chamber.add(glass);

    const ringGeometry = new THREE.TorusGeometry(1, 0.018, 8, 64);
    this.uniqueGeometries.add(ringGeometry);
    for (const [part, radius, y, material, parent] of [
      ['lower-seal-light', 1.09, 1.655, staticCyanEmissive, this.pedestal],
      ['upper-seal-light', 1.09, 3.26, staticCyanEmissive, this.chamber],
      ['deck-edge', 1.34, 1.52, graphite, this.pedestal],
      ['crown-edge', 1.24, 3.48, graphite, this.chamber],
    ] as const) {
      const ring = new THREE.Mesh(ringGeometry, material);
      ring.name = name(part);
      ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(radius);
      ring.position.y = y;
      markVisualOnly(ring);
      parent.add(ring);
    }
    for (let index = 0; index < 4; index++) {
      const angle = Math.PI / 4 + index * Math.PI / 2;
      const support = createBorrowedCylinder(resources, { name: name(`stanchion-${index}`),
        size: [0.026, 1.62, 0.026], position: [Math.sin(angle) * 1.085, 2.46, Math.cos(angle) * 1.085],
        material: structuralSteel });
      // Hairline bars should not stripe the shell with distracting shadows.
      support.userData.specimenPodShadowlessSupport = true;
      this.chamber.add(support);
    }

    // A fixed ceiling flange and sleeve hold a telescoping piston. Only the
    // exposed piston length changes as the glass/crown retracts; it never
    // becomes a floating cap or drives a ceiling plate through the roof.
    for (const [part, radius, height, y, material] of [
      ['ceiling-anchor', 0.64, 0.16, ceilingYMetres - 0.08, graphite],
      ['ceiling-anchor-face', 0.48, 0.08, ceilingYMetres - 0.2, mainCeramic],
      ['lift-motor-housing', 0.25, 0.4, ceilingYMetres - 0.4, structuralSteel],
      ['lift-fixed-sleeve', 0.145, 0.85, ceilingYMetres - 0.985, serviceMetal],
    ] as const) {
      this.ceilingMount.add(createBorrowedCylinder(resources, { name: name(part),
        size: [radius, height, radius], position: [0, y, 0], material }));
    }
    this.pistonTop = ceilingYMetres - 0.9;
    this.piston = createBorrowedCylinder(resources, { name: name('lift-piston'),
      size: [0.09, 1, 0.09], material: structuralSteel });
    this.ceilingMount.add(this.piston);
    this.setLidLift(0);

    this.labelMaterial = new THREE.MeshStandardMaterial({ name: `${prefix}-specimen-label-material`,
      map: this.labelTexture, emissiveMap: this.labelTexture, emissive: 0xffffff, emissiveIntensity: 0.28,
      roughness: 0.5, metalness: 0.08 });
    // Fixed curved plaque, not a billboard or a per-frame canvas upload.
    for (const [part, radius, height, arc, material] of [
      ['specimen-frame', 1.25, 0.49, 1.08, graphite],
      ['specimen-label', 1.265, 0.45, 1, this.labelMaterial],
    ] as const) {
      const geometry = new THREE.CylinderGeometry(radius, radius, height, 32, 1, true, -arc / 2, arc);
      this.uniqueGeometries.add(geometry);
      const uv = geometry.getAttribute('uv');
      for (let index = 0; index < uv.count; index++) uv.setY(index, 1 - uv.getY(index));
      uv.needsUpdate = true;
      const plate = new THREE.Mesh(geometry, material);
      plate.name = name(part);
      plate.position.y = 1.05;
      markVisualOnly(plate);
      this.pedestal.add(plate);
    }
  }

  setLidLift(metres: number): void {
    const lift = Number.isFinite(metres) ? THREE.MathUtils.clamp(metres, 0, SPECIMEN_POD_LID_RAISE_METRES) : 0;
    this.lidLift = lift;
    const bottom = 3.85 + lift; // Top of the crown's feed neck.
    this.piston.position.y = (bottom + this.pistonTop) / 2;
    this.piston.scale.y = this.pistonTop - bottom;
  }

  /** The menu and gameplay laboratory have different real ceiling heights. */
  setCeilingHeight(metres: number): void {
    if (!Number.isFinite(metres) || metres < 6.8 || metres === this.ceilingY) return;
    const offset = metres - this.ceilingY;
    for (const part of this.ceilingMount.children) if (part !== this.piston) part.position.y += offset;
    this.ceilingY = metres; this.pistonTop = metres - 0.9;
    this.setLidLift(this.lidLift);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of this.uniqueGeometries) geometry.dispose();
    this.uniqueGeometries.clear();
    this.labelMaterial.dispose();
    this.labelTexture.dispose();
  }
}
