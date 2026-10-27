import * as THREE from 'three';
import { FINAL_ARENA } from '../boss/FinalBossConfig.ts';
import { ENDING_ANCHOR as A, ENDING_TIMING as T, ENDING_EXIT_Z, endingProgress, sampleEndingBossWreck } from './BossDefeatTimeline.ts';

export class BossDefeatCamera {
  private readonly eye = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  present(camera: THREE.PerspectiveCamera, t: number, specimen: THREE.Vector3, boss: THREE.Vector3,
    collision: THREE.Vector3, bob: THREE.Vector3, goop: THREE.Vector3, volt: THREE.Vector3): void {
    const e = this.eye, f = this.focus; let fov = 52, shake = 0;
    if (t < T.charge) {
      const p = endingProgress(t, 0, T.charge); e.copy(boss).add(f.set(-19 + p * 4, 5, -24)); f.copy(boss).addScalar(0); f.y += 2; fov = 45;
    } else if (t < T.bossCharge) {
      e.copy(specimen).add(f.set(-4.5, 1.6, 6.5)); f.copy(specimen).y += .5; fov = 42;
    } else if (t < T.fire) {
      e.copy(boss).add(f.set(8, 2, -13)); f.copy(boss); fov = 46; shake = .02;
    } else if (t < T.specimenFire - .3) {
      e.copy(boss).add(f.set(9, 2.7, -12)); f.copy(boss); f.z -= 9; fov = 54; shake = .06;
    } else if (t < T.impact + .7) {
      e.copy(specimen).add(f.set(-7, 2, 5)); f.copy(specimen); f.y += .3; fov = 56; shake = .06;
    } else if (t < T.strain) {
      e.set(42 - (t - T.fire) * .6, 21, A.z + 13); f.copy(collision); fov = 64; shake = .06;
    } else if (t < T.escalation) {
      const bossShot = Math.floor((t - T.strain) / 1.3) % 2 === 1;
      if (bossShot) { e.copy(boss).add(f.set(6, 1.2, -11)); f.copy(boss); fov = 37; }
      else { e.copy(specimen).add(f.set(-3.6, .7, 5)); f.copy(specimen).y += .4; fov = 38; }
      shake = .04 + endingProgress(t, T.strain, T.escalation) * .045;
    } else if (t < T.orbit) {
      e.set(54 + (t - T.escalation) * .65, 28, A.z + 5); f.copy(collision); fov = 66; shake = .12;
    } else if (t < T.explosion) {
      const angle = endingProgress(t, T.orbit, T.explosion) * Math.PI * .8;
      e.copy(collision).add(f.set(Math.cos(angle) * 19, 8 + Math.sin(angle) * 4, Math.sin(angle) * 19)); f.copy(collision); fov = 65;
      shake = .12 + endingProgress(t, T.orbit, T.explosion) * .18;
    } else if (t < T.bossDrop) {
      const p = endingProgress(t, T.explosion, T.bossDrop);
      e.set(24 + p * 6, 16 + p * 5, A.z + 7); f.set(0, 2.5, A.z - 5); fov = 64; shake = .5 * (1 - p);
    } else if (t < T.bossLost) {
      e.set(28, 13, FINAL_ARENA.centreZ - 38); sampleEndingBossWreck(t, f); fov = 64; shake = .035;
    } else if (t < T.together) {
      e.set(-9, 4.2, A.z + 1); f.copy(bob).add(goop).add(volt).multiplyScalar(1 / 3); f.y += .6; fov = 53; shake = .025;
    } else if (t < T.drones) {
      e.copy(volt).add(f.set(-4, 1.6, 4.5)); f.copy(volt).y += .7; fov = 46; shake = .04;
    } else if (t < T.sacrifice - 3) {
      e.set(6, 4.5, A.z + 1); f.set(45, 8, A.z + 15); fov = 61; shake = .025;
    } else if (t < T.protest) {
      e.copy(goop).add(f.set(-4, 1.2, -4)); f.copy(goop).y += .6; fov = 41; shake = .035;
    } else if (t < T.insist) {
      e.copy(volt).add(f.set(3.2, 1.1, 3.7)); f.copy(volt).y += .5; fov = 41;
    } else if (t < T.leave) {
      e.copy(goop).add(f.set(2.4, 1.15, -4)); f.copy(goop).y += .65; fov = 39; shake = .05;
    } else if (t < T.lookBack) {
      e.copy(bob).add(f.set(-4, 2.1, -7)); f.copy(bob).add(volt).multiplyScalar(.5); f.y += .4; fov = 53; shake = .035;
    } else if (t < T.runAgain) {
      if (t < T.goodbye) { e.copy(bob).add(f.set(-2, 1, 3.5)); f.copy(bob).y += .5; fov = 40; }
      else { const p = endingProgress(t, T.goodbye, T.runAgain);
        e.copy(goop).add(f.set(3.4 - p * .3, 1.4, -5.8 + p * .4)); f.copy(goop).y += .65; fov = 41 - p * 2; }
      shake = .015;
    } else if (t < T.destruction) {
      e.copy(bob).add(f.set(-4.5, 2.2, 7)); f.copy(bob); f.z -= 12; f.y += .4; fov = 58; shake = .06;
    } else if (t < T.black) {
      const p = THREE.MathUtils.smoothstep(t, T.destruction, T.black);
      e.set(-10 - p * 18, 32 + p * 26, FINAL_ARENA.centreZ + 15);
      f.set(75, 38 + p * 7, FINAL_ARENA.centreZ + 15); fov = 74; shake = .45;
    } else if (t < T.daylight) {
      e.set(0, 3, ENDING_EXIT_Z - 10); f.set(0, 3, ENDING_EXIT_Z); fov = 50;
    } else if (t < T.sky) {
      const p = endingProgress(t, T.daylight, T.sky);
      e.set(-3.5 - p * 1.5, 1.7 + p * .5, ENDING_EXIT_Z - 10 - p * 11);
      f.copy(bob).add(volt).multiplyScalar(.5); f.y += .55; fov = 54;
    } else {
      const p = THREE.MathUtils.smoothstep(t, T.sky, T.credits + 8);
      e.set(0, 3.1 + p * 3, ENDING_EXIT_Z - 5);
      f.set(0, THREE.MathUtils.lerp(2.5, 140, p), ENDING_EXIT_Z - 105); fov = 59;
    }
    e.x += Math.sin(t * 71) * shake; e.y += Math.sin(t * 83 + 1) * shake * .65; e.z += Math.sin(t * 59) * shake * .4;
    camera.position.copy(e); camera.up.set(0, 1, 0); camera.lookAt(f); camera.fov = fov; camera.far = 1800;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
}
