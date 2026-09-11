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

  presentation.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(host.children[0]?.removed, true);
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
