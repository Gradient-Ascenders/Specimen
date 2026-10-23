import assert from 'node:assert/strict';
import test from 'node:test';
import { GoopSpeedOverlay, goopSpeedEffectStrength } from '../src/ui/GoopSpeedOverlay.ts';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style = {opacity: '', left: '', top: '', animationDelay: '', setProperty(_name: string, _value: string) {}};
  className = '';
  hidden = false;
  removed = false;
  ownerDocument = {createElement: () => new FakeElement()};
  setAttribute(name: string, value: string): void {this.attributes.set(name, value);}
  append(child: FakeElement): void {this.children.push(child);}
  remove(): void {this.removed = true;}
}

test('speed feedback requires the real boost and movement above ordinary speed', () => {
  const source = {locomotionSpeedMultiplier: 1.5, maximumLocomotionSpeedMetresPerSecond: 8.25, velocity: {x: 0, z: 0}};
  assert.equal(goopSpeedEffectStrength(source), 0);
  source.velocity.z = 5.5;
  assert.equal(goopSpeedEffectStrength(source), 0);
  source.velocity.z = 6.875;
  assert.equal(goopSpeedEffectStrength(source), .5);
  source.velocity.z = 8.25;
  assert.equal(goopSpeedEffectStrength(source), 1);
  source.locomotionSpeedMultiplier = 1;
  assert.equal(goopSpeedEffectStrength(source), 0, 'a fast knockback or a jump without acid support cannot trigger the cue');
});

test('the screen effect fades without allocating new streaks and resets on pause/disposal', () => {
  const host = new FakeElement(), overlay = new GoopSpeedOverlay(host as unknown as HTMLElement);
  const root = host.children[0];
  assert.equal(root.attributes.get('aria-hidden'), 'true');
  assert.equal(root.hidden, true);
  assert.equal(root.children.length, 12);
  overlay.update(1 / 60, 1);
  assert.equal(root.hidden, false);
  assert.ok(Number(root.style.opacity) > 0 && Number(root.style.opacity) < .72, 'entry is eased');
  for (let i = 0; i < 60; i++) overlay.update(1 / 60, 1);
  assert.ok(Number(root.style.opacity) >= .71);
  assert.equal(root.children.length, 12);
  const full = Number(root.style.opacity);
  overlay.update(1 / 60, 0);
  assert.ok(Number(root.style.opacity) < full);
  for (let i = 0; i < 60; i++) overlay.update(1 / 60, 0);
  assert.equal(root.hidden, true);
  overlay.update(.1, 1); overlay.reset();
  assert.equal(root.hidden, true);
  assert.equal(root.style.opacity, '0');
  overlay.dispose(); overlay.dispose(); overlay.update(.1, 1);
  assert.equal(root.removed, true);
  assert.equal(root.hidden, true);
});
