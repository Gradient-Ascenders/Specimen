import * as THREE from 'three';

import { TypewriterAudio } from '../../../audio/TypewriterAudio.ts';
import type { Vector3State } from '../../slime/SlimePresentationContract.ts';
import { ContainmentMonitorDialogue, MONITOR_DIALOGUE_TIMING, paginateMonitorSections } from './ContainmentMonitorDialogue.ts';
import { createContainmentSpeechTexture, paintContainmentSpeechTexture } from './ContainmentProceduralTextures.ts';
import { markVisualOnly } from './ContainmentModularComponents.ts';
import { GOOP_SPEECH_SIZE } from './GoopSpeechFraming.ts';

export const ROOM_FIVE_GOOP_SPEECH_SCRIPT = Object.freeze([
  'Hey! You!',
  'Get me outta here!',
  'They will kill you too',
  'The switch is at the top',
]);
export const ROOM_FIVE_GOOP_SPEECH_TRIGGER = Object.freeze({
  centre: Object.freeze({ x: 0, y: 76.546, z: 110 }), radius: 8,
});
export const ROOM_FIVE_GOOP_SPEECH_POSITION = Object.freeze({ x: 0, y: 79.7, z: 110 });
export const ROOM_FIVE_GOOP_SPEECH_TIMING = Object.freeze({ revealSeconds: .22, finalHoldSeconds: 4, fadeSeconds: .45 });

const PAGES = paginateMonitorSections(ROOM_FIVE_GOOP_SPEECH_SCRIPT, 18, 2);
const FINAL_TEXT_SECONDS = PAGES.reduce((seconds, page, index) => seconds +
  (page.text.length - 1) * MONITOR_DIALOGUE_TIMING.characterSeconds +
  (index === PAGES.length - 1 ? 0 : MONITOR_DIALOGUE_TIMING.sectionHoldSeconds), 0);

/** One diegetic, depth-tested billboard. No DOM overlay, lights or font downloads. */
export class RoomFiveGoopSpeech {
  readonly root = new THREE.Group();
  readonly dialogue = new ContainmentMonitorDialogue(ROOM_FIVE_GOOP_SPEECH_SCRIPT, { columns: 18, rows: 2 });
  readonly texture = createContainmentSpeechTexture();
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private elapsedSeconds = 0;
  private revealSeconds = 0;
  private activated = false;
  private finished = false;
  private disposed = false;
  private readonly viewOrientation = new THREE.Quaternion();
  private readonly parentOrientation = new THREE.Quaternion();
  private readonly speechAudio = new TypewriterAudio(this.root, {
    sound: 'bob-contact-01', intervalSeconds: .32, volumeScale: .35, maxDistance: 12,
    // The balloon is above his head; sound belongs to Goop inside the cell.
    localPosition: { x: 0, y: ROOM_FIVE_GOOP_SPEECH_TRIGGER.centre.y - ROOM_FIVE_GOOP_SPEECH_POSITION.y, z: 0 },
  });

  constructor() {
    this.root.name = 'room-5-goop-rescue-speech';
    this.root.position.copy(ROOM_FIVE_GOOP_SPEECH_POSITION);
    this.root.userData.presentationOwnedBy = this.root.name;
    const geometry = new THREE.PlaneGeometry(GOOP_SPEECH_SIZE.width, GOOP_SPEECH_SIZE.height);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const material = new THREE.MeshBasicMaterial({ name: 'room-5-goop-speech-display', map: this.texture,
      transparent: true, opacity: 0, depthTest: true, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'room-5-goop-speech-billboard';
    this.mesh.renderOrder = 10;
    this.root.add(this.mesh);
    this.root.traverse(markVisualOnly);
    // Keep the material discoverable while dormant for existing shader prewarm.
    // Opacity hides it; there is no new material/geometry on first approach.
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      if (this.disposed || this.mesh.material.opacity === 0) return;
      camera.getWorldQuaternion(this.viewOrientation);
      this.root.getWorldQuaternion(this.parentOrientation).invert();
      this.mesh.quaternion.copy(this.parentOrientation).multiply(this.viewOrientation);
      this.mesh.updateMatrixWorld(true);
    };
  }

  get hasActivated(): boolean { return this.activated; }
  get hasFinished(): boolean { return this.finished; }
  get isShowing(): boolean { return !this.disposed && this.mesh.material.opacity > 0; }

  update(deltaSeconds: number, activePosition?: Vector3State, available = true): void {
    if (this.disposed) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Invalid speech timestep.');
    const { centre, radius } = ROOM_FIVE_GOOP_SPEECH_TRIGGER;
    const dx = (activePosition?.x ?? NaN) - centre.x;
    const dy = (activePosition?.y ?? NaN) - centre.y;
    const dz = (activePosition?.z ?? NaN) - centre.z;
    if (this.finished || !available || !(dx * dx + dy * dy + dz * dz <= radius * radius)) {
      this.mesh.material.opacity = 0; this.revealSeconds = 0;
      this.speechAudio.update(deltaSeconds, this.dialogue.readModel, false);
      return;
    }
    this.activated = true;
    this.elapsedSeconds += deltaSeconds; this.revealSeconds += deltaSeconds;
    if (this.dialogue.update(deltaSeconds)) {
      const { text, typing, sectionIndex } = this.dialogue.readModel;
      paintContainmentSpeechTexture(this.texture, text, typing, sectionIndex);
    }
    const T = ROOM_FIVE_GOOP_SPEECH_TIMING;
    const reveal = Math.min(1, this.revealSeconds / T.revealSeconds);
    const fade = Math.max(0, Math.min(1,
      (FINAL_TEXT_SECONDS + T.finalHoldSeconds + T.fadeSeconds - this.elapsedSeconds) / T.fadeSeconds));
    this.mesh.scale.setScalar(.92 + .08 * (1 - (1 - reveal) ** 3));
    this.mesh.material.opacity = reveal * fade;
    if (fade === 0) this.finished = true;
    this.speechAudio.update(deltaSeconds, this.dialogue.readModel, this.isShowing);
  }

  /** Retry unfinished warnings, but remember every line once the final hint is typed. */
  resetForCheckpointRecovery(): void {
    if (this.disposed) return;
    if (!this.dialogue.readModel.complete) {
      this.reset();
      return;
    }
    this.finished = true;
    this.revealSeconds = 0;
    this.mesh.material.opacity = 0;
    this.speechAudio.reset();
  }

  /** A full level restart starts a fresh conversation, unlike checkpoint recovery. */
  reset(): void {
    if (this.disposed) return;
    const hadText = this.dialogue.readModel.text.length > 0;
    this.elapsedSeconds = 0; this.revealSeconds = 0; this.activated = false; this.finished = false;
    this.dialogue.reset(); this.mesh.material.opacity = 0; this.mesh.scale.setScalar(1);
    this.speechAudio.reset();
    if (hadText) paintContainmentSpeechTexture(this.texture, '', false, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent(); this.root.clear(); this.mesh.onBeforeRender = () => {};
    this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.texture.dispose();
  }
}
