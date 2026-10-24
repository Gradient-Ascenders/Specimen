import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RESEARCH_FINDINGS, RESEARCH_TIMING as T, researchWindow } from './BlackoutResearchTimeline.ts';
import { RESEARCH_WING_ORIGIN, RESEARCH_GLASS, researchLocalZ, researchWorldPoint } from './BlackoutResearchLayout.ts';

export { RESEARCH_WING_ORIGIN } from './BlackoutResearchLayout.ts';
export const RESEARCH_WING_URL = new URL('../../assets/environments/research-wing/research-wing.glb', import.meta.url).href;

function bobDiagram(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  ctx.fillStyle = '#123a47'; ctx.strokeStyle = '#6febec'; ctx.lineWidth = .014;
  ctx.beginPath(); ctx.moveTo(-.48, .43); ctx.bezierCurveTo(-.6, .13, -.34, -.19, -.22, -.31);
  ctx.bezierCurveTo(-.1, -.53, .17, -.52, .3, -.29); ctx.bezierCurveTo(.44, -.02, .6, .25, .48, .43);
  ctx.bezierCurveTo(.22, .57, -.3, .57, -.48, .43); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(.02, -.43); ctx.bezierCurveTo(-.07, -.66, .2, -.88, .36, -.71);
  ctx.bezierCurveTo(.49, -.53, .18, -.51, .11, -.62); ctx.stroke();
  ctx.fillStyle = '#85ffff'; for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * .17, .01, .055, .12, side * -.1, 0, Math.PI * 2); ctx.fill(); }
  ctx.setLineDash([.04, .035]); ctx.strokeStyle = '#2a7981'; ctx.beginPath(); ctx.moveTo(-.72, .48); ctx.lineTo(.72, .48); ctx.moveTo(0, -.96); ctx.lineTo(0, .65); ctx.stroke();
  ctx.restore();
}

function monitorCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext?.('2d'); return ctx ? { canvas, ctx } : undefined;
}

export class BlackoutResearchWing {
  readonly root = new THREE.Group();
  readonly lightRoot = new THREE.Group();
  readonly monitorDrone = new THREE.Group();
  readonly glass: THREE.Mesh;
  readonly glassCracks: THREE.LineSegments;
  readonly ready: Promise<void>;
  readonly diagnostics = { findings: RESEARCH_FINDINGS, assetReady: false, monitorCount: 8,
    threat: 'CATASTROPHIC', hypothesis: 'INCREDIBLE AMOUNT OF STORED POWER', scientistText: '' };
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly lights: THREE.PointLight[] = [];
  private readonly abort = new AbortController();
  private readonly thrusterPlumes: THREE.Mesh[] = [];
  private readonly doorParts: { mesh: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion }[] = [];
  private readonly galleryLamps: { z: number; material: THREE.MeshStandardMaterial }[] = [];
  private readonly shutters: { mesh: THREE.Object3D; x: number; y: number; height: number; at: number; duration: number; recess: number }[] = [];
  private overlookSeal?: { mesh: THREE.Object3D; y: number };
  private readonly alarm: THREE.PointLight;
  private readonly scientistCanvas = monitorCanvas(1024, 640);
  private scientistTexture?: THREE.CanvasTexture;
  private readonly scientistMaterial: THREE.MeshBasicMaterial;
  private scientistKey = '';
  private disposed = false;
  private readonly staticRoot = new THREE.Group();
  private readonly overlookRoot = new THREE.Group();
  private readonly screenRoot = new THREE.Group();
  private retainedOverlook = false;

