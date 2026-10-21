import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Loop } from '../src/core/Loop.ts';
import { Input } from '../src/core/Input.ts';
import { gameplayBindings } from '../src/core/KeyBindings.ts';
import { GameSettings, DEFAULT_GAME_SETTINGS, PRESENTATION_PREFERENCES_KEY } from '../src/ui/GameSettings.ts';
import { CameraRig } from '../src/render/CameraRig.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';

function environment() {
  const doc = Object.assign(new EventTarget(), { hidden: false, hasFocus: () => true });
  const win = new EventTarget();
  return { doc, win, options: { document: doc as unknown as Document, window: win as unknown as Window } };
}

for (const cap of [30, 60, 120]) test(`${cap} FPS cap preserves fixed-step simulation on a 144 Hz display`, () => {
  const env = environment(); let steps = 0, frames = 0;
  const loop = new Loop({ ...env.options, fixedUpdate: () => steps++, render: () => frames++ });
  loop.setFrameRateLimit(cap);
  for (let i = 0; i <= 432; i++) loop.tick(i * 1000 / 144);
  assert.ok(Math.abs(frames - (3 * cap + 1)) <= 1, `${frames} frames`);
  assert.ok(steps >= 179 && steps <= 180, `${steps} steps`);
  loop.dispose();
});

test('background pausing is optional and returning to the foreground does not catch up hidden time', () => {
  const env = environment(); let steps = 0;
  const loop = new Loop({ ...env.options, fixedUpdate: () => steps++, render: () => {} });
  loop.tick(0); env.doc.hidden = true; env.doc.dispatchEvent(new Event('visibilitychange'));
  loop.tick(1000); assert.equal(steps, 0);
  loop.setPauseWhenUnfocused(false); loop.tick(1000); loop.tick(1017); assert.equal(steps, 1);
  loop.setPauseWhenUnfocused(true); loop.tick(2000); assert.equal(steps, 1);
  env.doc.hidden = false; env.doc.dispatchEvent(new Event('visibilitychange')); loop.tick(3000);
  assert.equal(steps, 1);
  loop.tick(3017); assert.equal(steps, 2); loop.dispose();
});

test('remapping live input clears held keys and takes over debug shortcuts without double actions', () => {
  const env = environment(), settings = new GameSettings({ storage: null });
  const element = new EventTarget();
  const input = new Input({ ...env.options, pointerLockElement: element as HTMLElement });
  const key = (type: string, code: string) => env.win.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat: false }));
  key('keydown', 'KeyW'); assert.equal(input.isDown('moveForward'), true);
  assert.equal(settings.setKeyBinding('moveForward', 'KeyR'), true);
  assert.equal(settings.setKeyBinding('jump', 'KeyR'), false);
  assert.equal(settings.setKeyBinding('jump', 'KeyH'), false);
  assert.equal(settings.setKeyBinding('pause', 'Escape'), false);
  input.setBindings(gameplayBindings(settings.value.keyBindings));
  assert.equal(input.isDown('moveForward'), false);
  key('keydown', 'KeyR'); assert.equal(input.wasPressed('moveForward'), true); assert.equal(input.wasPressed('debugReset'), false);
  input.endFixedUpdate(); key('keyup', 'KeyR'); key('keydown', 'KeyW'); assert.equal(input.isDown('moveForward'), false);
  input.dispose();
});

test('new preferences and bindings survive reload; graphics defaults and reset remain intact', () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } };
  const settings = new GameSettings({ storage });
  settings.setFrameRateLimit(60); settings.setMusicVolume(0.3); settings.setBrightness(1.15);
  settings.setFieldOfViewDegrees(65); settings.setCameraShake(0); settings.setHUDVisibility('minimal');
  settings.setInterfaceScale(1.25); settings.setPauseInBackground(false); settings.setMuteInBackground(false);
  settings.setKeyBinding('jump', 'KeyJ'); settings.setGraphicsProfile('high');
  const reloaded = new GameSettings({ storage });
  assert.deepEqual(reloaded.value, { ...DEFAULT_GAME_SETTINGS, ...settings.value, masterVolume: DEFAULT_GAME_SETTINGS.masterVolume,
    frameRateLimit: 60, musicVolume: 0.3, brightness: 1.15, fieldOfViewDegrees: 65, cameraShake: 0,
    hudVisibility: 'minimal', interfaceScale: 1.25, pauseInBackground: false, muteInBackground: false, keyBindings: settings.value.keyBindings });
  settings.resetToDefaults(); assert.equal(saved.size, 0); assert.deepEqual(settings.value, DEFAULT_GAME_SETTINGS);
  storage.setItem(PRESENTATION_PREFERENCES_KEY, JSON.stringify({ brightness: 'oops', interfaceScale: 20, frameRateLimit: -1,
    cameraShake: 'none', keyBindings: { jump: 'Escape' } }));
  const malformed = new GameSettings({ storage });
  assert.equal(malformed.value.brightness, 1); assert.equal(malformed.value.interfaceScale, 1.5);
  assert.equal(malformed.value.frameRateLimit, 0); assert.deepEqual(malformed.value.keyBindings, DEFAULT_GAME_SETTINGS.keyBindings);
});

test('gameplay FOV applies on camera update and restores after an authored cinematic pose', () => {
  const rig = new CameraRig();
  rig.setFollowTarget({ position: new THREE.Vector3(), previousPosition: new THREE.Vector3(), velocity: new THREE.Vector3(),
    gameplayUp: new THREE.Vector3(0, 1, 0), grounded: true, attached: false }, new CollisionWorld());
  rig.setFieldOfViewDegrees(65); rig.update(1, 1 / 60); assert.equal(rig.camera.fov, 65);
  rig.camera.fov = 40; rig.update(1, 1 / 60); assert.equal(rig.camera.fov, 65);
  rig.setFieldOfViewDegrees(500); rig.update(1, 1 / 60); assert.equal(rig.camera.fov, 75);
});
