import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {ContainmentMonitor} from '../../../src/render/environment/containment/ContainmentMonitor.ts';
import {ContainmentMonitorDialogue} from '../../../src/render/environment/containment/ContainmentMonitorDialogue.ts';

test('hidden monitors keep dialogue time and paint the latest page when visible again',()=>{
  const material=new THREE.MeshStandardMaterial(),dialogue=new ContainmentMonitorDialogue(['Testing a hidden screen']);
  const monitor=new ContainmentMonitor({materials:{graphite:material,serviceMetal:material}},
    {roomId:1,position:{x:0,y:0,z:0},yaw:0,dialogue});
  const version=monitor.texture.version;
  monitor.setPresentationActive(false);monitor.update(10);
  assert.equal(dialogue.readModel.complete,true);assert.equal(monitor.texture.version,version);
  monitor.setPresentationActive(true);monitor.update(0);
  assert.equal(monitor.texture.version,version+1);
  monitor.update(1);assert.equal(monitor.texture.version,version+1);
  monitor.dispose();material.dispose();
});
