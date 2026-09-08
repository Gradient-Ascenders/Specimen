import * as THREE from 'three';

/** Damaged armoured scout with exposed machinery and broken rotor guards. */
export function createRustedSewerDrone(rusted = true): { body: THREE.Mesh; eye: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> } {
  const rust = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .96, metalness: .4, side: THREE.DoubleSide });
  const geometry = new THREE.SphereGeometry(1, 32, 20, rusted ? .2 : 0, Math.PI * (rusted ? 1.88 : 2)); geometry.scale(1.25, .62, 1);
  const positions = geometry.getAttribute('position'), colours = new Float32Array(positions.count * 3);
  const steel = new THREE.Color(0x343e3e), oxide = new THREE.Color(0x9d4823), colour = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const patch = Math.sin(positions.getX(i) * 13 + positions.getZ(i) * 9) * Math.cos(positions.getY(i) * 21);
    colour.copy(rusted ? steel : new THREE.Color(0x93a7ad)).lerp(oxide, rusted ? THREE.MathUtils.smoothstep(patch, -.5, .4) : 0); colour.toArray(colours, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const body = new THREE.Mesh(geometry, rust);
  const dark = new THREE.MeshStandardMaterial({ color: 0x192224, roughness: .72, metalness: .65 });
  const worn = new THREE.MeshStandardMaterial({ color: rusted ? 0x70503a : 0x4c626b, roughness: .88, metalness: .5 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); body.add(mesh); return mesh;
  };
  add(new THREE.SphereGeometry(.65, 16, 12), dark, 0, 0, 0);
  const eyeSocket = add(new THREE.CylinderGeometry(.28, .34, .25, 16), dark, 0, .05, -1);
  eyeSocket.rotation.x = Math.PI / 2;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0x41180a }));
  eye.position.set(0, .05, -1.18); body.add(eye);
  for (const side of [-1, 1]) {
    const firstPart = body.children.length;
    add(new THREE.BoxGeometry(1.1, .18, .32), worn, side * 1.2, .1, .15);
    const guard = add(new THREE.TorusGeometry(.64, .08, 8, 24, rusted && side < 0 ? Math.PI * 1.65 : Math.PI * 2), worn, side * 1.65, .12, .15);
    guard.rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(.18, .22, .22, 12), dark, side * 1.65, .08, .15);
    for (const angle of [0, Math.PI / 2]) {
      const blade = add(new THREE.BoxGeometry(1.05, .055, .13), dark, side * 1.65, .22, .15); blade.rotation.y = angle;
    }
    const barrel = add(new THREE.CylinderGeometry(.11, .14, .9, 10), worn, side * .55, -.25, -1);
    barrel.rotation.x = Math.PI / 2;
    const skid = add(new THREE.BoxGeometry(.12, .55, 1.1), worn, side * .85, -.5, .2); skid.rotation.z = side * .35;
    for (let i = firstPart; i < body.children.length; i++) body.children[i].userData.damageStage = side < 0 ? 1 : 2;
  }
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(.13, .08, .5), dark, -.4 + i * .2, .6, .2);
  const antenna = add(new THREE.CylinderGeometry(.025, .04, .65, 6), worn, .55, .65, .45); antenna.rotation.z = -.6;
  return { body, eye };
}
