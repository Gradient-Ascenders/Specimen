import { GRAPHICS_PROFILES } from '../src/render/GraphicsProfiles.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_GAME_SETTINGS, GameSettings, PRESENTATION_PREFERENCES_KEY, type SettingsStorage } from '../src/ui/GameSettings.ts';
import { FrameRateCounter } from '../src/ui/FrameRateCounter.ts';
import { MenuGamepadNavigation, nextMenuFocusIndex, type MenuGamepad } from '../src/ui/MenuNavigation.ts';
import { createSettingsPanelMarkup } from '../src/ui/SettingsPanelMarkup.ts';

function memoryStorage(): SettingsStorage {
  const entries = new Map<string, string>();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); },
    removeItem: key => { entries.delete(key); } };
}

test('audio, camera, input and display preferences survive reload independently of graphics', () => {
  const storage = memoryStorage(), first = new GameSettings({ storage });
  first.setShowFPS(true); first.setReduceMenuMotion(true);
  first.setGraphicsProfile('standard'); first.setMasterVolume(0.25);
  first.setSoundEffectsVolume(0.4); first.setMouseSensitivity(1.7);
  first.setInvertVerticalLook(true); first.setCameraDistanceMetres(7);
  const reloaded = new GameSettings({ storage });
  assert.deepEqual(reloaded.value, { ...DEFAULT_GAME_SETTINGS, ...GRAPHICS_PROFILES.standard.settings,
    showFPS: true, reduceMenuMotion: true, masterVolume: 0.25, soundEffectsVolume: 0.4,
    mouseSensitivity: 1.7, invertVerticalLook: true, cameraDistanceMetres: 7 });
  const saved = JSON.parse(storage.getItem(PRESENTATION_PREFERENCES_KEY)!);
  assert.equal(saved.showFPS, true); assert.equal(saved.reduceMenuMotion, true);
  assert.equal('graphicsProfile' in saved, false);
});

test('newly persisted preferences validate old saves and clamp unsupported values', () => {
  const storage = memoryStorage();
  storage.setItem(PRESENTATION_PREFERENCES_KEY, JSON.stringify({ musicVolume: 0.3,
    masterVolume: 4, soundEffectsVolume: -1, mouseSensitivity: 'fast',
    cameraDistanceMetres: null, invertVerticalLook: 'yes' }));
  const settings = new GameSettings({ storage });
  assert.equal(settings.value.masterVolume, 1);
  assert.equal(settings.value.soundEffectsVolume, 0);
  assert.equal(settings.value.mouseSensitivity, DEFAULT_GAME_SETTINGS.mouseSensitivity);
  assert.equal(settings.value.cameraDistanceMetres, DEFAULT_GAME_SETTINGS.cameraDistanceMetres);
  assert.equal(settings.value.invertVerticalLook, false);
  assert.equal(settings.value.musicVolume, 0.3);
});

test('reset restores every default atomically and clears saved presentation preferences', () => {
  const storage = memoryStorage(), settings = new GameSettings({ storage });
  settings.setShowFPS(true); settings.setReduceMenuMotion(true); settings.setGraphicsProfile('standard');
  settings.setMouseSensitivity(1.9); settings.setInvertVerticalLook(true); settings.setSoundEffectsVolume(0.1);
  settings.setCameraDistanceMetres(7); settings.setMasterVolume(0.15); settings.setGraphicsPreset('performance');
  settings.setRenderScale(0.5); settings.setRenderPixelRatioCap(2);
  let notifications = 0;
  settings.subscribe(() => notifications++);
  settings.resetToDefaults();
  assert.equal(notifications, 2);
  assert.deepEqual(settings.value, DEFAULT_GAME_SETTINGS);
  assert.equal(storage.getItem(PRESENTATION_PREFERENCES_KEY), null);
  assert.deepEqual(new GameSettings({ storage }).value, DEFAULT_GAME_SETTINGS);
  settings.resetToDefaults();
  assert.equal(notifications, 2);
});

test('invalid or inaccessible storage does not block settings or reset', () => {
  const storage = memoryStorage();
  for (const value of ['invalid json', 'null', '42', '{"showFPS":"yes","reduceMenuMotion":1,"graphicsProfile":"standard"}']) {
    storage.setItem(PRESENTATION_PREFERENCES_KEY, value);
    assert.deepEqual(new GameSettings({ storage }).value, DEFAULT_GAME_SETTINGS);
  }
  const blocked = () => { throw new Error('Storage unavailable'); };
  const settings = new GameSettings({ storage: { getItem: blocked, setItem: blocked, removeItem: blocked } });
  settings.setShowFPS(true); assert.equal(settings.value.showFPS, true);
  settings.resetToDefaults(); assert.deepEqual(settings.value, DEFAULT_GAME_SETTINGS);
});

