import * as THREE from 'three';
import { ENDING_EXIT_Z } from './BossDefeatTimeline.ts';

const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const blend = (t: number) => t * t * (3 - 2 * t);
const noise = (x: number, z: number): number => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = blend(x - ix), fz = blend(z - iz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix + iz * 317), hash(ix + 1 + iz * 317), fx),
    THREE.MathUtils.lerp(hash(ix + (iz + 1) * 317), hash(ix + 1 + (iz + 1) * 317), fx), fz);
};
export function endingTerrainHeight(x: number, z: number): number {
  const localZ = z - ENDING_EXIT_Z;
  if (localZ >= 0) return -.22;
  const edge = Math.max(Math.abs(x) - 10, -localZ - 40, localZ - 3, 0);
  const fade = THREE.MathUtils.smoothstep(edge, 0, 26);
  const rolling = noise(x * .012, localZ * .012) * 13 + noise(x * .031, localZ * .031) * 3.5 + noise(x * .11, localZ * .11) * .4;
  const valley = THREE.MathUtils.smoothstep(Math.abs(x), 20, 150);
  const mountains = THREE.MathUtils.smoothstep(-localZ, 240, 660) * (25 + noise(x * .008, localZ * .008) * 65);
  return -.22 + fade * (rolling * (.28 + valley * .72) + mountains);
}