  constructor() {
    this.root.name = 'blackout-bob-research-wing'; this.root.position.copy(RESEARCH_WING_ORIGIN); this.root.visible = false;
    this.lightRoot.name = 'blackout-research-retained-light-layout'; this.root.add(this.staticRoot, this.overlookRoot, this.screenRoot, this.monitorDrone);
    const dark = this.material(new THREE.MeshStandardMaterial({ color: 0x172731, roughness: .38, metalness: .7 }));
    const rim = this.material(new THREE.MeshStandardMaterial({ color: 0x77969d, roughness: .36, metalness: .7 }));
    const screen = (w: number, h: number, material: THREE.Material, position: THREE.Vector3, yaw: number, parent = this.screenRoot): THREE.Mesh => {
      const mesh = new THREE.Mesh(this.geometry(new THREE.PlaneGeometry(w, h)), material); mesh.position.copy(position); mesh.rotation.y = yaw; parent.add(mesh); return mesh;
    };
    for (const [i, finding] of RESEARCH_FINDINGS.entries()) {
      const content = monitorCanvas(1024, 640);
      if (content) {
        const c = content.ctx; this.paintBackground(c, 1024, 640, 'BEHAVIOURAL SCIENCE / SUBJECT SP-01');
        c.fillStyle = '#76e5dc'; c.font = 'bold 34px monospace'; c.fillText(finding.title, 35, 108);
        c.fillStyle = '#789b9f'; c.font = '21px monospace'; c.fillText(finding.subtitle, 35, 145);
        bobDiagram(c, 213, 354, 240);
        c.fillStyle = '#bfe3df'; c.font = '22px monospace';
        for (const [n, line] of finding.lines.entries()) this.wrap(c, line, 395, 242 + n * 88, 565, 31);
        c.fillStyle = '#53ada9'; c.font = '19px monospace'; c.fillText(`BOB  /  RECORD ${String(i + 1).padStart(2, '0')}  /  ACTIVE STUDY`, 35, 599);
      }
      const mat = this.screenMaterial(content?.canvas);
      const side = i < 3 ? -1 : 1, z = [5, 12, 19][i % 3]!;
      const mesh = screen(3.8, 2.22, mat, new THREE.Vector3(side * 7.48, 3.3, researchLocalZ(z)), side < 0 ? Math.PI / 2 : -Math.PI / 2);
      mesh.name = `bob-research-screen-${i + 1}`;
    }
    const big = monitorCanvas(1920, 1080);
    if (big) {
      const c = big.ctx; this.paintBackground(c, 1920, 1080, 'DIRECTORATE / RESTRICTED FUSION RESEARCH');
      c.fillStyle = '#a7d3d2'; c.font = '30px monospace'; c.fillText('SUBJECT SP-01 : BOB', 65, 156);
      c.fillStyle = '#ff6473'; c.font = 'bold 82px monospace'; c.fillText('CATASTROPHIC', 65, 255);
      c.fillStyle = '#bcdfdf'; c.font = '31px monospace'; c.fillText('THREAT CLASS / UNCONTAINABLE FUSION CATALYST', 70, 312);
      bobDiagram(c, 310, 643, 350);
      c.fillStyle = '#7eece1'; c.font = 'bold 51px monospace'; c.fillText('THE SPECIMEN', 650, 456);
      c.fillStyle = '#e8f0ee'; c.font = '34px monospace'; this.wrap(c, 'Bob can stabilise the fusion of multiple specimens.', 650, 525, 1140, 48);
      c.fillStyle = '#ff8990'; this.wrap(c, 'Projected outcome: mass destruction on a global scale.', 650, 653, 1140, 48);
      c.fillStyle = '#93c6c5'; c.font = '29px monospace'; c.fillText('EXPERIMENTAL HYPOTHESIS', 650, 810);
      c.fillStyle = '#f6cd74'; c.font = 'bold 36px monospace'; this.wrap(c, 'INCREDIBLE AMOUNT OF STORED POWER', 650, 870, 1140, 47);
      c.fillStyle = '#688f96'; c.font = '25px monospace'; c.fillText('UNTESTED / DO NOT INITIATE FUSION / DIRECTOR AUTHORISATION REQUIRED', 65, 1020);
    }
    const bigMesh = screen(10.8, 5.1, this.screenMaterial(big?.canvas), new THREE.Vector3(0, 4.2, researchLocalZ(30.64)), Math.PI);
    bigMesh.name = 'bob-catastrophic-research-monitor';
    this.buildMonitorThrone(dark, rim);
    this.scientistTexture = this.scientistCanvas ? this.canvasTexture(this.scientistCanvas.canvas) : undefined;
    this.scientistMaterial = this.material(new THREE.MeshBasicMaterial({ map: this.scientistTexture ?? null, color: 0xffffff, toneMapped: false }));
    screen(4.95, 2.95, this.scientistMaterial, new THREE.Vector3(0, 0, -.48), Math.PI, this.monitorDrone).name = 'flying-scientist-interface';
    this.monitorDrone.name = 'flying-scientist-monitor-drone'; this.monitorDrone.visible = false;
    this.setScientist('', 'green');
    const glassMaterial = this.material(new THREE.MeshPhysicalMaterial({ color: 0xb3e8ef, roughness: .1, metalness: .12,
      transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide }));
    this.glass = screen(15.2, 9.5, glassMaterial, RESEARCH_GLASS, 0, this.overlookRoot);
    this.glass.name = 'research-observation-breakaway-glass';
    const crackPoints: number[] = [];
    for (let i = 0; i < 18; i++) {
      const a = i * 2.399963;
      for (let n = 0; n < 3; n++) {
        const r = n * .7, next = (n + 1) * .7, bend = Math.sin(i * 3 + n) * .17;
        crackPoints.push(16 + Math.cos(a + bend) * r, 3.1 + Math.sin(a + bend) * r, 111.25,
          16 + Math.cos(a - bend) * next, 3.1 + Math.sin(a - bend) * next, 111.25);
      }
    }
    this.glassCracks = new THREE.LineSegments(this.geometry(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(crackPoints, 3))),
      this.material(new THREE.LineBasicMaterial({ color: 0xb8e4ee, transparent: true, opacity: .85, toneMapped: false })));
    this.glassCracks.visible = false; this.overlookRoot.add(this.glassCracks);
    const safety = this.material(new THREE.MeshBasicMaterial({ color: 0x16383f, toneMapped: false }));
    for (const side of [-1, 1]) for (const z of [4, 12, 20, 28]) this.box([.035, .045, 4], [side * 7.8, .18, researchLocalZ(z)], safety, this.staticRoot);
    for (const [x, y, z] of [[0, 5, 7], [0, 5, 25], [16, 5, 52], [16, 6, 89], [16, 7, 104], [16, 4.5, 28], [16, 5, 73]]) {
      const light = new THREE.PointLight(0xbdd9e6, 0, 28, 2); researchWorldPoint(x, y, z, light.position);
      this.lightRoot.add(light); this.lights.push(light);
    }
    this.alarm = new THREE.PointLight(0xff243b, 0, 36, 2);
    researchWorldPoint(0, 5, 26, this.alarm.position); this.lightRoot.add(this.alarm);
    this.ready = typeof window !== 'undefined' && !RESEARCH_WING_URL.startsWith('file:')
      ? this.load() : Promise.resolve();
    void this.ready.catch(() => {});
  }

  private async load(): Promise<void> {
    const response = await fetch(RESEARCH_WING_URL, { signal: this.abort.signal });
    if (!response.ok) throw new Error(`Research wing asset request failed: ${response.status}`);
    const asset = (await new GLTFLoader().parseAsync(await response.arrayBuffer(), '')).scene;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    asset.traverse(node => { if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry); for (const material of [node.material].flat()) materials.add(material);
    } });
    if (this.disposed) { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); return; }
    geometries.forEach(g => this.geometries.add(g)); materials.forEach(m => this.materials.add(m));
    asset.traverse(node => {
      if (node.name === 'Research_OverlookSeal') this.overlookSeal = { mesh: node, y: node.position.y };
      if (/^Research_(DeadEndDoor|Door_)/.test(node.name)) this.doorParts.push({ mesh: node, position: node.position.clone(), quaternion: node.quaternion.clone() });
      if (node.name.startsWith('Research_Bay_')) this.shutters.push({ mesh: node, x: node.position.x, y: node.position.y,
        height: node.name.includes('Director') ? 6.9 : node.name.includes('Hall') ? 2.9 : 3.6,
        at: node.name.includes('Director') ? T.monitorEntry - 3 : node.name.includes('Hall') ? T.pursuit - .65 : T.sentries - 2,
        duration: node.name.includes('Hall') ? .65 : 1.8,
        recess: node.name.includes('Hall') ? node.name.endsWith('Left') ? -.26 : .26 : 0 });
      if (node.name.startsWith('Research_Bay_')) {
        const hall = node.name.includes('Hall'), director = node.name.includes('Director');
        const width = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3()).z;
        const trim = this.material(new THREE.MeshStandardMaterial({ color: 0x38535e, roughness: .48, metalness: .7 }));
        for (let n = -2; n <= 2; n++) {
          if (hall) this.box([.03, .045, width - .24], [node.name.endsWith('Left') ? .14 : -.14, n * .44, 0], trim, node as THREE.Group);
          else this.box([director ? 6.8 : 3, .045, .04], [0, n * (director ? 1.1 : .58), .14], trim, node as THREE.Group);
        }
      }
      if (!(node instanceof THREE.Mesh)) return;
      node.receiveShadow = true;
      if (node.name.startsWith('Research_GalleryLamp_') && node.material instanceof THREE.MeshStandardMaterial) {
        const material = node.material.clone(); this.materials.add(material); node.material = material;
        this.galleryLamps.push({ z: Number(node.name.split('_').at(-1)), material });
      }
    });
    for (const node of [...asset.children]) (node.name.startsWith('Research_Overlook') ? this.overlookRoot : this.staticRoot).add(node);
    this.diagnostics.assetReady = true;
  }

  present(t: number, active = true): void {
    const dark = researchWindow(t, T.lampBurst, T.blackout), inGallery = t < T.chase;
    this.root.visible = active || this.retainedOverlook;
    this.staticRoot.visible = active && t < T.fall; this.screenRoot.visible = active && t < T.blackout;
    this.overlookRoot.visible = active || this.retainedOverlook;
    for (const [i, light] of this.lights.entries()) light.intensity = active
      ? (i < 2 ? 110 * (1 - dark) * (t >= T.alarm ? .42 : 1) : i === 3 ? 130 : 70)
        * (t < T.fall && !(t >= T.blackout && t < T.chase) ? 1 : 0) : i === 4 && this.retainedOverlook ? 10 : 0;
    const pulse = t >= T.alarm && t < T.blackout ? .18 + .82 * (.5 + .5 * Math.sin((t - T.alarm) * Math.PI * 1.65)) ** 3 : 0;
    this.alarm.intensity = active && inGallery ? 210 * pulse : 0;
    for (const lamp of this.galleryLamps) {
      const at = T.lampBurst + (25 - lamp.z) / 8 * .65;
      const broken = t >= at;
      const overloading = lamp.z === 25 && t >= T.overload && !broken;
      lamp.material.emissiveIntensity = broken ? .015 : overloading ? 3 + Math.max(0, t - T.overload) * .8 + Math.sin(t * 43) * .5 : 2.8;
    }
    for (const shutter of this.shutters) {
      const open = researchWindow(t, shutter.at, shutter.at + shutter.duration);
      shutter.mesh.position.y = shutter.y + shutter.height * open; shutter.mesh.position.x = shutter.x + shutter.recess * open;
    }
    if (this.overlookSeal) this.overlookSeal.mesh.position.y = this.overlookSeal.y - 6.65 * researchWindow(t, T.fall + .5, T.fall + 2);
    this.monitorDrone.visible = active && t >= T.monitorEntry && t < T.chase;
    const linear = THREE.MathUtils.clamp((t - T.monitorEntry) / (T.monitorArrives - T.monitorEntry), 0, 1);
    const u = linear ** 3 * (10 - 15 * linear + 6 * linear * linear);
    this.monitorDrone.position.set(0, 4.1 + Math.sin(u * Math.PI) * .9 + Math.sin(t * .7) * .025 * u, researchLocalZ(THREE.MathUtils.lerp(-4, 21.4, u)));
    this.monitorDrone.rotation.set(Math.sin(linear * Math.PI * 2) * -.045, Math.PI, Math.sin(t * .43) * .006 * u);
    for (const [i, plume] of this.thrusterPlumes.entries()) plume.scale.y = .65 + Math.sin(t * (13 + i) + i) * .035 + Math.sin(u * Math.PI) * .7;
    const breach = researchWindow(t, T.doorBlast, T.doorBlast + 1.2);
    for (const [i, part] of this.doorParts.entries()) {
      part.mesh.position.copy(part.position); part.mesh.position.x += (i % 2 ? 1 : -1) * breach * 4;
      part.mesh.position.z += breach * (7 + i * .3); part.mesh.position.y -= breach * breach * 3;
      part.mesh.quaternion.copy(part.quaternion); part.mesh.rotateY(breach * (i % 2 ? -1 : 1) * .9);
      part.mesh.visible = breach < 1;
    }
    this.glass.visible = t < T.glass;
    this.glassCracks.visible = active && t >= T.glass - .28 && t < T.glass;
  }

  setScientist(text: string, speaker: 'green' | 'red'): void {
    const key = `${speaker}:${text}`; if (key === this.scientistKey) return;
    this.scientistKey = key; this.diagnostics.scientistText = text;
    const content = this.scientistCanvas; if (!content) return;
    const c = content.ctx; this.paintBackground(c, 1024, 640, 'LIVE / CONTAINMENT DIRECTORATE');
    c.fillStyle = speaker === 'red' ? '#ff6b75' : '#8beaac'; c.font = 'bold 31px monospace'; c.fillText(speaker === 'red' ? 'SECURITY OVERRIDE' : 'DIRECTOR CHANNEL', 44, 131);
    c.font = 'bold 46px monospace'; this.wrap(c, text, 44, 255, 938, 70);
    c.fillStyle = '#76989d'; c.font = '22px monospace'; c.fillText('REMOTE AUTHORITY / THREE SUBJECTS LOCATED', 44, 583);
    if (this.scientistTexture) this.scientistTexture.needsUpdate = true;
  }

  reset(retainOverlook = false): void {
    this.retainedOverlook = retainOverlook; this.present(retainOverlook ? T.duration : 0, false); this.setScientist('', 'green');
    this.glass.visible = !retainOverlook;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.abort.abort();
    this.root.removeFromParent(); this.lightRoot.removeFromParent(); this.root.clear(); this.lightRoot.clear();
    this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose());
  }
  private buildMonitorThrone(dark: THREE.Material, rim: THREE.Material): void {
    const glow = this.material(new THREE.MeshBasicMaterial({ color: 0x8be8ee, toneMapped: false }));
    const black = this.material(new THREE.MeshStandardMaterial({ color: 0x040c12, roughness: .24, metalness: .82 }));
    const plumeMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0x87eaff, transparent: true, opacity: .45,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.box([5.6, 3.65, .72], [0, 0, 0], dark, this.monitorDrone);
    this.box([5.15, 3.15, .13], [0, 0, -.4], black, this.monitorDrone);
    this.box([4.7, 2.8, .48], [0, 0, .53], rim, this.monitorDrone);
    for (const side of [-1, 1]) {
      this.box([.16, 3.75, .82], [side * 2.74, 0, -.05], rim, this.monitorDrone);
      this.box([.045, 2.8, .06], [side * 2.61, 0, -.46], glow, this.monitorDrone);
      this.box([.65, .14, .46], [side * 2.8, -.9, .22], rim, this.monitorDrone);
      for (const y of [-1.15, 1.15]) {
        const pod = new THREE.Group(); pod.position.set(side * 2.96, y, .2); pod.rotation.z = side * -.09;
        this.monitorDrone.add(pod);
        const housing = new THREE.Mesh(this.geometry(new THREE.CylinderGeometry(.39, .46, .78, 20)), rim); pod.add(housing);
        const nozzle = new THREE.Mesh(this.geometry(new THREE.CylinderGeometry(.27, .31, .19, 20)), black); nozzle.position.y = -.44; pod.add(nozzle);
        const ring = new THREE.Mesh(this.geometry(new THREE.TorusGeometry(.34, .045, 6, 20)), glow);
        ring.rotation.x = Math.PI / 2; ring.position.y = -.54; pod.add(ring);
        const plume = new THREE.Mesh(this.geometry(new THREE.CylinderGeometry(.13, .32, .9, 14, 1, true)), plumeMaterial);
        plume.position.y = -.98; pod.add(plume); this.thrusterPlumes.push(plume);
        for (let i = 0; i < 3; i++) this.box([.09, .035, .32], [side * .31, -.15 + i * .15, 0], dark, pod);
      }
    }
    for (const y of [-1.78, 1.78]) {
      this.box([5.65, .13, .88], [0, y, -.03], rim, this.monitorDrone);
      for (const x of [-1.6, 0, 1.6]) this.box([.48, .035, .04], [x, y, -.5], glow, this.monitorDrone);
    }
    for (const x of [-1.5, -.5, .5, 1.5]) this.box([.4, .8, .22], [x, -.5, .85], dark, this.monitorDrone);
    this.box([.18, .5, .2], [0, 2, .22], dark, this.monitorDrone);
    this.box([1.5, .12, .22], [0, 2.2, .22], rim, this.monitorDrone);
  }
  private geometry<G extends THREE.BufferGeometry>(g: G): G { this.geometries.add(g); return g; }
  private material<M extends THREE.Material>(m: M): M { this.materials.add(m); return m; }
  private box(size: [number, number, number], position: [number, number, number], material: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(new THREE.BoxGeometry(...size)), material); mesh.position.set(...position); parent.add(mesh); return mesh;
  }
  private canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false; this.textures.add(texture); return texture;
  }
  private screenMaterial(canvas?: HTMLCanvasElement): THREE.Material {
    return this.material(new THREE.MeshBasicMaterial({ map: canvas ? this.canvasTexture(canvas) : null, color: canvas ? 0xffffff : 0x11343d, toneMapped: false }));
  }
  private paintBackground(c: CanvasRenderingContext2D, w: number, h: number, heading: string): void {
    c.fillStyle = '#061118'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#163039'; c.lineWidth = 1;
    for (let x = 0; x < w; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = '#76abae'; c.font = `${Math.round(w / 43)}px monospace`; c.fillText(heading, w * .035, h * .065);
    c.strokeStyle = '#36616b'; c.strokeRect(w * .016, h * .018, w * .968, h * .964);
  }
  private wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number): void {
    let line = ''; for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (c.measureText(next).width > width && line) { c.fillText(line, x, y); y += height; line = word; } else line = next;
    } c.fillText(line, x, y);
  }
}
