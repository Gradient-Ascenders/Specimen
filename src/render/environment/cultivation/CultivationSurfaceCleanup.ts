import * as THREE from 'three';
import type { LevelTwoPreviewScene } from '../../../levels/LevelTwoPreviewScene.ts';
import { createCoplanarSurfaceRepairs } from '../../geometry/CoplanarSurfaceGeometry.ts';

/** Final presentation pass, after batching and before physics registration. */
export class CultivationSurfaceCleanup {
  private readonly hidden = new THREE.MeshBasicMaterial({visible: false});
  private readonly replacements: {mesh: THREE.Mesh; geometry: THREE.BufferGeometry; repaired: THREE.BufferGeometry}[] = [];
  private readonly proxies: {mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; proxy: THREE.Mesh}[] = [];
  private disposed = false;
  readonly repairedMeshes: number;

  constructor(scene: LevelTwoPreviewScene) {
    const colliders = new Set(scene.collisionMeshes);
    const moving = new Map<THREE.Object3D, object>();
    for (const mesh of [...scene.dynamicCollisionMeshes, ...scene.solubleTargetMeshes]) moving.set(mesh, mesh);
    for (const passage of [scene.roomOneToTwoPassage, scene.roomTwoToThreeGoopPassage]) {
      for (const door of passage.doors) moving.set(door.root, door.root);
    }
    const entranceDomain = {};
    moving.set(scene.roomFour.entrance.root, entranceDomain);
    for (const mesh of scene.roomFour.movingEntranceMeshes) {
      if (mesh !== scene.roomFour.boardingGuard) moving.set(mesh, entranceDomain);
    }
    for (const child of scene.roomFour.root.children) if (child.name.startsWith('room-4-shaft-module-')) moving.set(child, child);
    moving.set(scene.roomFive.brokenCore, scene.roomFive.brokenCore);
    const domain = (mesh: THREE.Mesh): object => {
      let motion: object | undefined;
      for (let parent: THREE.Object3D | null = mesh; parent; parent = parent.parent) {
        motion = moving.get(parent) ?? motion;
        // Descendant colliders travel with the outer assembly, not independently.
        if (parent.parent === scene.root) return motion ?? parent;
      }
      return motion ?? mesh;
    };
    // Sliding hardware needs actual clearance, not a permanent cut based on
    // its initial pose. The authored colliders retain their exact dimensions.
    const insets = new Map<THREE.Mesh, THREE.BufferGeometry>();
    scene.root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BoxGeometry)) return;
      const name = object.name;
      let widthInset = 0, heightInset = 0, depthInset = 0;
      if (name === 'room-4-destination-vent-shutter' || name === 'room-5-reunion-floor') widthInset = .02;
      if (name === 'room-5-sewer-reunion-bridge') depthInset = .04;
      if (name === 'room-4-boarding-safety-guard') widthInset = .04;
      if (name === 'room-4-boarding-shaft-wall') widthInset = .06;
      if (name.startsWith('room-4-destination-wall-')) widthInset = .02;
      if (name === 'room-4-destination-vent-header') heightInset = .02;
      // Closed wall caps are buried in the passage floor. Lift them above the
      // neighbouring room's cap without altering the visible wall elevation.
      const passageWall = /^cultivation-room-\d-to-\d-.*lab-passage-(east|west)-wall$/.test(name);
      const liftPartition = name.startsWith('room-4-partition-');
      if (!widthInset && !heightInset && !depthInset && !passageWall && !liftPartition) return;
      const geometry = object.geometry.clone(), position = geometry.getAttribute('position');
      geometry.computeBoundingBox(); const minY = geometry.boundingBox!.min.y;
      for (let i = 0; i < position.count; i++) {
        position.setX(i, position.getX(i) - Math.sign(position.getX(i)) * widthInset / 2);
        position.setY(i, position.getY(i) - Math.sign(position.getY(i)) * heightInset / 2);
        position.setZ(i, position.getZ(i) - Math.sign(position.getZ(i)) * depthInset / 2);
        if ((passageWall || liftPartition) && Math.abs(position.getY(i) - minY) < .0001) position.setY(i, minY + .015);
      }
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      insets.set(object, geometry);
    });
    this.install(insets, colliders);
    const repairs = createCoplanarSurfaceRepairs(scene.root, domain);
    this.install(repairs, colliders);
    this.repairedMeshes = insets.size + repairs.size;
  }

  private install(repairs: Map<THREE.Mesh, THREE.BufferGeometry>, colliders: Set<THREE.Mesh>): void {
    for (const [mesh, geometry] of repairs) {
      if (colliders.has(mesh) || mesh instanceof THREE.InstancedMesh) {
        const proxy = new THREE.Mesh(geometry, mesh.material);
        proxy.name = `${mesh.name}-surface-skin`;
        proxy.userData = {...mesh.userData, presentationOnly: true};
        proxy.castShadow = mesh.castShadow; proxy.receiveShadow = mesh.receiveShadow;
        proxy.layers.mask = mesh.layers.mask;
        mesh.add(proxy);
        this.proxies.push({mesh, material: mesh.material, proxy});
        mesh.material = this.hidden;
      } else {
        this.replacements.push({mesh, geometry: mesh.geometry, repaired: geometry});
        mesh.geometry = geometry;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const {mesh, geometry, repaired} of [...this.replacements].reverse()) { mesh.geometry = geometry; repaired.dispose(); }
    for (const {mesh, material, proxy} of this.proxies) { mesh.material = material; proxy.removeFromParent(); proxy.geometry.dispose(); }
    this.hidden.dispose();
  }
}
