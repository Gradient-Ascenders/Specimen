import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { optimizeFiniteLightEvaluation } from '../environment/cultivation/FiniteLightEvaluation.ts';

/** Retrofit the patrol shell within its existing rotor/skid envelope. */
function dressScout(body: THREE.Mesh, eye: THREE.Mesh): void {
  const machinery = body.children.filter((o): o is THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> =>
    o instanceof THREE.Mesh && o !== eye && o.material instanceof THREE.MeshStandardMaterial);
  const dark = machinery[0].material;
  const worn = machinery.find(o => o.material !== dark)!.material;
  for (const part of machinery) {
    // Seat the rotor hubs into the blade stack, clear of the arm's flat faces.
    if (part.geometry instanceof THREE.CylinderGeometry && part.geometry.parameters.radiusTop === .18)
      part.position.y = .135;
  }
  worn.color.setHex(0x887765); worn.roughness = .92;
  const positions = body.geometry.getAttribute('position'), colours = body.geometry.getAttribute('color');
  const paint = new THREE.Color(0x9caeaa), oxide = new THREE.Color(0x745039), steel = new THREE.Color(0x394847);
  const colour = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const patch = Math.sin(x * 11 + Math.sin(z * 7)) * Math.cos(z * 13 + y * 19);
    const seam = 1 - THREE.MathUtils.smoothstep(Math.abs(y + .12), .05, .24);
    colour.copy(paint).lerp(steel, seam * .75);
    colour.lerp(oxide, THREE.MathUtils.smoothstep(patch, .25, .85) * (.25 + seam * .65));
    colour.toArray(colours.array, i * 3);
  }
  colours.needsUpdate = true;
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => body.add(new THREE.Mesh(geometry, material));
  for (const side of [-1, 1]) {
    // Sloped cheek armour, with a thin inset service strip and hex fasteners.
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(side * .82, .37, -.26),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -side * .5), new THREE.Vector3(1, 1, 1));
    add(new THREE.BoxGeometry(.44, .09, .92).applyMatrix4(transform), worn);
    add(new THREE.BoxGeometry(.10, .025, .66).translate(0, .065, 0).applyMatrix4(transform), dark);
    for (const z of [-.34, .34]) add(new THREE.CylinderGeometry(.045, .045, .04, 6)
      .translate(side * .12, .075, z).applyMatrix4(transform), dark);
    // Arm collars read as replaceable motor assemblies without widening guards.
    add(new THREE.BoxGeometry(.15, .305, .43).translate(side * 1.37, .0875, .15), dark);
    for (const z of [-.005, .305]) add(new THREE.CylinderGeometry(.05, .05, .04, 6)
      .translate(side * 1.37, .26, z), worn);
    // Twin underbody intake guards sit inside the existing landing skids.
    add(new THREE.BoxGeometry(.28, .14, .57).translate(side * .43, -.58, .22), dark);
    for (let n = 0; n < 4; n++) add(new THREE.BoxGeometry(.24, .045, .045)
      .translate(side * .43, -.674, .02 + n * .13), worn);
  }
}

/** Merge the immutable flying scout detail; keep the animated eye and damaged scout separate. */
export function batchMaintenanceScout(body: THREE.Mesh, eye: THREE.Mesh,
  surfaceMaps?: { bumpMap: THREE.Texture | null; roughnessMap: THREE.Texture | null }): void {
  dressScout(body, eye);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of [...body.children]) {
    if (!(child instanceof THREE.Mesh) || child === eye || Array.isArray(child.material)) continue;
    child.updateMatrix();
    let geometry = child.geometry.clone();
    if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
    geometry.applyMatrix4(child.matrix);
    const list = parts.get(child.material) ?? []; list.push(geometry); parts.set(child.material, list);
    child.removeFromParent(); child.geometry.dispose();
  }
  for (const [material, geometries] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false)!, material);
    mesh.name = 'room-5-scout-batched-machinery'; body.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
  body.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    if (surfaceMaps) {
      object.material.bumpMap = surfaceMaps.bumpMap;
      object.material.roughnessMap = surfaceMaps.roughnessMap;
      object.material.bumpScale = .004;
    }
    optimizeFiniteLightEvaluation(object.material);
  });
}
