import * as THREE from 'three';
import { FINAL_ARENA, FINAL_ARENA_RING } from '../boss/FinalBossConfig.ts';
import { RESEARCH_TIMING as T, researchWindow } from './BlackoutResearchTimeline.ts';

export class ResearchArenaReveal {
  readonly root = new THREE.Group();
  private readonly panels: THREE.Group[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly plate = new THREE.MeshStandardMaterial({ color: 0x9aafb5, roughness: .43, metalness: .7 });
  private readonly steel = new THREE.MeshStandardMaterial({ color: 0x263e48, roughness: .38, metalness: .8 });
  private readonly warning = new THREE.MeshBasicMaterial({ color: 0xffbd56, transparent: true, opacity: 1, toneMapped: false });
  private readonly hub: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private progress = 0;
  constructor() {
    this.root.name = 'research-arena-retracting-pit-cover'; this.root.visible = false;
    this.root.position.set(0, FINAL_ARENA.floorY - .08, FINAL_ARENA.centreZ);
    const radius = FINAL_ARENA_RING.innerRadius - .25;
    for (let i = 0; i < 8; i++) {
      const start = i * Math.PI / 4 + .0008, end = (i + 1) * Math.PI / 4 - .0008, mid = (start + end) / 2;
      const outline = new THREE.Shape(); outline.moveTo(0, 0);
      for (let n = 0; n <= 24; n++) {
        const a = THREE.MathUtils.lerp(start, end, n / 24); outline.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      }
      outline.closePath();
      const geometry = this.geometry(new THREE.ExtrudeGeometry(outline, { depth: .55, bevelEnabled: false, steps: 1 }));
      geometry.rotateX(Math.PI / 2);
      const panel = new THREE.Group(); panel.name = `pit-cover-blade-${i}`; panel.add(new THREE.Mesh(geometry, this.plate));
      for (const offset of [-.18, .18]) {
        const a = mid + offset;
        const rib = new THREE.Mesh(this.geometry(new THREE.BoxGeometry(43, .16, .32)), this.steel);
        rib.position.set(Math.cos(a) * 33, .09, Math.sin(a) * 33); rib.rotation.y = -a; panel.add(rib);
      }
      const lock = new THREE.Mesh(this.geometry(new THREE.BoxGeometry(5, .22, 1.1)), this.warning);
      lock.position.set(Math.cos(mid) * 53, .16, Math.sin(mid) * 53); lock.rotation.y = -mid; panel.add(lock);
      this.panels.push(panel); this.root.add(panel);
    }
    this.hub = new THREE.Mesh(this.geometry(new THREE.CylinderGeometry(3, 3.3, .65, 32)), this.steel);
    this.hub.position.y = .2; this.root.add(this.hub);
    this.ring = new THREE.Mesh(this.geometry(new THREE.RingGeometry(61.85, 62.12, 192)), this.warning);
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = .15; this.root.add(this.ring);
  }
  get diagnostics() { return { pitCoverVisible: this.panels[0]!.visible && this.root.visible, pitOpenProgress: this.progress }; }
  present(t: number, active = true): void {
    this.root.visible = active && t >= T.overlook; this.progress = researchWindow(t, T.pitOpen, T.pitClear);
    const unlock = researchWindow(t, T.pitUnlock, T.pitOpen);
    for (const [i, panel] of this.panels.entries()) {
      const a = (i + .5) * Math.PI / 4;
      panel.visible = t < T.pitClear + .15;
      panel.position.set(Math.cos(a) * this.progress * 74, -this.progress * 10 - unlock * .18,
        Math.sin(a) * this.progress * 74);
    }
    this.hub.visible = t < T.pitOpen + 1; this.hub.position.y = .2 - researchWindow(t, T.pitOpen, T.pitOpen + 1) * 14;
    this.ring.visible = t >= T.pitUnlock;
    this.warning.color.setHex(t >= T.pitUnlock ? 0xff5c35 : 0x92b8ba);
    this.warning.opacity = t >= T.pitUnlock ? .35 + .65 * (.5 + Math.sin(t * 10) * .5) : .65;
  }
  reset(): void { this.root.visible = false; this.progress = 0; }
  dispose(): void {
    this.root.removeFromParent(); this.root.clear(); this.geometries.forEach(g => g.dispose());
    this.plate.dispose(); this.steel.dispose(); this.warning.dispose();
  }
  private geometry<G extends THREE.BufferGeometry>(g: G): G { this.geometries.add(g); return g; }
}
