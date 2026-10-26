import * as THREE from 'three';
import { FINAL_MERGE_ANCHOR } from '../boss/FinalBossConfig.ts';
import { RESEARCH_WING_ORIGIN, researchLocalZ } from './BlackoutResearchLayout.ts';

export type ResearchSlime = 'bob' | 'goop' | 'volt';
export type ResearchSpeaker = ResearchSlime | 'green' | 'red';
export const RESEARCH_TIMING = Object.freeze({ alarm: 66, sentries: 68, monitorEntry: 80, monitorArrives: 90,
  overload: 116.5, lampBurst: 121, blackout: 123.5, search: 125, findThem: 130, chase: 134, pursuit: 170.1,
  deadEnd: 164, doorJump: 168, collision: 168.65, doorLand: 169.3, firingLine: 190,
  crossfire: 195, attraction: 205, fusion: 208, reveal: 213, charge: 219, blast: 222,
  doorBlast: 227, escape: 230, overlook: 236, ambush: 242.5, ram: 243, glass: 243.35,
  fall: 244, landing: 247.4, turnPursuers: 251.5, clearPursuers: 253,
  pitUnlock: 256.4, pitOpen: 257, noticeBoss: 258.4, pitClear: 261.2,
  boss: 262, handback: 274, duration: 277 });
/** The visible cascading failures and their sound share the same four beats. */
export const RESEARCH_LIGHT_FAILURES = Object.freeze([25, 20, 12, 4].map(z => ({z, at: RESEARCH_TIMING.lampBurst + (25-z)/8*.65})));
export const RESEARCH_DIALOGUE = Object.freeze([
  { start: 12, end: 18, speaker: 'goop', text: 'Looks like they’re quite the fans of you, Bob.' },
  { start: 49, end: 56, speaker: 'volt', text: 'Never thought I’d see someone more dangerous than Goop.' },
  { start: 57.5, end: 62.5, speaker: 'goop', text: 'Bob we gotta get you outta here' },
  { start: 92, end: 99, speaker: 'green', text: 'Time to head back to your cells, little ones.' },
  { start: 100.5, end: 105.5, speaker: 'green', text: 'Playtime is over.' },
  { start: 108, end: 112, speaker: 'red', text: 'Capture them.' },
  { start: 112.2, end: 114.2, speaker: 'volt', text: 'Follow my lead.' },
  { start: 130, end: 132.6, speaker: 'red', text: 'Find them' },
  { start: 143.8, end: 149.8, speaker: 'volt', text: 'I’ve got a plan, but Bob’s life could be on the line.' },
  { start: 151.3, end: 157.3, speaker: 'goop', text: 'Not sure how I feel about that, but we’re toast either way.' },
  { start: 180, end: 185, speaker: 'volt', text: 'Keep firing at Bob! Don’t stop!' },
  { start: 186.5, end: 188.5, speaker: 'goop', text: 'What!?' },
  { start: 190, end: 193, speaker: 'volt', text: 'Just do it!' },
] as const);
export const RESEARCH_FINDINGS = Object.freeze([
  { title: 'VISCOELASTIC MEMORY', subtitle: 'COMPRESSION / RECOVERY', lines: ['Shape returns after extreme compression.', 'Impact stress disperses through the gel.', 'No permanent structural damage observed.'] },
  { title: 'ENERGY RETENTION', subtitle: 'IMPACT / STORAGE', lines: ['The matrix retains incoming energy.', 'Repeated impacts increase internal charge.', 'Upper storage limit remains unknown.'] },
  { title: 'ADAPTIVE ADHESION', subtitle: 'SURFACE / RESPONSE', lines: ['Reversible bonds form on contact.', 'Grip adapts to changing surface loads.', 'Release does not damage the tissue.'] },
  { title: 'SELF-REPAIR', subtitle: 'CELLULAR / REASSEMBLY', lines: ['The cellular lattice reseals rapidly.', 'Separated tissue seeks its original form.', 'No visible scarring after recovery.'] },
  { title: 'FUSION COMPATIBILITY', subtitle: 'HOST / CATALYST', lines: ['Bob stabilises incompatible specimens.', 'Electrical and corrosive traits coexist.', 'A shared energy surge may trigger fusion.'] },
  { title: 'UNBOUNDED POTENTIAL', subtitle: 'SPECULATIVE / RESTRICTED', lines: ['Absorbed power changes the whole matrix.', 'A critical threshold has not been tested.', 'Do not expose to sustained crossfire.'] },
] as const);

export const researchEase = (u: number): number => { u = THREE.MathUtils.clamp(u, 0, 1); return u * u * (3 - 2 * u); };
export const researchWindow = (t: number, start: number, end: number): number => researchEase((t - start) / (end - start));
export function researchShot(t: number): string {
  if (t < 19) return 'research-walk';
  if (t < 25) return 'bob-reaction';
  if (t < 34) return 'research-insert';
  if (t < 46) return 'catastrophic-research';
  if (t < RESEARCH_TIMING.alarm) return 'the-warning';
  if (t < RESEARCH_TIMING.monitorEntry) return 'containment-alarm';
  if (t < RESEARCH_TIMING.overload) return 'the-scientists';
  if (t < RESEARCH_TIMING.search) return 'lights-out';
  if (t < RESEARCH_TIMING.chase) return 'empty-search';
  if (t < RESEARCH_TIMING.deadEnd) return 'hallway-chase';
  if (t < 173) return 'dead-end';
  if (t < 179) return 'closing-drones';
  if (t < RESEARCH_TIMING.crossfire) return 'the-plan';
  if (t < RESEARCH_TIMING.fusion) return 'crossfire';
  if (t < RESEARCH_TIMING.reveal) return 'fusion-flash';
  if (t < RESEARCH_TIMING.charge) return 'specimen-reveal';
  if (t < 226) return 'first-blast';
  if (t < RESEARCH_TIMING.overlook) return 'breach-the-door';
  if (t < RESEARCH_TIMING.ambush) return 'arena-overlook';
  if (t < RESEARCH_TIMING.fall) return 'glass-ambush';
  if (t < RESEARCH_TIMING.turnPursuers) return 'arena-impact';
  if (t < RESEARCH_TIMING.pitUnlock) return 'airborne-pursuers';
  if (t < RESEARCH_TIMING.boss) return 'pit-opening';
  if (t < RESEARCH_TIMING.handback) return 'exterminator-emergence';
  return 'boss-handoff';
}

