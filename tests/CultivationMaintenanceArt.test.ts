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
    assert.ok(art.diagnostics.batches < 80, 'sewer hardware stays spatially batched within the expanded art budget');
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
  } finally { art.dispose(); contamination.dispose(); lab.dispose(); room.dispose(); before.dispose(); }
});
