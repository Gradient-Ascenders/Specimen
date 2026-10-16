import * as THREE from 'three';

import type { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import type { RoomOneEggState } from '../render/environment/containment/RoomOneArt.ts';

interface ShellFragment {
  readonly root: THREE.Group;
  readonly shell: THREE.Mesh;
  readonly cracks: THREE.Mesh;
  readonly crackCounts: readonly number[];
  readonly centre: THREE.Vector3;
  readonly destination: THREE.Vector3;
  readonly rotation: THREE.Euler;
  readonly clearanceDirection: THREE.Vector3;
  readonly separationDirection: THREE.Vector3;
  readonly separatedPosition: THREE.Vector3;
  readonly currentClearanceDirection: THREE.Vector3;
  clearanceActive: boolean;
}

export interface TrailerEggSeam {
  readonly a: THREE.Vector3;
  readonly b: THREE.Vector3;
  readonly owners: readonly [number, number];
  readonly stage: number;
}

const SEEDS = [
  [-0.32, 0.74, -0.59], [0.58, 0.64, -0.5], [-0.18, -0.79, -0.58],
  [-0.15, 0.35, 0.96], [-0.94, -0.11, 0.18], [0.92, -0.28, 0.29],
] as const;
const MOTIONS = [
  { offset: [-0.22, -0.14], rotation: [-0.5, -0.12, -0.58] },
  { offset: [0.28, -0.11], rotation: [0.28, 0.32, 0.65] },
  { offset: [0.04, -0.19], rotation: [-0.74, 0.12, 0.05] },
  { offset: [0.01, 0.06], rotation: [0.08, -0.08, 0.08] },
  { offset: [-0.09, 0.015], rotation: [0.08, 0.04, -0.18] },
  { offset: [0.1, 0.04], rotation: [-0.08, -0.06, 0.19] },
] as const;

/** Crack ribbons are built from the actual shared edges of the shell pieces. */
export class TrailerEggFracture {
  readonly root = new THREE.Group();
  readonly fragments: readonly ShellFragment[];
  readonly seams: readonly TrailerEggSeam[];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly crackMaterial: THREE.MeshStandardMaterial;
  private readonly clearanceCentre: THREE.Vector3;
  private readonly initialClearanceRadius: number;
  private readonly finalClearanceRadius: number;
  private readonly inverseRotation = new THREE.Quaternion();
  private readonly localDirection = new THREE.Vector3();
  private readonly localUp = new THREE.Vector3();
  private disposed = false;

  constructor(resources: ContainmentArtResources, clearance: {
    readonly centre: THREE.Vector3;
    readonly radius: number;
    readonly initialRadius: number;
    /** Borrow a specific shell silhouette, without taking ownership of it. */
    readonly surface?: THREE.BufferGeometry;
  }) {
    this.root.name = 'trailer-fractured-egg';
    this.crackMaterial = resources.materials.crack.clone();
    this.crackMaterial.name = 'trailer-egg-fracture-edge';
    this.crackMaterial.side = THREE.DoubleSide;
    this.clearanceCentre = clearance.centre.clone();
    this.initialClearanceRadius = clearance.initialRadius;
    this.finalClearanceRadius = clearance.radius;
    // A geodesic mesh gives irregular angled breaks rather than the obvious
    // horizontal/vertical staircase produced by latitude/longitude rings.
    const sphere = clearance.surface?.clone() ?? new THREE.IcosahedronGeometry(0.5, 18);
    const positions = sphere.getAttribute('position');
    const normals = sphere.getAttribute('normal');
    const uvs = sphere.getAttribute('uv');
    const indices = sphere.index;
    const indexCount = indices?.count ?? positions.count;
    const seeds = SEEDS.map(seed => new THREE.Vector3(...seed).normalize());
    const triangles: number[][] = seeds.map(() => []);
    const vertexKeys = new Map<string, number>();
    const canonical: number[] = [];
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const key = [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)]
        .map(value => Math.round(value * 1e6)).join(':');
      if (!vertexKeys.has(key)) vertexKeys.set(key, vertex);
      canonical.push(vertexKeys.get(key)!);
    }
    const edges = new Map<string, { owner: number; a: number; b: number }>();
    const seams: TrailerEggSeam[] = [];
    const centroid = new THREE.Vector3();
    for (let triangle = 0; triangle < indexCount; triangle += 3) {
      const corners = indices
        ? [indices.getX(triangle), indices.getX(triangle + 1), indices.getX(triangle + 2)]
        : [triangle, triangle + 1, triangle + 2];
      centroid.set(0, 0, 0);
      for (const vertex of corners) centroid.add(new THREE.Vector3().fromBufferAttribute(positions, vertex));
      centroid.normalize();
      let owner = 0;
      let bestScore = -Infinity;
      seeds.forEach((seed, index) => {
        const roughness = Math.sin(centroid.x * 31 + centroid.y * 17 + index * 1.53) *
          Math.sin(centroid.z * 29 + centroid.x * 7) * 0.018;
        const score = seed.dot(centroid) + roughness;
        if (score > bestScore) { owner = index; bestScore = score; }
      });
      triangles[owner].push(...corners);
      for (let edge = 0; edge < 3; edge += 1) {
        const a = canonical[corners[edge]], b = canonical[corners[(edge + 1) % 3]];
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        const previous = edges.get(key);
        if (!previous) edges.set(key, { owner, a, b });
        else if (previous.owner !== owner) {
          const owners = [previous.owner, owner].sort((left, right) => left - right) as [number, number];
          seams.push({
            a: new THREE.Vector3().fromBufferAttribute(positions, a),
            b: new THREE.Vector3().fromBufferAttribute(positions, b),
            owners,
            stage: owners[0] === 0 && owners[1] === 1 ? 1
              : owners[1] === 2 && owners[0] < 2 ? 2 : 3,
          });
        }
      }
    }
    this.seams = seams;
    this.fragments = triangles.map((vertices, owner) => {
      const centre = new THREE.Vector3();
      for (const vertex of vertices) centre.add(new THREE.Vector3().fromBufferAttribute(positions, vertex));
      centre.divideScalar(vertices.length);
      const data: number[] = [], normalData: number[] = [], uvData: number[] = [];
      const append = (vertex: number, inner: boolean): void => {
        const point = new THREE.Vector3().fromBufferAttribute(positions, vertex).multiplyScalar(inner ? 0.947 : 1);
        point.sub(centre);
        data.push(point.x, point.y, point.z);
        const sign = inner ? -1 : 1;
        normalData.push(normals.getX(vertex) * sign, normals.getY(vertex) * sign, normals.getZ(vertex) * sign);
        uvData.push(uvs.getX(vertex), uvs.getY(vertex));
      };
      for (const vertex of vertices) append(vertex, false);
      const outerCount = vertices.length;
      for (let triangle = 0; triangle < vertices.length; triangle += 3) {
        for (const corner of [2, 1, 0]) append(vertices[triangle + corner], true);
      }
      const ownSeams = seams.filter(seam => seam.owners.includes(owner));
      for (const seam of ownSeams) {
        const a = seam.a.clone(), b = seam.b.clone();
        const innerA = a.clone().multiplyScalar(0.947), innerB = b.clone().multiplyScalar(0.947);
        const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), innerA.clone().sub(a)).normalize();
        for (const point of [a, innerA, b, b, innerA, innerB]) {
          const local = point.clone().sub(centre);
          data.push(local.x, local.y, local.z);
          normalData.push(normal.x, normal.y, normal.z);
          uvData.push(0, 0);
        }
      }
      const geometry = this.own(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalData, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvData, 2));
      geometry.addGroup(0, outerCount, 0);
      geometry.addGroup(outerCount, outerCount, 1);
      geometry.addGroup(outerCount * 2, data.length / 3 - outerCount * 2, 2);
      const shell = new THREE.Mesh(geometry, [resources.materials.specimenShell,
        resources.materials.specimenShellInterior, this.crackMaterial]);
      shell.name = `trailer-egg-shell-fragment-${owner}`;

      const ribbon: number[] = [];
      const crackCounts: number[] = [0];
      for (let stage = 1; stage <= 3; stage += 1) {
        for (const seam of ownSeams.filter(edge => edge.stage === stage)) {
          const a = seam.a.clone().multiplyScalar(1.004), b = seam.b.clone().multiplyScalar(1.004);
          const middle = a.clone().add(b).multiplyScalar(0.5);
          const side = centre.clone().sub(middle).projectOnPlane(middle.clone().normalize()).normalize().multiplyScalar(0.0045);
          for (const point of [a, b, a.clone().add(side), b, b.clone().add(side), a.clone().add(side)]) {
            const local = point.clone().sub(centre);
            ribbon.push(local.x, local.y, local.z);
          }
        }
        crackCounts.push(ribbon.length / 3);
      }
      const crackGeometry = this.own(new THREE.BufferGeometry());
      crackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3));
      crackGeometry.computeVertexNormals();
      const cracks = new THREE.Mesh(crackGeometry, this.crackMaterial);
      cracks.name = `trailer-egg-fragment-${owner}-matching-cracks`;
      cracks.userData.trailerDetail = true;
      const root = new THREE.Group();
      root.name = `trailer-egg-piece-${owner}`;
      root.position.copy(centre);
      root.add(shell, cracks);
      this.root.add(root);
      const motion = MOTIONS[owner];
      const rotation = new THREE.Euler(...motion.rotation);
      const quaternion = new THREE.Quaternion().setFromEuler(rotation);
      const point = new THREE.Vector3();
      let lowestPoint = Infinity;
      for (let index = 0; index < data.length; index += 3) {
        point.set(data[index], data[index + 1], data[index + 2]).applyQuaternion(quaternion);
        lowestPoint = Math.min(lowestPoint, point.y);
      }
      // Settle each irregular piece onto the chamber floor, not in mid-air.
      const destination = new THREE.Vector3(centre.x + motion.offset[0], -0.5 - lowestPoint, centre.z + motion.offset[1]);
      // Roll the broad front lip to the left; pushing it straight forward
      // would pin it against the glass before it had cleared Bob's feet.
      const clearanceDirection = owner === 2 ? new THREE.Vector3(-1, 0, 0)
        : new THREE.Vector3(centre.x - clearance.centre.x, 0,
          centre.z - clearance.centre.z).normalize();
      let inwardEdge = Infinity;
      // Keep the complete piece (including its rim) beyond a separating plane
      // outside Bob's envelope. Vertices and every triangle between them then
      // stay clear, not merely each fragment's centre or bounding sphere.
      for (const coordinates of [data, ribbon]) {
        for (let index = 0; index < coordinates.length; index += 3) {
          point.set(coordinates[index], coordinates[index + 1], coordinates[index + 2])
            .applyQuaternion(quaternion).add(destination).sub(clearance.centre);
          inwardEdge = Math.min(inwardEdge, point.dot(clearanceDirection));
        }
      }
      destination.addScaledVector(clearanceDirection, Math.max(0, clearance.radius - inwardEdge));
      const separationDirection = new THREE.Vector3(centre.x - clearance.centre.x, 0,
        centre.z - clearance.centre.z).normalize();
      let initialEdge = Infinity;
      for (const coordinates of [data, ribbon]) {
        for (let index = 0; index < coordinates.length; index += 3) {
          point.set(coordinates[index], coordinates[index + 1], coordinates[index + 2])
            .add(centre).sub(clearance.centre);
          initialEdge = Math.min(initialEdge, point.dot(separationDirection));
        }
      }
      const separatedPosition = centre.clone().addScaledVector(separationDirection,
        Math.max(0, clearance.initialRadius - initialEdge));
      return { root, shell, cracks, crackCounts, centre, destination, rotation, clearanceDirection,
        separationDirection, separatedPosition, currentClearanceDirection: separationDirection.clone(), clearanceActive: false };
    });
    sphere.dispose();
    this.apply('intact', 0);
  }

  apply(state: RoomOneEggState, opening: number, crackProgress?: number): void {
    if (this.disposed) return;
    const stage = state === 'intact' ? 0 : state === 'crack-stage-1' ? 1 : state === 'crack-stage-2' ? 2 : 3;
    // Optional continuous reveal preserves the standalone trailer's staged API.
    // Whole six-vertex ribbon segments grow from existing shared shell seams;
    // there are no geometry uploads or new materials during the crack buildup.
    const amount = THREE.MathUtils.clamp(crackProgress ?? stage / 3, 0, 1) * 3;
    const completed = Math.min(2, Math.floor(amount)), fraction = amount - completed;
    this.fragments.forEach((fragment, index) => {
      // Front lip yields first; the upper and side pieces follow it apart.
      const delay = index === 2 ? 0 : index < 2 ? 0.045 : 0.12;
      const progress = THREE.MathUtils.clamp((opening - delay) / (1 - delay), 0, 1);
      const separation = Math.min(1, progress * 2);
      const separationEase = separation * separation * (3 - 2 * separation);
      const roll = Math.max(0, progress * 2 - 1);
      const rollEase = roll * roll * (3 - 2 * roll);
      fragment.root.position.lerpVectors(fragment.centre, fragment.separatedPosition, separationEase);
      fragment.root.rotation.set(0, 0, 0);
      fragment.currentClearanceDirection.copy(fragment.separationDirection);
      fragment.clearanceActive = roll > 0;
      if (fragment.clearanceActive) {
        fragment.root.position.lerpVectors(fragment.separatedPosition, fragment.destination, rollEase);
        fragment.root.rotation.set(fragment.rotation.x * rollEase, fragment.rotation.y * rollEase, fragment.rotation.z * rollEase);
        fragment.currentClearanceDirection.lerpVectors(fragment.separationDirection,
          fragment.clearanceDirection, rollEase).normalize();
        this.keepClearAndAboveFloor(fragment, THREE.MathUtils.lerp(this.initialClearanceRadius,
          this.finalClearanceRadius, rollEase));
      }
      const from = fragment.crackCounts[completed], to = fragment.crackCounts[completed + 1];
      const count = from + Math.floor((to - from) * fraction / 6) * 6;
      fragment.cracks.geometry.setDrawRange(0, count);
      fragment.cracks.visible = count > 0;
    });
  }

  private keepClearAndAboveFloor(fragment: ShellFragment, radius: number): void {
    this.inverseRotation.copy(fragment.root.quaternion).invert();
    this.localDirection.copy(fragment.currentClearanceDirection).applyQuaternion(this.inverseRotation);
    let edge = Infinity, lowest = Infinity;
    const up = this.localUp.set(0, 1, 0).applyQuaternion(this.inverseRotation);
    for (const mesh of [fragment.shell, fragment.cracks]) {
      const positions = mesh.geometry.getAttribute('position');
      for (let vertex = 0; vertex < positions.count; vertex += 1) {
        const x = positions.getX(vertex), y = positions.getY(vertex), z = positions.getZ(vertex);
        edge = Math.min(edge, x * this.localDirection.x + y * this.localDirection.y + z * this.localDirection.z);
        lowest = Math.min(lowest, x * up.x + y * up.y + z * up.z);
      }
    }
    const origin = (fragment.root.position.x - this.clearanceCentre.x) * fragment.currentClearanceDirection.x +
      (fragment.root.position.z - this.clearanceCentre.z) * fragment.currentClearanceDirection.z;
    fragment.root.position.addScaledVector(fragment.currentClearanceDirection, Math.max(0, radius - edge - origin));
    fragment.root.position.y = Math.max(fragment.root.position.y, -0.5 - lowest);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    this.crackMaterial.dispose();
    this.root.clear();
  }

  private own<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }
}
