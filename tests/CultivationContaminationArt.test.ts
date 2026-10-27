import { cultivationAssets } from './helpers/CultivationBakedAssets.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CultivationContaminationArt } from '../src/render/environment/cultivation/CultivationContaminationArt.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';

test('dressing releases original geometry without disposing borrowed replacements or proxies', () => {
  const lab = new CultivationLabMaterials(cultivationAssets), art = new CultivationContaminationArt(lab);
  const root = new THREE.Group(), warning = new THREE.MeshStandardMaterial();
  art.addRoom(root, 1, warning);
  const mesh = art.roots[0].children.find(object => object instanceof THREE.Mesh) as THREE.Mesh;
  const original = mesh.geometry, replacement = original.clone(), proxyGeometry = new THREE.BoxGeometry();
  let originals = 0, replacements = 0, proxies = 0;
  original.addEventListener('dispose', () => originals++);
  replacement.addEventListener('dispose', () => replacements++);
  proxyGeometry.addEventListener('dispose', () => proxies++);
  mesh.geometry = replacement;
  mesh.add(new THREE.Mesh(proxyGeometry, warning));
  try {
    art.dispose(); art.dispose();
    assert.equal(originals, 1, 'release the original even while a replacement is installed');
    assert.equal(replacements, 0, 'replacement belongs to the cleanup pass');
    assert.equal(proxies, 0, 'attached proxy belongs to the cleanup pass');
  } finally {
    art.dispose(); replacement.dispose(); proxyGeometry.dispose(); warning.dispose(); lab.dispose();
  }
});

