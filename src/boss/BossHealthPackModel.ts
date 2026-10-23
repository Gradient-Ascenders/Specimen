import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

interface HealthPackPart {
  readonly name: string;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly beacon?: boolean;
}

/** A reusable hard-shell medical case. Coordinates are relative to the existing
 * pickup anchor: its feet sit 0.5m below it, matching the unchanged drop sweep.
 * All drops share six material batches, including the subtle location beacon. */
export function createBossHealthPackModel(): readonly HealthPackPart[] {
  const shell = new THREE.MeshStandardMaterial({ color: 0xdce8df, roughness: .58, metalness: .18 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x24383a, roughness: .55, metalness: .65 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101c1e, roughness: .88, metalness: .03 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x849b9d, roughness: .34, metalness: .82 });
  const medical = new THREE.MeshStandardMaterial({ color: 0x41d99a, emissive: 0x21e693, emissiveIntensity: .75, roughness: .42, metalness: .1 });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x69efb5, transparent: true, opacity: .26, depthWrite: false, toneMapped: false });
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (g: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    g.translate(x, y, z);
    if (g.index) { const flat = g.toNonIndexed(); g.dispose(); g = flat; }
    const list = batches.get(material) ?? []; list.push(g); batches.set(material, list);
  };
  const box = (size: [number, number, number], at: [number, number, number], material: THREE.Material, radius = .035) => {
    add(new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(v => v * .25))), material, ...at);
  };

  // A dark structural tub, an exposed lid joint, and two ceramic-painted shells.
  box([1.28, .59, .96], [0, -.175, 0], frame, .075);
  box([1.34, .12, 1.04], [0, -.44, 0], rubber, .045);
  box([1.23, .28, .925], [0, -.215, 0], shell, .06);
  box([1.3, .18, 1], [0, .08, 0], shell, .065);
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    box([.12, .30, .13], [side * .605, -.23, end * .44], rubber, .018);
    // Shallow perimeter fasteners terminate inside the lid, rather than float.
    const screw = new THREE.CylinderGeometry(.027, .027, .019, 8);
    add(screw, steel, side * .5, .173, end * .34);
  }

  // The medical cross is one continuous extrusion, with an inset dark badge.
  box([.72, .032, .65], [0, .185, -.035], frame, .045);
  const plus = (size: number, depth: number) => {
    const r = size / 2, w = size * .145;
    const outline = [[-w, -r], [w, -r], [w, -w], [r, -w], [r, w], [w, w], [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w]];
    const shape = new THREE.Shape(); outline.forEach(([x, y], i) => { if (i) shape.lineTo(x!, y!); else shape.moveTo(x!, y!); }); shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 1, steps: 1 });
  };
  const topCross = plus(.48, .007); topCross.rotateX(-Math.PI / 2);
  add(topCross, medical, 0, .203, -.035);
  // A second, smaller symbol reads when the pack is seen from floor level.
  box([.31, .23, .024], [0, -.20, -.474], frame, .025);
  const frontCross = plus(.155, .007); frontCross.rotateY(Math.PI);
  add(frontCross, medical, 0, -.2, -.489);

  // Low-profile folded handle and metal catches give the case a real purpose.
  for (const side of [-1, 1]) {
    box([.12, .06, .105], [side * .29, .19, .37], steel, .018);
    box([.13, .2, .045], [side * .46, -.04, -.49], steel, .018);
    box([.07, .055, .012], [side * .46, .005, -.52], frame, .009);
    box([.025, .075, .29], [side * .645, -.19, 0], frame, .009);
    box([.012, .035, .18], [side * .66, -.19, 0], medical, .005);
  }
  box([.64, .065, .085], [0, .25, .37], rubber, .025);
  for (const end of [-1, 1]) box([.56, .09, .025], [0, -.24, end * .476], frame, .015);

  const names = ['shell', 'frame', 'bumper', 'hardware', 'medical-symbols'];
  const materialOrder = [shell, frame, rubber, steel, medical];
  const parts: HealthPackPart[] = materialOrder.map((material, i) => {
    const geometries = batches.get(material)!, geometry = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!geometry) throw new Error('Could not batch medical case geometry.');
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { name: `health-pack-${names[i]}`, geometry, material };
  });
  const halo = new THREE.TorusGeometry(.84, .012, 6, 64);
  halo.rotateX(-Math.PI / 2); halo.translate(0, -.455, 0);
  parts.push({ name: 'health-pack-location-beacon', geometry: halo, material: beacon, beacon: true });
  return parts;
}
