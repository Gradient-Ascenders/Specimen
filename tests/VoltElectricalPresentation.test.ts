import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import type { VoltElectricalReadModel } from '../src/abilities/VoltElectricalSystem.ts';
import { VoltElectricalPresentation } from '../src/render/electrical/VoltElectricalPresentation.ts';
import { GraphicsResourcePolicy } from '../src/render/GraphicsResourcePolicy.ts';

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  className = '';
  hidden = false;
  textContent: string | null = '';
  isConnected = false;
  removed = false;

  setAttribute(_name: string, _value: string): void {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.isConnected = true;
      this.children.push(child);
    }
  }

  remove(): void {
    this.isConnected = false;
    this.removed = true;
  }
}

class FakeHost extends FakeElement {
  throwAfterAppend = false;

  override append(...children: FakeElement[]): void {
    super.append(...children);
    if (this.throwAfterAppend) throw new Error('injected host append failure');
  }
}

class FakeDocument {
  readonly created: FakeElement[] = [];

  createElement(): FakeElement {
    const element = new FakeElement();
    this.created.push(element);
    return element;
  }
}

const readModel = (): VoltElectricalReadModel => ({
  aimActive: true,
  searching: true,
  selectedTargetId: 'target',
  selectedTargetName: 'Target',
  selectedTargetValid: true,
  connectedTargetId: undefined,
  connectedTargetName: undefined,
  connectionUnstable: false,
  tetherDistanceMetres: 0,
  acquisitionRangeMetres: 15,
  instabilityWarningRangeMetres: 16,
  tetherBreakRangeMetres: 20,
  beamMode: 'search',
  beamStart: { x: 0, y: 0, z: 0 },
  beamEnd: { x: 0, y: 0, z: 10 },
  aimPoint: { x: 0, y: 0, z: 10 },
});

test('Volt presentation reuses one beam and one DOM overlay across updates', () => {
  const scene = new THREE.Scene();
  const host = new FakeHost();
  const document = new FakeDocument();
  const presentation = new VoltElectricalPresentation({
    scene,
    host: host as unknown as HTMLElement,
    document: document as unknown as Document,
  });

  const model = readModel();
  for (let index = 0; index < 50; index += 1) {
    presentation.update(model);
  }

  const diagnostics = presentation.getDiagnostics();
  assert.equal(scene.children.length, 1);
  assert.equal(host.children.length, 1);
  assert.equal(diagnostics.beamVisible, true);
  assert.equal(diagnostics.crosshairCount, 1);

  const beam = scene.getObjectByName('volt-electrical-arc-core') as THREE.Mesh;
  const branches = scene.getObjectByName('volt-electrical-branch-arcs') as THREE.LineSegments;
  const sparks = scene.getObjectByName('volt-electrical-travelling-sparks') as THREE.Points;
  assert.ok(beam);
  assert.ok(branches);
  assert.ok(sparks);
  assert.equal(beam.geometry.getAttribute('position').count, 198);
  assert.equal(beam.geometry.index!.count / 3, 192);
  assert.equal(branches.geometry.getAttribute('position').count, 32);
  assert.equal(sparks.geometry.getAttribute('position').count, 7);
  const sparkMaterial = sparks.material as THREE.PointsMaterial;
  assert.equal(sparkMaterial.size, 0.11);
  const sparkShader = { fragmentShader: '#include <color_fragment>' };
  sparkMaterial.onBeforeCompile(
    sparkShader as THREE.WebGLProgramParametersWithUniforms,
    {} as THREE.WebGLRenderer,
  );
  assert.match(sparkShader.fragmentShader, /gl_PointCoord/);
  assert.match(sparkShader.fragmentShader, /smoothstep/);
  assert.equal(beam.visible, true);
  assert.equal(branches.visible, true);
  assert.equal(sparks.visible, true);

  const firstArcPosition = beam.geometry.getAttribute('position').getY(2);
  presentation.update(model);
  assert.equal(beam.geometry.getAttribute('position').getY(2), firstArcPosition);
  presentation.update(model, 1 / 60);
  assert.notEqual(beam.geometry.getAttribute('position').getY(2), firstArcPosition);

  presentation.update({ ...model, beamMode: 'none' });
  assert.equal(beam.visible, false);
  assert.equal(branches.visible, false);
  assert.equal(sparks.visible, false);
  presentation.update({ ...model, beamMode: 'connected' });
  assert.equal(beam.visible, true);
  assert.equal(branches.visible, true);
  assert.equal(sparks.visible, true);

  presentation.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(host.children[0]?.removed, true);
});

