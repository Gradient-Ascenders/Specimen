import * as THREE from 'three';

export interface CharacterDetailIndices {
  readonly name: string;
  readonly vertices: number;
  readonly indices: Uint16Array;
}

export function readCharacterDetail(bytes: ArrayBuffer): readonly CharacterDetailIndices[] {
  const data = new Uint8Array(bytes), view = new DataView(bytes);
  if (data.length < 12 || new TextDecoder().decode(data.subarray(0, 8)) !== 'SLOD0001') throw new Error('Invalid character detail header');
  const length = view.getUint32(8, true);
  if (length > data.length - 12) throw new Error('Truncated character detail metadata');
  const metadata = JSON.parse(new TextDecoder().decode(data.subarray(12, 12 + length)));
  if (!Array.isArray(metadata.meshes) || !metadata.meshes.length || metadata.meshes.length > 16) throw new Error('Invalid character detail meshes');
  const names = new Set<string>();
  let offset = 12 + length;
  const result = metadata.meshes.map((mesh: { name: string; vertices: number; indices: number }) => {
    if (typeof mesh.name !== 'string' || names.has(mesh.name) || !Number.isSafeInteger(mesh.vertices) || mesh.vertices <= 0 || mesh.vertices > 65536 ||
        !Number.isSafeInteger(mesh.indices) || mesh.indices <= 0 || mesh.indices % 3 || mesh.indices * 2 > data.length - offset) throw new Error('Invalid character detail mesh');
    names.add(mesh.name);
    // The JSON header need not be aligned. Read explicitly as little endian.
    const indices = new Uint16Array(mesh.indices);
    for (let i = 0; i < indices.length; i++) {
      indices[i] = view.getUint16(offset + i * 2, true);
      if (indices[i] >= mesh.vertices) throw new Error('Character detail index out of bounds');
    }
    offset += indices.byteLength;
    return { name: mesh.name, vertices: mesh.vertices, indices };
  });
  if (offset !== data.length) throw new Error('Unexpected character detail payload');
  return result;
}

export async function loadCharacterDetail(url: string): Promise<readonly CharacterDetailIndices[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Character detail ${url}: HTTP ${response.status}`);
  return readCharacterDetail(await response.arrayBuffer());
}

/** Index-only LOD shares the original geometry and vertex/morph streams. Hysteresis uses
 * projected size, so narrow FOVs keep detail longer. Collision is never touched. */
export class CharacterDetail {
  private readonly entries: Array<{ geometry: THREE.BufferGeometry; fullCount: number; distantCount: number }> = [];
  private distant = false;
  private readonly centre = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly anchor: THREE.Object3D;
  private radius = 0;

  constructor(anchor: THREE.Object3D, meshes: readonly THREE.Mesh[], indices: readonly CharacterDetailIndices[]) {
    this.anchor = anchor;
    // Validate the whole bank before taking ownership of any geometry.
    if (indices.length !== meshes.length || meshes.some(mesh => {
      const record = indices.find(record => record.name === mesh.name);
      return !record || !mesh.geometry.index || record.vertices !== mesh.geometry.getAttribute('position').count;
    })) throw new Error('Character detail does not match its source geometry');
    for (const mesh of meshes) {
      const geometry = mesh.geometry, full = geometry.index!;
      const distant = indices.find(record => record.name === mesh.name)!.indices;
      const bank = new Uint16Array(full.count + distant.length);
      for (let i = 0; i < full.count; i++) bank[i] = full.getX(i);
      bank.set(distant, full.count);
      // One immutable index upload; only drawRange changes on transitions.
      // Reusing the geometry also avoids Three allocating a second Volt morph
      // texture array, which is cached by geometry rather than by attribute.
      geometry.setIndex(new THREE.BufferAttribute(bank, 1));
      geometry.setDrawRange(0, full.count);
      this.radius = Math.max(this.radius, geometry.boundingSphere?.radius ?? 1.5);
      this.entries.push({ geometry, fullCount: full.count, distantCount: distant.length });
    }
  }

  get diagnostics() {
    return { level: this.distant ? 'distant' : 'full',
      triangles: this.entries.reduce((sum, entry) => sum + entry.geometry.drawRange.count / 3, 0) };
  }

  update(camera: THREE.Camera): void {
    this.anchor.getWorldPosition(this.centre);
    camera.getWorldPosition(this.eye);
    const projectedDiameter = this.radius * camera.projectionMatrix.elements[5] /
      Math.max(0.001, this.centre.distanceTo(this.eye) - this.radius);
    const distant = camera instanceof THREE.PerspectiveCamera && projectedDiameter < (this.distant ? 0.125 : 0.1);
    if (distant === this.distant) return;
    this.distant = distant;
    for (const entry of this.entries) entry.geometry.setDrawRange(distant ? entry.fullCount : 0, distant ? entry.distantCount : entry.fullCount);
  }

  dispose(): void {
    // The asset owner releases the single geometry/index bank, including when
    // disposed while distant. No inactive index buffer can be orphaned.
    for (const entry of this.entries) entry.geometry.setDrawRange(0, entry.fullCount);
    this.entries.length = 0;
  }
}
