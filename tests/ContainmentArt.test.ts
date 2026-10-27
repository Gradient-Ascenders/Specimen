import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import * as THREE from 'three';

import { ContainmentArtResources } from '../src/render/environment/containment/ContainmentArtResources.ts';
import { CONTAINMENT_SIGNS } from '../src/render/environment/containment/ContainmentSignContent.ts';
import { SIGNAGE_CONTENT_JSON } from '../src/render/environment/containment/signage.generated.ts';

test('baked Michroma signs match the current authored content and atlas order', () => {
  assert.deepEqual(JSON.parse(SIGNAGE_CONTENT_JSON), CONTAINMENT_SIGNS, 'Run npm run generate:signage after editing content');
});

test('Containment procedural textures are compact, deterministic and correctly configured', () => {
  const first = new ContainmentArtResources();
  const second = new ContainmentArtResources();
  const firstTextures = textureList(first);
  const secondTextures = textureList(second);

  assert.equal(firstTextures.length, first.diagnostics.textureCount);
  assert.equal(first.diagnostics.textureCount, 10);
  assert.equal(first.diagnostics.materialCount, 22);
  assert.equal(first.diagnostics.estimatedTextureBytes, 10_633_216);
  assert.equal(first.textures.signageAtlas.anisotropy, 8);
  firstTextures.forEach((texture, index) => {
    const counterpart = secondTextures[index];
    assert.deepEqual(
      [texture.image.width, texture.image.height],
      texture === first.textures.signageAtlas ? [1024, 2560] : [64, 64],
    );
    assert.equal(
      Buffer.from(texture.image.data.buffer).equals(
        Buffer.from(counterpart.image.data.buffer),
      ),
      true,
    );
    assert.equal(texture.generateMipmaps, true);
    assert.equal(texture.magFilter, THREE.LinearFilter);
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(
      texture.colorSpace,
      texture === first.textures.signageAtlas ||
        texture === first.textures.acidFoundationAlbedo
        ? THREE.SRGBColorSpace
        : THREE.NoColorSpace,
    );
    assert.equal(
      texture.wrapS,
      texture === first.textures.signageAtlas
        ? THREE.ClampToEdgeWrapping
        : THREE.RepeatWrapping,
    );
    assert.equal(texture.wrapT, texture.wrapS);
  });
  assert.deepEqual(
    Object.fromEntries(
      firstTextures.map((texture) => [
        texture.name,
        createHash('sha256').update(texture.image.data).digest('hex'),
      ]),
    ),
    {
      'containment-ceramic-micro-normal':
        '15911a903b368ef75bcb477a5ea53399e559de59b667ffa5a76ad43f4bbbdc8c',
      'containment-ceramic-roughness':
        '56c4ff8203f809e13a560d1e75f6bb86fed99cfe62214214ba8dc1c8c831bf46',
      'containment-graphite-micro-normal':
        '14504dc0d4c5f9591d85806561d6cbbf7a561463e8ed0f709f0418ed416df7bf',
      'containment-graphite-roughness':
        'f872f19a3dccfe32b78df9221f16e2285ffbf4f89aa097dd56423af85ea9bfd9',
      'containment-sticky-organic-normal':
        'fe1094eb443f99ea7d04031fe60fb58ff27156c67d35488435ecb2821cef2d0d',
      'containment-sticky-wet-roughness':
        '683ddf1166481a2453d7d3f446504881f0b35e410464cbb6c14b6b9ee9c88ffe',
      'containment-sticky-vent-organic-normal':
        'fbeff4497daea728edf61a18624884e71148a1e8d9bbaa1444e57f6dc365fdaa',
      'containment-sticky-vent-roughness':
        'e934e6fb6f00fd412fcaf097b2ced1258dc8b5e832da4246d3e9f1f25141f91f',
      'containment-acid-static-foundation-albedo':
        '3a14713d56e94f4a7c7610630edf2a7ff2d051db6359f3c7ff18e0019f7e30ea',
      'containment-michroma-signage-atlas':
        'ca5ecca5fb399bdb10c1447f5e06190332a39ab00773e646d781c6719aa4fe2e',
    },
  );

  first.dispose();
  second.dispose();
});

function textureList(resources: ContainmentArtResources): readonly THREE.DataTexture[] {
  return [
    resources.textures.ceramicNormal,
    resources.textures.ceramicRoughness,
    resources.textures.graphiteNormal,
    resources.textures.graphiteRoughness,
    resources.textures.stickyNormal,
    resources.textures.stickyRoughness,
    resources.textures.stickyVentNormal,
    resources.textures.stickyVentRoughness,
    resources.textures.acidFoundationAlbedo,
    resources.textures.signageAtlas,
  ];
}
