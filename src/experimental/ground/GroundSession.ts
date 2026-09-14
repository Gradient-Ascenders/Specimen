import { DeformableBody, type CageConfig } from './DeformableBody.ts';
import { PREFERRED_MATERIAL_CONFIG } from './MaterialPresets.ts';
import { KinematicGroundBody } from './KinematicGroundBody.ts';
import { IDLE, type BodyKind, type GroundBody, type GroundInput, type Vec3 } from './GroundBody.ts';

export const MAX_RECORDING_TICKS = 1800;
export interface GroundTape {
  version: 1;
  kind: BodyKind;
  config: CageConfig;
  spawn: Vec3;
  inputs: GroundInput[];
  expected?: string;
}
export function reversalInputs(): GroundInput[] {
  return Array.from({length:600}, (_,tick) => ({
    x: tick<120 ? 0 : tick<360 ? 1 : tick<480 ? -1 : 0,
    z: 0, coast: tick>=480,
  }));
}
export function stateDigest(state: string): string {
  let hash=2166136261;
  for (let i=0; i<state.length; i++) hash=Math.imul(hash^state.charCodeAt(i),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}

/** Records tick inputs and frozen configuration, never wall-clock timestamps. */
export class GroundSession {
  body: GroundBody;
  kind: BodyKind = 'deformable';
  config: CageConfig = {...PREFERRED_MATERIAL_CONFIG};
  spawn: Vec3 = [0,.51,0];
  tick=0;
  mode: 'live' | 'recording' | 'replay' | 'finished' = 'live';
  savedTape: GroundTape | undefined;
  replayResult = '';
  private activeTape: GroundTape | undefined;

  constructor() { this.body=new DeformableBody(this.config); }
  reset(): void {
    this.body.reset(this.spawn);
    this.tick=0; this.mode='live'; this.activeTape=undefined; this.replayResult='';
  }
  configure(kind: BodyKind, config: CageConfig, spawn: Vec3 = [0,.51,0]): void {
    const next = kind==='deformable' ? new DeformableBody(config) : new KinematicGroundBody();
    this.body.dispose(); this.body=next; this.kind=kind; this.config={...config}; this.spawn=[...spawn];
    this.reset();
  }
  startRecording(): void {
    this.reset();
    this.activeTape={version:1,kind:this.kind,config:{...this.config},spawn:[...this.spawn],inputs:[]};
    this.mode='recording';
  }
  stopRecording(): void {
    if (this.mode!=='recording' || !this.activeTape) return;
    this.activeTape.expected=JSON.stringify(this.body.snapshot());
    this.savedTape=this.activeTape; this.activeTape=undefined; this.mode='finished';
    this.replayResult=`Recorded ${this.tick} ticks · ${stateDigest(this.savedTape.expected!)}`;
  }
  play(tape: GroundTape): void {
    this.configure(tape.kind,tape.config,tape.spawn);
    this.activeTape={...tape,config:{...tape.config},inputs:tape.inputs.map((input)=>({...input}))};
    this.mode='replay';
    if (!tape.inputs.length) this.finishReplay();
  }
  playReversal(): void {
    this.play({version:1,kind:this.kind,config:{...this.config},spawn:[...this.spawn],inputs:reversalInputs()});
  }
  private finishReplay(): void {
    const tape=this.activeTape!;
    const state=JSON.stringify(this.body.snapshot());
    this.replayResult=tape.expected === undefined
      ? `Tape complete · ${stateDigest(state)}`
      : `${state===tape.expected ? 'EXACT replay match' : 'REPLAY MISMATCH'} · ${stateDigest(state)}`;
    this.savedTape={...tape,expected:tape.expected ?? state};
    this.activeTape=undefined; this.mode='finished';
  }
  step(input: GroundInput = IDLE): void {
    if (this.mode==='finished') return;
    const sampled=this.mode==='replay' ? this.activeTape!.inputs[this.tick] : input;
    this.body.step(sampled); this.tick++;
    if (this.mode==='recording') {
      this.activeTape!.inputs.push({...sampled});
      if (this.tick>=MAX_RECORDING_TICKS) this.stopRecording();
    } else if (this.mode==='replay' && this.tick===this.activeTape!.inputs.length) this.finishReplay();
  }
}