test('FPS uses a half-second average, includes slow rendered frames and supports explicit resets', () => {
  const counter = new FrameRateCounter();
  assert.equal(counter.sample(0), undefined); assert.equal(counter.sample(NaN), undefined);
  assert.equal(counter.sample(Infinity), undefined); assert.equal(counter.sample(-1), undefined);
  for (let i = 0; i < 29; i++) assert.equal(counter.sample(1 / 60), undefined);
  assert.equal(counter.sample(1 / 60), 60);
  for (let i = 0; i < 14; i++) assert.equal(counter.sample(1 / 30), undefined);
  assert.equal(counter.sample(1 / 30), 30);
  counter.sample(0.25); counter.reset();
  assert.equal(counter.sample(0.25), undefined);
  assert.equal(counter.sample(0.25), 4);
  assert.equal(counter.sample(1.2), 1, 'a slow renderer must produce a numeric sample instead of resetting forever');
  assert.equal(counter.sample(1.5), 1);
  assert.equal(counter.sample(3), 0, 'sub-one-FPS rendering stays measurable');
  assert.equal(counter.sample(.25), undefined);
  assert.equal(counter.sample(.25), 4, 'normal rendering recovers immediately');
});

function pad(button?: number, axes = [0, 0]): MenuGamepad {
  return { axes, buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: index === button, value: index === button ? 1 : 0 })) };
}

test('standard gamepad navigation has dead zones, bounded repeat and release-to-arm', () => {
  const navigation = new MenuGamepadNavigation();
  assert.equal(navigation.sample(pad(0), 1 / 60), undefined, 'Held A must not activate a freshly opened menu.');
  navigation.sample(pad(undefined, [0.4, -0.4]), 1 / 60);
  assert.equal(navigation.sample(pad(0), 1 / 60), 'activate');
  for (let i = 0; i < 100; i++) assert.equal(navigation.sample(pad(0), 0.1), undefined);
  navigation.sample(pad(), 1 / 60);
  assert.equal(navigation.sample(pad(13), 1 / 60), 'next');
  for (let i = 0; i < 3; i++) assert.equal(navigation.sample(pad(13), 0.1), undefined);
  assert.equal(navigation.sample(pad(13), 0.1), 'next');
  navigation.reset();
  assert.equal(navigation.sample(pad(1), 0.1), undefined);
  navigation.sample(pad(), 0.1);
  assert.equal(navigation.sample(pad(1), 0.1), 'back');
  navigation.sample(pad(), 0.1);
  assert.equal(navigation.sample(pad(undefined, [-0.8, 0]), 0.1), 'decrease');
  assert.equal(navigation.sample(pad(undefined, [0.8, 0]), 0.1), 'increase');
  assert.equal(navigation.sample(pad(undefined, [0, -0.8]), 0.1), 'previous');
  assert.equal(navigation.sample(undefined, 0.1), undefined);
});

test('menu focus wraps predictably and handles an empty or unfocused panel', () => {
  assert.equal(nextMenuFocusIndex(-1, 3, 1), 0);
  assert.equal(nextMenuFocusIndex(-1, 3, -1), 2);
  assert.equal(nextMenuFocusIndex(2, 3, 1), 0);
  assert.equal(nextMenuFocusIndex(0, 3, -1), 2);
  assert.equal(nextMenuFocusIndex(0, 0, 1), -1);
});

test('settings group controls into five labelled tabs, unique controls and linked hints', () => {
  const markup = createSettingsPanelMarkup();
  for (const section of ['Graphics', 'Display', 'Audio', 'Controls', 'Accessibility']) {
    assert.ok(markup.includes(`>${section}</legend>`));
    assert.ok(markup.includes(`id="settings-${section.toLowerCase()}"`));
    assert.ok(markup.includes(`aria-controls="settings-${section.toLowerCase()}"`));
  }
  const controls = [...markup.matchAll(/<(?:input|select)\b([^>]*)>/g)].map(match => match[1]);
  const keys = controls.map(control => control.match(/data-setting="([^"]+)"/)![1]);
  assert.equal(keys.length, 25); assert.equal(new Set(keys).size, keys.length);
  for (const attributes of controls) {
    const key = attributes.match(/data-setting="([^"]+)"/)![1];
    const description = attributes.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(markup.includes(`data-setting-output="${key}"`));
    if (description) assert.ok(markup.includes(`id="${description}"`));
  }
  assert.ok(markup.includes('data-action="reset-settings"'));
  assert.equal((markup.match(/data-autofocus/g) ?? []).length, 1);
});