export interface ResearchActorSample { airborne: boolean; visible: boolean; scale: number; }
export function sampleResearchSlime(id: ResearchSlime, t: number, out: THREE.Vector3): ResearchActorSample {
  const T = RESEARCH_TIMING;
  const lane = id === 'goop' ? -1.45 : id === 'volt' ? 1.45 : 0;
  let airborne = false;
  out.set(lane, .46, 3 + 22 * researchWindow(t, 0, 46));
  if (t >= 46) out.z = 25 + (id === 'bob' ? .6 : 0);
  if (t >= T.blackout) out.set(16 + lane, .46, 30);
  if (t >= T.chase) {
    const elapsed = THREE.MathUtils.clamp(t - T.chase, 0, T.deadEnd - T.chase);
    const speed = 57 / (T.deadEnd - T.chase);
    let distance = elapsed * speed;
    if (id === 'bob' && Math.floor(elapsed / 1.12) < Math.floor((T.deadEnd - T.chase) / 1.12)) {
      const cycle = elapsed / 1.12, phase = cycle % 1;
      const carry = phase < .62 ? .88 * phase / .62 : .88 + .12 * (phase - .62) / .38;
      distance = (Math.floor(cycle) + carry) * 1.12 * speed;
      if (phase < .62) { const flight = phase / .62; out.y += 4 * flight * (1 - flight) * 1.05; airborne = true; }
    }
    out.x = 16 + lane; out.z = 30 + distance;
  }
  if (t >= T.deadEnd) {
    out.set(16 + lane, .46, 87 + researchWindow(t, T.deadEnd, T.deadEnd + 1.1) * (id === 'bob' ? 2 : 1.7));
    if (id === 'bob' && t >= T.doorJump) {
      if (t < T.collision) {
        const u = (t - T.doorJump) / (T.collision - T.doorJump);
        out.z = 89 + 5.05 * u; out.y += Math.sin(u * Math.PI * .72) * 1.15; airborne = true;
      } else if (t < T.doorLand) {
        const u = (t - T.collision) / (T.doorLand - T.collision);
        out.z = THREE.MathUtils.lerp(94.05, 92.1, u); out.y += Math.sin(Math.PI * .72) * 1.15 * (1 - u * u); airborne = true;
      } else out.z = 92.1;
    }
    if (t >= T.attraction) {
      const u = researchWindow(t, T.attraction, T.fusion + .8), twist = u * Math.PI * 1.1;
      const dx = out.x - 16, dz = out.z - 92.1;
      out.x = 16 + (dx * Math.cos(twist) - dz * Math.sin(twist) * .3) * (1 - u);
      out.z = 92.1 + (dz * Math.cos(twist) + dx * Math.sin(twist)) * (1 - u);
      out.y += Math.sin(u * Math.PI) * .65;
    }
  }
  const shrink = researchWindow(t, T.attraction + 1, T.fusion + 1.4);
  out.z = researchLocalZ(out.z);
  return { airborne, visible: t < T.blackout || t >= T.chase && t < T.fusion + 1.5, scale: 1 - .98 * shrink };
}

export function sampleResearchSpecimen(t: number, out: THREE.Vector3): void {
  const T = RESEARCH_TIMING;
  out.set(16, 1.67, 92.1);
  if (t >= T.escape) out.z = THREE.MathUtils.lerp(92.1, 108.5, researchWindow(t, T.escape, T.overlook));
  if (t >= T.ram) {
    out.z = t < T.glass ? THREE.MathUtils.lerp(108.5, 109.75, researchWindow(t, T.ram, T.glass)) :
      THREE.MathUtils.lerp(109.75, 113, researchWindow(t, T.glass, T.fall));
    out.y += .43 * researchWindow(t, T.glass, T.fall);
  }
}

export function sampleResearchSpecimenWorld(t: number, out: THREE.Vector3): void {
  const T = RESEARCH_TIMING;
  if (t < T.fall) { sampleResearchSpecimen(t, out); out.add(RESEARCH_WING_ORIGIN); return; }
  const u = THREE.MathUtils.clamp((t - T.fall) / (T.landing - T.fall), 0, 1);
  out.copy(FINAL_MERGE_ANCHOR);
  out.y += (RESEARCH_WING_ORIGIN.y + 2.1 - FINAL_MERGE_ANCHOR.y) * (1 - u * u);
  out.z = THREE.MathUtils.lerp(RESEARCH_WING_ORIGIN.z + 113, FINAL_MERGE_ANCHOR.z, u);
}

export function researchPursuerShotTime(index: number): number { return RESEARCH_TIMING.clearPursuers + index * .7; }

export function researchDroneDeathTime(index: number): number {
  return index < 8 ? RESEARCH_TIMING.blast + .3 + index * .065 : researchPursuerShotTime(index - 8) + .28;
}
export function researchDroneFireStart(index: number): number {
  return index < 8 ? RESEARCH_TIMING.reveal + .6 + index * .025 : RESEARCH_TIMING.landing + .5 + (index - 8) * .08;
}
export function researchDroneFireInterval(index: number): number { return .31 + index % 3 * .025; }
