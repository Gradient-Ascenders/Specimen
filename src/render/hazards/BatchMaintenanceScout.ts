import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { optimizeFiniteLightEvaluation } from '../environment/cultivation/FiniteLightEvaluation.ts';

/** Local-space wear stays attached to the moving armour and shared machinery batches. */
function weatherScout(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vScoutSurface;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvScoutSurface = position;');
    shader.fragmentShader = `varying vec3 vScoutSurface;
      float scoutHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float scoutNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(scoutHash(i), scoutHash(i+vec3(1,0,0)), f.x),
          mix(scoutHash(i+vec3(0,1,0)), scoutHash(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(scoutHash(i+vec3(0,0,1)), scoutHash(i+vec3(1,0,1)), f.x),
          mix(scoutHash(i+vec3(0,1,1)), scoutHash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float deposits = smoothstep(.48, .78, scoutNoise(vScoutSurface * 6.0));
      float chips = smoothstep(.72, .85, scoutNoise(vScoutSurface * 65.0)) * (.25 + deposits);
      float scuffs = smoothstep(.66, .82, scoutNoise(vScoutSurface * vec3(5.0, 110.0, 23.0)));
      diffuseColor.rgb *= mix(vec3(1.0), vec3(.46, .34, .23), deposits * .6);
      diffuseColor.rgb *= 1.0 - chips * .68 - scuffs * .32;
    `);
  };
  material.customProgramCacheKey = () => 'room-5-armoured-scout-wear-v1';
}

/** Rebuild only the patrol presentation; the sewer wreck keeps its original shell. */
function dressScout(body: THREE.Mesh, eye: THREE.Mesh): void {
  const machinery = body.children.filter((o): o is THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> =>
    o instanceof THREE.Mesh && o !== eye && o.material instanceof THREE.MeshStandardMaterial);
  const dark = machinery[0].material;
  const worn = machinery.find(o => o.material !== dark)!.material;
  for (const part of machinery) { part.removeFromParent(); part.geometry.dispose(); }
  dark.color.setHex(0x20282b); dark.roughness = .8;
  worn.color.setHex(0xa49b84); worn.roughness = .9; worn.metalness = .4;

  // Chamfered ceramic armour replaces the rounded saucer. Its compact shoulders
  // leave the two enclosed lift fans distinct at gameplay distance.
  const outline = new THREE.Shape();
  outline.moveTo(-.82, .4); outline.lineTo(.82, .4);
  outline.lineTo(1.04, .18); outline.lineTo(.98, -.22);
  outline.lineTo(.70, -.36); outline.lineTo(-.70, -.36);
  outline.lineTo(-.98, -.22); outline.lineTo(-1.04, .18); outline.closePath();
  const hull = new THREE.ExtrudeGeometry(outline, { depth: 1.45, bevelEnabled: true,
    bevelSegments: 1, steps: 1, bevelSize: .055, bevelThickness: .055 }).translate(0, 0, -.72);
  body.geometry.dispose(); body.geometry = hull;
  const positions = hull.getAttribute('position'), colours = new Float32Array(positions.count * 3);
  const paint = new THREE.Color(0xbabbb0), oxide = new THREE.Color(0x735039), steel = new THREE.Color(0x394347);
  const colour = new THREE.Color(), caution = new THREE.Color(0xa78a38);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const patch = Math.sin(x * 17 + Math.sin(z * 9)) * Math.cos(z * 23 + y * 31);
    const edge = THREE.MathUtils.smoothstep(Math.abs(x), .80, 1.07);
    colour.copy(paint).lerp(steel, y < -.18 ? .75 : edge * .32);
    // A faded service stripe and irregular exposed edges, not an all-over rust coat.
    if (x > .43 && x < .85) colour.lerp(caution, .72);
    colour.lerp(oxide, THREE.MathUtils.smoothstep(patch, .30, .87) * (.18 + edge * .7));
    colour.toArray(colours, i * 3);
  }
  hull.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => body.add(new THREE.Mesh(geometry, material));
  const box = (x: number, y: number, z: number, atX: number, atY: number, atZ: number, material: THREE.Material) =>
    add(new THREE.BoxGeometry(x, y, z).translate(atX, atY, atZ), material);
  box(1.3, .2, 1.05, 0, -.43, .12, dark);
  // Recessed monocular scanner: the original live eye still owns network status.
  eye.scale.set(1, .72, .55);
  add(new THREE.CylinderGeometry(.29, .33, .32, 12).rotateX(Math.PI / 2).translate(0, .05, -.99), dark);
  add(new THREE.TorusGeometry(.255, .035, 6, 16).translate(0, .05, -1.17), worn);
  box(.76, .12, .39, 0, .35, -.91, dark);
  // Small shoulder markers share the eye material, so disabling a network dims
  // every status surface together without adding lights or per-frame updates.
  for (const side of [-1, 1]) {
    box(.25, .065, .04, side * .65, .19, -.925, eye.material as THREE.Material);
    box(.40, .16, .14, side * .65, .18, -.82, dark);
    box(.62, .20, .32, side * 1.18, -.10, .1, dark);
    const atX = side * 1.62;
    add(new THREE.CylinderGeometry(.60, .65, .45, 20, 1, true).translate(atX, -.03, .1), worn);
    add(new THREE.TorusGeometry(.60, .055, 6, 20).rotateX(Math.PI / 2).translate(atX, .225, .1), dark);
    add(new THREE.TorusGeometry(.65, .04, 6, 20).rotateX(Math.PI / 2).translate(atX, -.285, .1), dark);
    add(new THREE.CylinderGeometry(.17, .22, .30, 12).translate(atX, .015, .1), dark);
    // Raised, separated blade layers and open ducts expose convincing machinery.
    for (const [angle, y] of [[.3, .215], [Math.PI / 2 + .3, .30]])
      add(new THREE.BoxGeometry(1.05, .045, .11).rotateY(angle).translate(atX, y, .1), dark);
    add(new THREE.CylinderGeometry(.12, .16, .075, 10).translate(atX, .37, .1), worn);
    for (const z of [-.34, .54]) {
      box(.16, .09, .13, atX, .40, z, worn);
      add(new THREE.CylinderGeometry(.035, .035, .035, 6).translate(atX, .48, z), dark);
    }
    // Short recessed weapon ports stay inside the former barrel envelope.
    add(new THREE.CylinderGeometry(.12, .16, .46, 10).rotateX(Math.PI / 2)
      .translate(side * .56, -.25, -.96), dark);
    add(new THREE.TorusGeometry(.12, .025, 5, 10).translate(side * .56, -.25, -1.21), worn);
    box(.12, .19, .83, side * .70, -.61, .16, worn);
    box(.17, .075, 1.03, side * .70, -.735, .12, dark);
  }
  // A raised heat exchanger and offset receiver provide a recognisable rear.
  box(.78, .055, .64, 0, .51, .24, dark);
  for (let i = 0; i < 5; i++) box(.62, .055, .045, 0, .59, -.01 + i * .125, worn);
  box(.24, .40, .22, .58, .62, .48, dark);
  box(.29, .08, .27, .58, .88, .48, worn);
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
  const finished = new Set<THREE.MeshStandardMaterial>();
  body.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    if (finished.has(object.material)) return;
    finished.add(object.material);
    if (surfaceMaps) {
      object.material.bumpMap = surfaceMaps.bumpMap;
      object.material.roughnessMap = surfaceMaps.roughnessMap;
      object.material.bumpScale = .004;
    }
    weatherScout(object.material);
    optimizeFiniteLightEvaluation(object.material);
  });
}
