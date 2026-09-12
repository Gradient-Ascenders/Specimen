import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CultivationSewerLighting } from '../src/render/environment/cultivation/CultivationSewerLighting.ts';
import { auditOpaqueSurfaces } from '../src/render/geometry/OpaqueSurfaceAudit.ts';

test('sewer lamp flicker stays dim, preserves light slots, and leaves the ambush unlit', () => {
  const root = new THREE.Group(), lighting = new CultivationSewerLighting(root);
  const lights: THREE.PointLight[] = [];
  root.traverse(o => { if (o instanceof THREE.PointLight) lights.push(o); });
  assert.equal(lights.length, 2);
  const initial = lights.map(l => l.intensity);
  const min = [...initial], max = [...initial];
  try {
    root.updateMatrixWorld(true);
    for (const light of lights) {
      assert.equal(light.castShadow, false);
      assert.ok(light.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(40, -11.7, 70)) > light.distance,
        'lamp falloff ends before the dormant drone');
    }
    for (let frame = 0; frame < 19 * 60; frame++) {
      lighting.update(1 / 60);
      lights.forEach((light, i) => {
        assert.ok(light.visible && light.parent?.visible, 'flicker never removes a shader light slot');
        assert.ok(light.intensity > .2 && light.intensity < 2.8);
        assert.ok(Math.abs(light.intensity - initial[i]) < 2.1);
        min[i] = Math.min(min[i], light.intensity); max[i] = Math.max(max[i], light.intensity);
      });
    }
    assert.ok(min[1] < max[1] * .25, 'the far lamp has a noticeable brownout');
    assert.ok(min[0] > max[0] * .65, 'the entry lamp retains a weak orientation cue');
    lighting.reset(); assert.deepEqual(lights.map(l => l.intensity), initial);
    assert.deepEqual(auditOpaqueSurfaces(root).conflicts, []);
  } finally { lighting.dispose(); lighting.dispose(); }
  assert.equal(root.children.length, 0);
});
