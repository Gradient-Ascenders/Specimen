import * as THREE from 'three';
import type { GreyboxRoomBuilder } from '../../../levels/GreyboxRoomBuilder.ts';

/** Original, deterministic facility finishes. One owner for Room 1 and its passage. */
export class CultivationLabMaterials {
  readonly textures: THREE.DataTexture[] = [];
  readonly wall = this.finish('wall', 0xe2e1d8, 0.76, 0.02);
  readonly floor = this.finish('floor', 0xaeb7b2, 0.84, 0.08);
  readonly ceiling = this.finish('ceiling', 0xcbd0ca, 0.8, 0.06);
  readonly metal = this.finish('metal', 0x465156, 0.68, 0.72);
  readonly duct = this.finish('duct', 0x879391, 0.65, 0.7);
  readonly platform = this.variant(this.floor, 'platform', 0xd6a928);
  readonly rope = this.variant(this.metal, 'soluble-rope', 0x744522);
  readonly fixture = new THREE.MeshStandardMaterial({
    name: 'cultivation-lab-neutral-fixture', color: 0xf3f2e9,
    emissive: 0xf4f2e5, emissiveIntensity: 0.72, roughness: 0.38,
  });
  private readonly bindings: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; geometry: THREE.BufferGeometry }[] = [];
  private readonly decorations: THREE.Object3D[] = [];
  private disposed = false;

  constructor() {
    this.platform.emissive.setHex(0x443300);
    this.platform.emissiveIntensity = 0.28;
    this.rope.metalness = 0;
    this.rope.roughness = 0.9;
    this.rope.emissive.setHex(0x211006);
    this.rope.emissiveIntensity = 0.28;
  }

  /** Material identity is an explicit authoring reference, never a gameplay rule. */
  dress(builder: GreyboxRoomBuilder): void {
    const source = builder.materials;
    builder.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BoxGeometry)) return;
      let material: THREE.MeshStandardMaterial | undefined;
      if (object.material === source.wall) {
        material = object.name.includes('ceiling') ? this.ceiling : this.wall;
      } else if (object.material === source.floor) material = this.floor;
      else if (object.material === source.support) material = this.metal;
      else if (object.material === source.duct) material = this.duct;
      else if (object.material === source.platform) material = this.platform;
      else if (object.material === source.wood) material = this.rope;
      // Explicit door art parts; status indicators remain owned by the door.
      else if (object.name.endsWith('-shutter-panel')) material = this.duct;
      else if (/-frame-(top|left|right)$/.test(object.name)) material = this.metal;
      if (material) this.bind(object, material);
    });
  }

  /** Own presentation geometry copies; collider vertices are never changed. */
  private bind(mesh: THREE.Mesh, material: THREE.MeshStandardMaterial): void {
    this.bindings.push({ mesh, material: mesh.material, geometry: mesh.geometry });
    mesh.geometry = mesh.geometry.clone();
    const positions = mesh.geometry.getAttribute('position');
    const normals = mesh.geometry.getAttribute('normal');
    const uv = mesh.geometry.getAttribute('uv');
    // Doorway walls and the original trim share x/y opening planes. Give only
    // the non-colliding trim a 15 mm reveal into the opening. Lower the jamb
    // tops to meet the header, avoiding coplanar overlap between trim pieces.
    const framePart = mesh.name.match(/-frame-(top|left|right)$/)?.[1];
    if (framePart) {
      const clearance = 0.015;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        if (framePart === 'left' && x > 0) positions.setX(i, x + clearance);
        if (framePart === 'right' && x < 0) positions.setX(i, x - clearance);
        if ((framePart === 'top' && y < 0) || (framePart !== 'top' && y > 0)) {
          positions.setY(i, y - clearance);
        }
      }
      positions.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
    const panelWidth = material === this.wall ? 4 : material === this.rope ? 0.5 : 2;
    const panelHeight = material === this.wall ? 3 : material === this.rope ? 0.5 : 2;
    for (let i = 0; i < uv.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
      // Offset static panels into their authored bay grid; moving parts use local UVs.
      const moving = material === this.platform || material === this.rope || mesh.userData.doorId;
      const px = x + (moving ? 0 : mesh.position.x);
      const py = y + (moving ? 0 : mesh.position.y);
      const pz = z + (moving ? 0 : mesh.position.z);
      uv.setXY(i, (Math.abs(nx) > 0.5 ? -nx * pz : Math.abs(ny) > 0.5 ? px : nz * px) / panelWidth,
        (Math.abs(ny) > 0.5 ? -ny * pz : py) / panelHeight);
    }
    uv.needsUpdate = true;
    mesh.material = material;
  }

  addFixtures(root: THREE.Group, width: number, height: number, length: number, ceilingOpening?: readonly [number, number, number, number]): void {
    const group = new THREE.Group();
    group.name = 'cultivation-lab-presentation';
    group.userData.presentationOnly = true;
    const transforms: THREE.Matrix4[] = [];
    for (let z = 5; z < length; z += 8) {
      for (const x of [-width * 0.28, width * 0.28]) {
        if (ceilingOpening && x + 0.12 > ceilingOpening[0] && x - 0.12 < ceilingOpening[1] &&
          z + 1.4 > ceilingOpening[2] && z - 1.4 < ceilingOpening[3]) continue;
        transforms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, height - 0.24, z),
          new THREE.Quaternion(), new THREE.Vector3(0.24, 0.06, 2.8)));
      }
    }
    // Wall-mounted luminaires carry the same quiet fluorescent family as Level 1.
    for (let z = 5; z < length; z += 8) {
      for (const side of [-1, 1]) {
        transforms.push(new THREE.Matrix4().compose(new THREE.Vector3(side * (width / 2 - 0.23), 4, z),
          new THREE.Quaternion(), new THREE.Vector3(0.06, 0.16, 2.4)));
      }
    }
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const strips = new THREE.InstancedMesh(geometry, this.fixture, transforms.length);
    strips.name = 'cultivation-neutral-ceiling-strips';
    transforms.forEach((matrix, index) => strips.setMatrixAt(index, matrix));
    strips.computeBoundingSphere();
    group.add(strips);
    const trim: THREE.Matrix4[] = [];
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      trim.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
    };
    for (const side of [-1, 1]) {
      const x = side * (width / 2 - 0.19);
      box(x, 0.55, length / 2, 0.06, 0.35, length - 0.6);
      box(x, 4, length / 2, 0.04, 0.32, length - 0.6);
      for (let z = 2; z < length - 1; z += 8) box(x, height / 2, z, 0.07, height - 0.5, 0.14);
    }
    const frames = new THREE.InstancedMesh(geometry, this.metal, trim.length);
    frames.name = 'cultivation-service-bay-trims';
    trim.forEach((matrix, i) => frames.setMatrixAt(i, matrix));
    frames.computeBoundingSphere();
    group.add(frames);
    if (height > 10) {
      // Broad local light pools neutralize the old green fill without changing the renderer.
      for (const z of [10, 38]) {
        const light = new THREE.PointLight(0xf3f2e9, 480, 48, 2);
        light.name = 'cultivation-room-one-neutral-fill';
        light.position.set(0, 10, z);
        group.add(light);
      }
    }
    root.add(group);
    this.decorations.push(group);
  }

  get diagnostics() {
    return { materialCount: 8, textureCount: this.textures.length,
      textureBytes: this.textures.reduce((sum, texture) => sum + (texture.image.data?.byteLength ?? 0), 0),
      dressedMeshCount: this.bindings.length, addedDrawCalls: this.decorations.length * 2 };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { mesh, material, geometry } of this.bindings) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      mesh.material = material;
    }
    this.bindings.length = 0;
    const decorationGeometries = new Set<THREE.BufferGeometry>();
    for (const group of this.decorations) {
      group.removeFromParent();
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) decorationGeometries.add(object.geometry);
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
    }
    for (const geometry of decorationGeometries) geometry.dispose();
    this.decorations.length = 0;
    for (const material of [this.wall, this.floor, this.ceiling, this.metal, this.duct, this.platform, this.rope, this.fixture]) material.dispose();
    for (const texture of this.textures) texture.dispose();
  }

  private variant(source: THREE.MeshStandardMaterial, name: string, colour: number) {
    const material = source.clone();
    material.name = `cultivation-lab-${name}`;
    material.color.setHex(colour);
    return material;
  }

  private finish(kind: 'wall' | 'floor' | 'ceiling' | 'metal' | 'duct', colour: number, roughness: number, metalness: number) {
    const size = kind === 'metal' || kind === 'duct' ? 256 : 512;
    const albedo = new Uint8Array(size * size * 4);
    const relief = new Uint8Array(size * size * 4);
    const rough = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const noise = (((Math.imul(x + 37, 374761393) ^ Math.imul(y + 91, 668265263)) >>> 0) % 997) / 997;
      const metal = kind === 'metal' || kind === 'duct';
      const ductRow = (v * 4) % 1;
      const seam = edge < (metal ? 0.004 : 0.006) ||
        (kind === 'duct' && Math.min(ductRow, 1 - ductRow) < 0.008);
      const rim = edge < 0.013;
      const grime = Math.exp(-edge * 90) * (3 + noise * 5);
      const scratch = !seam && y % 71 === 19 && x % 113 > 25 && x % 113 < 68 ? 7 : 0;
      const brush = metal ? Math.sin(v * Math.PI * 128) * 3 : 0;
      // Ceiling service recess and duct seams are baked, avoiding extra geometry.
      const service = kind === 'ceiling' && u > 0.82 && u < 0.94;
      const louvre = service && Math.floor(v * 28) % 2 === 0;
      const screw = Math.hypot(Math.min(Math.abs(u - 0.035), Math.abs(u - 0.965)),
        Math.min(Math.abs(v - 0.035), Math.abs(v - 0.965))) < 0.004;
      const value = screw ? 120 : seam ? 65 : service ? (louvre ? 103 : 143) : (rim ? 222 : 249) - grime + (noise - 0.5) * 3 + brush - scratch;
      const i = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        albedo[i + channel] = value;
        relief[i + channel] = seam || louvre ? 85 : 180 + (noise - 0.5) * 5 - scratch;
        rough[i + channel] = seam ? 245 : 215 + noise * 25 + Math.min(grime, 10);
      }
      // Tiny warm deposits around exposed metal joints, not widespread rust.
      if (metal && rim && !seam) albedo[i + 2] -= 5;
      albedo[i + 3] = relief[i + 3] = rough[i + 3] = 255;
    }
    const texture = (suffix: string, pixels: Uint8Array, colourMap = false) => {
      const map = new THREE.DataTexture(pixels, size, size);
      map.name = `cultivation-lab-${kind}-${suffix}`;
      map.colorSpace = colourMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.magFilter = THREE.LinearFilter;
      map.minFilter = THREE.LinearMipmapLinearFilter;
      map.generateMipmaps = true;
      map.anisotropy = 4;
      map.needsUpdate = true;
      this.textures.push(map);
      return map;
    };
    return new THREE.MeshStandardMaterial({ name: `cultivation-lab-${kind}`, color: colour,
      roughness, metalness, map: texture('albedo', albedo, true),
      bumpMap: texture('relief', relief), bumpScale: 0.018,
      roughnessMap: texture('roughness', rough) });
  }
}
