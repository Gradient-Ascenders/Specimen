import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelTwoRoomFiveGreybox } from '../../../levels/LevelTwoRoomFiveGreybox.ts';
import type { CultivationLabMaterials } from './CultivationLabMaterials.ts';
import { mapCultivationPlatformWear } from './CultivationPlatformWear.ts';
import { createCultivationFacilityLettering } from './CultivationFacilityLettering.ts';
import { optimizeFiniteLightEvaluation } from './FiniteLightEvaluation.ts';

type Point = [number, number, number];
type Finish = 'ceramic' | 'frame' | 'metal' | 'warning' | 'copper' | 'signal' | 'ink';
interface Hardware {
  box(material: Finish, size: Point, at: Point): void;
  cylinder(material: Finish, radius: number, height: number, at: Point): void;
  ring(material: Finish, radius: number, tube: number, at: Point): void;
  line(material: Finish, from: Point, to: Point, radius?: number): void;
  label(text: string, height: number, at: Point, yaw?: number): void;
}

/** A suspended bioelectric power cell. Detail follows the original moving hull/panes;
 * all geometry is baked, with shared finishes and no extra lights or frame work. */
export class CultivationVoltPodArt {
  private readonly roots: THREE.Group[] = [];
  private readonly originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  private readonly hidden = new THREE.MeshBasicMaterial({ visible: false });
  private readonly glass = new THREE.MeshStandardMaterial({ name: 'room-5-containment-clean-glass', color: 0xa6c8ca,
    roughness: .2, metalness: .04, transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide });
  private readonly copper = new THREE.MeshStandardMaterial({ name: 'room-5-extraction-copper', color: 0xb47a48,
    roughness: .38, metalness: .72 });
  private readonly ink = new THREE.MeshBasicMaterial({ name: 'room-5-power-cell-lettering', color: 0xc9dbd9 });
  private readonly finishes: THREE.MeshStandardMaterial[] = [];

  constructor(room: LevelTwoRoomFiveGreybox, lab: CultivationLabMaterials) {
    const art = lab.platformArt;
    const readable = (source: THREE.MeshStandardMaterial, name: string, emission: number, intensity: number) => {
      const material = source.clone(); material.name = `room-5-power-cell-${name}`;
      material.emissive.setHex(emission); material.emissiveIntensity = intensity; material.emissiveMap = material.map;
      optimizeFiniteLightEvaluation(material); this.finishes.push(material); return material;
    };
    // Volt's existing internal lamp cannot illuminate outward-facing armour.
    // A modest visibility floor makes its finish readable without a room wash.
    const finishes: Record<Finish, THREE.Material> = {
      ceramic: readable(lab.platform, 'ceramic', 0xcfd9d9, .11),
      frame: readable(art.frame, 'armour', 0x2d3b40, .22),
      metal: readable(art.metal, 'steel', 0x687c82, .18),
      warning: readable(art.warning, 'hazard-markings', 0xdca51c, .25),
      copper: this.copper, signal: room.releaseButton.material, ink: this.ink,
    };
    this.copper.emissive.setHex(0xb47a48); this.copper.emissiveIntensity = .2;
    for (const material of [this.glass, this.copper, room.releaseButton.material]) optimizeFiniteLightEvaluation(material);
    const build = (parent: THREE.Object3D, name: string, draw: (hardware: Hardware) => void) => {
      const baked = lab.assets.geometries(`volt-power-cell-${name}`, () => {
        const parts = new Map<Finish, THREE.BufferGeometry[]>();
        const add = (material: Finish, source: THREE.BufferGeometry) => {
          const geometry = source.index ? source.toNonIndexed() : source;
          if (geometry !== source) source.dispose();
          if (material === 'ceramic') mapCultivationPlatformWear(geometry, name);
          const list = parts.get(material) ?? []; list.push(geometry); parts.set(material, list);
        };
        draw({
          box: (m, size, at) => add(m, new RoundedBoxGeometry(...size, 1, Math.min(.045, ...size.map(n => n / 3))).translate(...at)),
          cylinder: (m, r, h, at) => add(m, new THREE.CylinderGeometry(r, r, h, 12).translate(...at)),
          ring: (m, r, tube, at) => add(m, new THREE.TorusGeometry(r, tube, 6, 28).rotateX(Math.PI / 2).translate(...at)),
          line: (m, a, b, radius = .065) => {
            const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
            add(m, new THREE.CylinderGeometry(radius, radius, delta.length(), 8)
              .applyQuaternion(q).translate(...from.add(to).multiplyScalar(.5).toArray()));
          },
          label: (text, height, at, yaw = Math.PI) => {
            const halfWidth = (text.length * .76 - .16) * height / 2;
            add('ink', createCultivationFacilityLettering(text, height,
              [at[0] - Math.cos(yaw) * halfWidth, at[1], at[2] + Math.sin(yaw) * halfWidth], yaw));
          },
        });
        const result: Record<string, THREE.BufferGeometry> = {};
        for (const [role, pieces] of parts) {
          result[role] = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose());
        }
        return result;
      });
      const root = new THREE.Group(); root.name = `room-5-${name}`; root.userData.presentationOnly = true;
      for (const [role, geometry] of Object.entries(baked)) {
        const mesh = new THREE.Mesh(geometry, finishes[role as Finish]); mesh.name = `${root.name}-${role}`;
        mesh.userData.presentationOnly = true; root.add(mesh);
      }
      parent.add(root); this.roots.push(root);
    };

