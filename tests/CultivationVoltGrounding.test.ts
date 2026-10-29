import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LevelTwoRoomFiveGreybox } from '../src/levels/LevelTwoRoomFiveGreybox.ts';
import { VOLT_FINALE, sampleVoltFinaleActor, sampleVoltFinaleDrone } from '../src/cinematics/CultivationFinaleTimeline.ts';
import { VOLT_FINALE_COVER } from '../src/cinematics/CultivationFinaleLayout.ts';

test('captive and cinematic Volt share the pod floor through reset, release and the boarding launch', () => {
  const room = new LevelTwoRoomFiveGreybox(() => {}, undefined, true);
  const point = new THREE.Vector3(), deck = new THREE.Box3();
  room.root.position.set(12, 3, 40);
  try {
    const base = room.pod.getObjectByName('room-5-pod-base')!;
    const gap = () => {
      room.root.updateMatrixWorld(true);
      deck.setFromObject(base);
      room.captiveVolt.getWorldPosition(point);
      return point.y - room.captiveVoltPresentation.radiusMetres - deck.max.y;
    };
    assert.ok(Math.abs(gap() - .01) < 1e-6);
    room.controller.releaseElapsed = 2;
    room.syncPresentation();
    assert.ok(Math.abs(gap() - .01) < 1e-6, 'follows the moving pod');
    room.reset();
    assert.ok(Math.abs(gap() - .01) < 1e-6, 'reset retains floor contact');
    const captive = room.root.worldToLocal(room.captiveVolt.getWorldPosition(new THREE.Vector3()));
    sampleVoltFinaleActor('volt', VOLT_FINALE.open, point);
    assert.ok(point.distanceTo(captive) < 1e-6, 'captive-to-cinematic handoff has no position jump');
    for (let t = 0; t < VOLT_FINALE.voltJump; t += .1) {
      sampleVoltFinaleActor('volt', t, point);
      room.root.localToWorld(point);
      assert.ok(Math.abs(point.y - .45 - deck.max.y - .01) < 1e-6, `floor contact at ${t}`);
    }
    sampleVoltFinaleActor('volt', VOLT_FINALE.voltJump - 1e-5, point);
    const after = new THREE.Vector3();
    sampleVoltFinaleActor('volt', VOLT_FINALE.voltJump + 1e-5, after);
    assert.ok(point.distanceTo(after) < .001, 'boarding jump starts at the front lip');
    sampleVoltFinaleActor('volt', VOLT_FINALE.scanVolt, point);
    sampleVoltFinaleDrone(0, VOLT_FINALE.scanVolt, after);
    assert.ok(after.y > point.y + .7, 'scanner sees Volt over the lower pod rim');
    sampleVoltFinaleDrone(0, VOLT_FINALE.coverImpact, after);
    assert.ok(Math.abs(after.y - VOLT_FINALE_COVER.droneY) < 1e-6, 'cover strike retains its authored height');
  } finally { room.dispose(); }
});