export class BossDefeatTerrain {
  readonly root = new THREE.Group();
  readonly ground: THREE.Mesh;
  readonly trees: THREE.InstancedMesh;
  readonly grass: THREE.InstancedMesh;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures: THREE.Texture[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  constructor() {
    this.root.name = 'ending-sculpted-meadow-and-woodland';
    const grain = new Uint8Array(96 * 96 * 4);
    for (let i = 0; i < 96 * 96; i++) { const n = 185 + hash(i) * 70;
      grain[i * 4] = n; grain[i * 4 + 1] = n; grain[i * 4 + 2] = n; grain[i * 4 + 3] = 255; }
    const map = new THREE.DataTexture(grain, 96, 96); map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter; map.generateMipmaps = true; map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4; map.needsUpdate = true; this.textures.push(map);
    const groundMaterial = this.material(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map, roughness: 1 }));
    const terrain = this.geometry(new THREE.PlaneGeometry(900, 850, 220, 208)); terrain.rotateX(-Math.PI / 2); terrain.translate(0, 0, ENDING_EXIT_Z - 425.05);
    const positions = terrain.getAttribute('position'), uv = terrain.getAttribute('uv'), colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), y = endingTerrainHeight(x, z); positions.setY(i, y);
      const slope = Math.abs(endingTerrainHeight(x + 1, z) - y) + Math.abs(endingTerrainHeight(x, z + 1) - y);
      const patch = noise(x * .09, z * .09), rock = THREE.MathUtils.smoothstep(slope, .8, 1.7);
      this.color.setHex(patch > .58 ? 0x8c9857 : patch < .28 ? 0x536c3d : 0x758b48).lerp(new THREE.Color(0x888b7c), rock);
      this.color.multiplyScalar(.84 + noise(x * .3, z * .3) * .24); this.color.toArray(colors, i * 3);
      uv.setXY(i, x / 9, z / 9);
    }
    terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3)); terrain.computeVertexNormals(); terrain.computeBoundingSphere();
    this.ground = new THREE.Mesh(terrain, groundMaterial); this.ground.name = 'contoured-exterior-ground'; this.ground.receiveShadow = true; this.root.add(this.ground);
    const bark = this.material(new THREE.MeshStandardMaterial({ color: 0x5b5744, roughness: 1, map }));
    const needles = this.material(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .95 }));
    const trunk = this.geometry(new THREE.CylinderGeometry(.14, .31, 1, 9, 3));
    const crown = this.geometry(this.makeCrown());
    this.trees = new THREE.InstancedMesh(crown, needles, 240); this.trees.name = 'layered-asymmetric-fir-canopies'; this.trees.castShadow = true;
    const trunks = new THREE.InstancedMesh(trunk, bark, 240); trunks.name = 'woodland-tree-trunks'; trunks.castShadow = true;
    const contacts = new THREE.InstancedMesh(this.geometry(new THREE.CircleGeometry(1, 16)), this.material(new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;gl_FragColor=vec4(.07,.12,.055,pow(max(0.,1.-r),2.)*.35);}' })), 240);
    for (let i = 0; i < 240; i++) {
      const side = i % 2 ? 1 : -1, distance = hash(i * 4.1 + 11);
      const z = ENDING_EXIT_Z - 23 - hash(i * 7.1) * 560;
      const x = side * (22 + distance * (70 + (-z + ENDING_EXIT_Z) * .35));
      const y = endingTerrainHeight(x, z), height = 7 + hash(i * 9.3) * 12, radius = 2 + hash(i * 3.7) * 2.6;
      this.dummy.position.set(x, y + height * .46, z); this.dummy.rotation.set(0, hash(i) * 6.28, (hash(i * 2) - .5) * .06);
      this.dummy.scale.set(radius * .65, height, radius * .65); this.dummy.updateMatrix(); trunks.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.y = y + height * .15; this.dummy.scale.set(radius, height, radius * (.75 + hash(i + 8) * .3)); this.dummy.updateMatrix(); this.trees.setMatrixAt(i, this.dummy.matrix);
      this.color.setHSL(.26 + hash(i + 2) * .07, .27 + hash(i + 3) * .18, .20 + hash(i + 5) * .12); this.trees.setColorAt(i, this.color);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.position.set(x, y + .035, z); this.dummy.scale.set(radius * 1.5, radius * 1.5, 1);
      this.dummy.updateMatrix(); contacts.setMatrixAt(i, this.dummy.matrix);
    }
    this.root.add(trunks, this.trees, contacts);
    const rockMaterial = this.material(new THREE.MeshStandardMaterial({ color: 0x949c8b, roughness: 1, map }));
    const rocks = new THREE.InstancedMesh(this.geometry(new THREE.IcosahedronGeometry(1, 1)), rockMaterial, 180); rocks.name = 'weathered-meadow-rocks'; rocks.castShadow = true;
    for (let i = 0; i < 180; i++) {
      const x = (i % 2 ? 1 : -1) * (11 + hash(i + 51) * 170), z = ENDING_EXIT_Z - 8 - hash(i * 2.3 + 1) * 290;
      const size = .2 + hash(i * 3.2) ** 3 * 3.8;
      this.dummy.position.set(x, endingTerrainHeight(x, z) + size * .2, z); this.dummy.rotation.set(hash(i) * 2, hash(i + 1) * 6, hash(i + 2));
      this.dummy.scale.set(size * 1.3, size * .7, size); this.dummy.updateMatrix(); rocks.setMatrixAt(i, this.dummy.matrix);
      this.color.setHSL(.15, .05 + hash(i * 3) * .1, .32 + hash(i * 7) * .22); rocks.setColorAt(i, this.color);
    }
    this.root.add(rocks);
    const blades = this.geometry(new THREE.BufferGeometry());
    blades.setAttribute('position', new THREE.Float32BufferAttribute([-.09,0,0,.08,0,0,.03,.8,.04, 0,0,-.09,0,0,.09,-.04,.62,.03, -.06,0,-.05,.06,0,.05,-.09,.5,.08], 3));
    blades.computeVertexNormals();
    this.grass = new THREE.InstancedMesh(blades, this.material(new THREE.MeshStandardMaterial({ color: 0xb3b667, roughness: 1, side: THREE.DoubleSide })), 9600);
    this.grass.name = 'meadow-grass-and-wild-seed-heads';
    for (let i = 0; i < 9600; i++) {
      const nearExit = i >= 8800;
      const x = (hash(i * 5.31) - .5) * (nearExit ? 16 : 290), z = ENDING_EXIT_Z - 3 - hash(i * 7.13) * (nearExit ? 36 : 220);
      const scale = nearExit ? .2 + hash(i * 4.12) * .3 : .35 + hash(i * 4.12) * .85;
      this.dummy.scale.set(scale, scale * (1 + hash(i * 6.3)), scale);
      this.dummy.position.set(x, endingTerrainHeight(x, z), z); this.dummy.rotation.set(0, hash(i + 7) * 6.28, 0); this.dummy.updateMatrix(); this.grass.setMatrixAt(i, this.dummy.matrix);
      this.color.setHSL(.18 + hash(i * 2.1) * .1, .28 + hash(i * 6.1) * .2, .27 + hash(i * 3.1) * .27); this.grass.setColorAt(i, this.color);
    }
    this.root.add(this.grass);
  }
  private makeCrown(): THREE.BufferGeometry {
    const vertices: number[] = [], colors: number[] = [], indices: number[] = [], sides = 14, levels = 24;
    for (let row = 0; row <= levels; row++) for (let j = 0; j <= sides; j++) {
      const y = row / levels, a = j / sides * Math.PI * 2;
      const layer = row % 3 === 0 ? 1 : row % 3 === 1 ? .53 : .75;
      const r = (1 - y) * layer * (.92 + Math.sin(j * 7.3 + row * 2.1) * .11);
      vertices.push(Math.sin(a) * r + y * y * .07, y * .86, Math.cos(a) * r);
      const light = .52 + y * .3 + (row % 3 === 0 ? .12 : 0); colors.push(light, light, light);
      if (row < levels && j < sides) { const n = row * (sides + 1) + j; indices.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
  }
  private geometry<G extends THREE.BufferGeometry>(g: G): G { this.geometries.add(g); return g; }
  private material<M extends THREE.Material>(m: M): M { this.materials.add(m); return m; }
  dispose(): void { this.root.removeFromParent(); this.root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose()); }
}
