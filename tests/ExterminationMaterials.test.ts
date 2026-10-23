import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { ExterminationMaterials } from '../src/boss/ExterminationMaterials.ts';
import { EXTERMINATION_SURFACES, EXTERMINATION_SURFACE_NAMES, readExterminationMaps } from '../src/boss/ExterminationSurfaceMaps.ts';

const bytes = gunzipSync(readFileSync(new URL('../src/assets/blackout/extermination-maps.bin', import.meta.url)));
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const data = readExterminationMaps(buffer);

test('the authored room bundle validates its layout and contains varied linear roughness and normalized tangent normals', () => {
  assert.throws(() => readExterminationMaps(buffer.slice(0, buffer.byteLength - 4)), /Invalid/);
  assert.throws(() => readExterminationMaps(new Uint8Array(28).buffer), /Invalid/);
  const extra = new Uint8Array(buffer.byteLength + 1); extra.set(new Uint8Array(buffer));
  assert.throws(() => readExterminationMaps(extra.buffer), /Trailing/);
  for (const family of EXTERMINATION_SURFACE_NAMES) {
    const [color, rough, normal] = data.maps[family], size = EXTERMINATION_SURFACES[family].size;
    assert.equal(color.length, size * size * 4);
    let low = 255, high = 0, tilted = 0;
    for (let p = 0; p < normal.length; p += 4 * 31) {
      const length = Math.hypot(normal[p]! / 127.5 - 1, normal[p + 1]! / 127.5 - 1, normal[p + 2]! / 127.5 - 1);
      assert.ok(Math.abs(length - 1) < .015); assert.ok(normal[p + 2]! > 127);
      if (normal[p] !== 128 || normal[p + 1] !== 128) tilted++;
      low = Math.min(low, rough[p]!); high = Math.max(high, rough[p]!);
    }
    assert.ok(high - low > 10, `${family} needs actual roughness variation`);
    assert.ok(tilted > 10, `${family} has real surface relief`);
  }
});

test('room finishes share maps while retaining distinct paint, sheen and wear; disposal releases each owned resource exactly once', () => {
  const kit = new ExterminationMaterials(data), environment = new THREE.Texture(); let probeDisposed = 0;
  environment.addEventListener('dispose', () => probeDisposed++); kit.setEnvironment(environment);
  const materials = ['ivory', 'coolPanel', 'servicePanel', 'floor', 'repairDeck', 'floorTrim', 'steel', 'bareSteel', 'rubber', 'grate', 'shaft', 'cover', 'coverRepair', 'hazard', 'glass'].map(f => kit.get(f as Parameters<typeof kit.get>[0]));
  const textures = new Set<THREE.Texture>(); let materialDisposals = 0, textureDisposals = 0;
  for (const m of materials) {
    m.addEventListener('dispose', () => materialDisposals++);
    assert.equal(m.envMap, environment);
    for (const [i, map] of [m.map, m.roughnessMap, m.normalMap].entries()) {
      if (!map || textures.has(map)) continue;
      textures.add(map); map.addEventListener('dispose', () => textureDisposals++);
      assert.equal(map.colorSpace, i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace);
      assert.ok(map.image.width >= 512); assert.equal(map.generateMipmaps, true); assert.equal(map.anisotropy, 4);
    }
  }
  assert.equal(kit.get('ivory').map, kit.get('coverRepair').map);
  assert.notEqual(kit.get('ivory').color.getHex(), kit.get('servicePanel').color.getHex());
  assert.notEqual(kit.get('floor').map, kit.get('grate').map);
  assert.equal(textures.size, 15); assert.ok(kit.diagnostics.textureBytes < 48 * 1024 * 1024);
  kit.dispose(); kit.dispose(); assert.equal(materialDisposals, 15); assert.equal(textureDisposals, 15); assert.equal(probeDisposed, 0);
  environment.dispose();
});
