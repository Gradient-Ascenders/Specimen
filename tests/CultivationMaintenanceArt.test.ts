import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoRoomFiveGreybox } from '../src/levels/LevelTwoRoomFiveGreybox.ts';
import { CultivationLabMaterials } from '../src/render/environment/cultivation/CultivationLabMaterials.ts';
import { CultivationContaminationArt } from '../src/render/environment/cultivation/CultivationContaminationArt.ts';
import { CultivationMaintenanceArt } from '../src/render/environment/cultivation/CultivationMaintenanceArt.ts';
import { SewerDroneDamage } from '../src/render/hazards/SewerDroneDamage.ts';
import { auditOpaqueSurfaces } from '../src/render/geometry/OpaqueSurfaceAudit.ts';
import { CollisionWorld, CollisionHit, CollisionLayer } from '../src/physics/CollisionWorld.ts';
import { createRustedSewerDrone } from '../src/levels/RustedSewerDrone.ts';
import { batchMaintenanceScout } from '../src/render/hazards/BatchMaintenanceScout.ts';

test('patrol drone detailing fits its envelope and retains its live eye with batched machinery and clear motor faces', () => {
  const {body, eye} = createRustedSewerDrone(false);
  body.scale.setScalar(.75);
  const bounds = new THREE.Box3().setFromObject(body, true), eyeMaterial = eye.material;
  const eyePosition = eye.position.clone(), oldGeometry = body.geometry;
  let retiredHull = 0; oldGeometry.addEventListener('dispose', () => retiredHull++);
  const materials = new Set<THREE.Material>();
  body.traverse(o => { if (o instanceof THREE.Mesh) materials.add(o.material); });
  try {
    batchMaintenanceScout(body, eye);
    const after = new THREE.Box3().setFromObject(body, true);
    assert.ok(bounds.containsBox(after), 'new armour and fans stay inside the previous visual envelope');
    assert.notEqual(body.geometry, oldGeometry);
    assert.equal(retiredHull, 1, 'replaced hull is disposed');
    assert.equal(eye.material, eyeMaterial); assert.deepEqual(eye.position, eyePosition);
    assert.equal(body.children.length, 4, 'one eye, two machinery batches and one shared sensor batch');
    const markers = body.children.find(o => o !== eye && o instanceof THREE.Mesh && o.material === eyeMaterial);
    assert.ok(markers, 'sensor markers share live network status without extra lights');
    assert.deepEqual(auditOpaqueSurfaces(body, .01).conflicts, [], 'motor clearance at the actual patrol scale');
    body.traverse(o => { if (o instanceof THREE.Mesh) assert.ok(materials.has(o.material)); });
  } finally {
    body.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    for (const material of materials) material.dispose();
  }
});

