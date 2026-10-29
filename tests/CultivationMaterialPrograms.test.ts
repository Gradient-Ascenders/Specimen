import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CultivationSewerArt } from '../src/render/environment/cultivation/CultivationSewerArt.ts';
import { CultivationAccessTunnelArt } from '../src/render/environment/cultivation/CultivationAccessTunnelArt.ts';
import type { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import type { CultivationContaminationArt } from '../src/render/environment/cultivation/CultivationContaminationArt.ts';

test('Cultivation uniform-only finishes share programs while custom wear keeps distinct shader identities', () => {
  const sources = ['metal', 'acid', 'sticky', 'wall', 'floor'].map(name => {
    const material = new THREE.MeshStandardMaterial({name});
    material.customProgramCacheKey = () => name;
    return material;
  });
  const [metal, acid, sticky, wall, floor] = sources;
  const lab = {metal, pole:metal, acid, sticky} as CultivationLabMaterials;
  const contamination = {finishes:{wall, floor, metal}} as CultivationContaminationArt;
  const sewer = new CultivationSewerArt(lab, contamination);
  const access = new CultivationAccessTunnelArt(lab, contamination);
  const tunnel = access as unknown as {iron:THREE.Material;wall:THREE.Material;floor:THREE.Material;waste:THREE.Material};
  const shader = (material:THREE.Material) => {
    const result = {uniforms:{},vertexShader:'#include <worldpos_vertex>',
      fragmentShader:'#include <color_fragment>\n#include <metalnessmap_fragment>'};
    material.onBeforeCompile(result as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    return result;
  };
  try {
    assert.equal(sewer.iron.customProgramCacheKey(), metal.customProgramCacheKey());
    assert.equal(tunnel.iron.customProgramCacheKey(), metal.customProgramCacheKey());
    assert.deepEqual(shader(sewer.iron), shader(metal));
    assert.deepEqual(shader(tunnel.iron), shader(metal));
    for (const [material, source] of [[sewer.lining, wall], [sewer.bank, floor], [sewer.waste, acid],
      [tunnel.wall, wall], [tunnel.floor, floor], [tunnel.waste, acid]]) {
      assert.notEqual(material.customProgramCacheKey(), source.customProgramCacheKey());
      assert.notEqual(shader(material).fragmentShader, shader(source).fragmentShader);
    }
    assert.notEqual(sewer.lining.customProgramCacheKey(), tunnel.wall.customProgramCacheKey());
    assert.notEqual(sewer.waste.customProgramCacheKey(), tunnel.waste.customProgramCacheKey());
  } finally {
    sewer.dispose(); access.dispose(); sources.forEach(material => material.dispose());
  }
});
