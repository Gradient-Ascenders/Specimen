import * as THREE from 'three';
import { TypewriterAudio } from '../../../audio/TypewriterAudio.ts';
import { GAMEPLAY_UI_LAYER } from '../../GameplayUiLayer.ts';
import type { SlimeId } from '../../../slimes/SlimeRoster.ts';
import type { Vector3State } from '../../slime/SlimePresentationContract.ts';
import { ContainmentMonitorDialogue } from '../containment/ContainmentMonitorDialogue.ts';
import { createContainmentSpeechTexture, paintContainmentSpeechTexture } from '../containment/ContainmentProceduralTextures.ts';
import { GOOP_SPEECH_SIZE, GoopSpeechFraming } from '../containment/GoopSpeechFraming.ts';

export const BLACKOUT_ROOM_ONE_SCRIPT = Object.freeze([
  { speaker: 'volt', text: 'Been a while, Goop' },
  { speaker: 'goop', text: 'Looks like they’ve tightened security around you.' },
  { speaker: 'volt', text: 'Who’s your new friend?' },
  { speaker: 'goop', text: 'Our ticket outta here.' },
] as const);

interface SpeechState {
  readonly activeSlimeId: SlimeId;
  readonly enabled: boolean;
  readonly rendered: boolean;
  readonly goop: Vector3State;
  readonly volt: Vector3State;
}

export class BlackoutRoomOneSpeech {
  readonly root = new THREE.Group();
  readonly texture = createContainmentSpeechTexture();
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly dialogue = new ContainmentMonitorDialogue(BLACKOUT_ROOM_ONE_SCRIPT.map(line => line.text), {
    delaySeconds: 1.2, columns: 18, rows: 2, sectionHoldSeconds: [2.2, 2.6, 2.2],
  });
  private readonly framing: GoopSpeechFraming;
  private readonly position = new THREE.Vector3();
  private readonly speechAudio = new TypewriterAudio(this.root, {
    sound: 'bob-contact-01', intervalSeconds: .32, volumeScale: .3, maxDistance: 18,
    localPosition: { x: 0, y: -2.75, z: 0 },
  });
  private elapsed = 0;
  private heard = false;
  private disposed = false;

  constructor() {
    this.root.name = 'blackout-room-one-speech';
    this.root.visible = false;
    this.texture.name = 'blackout-room-one-speech-texture';
    const geometry = new THREE.PlaneGeometry(GOOP_SPEECH_SIZE.width, GOOP_SPEECH_SIZE.height);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    }));
    this.mesh.name = 'blackout-room-one-speech-panel';
    this.mesh.layers.set(GAMEPLAY_UI_LAYER);
    this.mesh.userData.visualOnly = true;
    this.root.add(this.mesh);
    this.framing = new GoopSpeechFraming(this.root, this.mesh, -.6);
    this.framing.setPlayerControlled(false);
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => this.framing.present(camera);
  }

  get readModel() {
    return { ...this.dialogue.readModel, speaker: BLACKOUT_ROOM_ONE_SCRIPT[this.dialogue.readModel.sectionIndex].speaker,
      heard: this.heard };
  }

  update(dt: number, state: SpeechState): void {
    if (this.disposed) return;
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid speech timestep.');
    this.root.visible = state.enabled && state.rendered && !this.heard;
    if (!this.root.visible) return;
    this.elapsed += dt;
    if (this.dialogue.update(dt)) {
      const model = this.readModel;
      paintContainmentSpeechTexture(this.texture, model.text, model.typing, model.sectionIndex,
        BLACKOUT_ROOM_ONE_SCRIPT.length, model.speaker);
      this.root.userData.speaker = model.speaker;
    }
    this.present(state);
    const reveal = THREE.MathUtils.clamp((this.elapsed - 1.2) / .22, 0, 1);
    const fade = 1 - THREE.MathUtils.clamp((this.elapsed - this.dialogue.durationSeconds - 3) / .4, 0, 1);
    this.mesh.material.opacity = reveal * fade;
    this.speechAudio.update(dt, this.dialogue.readModel, this.mesh.material.opacity > 0);
    if (fade === 0) { this.heard = true; this.hide(); }
  }

  present(state: Pick<SpeechState, 'goop' | 'volt' | 'activeSlimeId'>): void {
    if (this.disposed) return;
    const speaker = this.readModel.speaker;
    this.framing.setPlayerControlled(state.activeSlimeId === speaker);
    this.position.copy(state[speaker]);
    this.root.parent?.worldToLocal(this.position);
    this.root.position.copy(this.position);
    this.root.position.y += 2.75;
  }

  hide(): void { this.root.visible = false; }

  reset(preserveCompleted = false): void {
    if (this.disposed) return;
    this.heard = preserveCompleted && (this.heard || this.dialogue.readModel.complete);
    this.elapsed = 0;
    this.dialogue.reset();
    this.speechAudio.reset();
    this.mesh.material.opacity = 0;
    this.hide();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.onBeforeRender = () => {};
    this.root.removeFromParent();
    this.root.clear();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}
