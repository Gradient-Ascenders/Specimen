import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { TypewriterAudio } from '../../../audio/TypewriterAudio.ts';
import type { ContainmentArtMaterials } from './ContainmentArtResources.ts';
import type { Vector3State } from '../../slime/SlimePresentationContract.ts';
import { createContainmentMonitorTexture, paintContainmentMonitorTexture,
  type MonitorTextColour } from './ContainmentProceduralTextures.ts';
import { markVisualOnly } from './ContainmentModularComponents.ts';
import type { ContainmentMonitorDialogue } from './ContainmentMonitorDialogue.ts';

interface ContainmentMonitorOptions {
  readonly roomId: number;
  readonly namePrefix?: string;
  readonly position: Vector3State;
  readonly yaw: number;
  readonly dialogue: ContainmentMonitorDialogue;
  readonly sectionColours?: readonly MonitorTextColour[];
}

/** Borrow only the two finishes a terminal needs, including in other levels. */
export interface ContainmentMonitorResources {
  readonly materials: Pick<ContainmentArtMaterials, 'graphite' | 'serviceMetal'>;
}

/** Wall-mounted, three-draw observation terminal. Shared finishes remain borrowed. */
export class ContainmentMonitor {
  readonly root = new THREE.Group();
  readonly dialogue: ContainmentMonitorDialogue;
  readonly texture = createContainmentMonitorTexture();
  readonly screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly sectionColours: readonly MonitorTextColour[];
  private readonly typingAudio = new TypewriterAudio(this.root, {
    sound: 'world-sign-tick-01', intervalSeconds: .12, maxDistance: 14,
  });
  protected disposed = false;
  private presentationActive=true;
  private textureDirty=false;
  setPresentationActive(active:boolean):void { this.presentationActive=active; }

  constructor(resources: ContainmentMonitorResources, options: ContainmentMonitorOptions) {
    const owner = options.namePrefix ?? `room-${options.roomId}`;
    const prefix = `${owner}-monitor`;
    this.dialogue = options.dialogue;
    this.sectionColours = options.sectionColours ?? [];
    this.root.name = `${owner}-observation-monitor`;
    this.texture.name = `${this.root.name}-screen`;
    this.root.position.copy(options.position);
    this.root.rotation.y = options.yaw;
    this.root.userData.presentationOwnedBy = this.root.name;
    const hardware = (name: string, material: THREE.Material,
      parts: readonly { size: [number, number, number]; at: [number, number, number] }[]) => {
      const pieces = parts.map(part => new THREE.BoxGeometry(...part.size).translate(...part.at));
      const geometry = mergeGeometries(pieces)!;
      for (const piece of pieces) piece.dispose();
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
      mesh.receiveShadow = true; this.root.add(mesh);
    };
    hardware(`${prefix}-graphite-housing`, resources.materials.graphite, [
      { size: [4.18, 2.68, .23], at: [0, 0, .08] },
      { size: [.18, 2.2, .14], at: [-1.65, 0, -.09] },
      { size: [.18, 2.2, .14], at: [1.65, 0, -.09] },
    ]);
    hardware(`${prefix}-retaining-trim`, resources.materials.serviceMetal, [
      { size: [4.05, .045, .05], at: [0, 1.22, .2] },
      { size: [4.05, .045, .05], at: [0, -1.22, .2] },
      // Butt-join the vertical rails to the horizontals instead of overlapping
      // their front faces at each corner.
      { size: [.045, 2.395, .05], at: [-2.005, 0, .2] },
      { size: [.045, 2.395, .05], at: [2.005, 0, .2] },
      ...[-1, 1].flatMap(x => [-1, 1].map(y => ({
        size: [.075, .075, .035] as [number, number, number],
        at: [x * 1.96, y * 1.18, .235] as [number, number, number],
      }))),
    ]);
    const screenGeometry = new THREE.PlaneGeometry(3.8, 2.2);
    // Data-texture rows are top-down; keep the terminal upright, not mirrored.
    const uv = screenGeometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    material.name = `${prefix}-display`;
    this.screen = new THREE.Mesh(screenGeometry, material);
    this.screen.name = `${prefix}-screen`; this.screen.position.z = .205;
    this.geometries.push(screenGeometry); this.root.add(this.screen);
    this.root.traverse(object => {
      markVisualOnly(object);
      // All hardware is immutable; typing changes only an existing screen texture.
      object.updateMatrix(); object.matrixAutoUpdate = false;
    });
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    this.textureDirty=this.dialogue.update(deltaSeconds)||this.textureDirty;
    if (this.presentationActive&&this.textureDirty) {
      const { text, typing, sectionIndex } = this.dialogue.readModel;
      paintContainmentMonitorTexture(this.texture, text, typing, this.sectionColours[sectionIndex] ?? 'green');
      this.textureDirty=false;
    }
    this.typingAudio.update(deltaSeconds, this.dialogue.readModel);
  }

  reset(preserveCompleted = false): void {
    if (this.disposed) return;
    // Checkpoint recovery keeps the final page, without repainting or retyping.
    if (preserveCompleted && this.dialogue.readModel.complete) return;
    this.dialogue.reset();
    this.textureDirty=false;
    this.typingAudio.reset();
    paintContainmentMonitorTexture(this.texture, '', false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    this.screen.material.dispose(); this.texture.dispose();
    this.root.clear();
  }
}

/** One-shot gameplay proximity gate shared by the later observation terminals. */
export class ProximityContainmentMonitor extends ContainmentMonitor {
  private activated = false;
  private readonly trigger: { readonly centre: Vector3State; readonly radius: number };

  constructor(resources: ContainmentMonitorResources, options: ContainmentMonitorOptions & {
    readonly trigger: { readonly centre: Vector3State; readonly radius: number };
  }) {
    super(resources, options);
    this.trigger = options.trigger;
  }

  get hasActivated(): boolean { return this.activated; }

  override update(deltaSeconds: number, activePosition?: Vector3State): void {
    if (this.disposed) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Invalid monitor timestep.');
    if (!this.activated) {
      if (!activePosition) return;
      const { centre, radius } = this.trigger;
      const dx = activePosition.x - centre.x, dy = activePosition.y - centre.y, dz = activePosition.z - centre.z;
      if (!(dx * dx + dy * dy + dz * dz <= radius * radius)) return;
      this.activated = true;
    }
    super.update(deltaSeconds);
  }

  override reset(preserveCompleted = false): void {
    if (this.disposed) return;
    if (!preserveCompleted || !this.dialogue.readModel.complete) this.activated = false;
    super.reset(preserveCompleted);
  }
}
