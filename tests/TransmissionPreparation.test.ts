import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { requiresTransmissionPreparation } from '../src/render/TransmissionPreparation.ts';

test('linear capture requirements follow effective materials including dormant character forms', () => {
  const root=new THREE.Group(), geometry=new THREE.BoxGeometry();
  const material=new THREE.MeshPhysicalMaterial({transmission:0});
  const mesh=new THREE.Mesh(geometry,material);mesh.visible=false;root.add(mesh);
  assert.equal(requiresTransmissionPreparation(root),false);
  material.transmission=.28;assert.equal(requiresTransmissionPreparation(root),true);
  material.visible=false;assert.equal(requiresTransmissionPreparation(root),false);
  geometry.dispose();material.dispose();
});