test('maintenance art preserves all Room 5 colliders, LOS, acid bounds and checkpoint/reset transforms', () => {
  const before = new LevelTwoRoomFiveGreybox(() => {}), room = new LevelTwoRoomFiveGreybox(() => {});
  const lab = new CultivationLabMaterials(), contamination = new CultivationContaminationArt(lab);
  const lights = (root: THREE.Object3D) => { const values: {name: string; settings: unknown[]}[] = []; root.traverse(o => {
    if (o instanceof THREE.PointLight) values.push({name:o.name, settings:[o.color.getHex(), o.intensity, o.distance, o.decay, o.castShadow, o.position.toArray()]});
  }); return values; };
  const lightingBefore = lights(room.root);
  const eyeMaterial = room.sewer.eye.material;
  const art = new CultivationMaintenanceArt(room, lab, contamination);
  const authoredLights = lights(room.root).filter(value => lightingBefore.some(old => old.name === value.name));
  assert.deepEqual(authoredLights, lightingBefore, 'sewer fixtures retain their authored lighting');
  assert.equal(lights(room.root).length, lightingBefore.length + 3, 'only the existing corridor fixtures are added');
  assert.equal(room.sewer.eye.material, eyeMaterial, 'the drone keeps its existing status eye');
  const check = () => {
    assert.equal(room.collisionMeshes.length, before.collisionMeshes.length);
    room.collisionMeshes.forEach((mesh, i) => {
      const old = before.collisionMeshes[i];
      assert.deepEqual(mesh.quaternion.toArray(), old.quaternion.toArray());
      for (const field of ['name', 'userData', 'position', 'scale', 'visible'] as const) assert.deepEqual(mesh[field], old[field], `${mesh.name}: ${field}`);
      assert.deepEqual(mesh.geometry.getAttribute('position').array, old.geometry.getAttribute('position').array, mesh.name);
    });
    for (const p of [[40, -11.8, 70], [0, .2, 40], [40, .5, 14], [-12, 10.5, 23], [8, .6, 65]]) {
      assert.equal(room.isAcidAt(new THREE.Vector3(...p)), before.isAcidAt(new THREE.Vector3(...p)));
    }
    const a = new CollisionWorld(), b = new CollisionWorld();
    a.registerAll(before.collisionMeshes); b.registerAll(room.collisionMeshes);
    const ha = new CollisionHit(), hb = new CollisionHit(), delta = new THREE.Vector3(30, -4, 12);
    for (let y = -10; y <= 30; y += 5) for (let z = 20; z < 80; z += 8) {
      const origin = new THREE.Vector3(-18, y, z);
      const hit = a.sweepSphere(origin, delta, .1, ha, CollisionLayer.LineOfSight);
      assert.equal(b.sweepSphere(origin, delta, .1, hb, CollisionLayer.LineOfSight), hit);
      if (hit) assert.equal(hb.fraction, ha.fraction);
    }
  };
  try {
    check();
    for (const checkpoint of ['controls', 'rescued', 'split'] as const) {
      before.restoreCheckpoint(checkpoint); room.restoreCheckpoint(checkpoint); check();
    }
    before.reset(); room.reset(); check();
    assert.equal(art.acidSurfaces.length, 13);
    assert.ok(art.acidSurfaces.filter(mesh => !/^room-5-(vent-acid-|sewer-acid-channel|drainage-water-)/.test(mesh.name)).every(mesh => mesh.material === lab.acid));
    const effluent = art.acidSurfaces.find(mesh => mesh.name === 'room-5-sewer-acid-channel')!.material as THREE.Material;
    assert.equal(effluent.name, 'cultivation-sewer-industrial-effluent');
    const effluentShader = {uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader};
    effluent.onBeforeCompile(effluentShader, null as never);
    assert.ok(art.acidSurfaces.filter(mesh => mesh.name.startsWith('room-5-vent-acid-')).every(mesh => (mesh.material as THREE.Material).name === 'cultivation-access-stagnant-waste'));
    const waste = art.acidSurfaces.find(mesh => mesh.name.startsWith('room-5-vent-acid-'))!.material as THREE.Material;
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    waste.onBeforeCompile(shader, null as never);
    lab.acid.update(.5); lab.acid.disturb(35, 9.1, .22, 1);
    assert.equal(shader.uniforms.uTime.value, .5, 'tunnel waste shares the live liquid clock');
    assert.equal(effluentShader.uniforms.uTime, shader.uniforms.uTime);
    assert.equal(effluentShader.uniforms.uRipples, shader.uniforms.uRipples);
    assert.equal(effluentShader.uniforms.uEmissionStrength.value, lab.acid.diagnostics.emissionStrength, 'sewer emission remains unchanged');
    assert.ok(shader.uniforms.uRipples.value.some((r: THREE.Vector4) => r.w > 0), 'Goop wakes reach the tunnel variant');
    assert.equal(lab.acid.diagnostics.flowSpeed, .26, 'sewer and earlier room liquid remains unchanged');
    let adhesiveSurfaces = 0;
    room.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) if (material.name === 'cultivation-access-damp-adhesive') {
        adhesiveSurfaces++;
        assert.ok(material instanceof THREE.MeshStandardMaterial);
        assert.equal(material.map, lab.sticky.map, 'share the jade adhesive route cue');
        assert.equal(material.emissive.getHex(), lab.sticky.emissive.getHex());
        assert.equal(material.emissiveIntensity, .18);
        assert.equal(object.geometry.getAttribute('membranePanel').count, object.geometry.getAttribute('position').count);
        assert.equal(material.normalMap, lab.sticky.normalMap, 'preserve the wet adhesive finish');
      }
    });
    assert.ok(adhesiveSurfaces > 0);
    assert.equal(art.diagnostics.newTextures, 0);
    assert.ok(art.diagnostics.staticMeshesBatched > 180);
    assert.ok(art.diagnostics.batches < 90, 'sewer and chamber hardware stay spatially batched');
    const chamberBatches = room.root.children.filter(o => o.name.startsWith('room-5-drone-chamber-hardware-')) as THREE.Mesh[];
    assert.ok(chamberBatches.length > 0 && chamberBatches.length <= 6);
    assert.ok(chamberBatches.every(mesh => mesh.userData.shadowProxyReceiver), 'existing structural hulls cover detail shadows');
    const chamberMaterials = new Set<THREE.MeshStandardMaterial>();
    room.root.traverse(o => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && o.material.name.startsWith('cultivation-drone-chamber-'))
        chamberMaterials.add(o.material);
    });
    const panels = [...chamberMaterials].find(m => m.name.endsWith('stained-panels'))!;
    assert.equal(panels.map, contamination.finishes.wall.map, 'reuse the earlier rooms weathering');
    assert.equal(panels.emissiveIntensity, .025, 'keep chamber wall emission subdued');
    assert.equal(panels.emissive.getHex(), 0xcdd2c9);
    const platformArt = room.root.getObjectByName('cultivation-static-platform-art')!;
    const whiteDecks: THREE.Mesh[] = [];
    platformArt.traverse(o => {
      if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
      if (o.material.map === lab.platform.map) {
        whiteDecks.push(o);
        assert.equal(o.material.name, 'cultivation-drone-chamber-dirty-white-deck');
        assert.equal(o.material.roughnessMap, lab.platform.roughnessMap);
        assert.equal(o.material.color.getHex(), 0xe1dfd6);
      }
    });
    assert.ok(whiteDecks.length > 0);
    const landing = room.root.getObjectByName('room-5-bob-shaft-landing-tile') as THREE.Mesh;
    assert.equal(landing.userData.surfaceTag, 'default', 'the entrance tile is not adhesive');
    assert.equal(landing.userData.textureRole, undefined);
    assert.equal(room.root.getObjectByName('room-5-bob-shaft-climb')!.userData.surfaceTag, 'sticky', 'retain the required vertical climb');
    let chamberDisposals = 0;
    for (const mesh of chamberBatches) mesh.geometry.addEventListener('dispose', () => chamberDisposals++);
    const damage = new SewerDroneDamage(room.brokenCore);
    try {
      for (const hits of [0, 1, 2, 0]) {
        damage.update(0, hits);
        for (const part of room.brokenCore.children.filter(p => typeof p.userData.damageStage === 'number'))
          assert.equal(part.visible, hits < part.userData.damageStage);
        assert.deepEqual(auditOpaqueSurfaces(room.brokenCore).conflicts, [], `drone damage stage ${hits}`);
      }
      for (const network of ['red', 'blue', 'green'] as const) {
        room.controller.security.select(network);
        for (const dt of [.03, .5]) {
          room.sewer.sync(room.controller.security, dt);
          for (const handle of room.controls.values())
            assert.deepEqual(auditOpaqueSurfaces(handle.parent!).conflicts, [], `${network} switch pose`);
        }
      }
    } finally { damage.dispose(); }
    let disposal = 0;
    const batch = room.root.children.find(o => o.name.startsWith('room-5-art-static')) as THREE.Mesh;
    batch.geometry.addEventListener('dispose', () => disposal++);
    art.dispose(); art.dispose(); assert.equal(disposal, 1);
    assert.equal(chamberDisposals, chamberBatches.length);
  } finally { art.dispose(); contamination.dispose(); lab.dispose(); room.dispose(); before.dispose(); }
});
