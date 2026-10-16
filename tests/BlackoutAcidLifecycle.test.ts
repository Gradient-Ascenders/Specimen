import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { maintenanceMaps } from './helpers/BlackoutMaintenanceMapData.ts';
import { BlackoutMaintenanceBay } from '../src/levels/BlackoutMaintenanceBay.ts';
import { BlackoutTransitRoom } from '../src/levels/BlackoutTransitRoom.ts';
import { AcidSurfaceMaterial } from '../src/render/environment/containment/AcidSurfaceMaterial.ts';

test('both Blackout hazardous surfaces reuse animated acid and release material/noise once', () => {
  const bay = new BlackoutMaintenanceBay(maintenanceMaps);
  const transit = new BlackoutTransitRoom(bay.surfaceMaterials);
  const disposalChecks: (() => void)[] = [];
  for (const [owner, name, advance] of [
    [bay, 'animated-acid-surface', () => bay.update(.5, false)],
    [transit, 'transit-acid-surface', () => transit.update(.5)],
  ] as const) {
    const surface = owner.root.getObjectByName(name) as THREE.Mesh;
    const material = surface.material as AcidSurfaceMaterial;
    assert.ok(material instanceof AcidSurfaceMaterial);
    const version = material.version, key = material.customProgramCacheKey();
    advance(); advance();
    assert.equal(material.diagnostics.timeSeconds, 1);
    assert.equal(material.version, version);
    assert.equal(material.customProgramCacheKey(), key);
    let materialDisposals = 0, noiseDisposals = 0;
    const uniforms = (material as any).acidUniforms;
    uniforms.uAcidNoise.value.addEventListener('dispose', () => noiseDisposals++);
    material.addEventListener('dispose', () => materialDisposals++);
    disposalChecks.push(() => {
      assert.equal(materialDisposals, 1);
      assert.equal(noiseDisposals, 1);
    });
  }
  transit.dispose(); transit.dispose();
  bay.dispose(); bay.dispose();
  for (const check of disposalChecks) check();
});
