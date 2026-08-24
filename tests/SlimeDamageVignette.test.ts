import assert from 'node:assert/strict';
import test from 'node:test';

import { SlimeDamageSystem } from '../src/systems/SlimeDamageSystem.ts';
import { SlimeDamageVignette } from '../src/ui/SlimeDamageVignette.ts';

class FakeStyle {
  readonly properties = new Map<string, string>();
  opacity = '';

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.properties.get(name) ?? '';
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  className = '';
  removed = false;

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  remove(): void {
    this.removed = true;
  }
}

test('damage vignette mirrors active health, slime colour, regeneration, and disposal', () => {
  const damage = new SlimeDamageSystem();
  const element = new FakeElement();
  const hostDocument = {
    createElement: () => element,
  } as unknown as Document;
  const vignette = new SlimeDamageVignette({ damage, document: hostDocument });

  vignette.update(0, 'bob');
  assert.equal(element.className, 'slime-damage-vignette');
  assert.equal(element.attributes.get('aria-hidden'), 'true');
  assert.equal(element.dataset.slimeId, 'bob');
  assert.equal(element.style.getPropertyValue('--damage-colour-rgb'), '114 234 208');
  assert.equal(element.style.opacity, '0.000');

  damage.applyDamage('bob', 20);
  vignette.update(0, 'bob');
  const impactOpacity = Number(element.style.opacity);
  assert.ok(impactOpacity >= 0.47);

  vignette.update(0.5, 'bob');
  const woundedOpacity = Number(element.style.opacity);
  assert.ok(woundedOpacity > 0);
  assert.ok(woundedOpacity < impactOpacity);

  damage.update(3.75);
  vignette.update(3.75, 'bob');
  assert.equal(element.style.opacity, '0.000');

  damage.applyDamage('goop', 40);
  vignette.update(0, 'goop');
  assert.equal(element.dataset.slimeId, 'goop');
  assert.equal(element.style.getPropertyValue('--damage-colour-rgb'), '145 207 75');
  assert.ok(Number(element.style.opacity) > 0);

  damage.reset();
  assert.equal(element.style.opacity, '0');
  vignette.dispose();
  assert.equal(element.removed, true);
  damage.dispose();
});
