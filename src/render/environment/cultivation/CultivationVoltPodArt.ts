import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelTwoRoomFiveGreybox } from '../../../levels/LevelTwoRoomFiveGreybox.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import { mapCultivationPlatformWear } from './CultivationPlatformWear.ts';

/** Level 1 containment vocabulary, fitted to the existing moving pod and pane colliders. */
export class CultivationVoltPodArt {
  private readonly roots: THREE.Group[] = [];
  private readonly originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  private readonly hidden = new THREE.MeshBasicMaterial({ visible: false });
  private readonly glass = new THREE.MeshStandardMaterial({ name: 'room-5-containment-clean-glass', color: 0xa6c8ca,
    roughness: .2, metalness: .04, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide });

  constructor(room: LevelTwoRoomFiveGreybox, lab: CultivationLabMaterials) {
    const art = lab.platformArt;
    const build = (parent: THREE.Object3D, draw: (box: (material: THREE.Material, size: [number, number, number], at: [number, number, number]) => void) => void) => {
      const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
      draw((material, size, at) => {
        const g = new RoundedBoxGeometry(...size, 1, Math.min(.06, ...size.map(n => n / 3))); g.translate(...at);
        if (material === lab.platform) mapCultivationPlatformWear(g, parent.name);
        const list = parts.get(material) ?? []; list.push(g); parts.set(material, list);
      });
      const root = new THREE.Group(); root.name = 'room-5-level-one-containment-art'; root.userData.presentationOnly = true;
      for (const [material, pieces] of parts) {
        const geometry = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose());
        const mesh = new THREE.Mesh(geometry, material); mesh.userData.presentationOnly = true; root.add(mesh);
      }
      parent.add(root); this.roots.push(root);
    };
    for (const name of ['room-5-pod-base', 'room-5-pod-cap']) {
      const mesh = room.pod.getObjectByName(name) as THREE.Mesh;
      if (!mesh) throw new Error(`Missing containment collider: ${name}`);
      this.originals.push({mesh, material: mesh.material}); mesh.material = this.hidden;
      build(mesh, box => {
        box(lab.platform, [6, .3, 6], [0, name.endsWith('base') ? -.05 : .05, 0]);
        box(art.frame, [5.88, .1, 5.88], [0, name.endsWith('base') ? .15 : -.15, 0]);
      });
    }
    build(room.pod, box => {
      box(art.metal, [.65, .7, 1.3], [2.55, -1.45, .3]);
      box(art.frame, [.46, .44, .08], [2.55, -1.38, -.4]);
      box(art.warning, [.16, .08, .025], [2.55, -1.35, -.455]);
      box(art.metal, [.24, .45, .24], [-.7, 2.4, .2]);
      box(art.frame, [.5, .1, .5], [-.7, 2.23, .2]);
      box(lab.platform, [1.2, .25, .8], [-.7, 2.7, .2]);
    });
    for (const pane of room.pod.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.name.includes('pod-glass-'))) {
      this.originals.push({mesh: pane, material: pane.material}); pane.material = this.glass;
      const xPane = pane.name.includes('-x-');
      build(pane, box => {
        for (const side of [-1, 1]) {
          box(art.metal, xPane ? [.15, 4, .18] : [.18, 4, .15], xPane ? [0, 0, side * 2.87] : [side * 2.87, 0, 0]);
          box(art.frame, xPane ? [.15, .12, 5.7] : [5.7, .12, .15], [0, side * 1.86, 0]);
        }
      });
    }
  }
  dispose(): void {
    for (const {mesh, material} of this.originals) mesh.material = material;
    for (const root of this.roots) { root.removeFromParent(); root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); }
    this.roots.length = 0; this.originals.length = 0; this.hidden.dispose(); this.glass.dispose();
  }
}