    for (const name of ['room-5-pod-base', 'room-5-pod-cap']) {
      const mesh = room.pod.getObjectByName(name) as THREE.Mesh;
      if (!mesh) throw new Error(`Missing containment collider: ${name}`);
      this.originals.push({ mesh, material: mesh.material }); mesh.material = this.hidden;
      const base = name.endsWith('base');
      build(mesh, base ? 'power-cell-base' : 'power-cell-cap', ({ box }) => {
        box('ceramic', [6, .3, 6], [0, base ? -.05 : .05, 0]);
        box('frame', [5.88, .1, 5.88], [0, base ? .15 : -.15, 0]);
        for (const side of [-1, 1]) {
          box('metal', [.34, .48, 5.6], [side * 2.7, 0, 0]);
          box('metal', [4.9, .48, .34], [0, 0, side * 2.7]);
          for (let i = 0; i < 9; i++) box('warning', [.23, .13, .025], [-2.2 + i * .55, .015, side * 3.015]);
        }
      });
    }

    build(room.pod, 'volt-battery-extraction-array', ({ box, cylinder, ring, line, label }) => {
      // Armoured corners leave the middle of each window clear for Volt.
      for (const x of [-2.68, 2.68]) for (const z of [-2.68, 2.68]) {
        box('metal', [.32, 3.6, .32], [x, 0, z]);
        for (const y of [-1.5, 1.5]) box('frame', [.52, .28, .52], [x, y, z]);
      }
      // Copper induction stacks and ceramic insulators extract power, rather
      // than making this read as another empty display case.
      for (const x of [-2.05, 2.05]) for (const z of [-1.9, 1.9]) {
        cylinder('copper', .16, 2.65, [x, -.02, z]);
        for (let i = 0; i < 7; i++) cylinder('ceramic', .3, .09, [x, -1.18 + i * .38, z]);
        for (const y of [-1.52, 1.52]) {
          cylinder('metal', .35, .24, [x, y, z]);
          line('copper', [x, y, z], [x * .57, y, z * .57], .085);
        }
      }
      for (const y of [-1.5, 1.5]) {
        cylinder('frame', 1.36, .16, [0, y, 0]);
        ring('copper', 1.56, .075, [0, y, 0]);
        ring('signal', 1.39, .028, [0, y + (y < 0 ? .1 : -.1), 0]);
      }
      cylinder('metal', .74, .65, [0, -1.09, 0]);
      cylinder('copper', .9, .12, [0, -.7, 0]);
      // Roof contacts terminate the two suspension/power feeds.
      for (const x of [-2.5, 2.5]) {
        cylinder('frame', .32, .28, [x, 2.24, 0]);
        for (let i = 0; i < 3; i++) cylinder('ceramic', .27, .065, [x, 2.47 + i * .17, 0]);
        cylinder('copper', .12, .82, [x, 2.55, 0]);
      }
      box('frame', [5.55, .88, .22], [0, 2.43, -3.13]);
      box('metal', [5.1, .035, .025], [0, 2.12, -3.255]);
      label('VOLT / POWER CELL', .29, [0, 2.42, -3.26]);
      label('CRITICAL - BIOELECTRIC', .14, [0, 2.17, -3.26]);
      box('frame', [3.8, .43, .18], [0, -1.98, -3.13]);
      for (let i = 0; i < 8; i++) box('signal', [.28, .15, .025], [-1.48 + i * .42, -1.95, -3.245]);
      for (const x of [-2.35, 2.35]) {
        line('warning', [x - .18, 2.28, -3.27], [x, 2.72, -3.27], .022);
        line('warning', [x, 2.72, -3.27], [x + .18, 2.28, -3.27], .022);
        line('warning', [x + .18, 2.28, -3.27], [x - .18, 2.28, -3.27], .022);
        line('warning', [x + .04, 2.59, -3.29], [x - .035, 2.47, -3.29], .016);
        line('warning', [x - .035, 2.47, -3.29], [x + .035, 2.47, -3.29], .016);
        line('warning', [x + .035, 2.47, -3.29], [x - .03, 2.35, -3.29], .016);
      }
    });

