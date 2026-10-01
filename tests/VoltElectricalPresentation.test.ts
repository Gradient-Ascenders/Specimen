import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import type { VoltElectricalReadModel } from '../src/abilities/VoltElectricalSystem.ts';
import { VoltElectricalPresentation } from '../src/render/electrical/VoltElectricalPresentation.ts';

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

  const beam = scene.getObjectByName('volt-electrical-arc-core') as THREE.Line;
  const branches = scene.getObjectByName('volt-electrical-branch-arcs') as THREE.LineSegments;
  const sparks = scene.getObjectByName('volt-electrical-travelling-sparks') as THREE.Points;
  assert.ok(beam);
  assert.ok(branches);
  assert.ok(sparks);
  assert.equal(beam.geometry.getAttribute('position').count, 14);
  assert.equal(branches.geometry.getAttribute('position').count, 32);
  assert.equal(sparks.geometry.getAttribute('position').count, 7);
  const sparkMaterial = sparks.material as THREE.PointsMaterial;
  assert.equal(sparkMaterial.size, 0.075);
  const sparkShader = { fragmentShader: '#include <color_fragment>' };
  sparkMaterial.onBeforeCompile(
    sparkShader as THREE.WebGLProgramParametersWithUniforms,
    {} as THREE.WebGLRenderer,
  );
  assert.match(sparkShader.fragmentShader, /gl_PointCoord/);
  assert.match(sparkShader.fragmentShader, /smoothstep\(0\.18, 0\.5, sparkRadius\)/);
  assert.equal(beam.visible, true);
  assert.equal(branches.visible, true);
  assert.equal(sparks.visible, true);

  const firstArcPosition = beam.geometry.getAttribute('position').getY(1);
  presentation.update(model);
  assert.equal(beam.geometry.getAttribute('position').getY(1), firstArcPosition);
  presentation.update(model, 1 / 60);
  assert.notEqual(beam.geometry.getAttribute('position').getY(1), firstArcPosition);

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
    const result = ['volt-electrical-arc-core', 'volt-electrical-branch-arcs', 'volt-electrical-travelling-sparks'].flatMap(name =>
      Array.from((scene.getObjectByName(name) as THREE.Line).geometry.getAttribute('position').array));
    presentation.dispose();
    return result;
  };
  for (const mode of ['search', 'connected'] as const) {
    const expected = sample(60, mode);
    for (const hz of [30, 144]) sample(hz, mode).forEach((value, i) => assert.ok(Math.abs(value - expected[i]!) < 1e-5));
  }
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