test('electrical animation is independent of refresh rate and extra state syncs', () => {
  const sample = (hz: number, mode: 'search' | 'connected') => {
    const scene = new THREE.Scene();
    const presentation = new VoltElectricalPresentation({scene, host: new FakeHost() as unknown as HTMLElement, document: new FakeDocument() as unknown as Document});
    const model = {...readModel(), beamMode: mode};
    for (let i = 0; i < hz; i++) {
      presentation.update(model);
      presentation.update(model);
      presentation.update(model, 1 / hz);
    }
    const result = ['volt-electrical-arc-core', 'volt-electrical-branch-arcs', 'volt-electrical-travelling-sparks',
      'volt-electrical-contact-coronas', 'volt-electrical-impact-sparks'].flatMap(name =>
      Array.from((scene.getObjectByName(name) as THREE.Line).geometry.getAttribute('position').array));
    presentation.dispose();
    return result;
  };
  for (const mode of ['search', 'connected'] as const) {
    const expected = sample(60, mode);
    for (const hz of [30, 144]) sample(hz, mode).forEach((value, i) => assert.ok(Math.abs(value - expected[i]!) < 1e-5));
  }
});

test('powered, unstable and disconnected effects reuse bounded resources and reset cleanly', () => {
  const scene = new THREE.Scene();
  const document = new FakeDocument();
  const presentation = new VoltElectricalPresentation({scene, host: new FakeHost() as unknown as HTMLElement, document: document as unknown as Document});
  const effects = scene.getObjectByName('volt-electrical-effects')!;
  const beam = scene.getObjectByName('volt-electrical-arc-core') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  const contacts = scene.getObjectByName('volt-electrical-contact-coronas') as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  const impacts = scene.getObjectByName('volt-electrical-impact-sparks') as THREE.Points;
  const objects = effects.children as (THREE.Mesh | THREE.Points | THREE.LineSegments)[];
  const buffers = objects.map(object => object.geometry.getAttribute('position').array);
  const materials = objects.map(object => object.material);
  const model = {...readModel(), beamMode: 'connected' as const, connectedTargetId: 'target', connectedTargetName: 'Target'};
  const policy = new GraphicsResourcePolicy(scene);
  try {
    presentation.update(model);
    const burstSize = contacts.material.size;
    assert.equal(impacts.visible, true);
    assert.equal(impacts.geometry.getAttribute('position').count, 24);
    assert.equal(beam.material.uniforms.tint!.value.getHex(), 0xffd329);
    assert.equal(document.created[2]!.dataset.state, 'connected');
    for (let frame = 0; frame < 120; frame++) presentation.update(model, 1 / 60);
    assert.ok(contacts.material.size < burstSize, 'connection flash settles into a restrained socket corona');
    const stablePositions = Array.from(beam.geometry.getAttribute('position').array);
    const stableWidth = beam.material.uniforms.width!.value;
    presentation.update({...model, connectionUnstable: true});
    assert.equal(beam.material.uniforms.tint!.value.getHex(), 0xff9e25);
    assert.ok(beam.material.uniforms.width!.value > stableWidth);
    assert.notDeepEqual(Array.from(beam.geometry.getAttribute('position').array), stablePositions);
    assert.equal(document.created[2]!.dataset.state, 'unstable');

    policy.setQuality(256, 0.5);
    assert.equal(impacts.geometry.drawRange.count, 12);
    assert.equal(beam.geometry.drawRange.count, Infinity, 'quality never thins the gameplay beam');
    assert.equal(contacts.geometry.drawRange.count, Infinity, 'socket contact is a functional cue');
    presentation.update(model, 1 / 60);
    assert.equal(impacts.geometry.drawRange.count, 12, 'animation respects particle thinning');
    policy.setQuality(512, 1);
    assert.equal(impacts.geometry.drawRange.count, Infinity);

    for (const end of [{x: 0, y: 10, z: 0}, model.beamStart, {x: 2, y: -4, z: 8}]) {
      presentation.update({...model, beamEnd: end}, 1 / 60);
      for (const object of objects) {
        for (const value of object.geometry.getAttribute('position').array) assert.ok(Number.isFinite(value));
      }
      const position = beam.geometry.getAttribute('position');
      assert.deepEqual([position.getX(0), position.getY(0), position.getZ(0)], [0, 0, 0]);
      for (const last of [65, 131, 197]) {
        assert.deepEqual([position.getX(last), position.getY(last), position.getZ(last)], [end.x, end.y, end.z]);
        assert.deepEqual([position.getX(last - 65), position.getY(last - 65), position.getZ(last - 65)], [0, 0, 0]);
      }
      const contactPosition = contacts.geometry.getAttribute('position');
      assert.deepEqual([contactPosition.getX(1), contactPosition.getY(1), contactPosition.getZ(1)], [end.x, end.y, end.z]);
    }
    presentation.update({...readModel(), beamMode: 'none'});
    assert.equal(effects.visible, false);
    assert.equal(impacts.visible, false, 'disconnect/reset removes powered particles immediately');
    assert.equal(document.created[2]!.hidden, true);
    assert.equal(document.created[2]!.dataset.state, undefined);
    presentation.update(model);
    assert.equal(contacts.material.size, burstSize, 'next connection starts fresh');
    assert.equal(effects.children.length, 5);
    assert.equal(objects.some(object => object instanceof THREE.Light), false);
    for (let index = 0; index < objects.length; index++) {
      assert.equal(objects[index]!.geometry.getAttribute('position').array, buffers[index]);
      assert.equal(objects[index]!.material, materials[index]);
      const material = objects[index]!.material as THREE.Material;
      assert.equal(material.depthTest, true);
      assert.equal(material.depthWrite, false);
    }
    const disposals: number[] = [];
    for (const object of objects) {
      object.geometry.addEventListener('dispose', () => disposals.push(1));
      (object.material as THREE.Material).addEventListener('dispose', () => disposals.push(1));
    }
    presentation.dispose(); presentation.dispose();
    assert.equal(disposals.length, 10);
  } finally { policy.dispose(); presentation.dispose(); }
});

test('Volt presentation removes an attached render root when scene.add throws after mutation', () => {
  const scene = new THREE.Scene();
  const add = scene.add.bind(scene);
  scene.add = ((...objects: THREE.Object3D[]) => {
    add(...objects);
    throw new Error('injected scene add failure');
  }) as typeof scene.add;
  const host = new FakeHost();
  const document = new FakeDocument();

  assert.throws(
    () => new VoltElectricalPresentation({
      scene,
      host: host as unknown as HTMLElement,
      document: document as unknown as Document,
    }),
    /injected scene add failure/,
  );
  assert.equal(scene.children.length, 0);
  assert.equal(host.children.length, 0);
});

test('Volt presentation removes both attachments when host append throws after mutation', () => {
  const scene = new THREE.Scene();
  const host = new FakeHost();
  host.throwAfterAppend = true;
  const document = new FakeDocument();

  assert.throws(
    () => new VoltElectricalPresentation({
      scene,
      host: host as unknown as HTMLElement,
      document: document as unknown as Document,
    }),
    /injected host append failure/,
  );

  assert.equal(scene.children.length, 0);
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0]?.removed, true);
});