    // Each window keeps its own frame during the existing release animation.
    for (const pane of room.pod.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.name.includes('pod-glass-'))) {
      this.originals.push({ mesh: pane, material: pane.material }); pane.material = this.glass;
      const xPane = pane.name.includes('-x-');
      build(pane, `power-cell-window-${pane.name}`, ({ box }) => {
        for (const side of [-1, 1]) {
          box('metal', xPane ? [.15, 3.6, .18] : [.18, 3.6, .15], xPane ? [0, 0, side * 2.87] : [side * 2.87, 0, 0]);
          box('frame', xPane ? [.15, .12, 5.7] : [5.7, .12, .15], [0, side * 1.86, 0]);
        }
        if(pane.name==='room-5-pod-glass-z--1'){
          // A visible mechanical lower rail and nested shutter sections make
          // the clear front window's upward retraction legible on camera.
          for(const y of [-1.7,-.56,.56,1.7])box('metal',[5.45,.08,.12],[0,y,-.13]);
          for(const x of [-2.72,2.72])box('warning',[.1,3.3,.08],[x,0,-.14]);
          box('warning',[1.1,.16,.13],[0,-1.77,-.14]);
        }
      });
    }
    build(room.pod,'volt-shutter-fixed-guide-rails',({box})=>{
      for(const x of [-3.13,3.13]){
        box('frame',[.22,4.2,.28],[x,0,-3]);
        box('metal',[.055,3.9,.07],[x,-.02,-3.18]);
      }
      // Keep the retraction hood behind the existing CRITICAL plaque.
      box('frame',[6.5,.44,.34],[0,2.08,-2.795]);
    });

    const pedestal = room.root.getObjectByName('room-5-release-pedestal')!;
    build(pedestal, 'volt-release-button-console', ({ box, cylinder, label }) => {
      box('frame', [1.4, 1.8, .22], [0, 0, .12]);
      for (const side of [-1, 1]) {
        box('metal', [.13, .95, .31], [side * .48, .05, .25]);
        box('metal', [1.05, .13, .31], [0, .05 + side * .48, .25]);
        for (const x of [-.59, .59]) cylinder('metal', .045, .04, [x, side * .7, .25]);
      }
      box('frame', [1.3, .48, .22], [0, 1.02, .12]);
      label('RELEASE', .18, [0, .99, .245], 0);
      label('VOLT CELL', .105, [0, -.7, .245], 0);
    });
    build(room.releaseButton, 'volt-release-button-face', ({ line }) => {
      line('ink', [.08, .2, .17], [-.06, -.015, .17], .02);
      line('ink', [-.06, -.015, .17], [.07, -.015, .17], .02);
      line('ink', [.07, -.015, .17], [-.08, -.2, .17], .02);
    });
    // Supported ceiling tray: the control never has a floating diagonal cable
    // across Bob's walk/jump lane. The same live signal reaches the power cell.
    build(room.root, 'volt-release-connected-power-tray', ({ box, line, cylinder }) => {
      box('frame', [.55, 6.8, .45], [0, 33.4, 26.58]);
      line('copper', [0, 30, 26.5], [0, 36.8, 26.5], .095);
      line('signal', [0, 30, 26.84], [0, 36.8, 26.84], .035);
      line('signal', [0, 36.8, 26.84], [.22, 36.98, 26.5], .035);
      box('frame', [.65, .23, 22.5], [0, 36.8, 37.75]);
      line('copper', [0, 36.98, 26.5], [0, 36.98, 49], .09);
      line('signal', [.22, 36.98, 26.5], [.22, 36.98, 49], .035);
      for (const z of [27, 32, 38, 44, 49]) {
        box('metal', [1, .18, .25], [0, 37, z]);
        cylinder('metal', .06, .9, [0, 37.55, z]);
      }
      box('frame', [6.7, .38, 1.05], [0, 37.78, 49]);
      for (const x of [-2.5, 2.5]) {
        box('metal', [.8, .2, .85], [x, 37.48, 49]);
        line('copper', [0, 37.48, 49], [x, 37.48, 49], .09);
      }
    });
    for (const feed of room.podFeeds) {
      build(feed, `power-feed-${feed.name}`, ({ box }) => box('signal', [.04, 1, .025], [0, 0, -.115]));
    }
  }

  dispose(): void {
    for (const { mesh, material } of this.originals) mesh.material = material;
    for (const root of this.roots) { root.removeFromParent(); root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); }
    this.roots.length = 0; this.originals.length = 0;
    this.hidden.dispose(); this.glass.dispose(); this.copper.dispose(); this.ink.dispose();
    this.finishes.forEach(material => material.dispose());
  }
}
