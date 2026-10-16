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

test('FPS and reduced-menu-motion persist without changing safe gameplay defaults on reload', () => {
  const storage = memoryStorage(), first = new GameSettings({ storage });
  first.setShowFPS(true); first.setReduceMenuMotion(true);
  first.setGraphicsProfile('standard'); first.setMasterVolume(0.25);
  const reloaded = new GameSettings({ storage });
  assert.deepEqual(reloaded.value, { ...DEFAULT_GAME_SETTINGS, showFPS: true, reduceMenuMotion: true });
  assert.deepEqual(JSON.parse(storage.getItem(PRESENTATION_PREFERENCES_KEY)!), { showFPS: true, reduceMenuMotion: true });
});

test('reset restores every default atomically and clears saved presentation preferences', () => {
  const storage = memoryStorage(), settings = new GameSettings({ storage });
  settings.setShowFPS(true); settings.setReduceMenuMotion(true); settings.setGraphicsProfile('standard');
  settings.setMouseSensitivity(1.9); settings.setInvertVerticalLook(true); settings.setSoundEffectsVolume(0.1);
  settings.setMusicVolume(0.2);
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

test('FPS uses a half-second frame average, ignores invalid samples and resets gaps', () => {
  const counter = new FrameRateCounter();
  assert.equal(counter.sample(0), undefined); assert.equal(counter.sample(NaN), undefined);
  for (let i = 0; i < 29; i++) assert.equal(counter.sample(1 / 60), undefined);
  assert.equal(counter.sample(1 / 60), 60);
  for (let i = 0; i < 14; i++) assert.equal(counter.sample(1 / 30), undefined);
  assert.equal(counter.sample(1 / 30), 30);
  counter.sample(0.25); counter.reset();
  assert.equal(counter.sample(0.25), undefined);
  assert.equal(counter.sample(2), undefined);
  assert.equal(counter.sample(0.25), undefined);
  assert.equal(counter.sample(0.25), 4);
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

test('settings expose five labelled sections, current values, descriptions and reset without duplicate controls', () => {
  const markup = createSettingsPanelMarkup();
  for (const section of ['Graphics', 'Display', 'Audio', 'Controls', 'Accessibility']) {
    assert.ok(markup.includes(`<legend>${section}</legend>`));
    assert.ok(markup.includes(`id="settings-${section.toLowerCase()}"`));
  }
  const controls = [...markup.matchAll(/<(?:input|select)\b([^>]*)>/g)].map(match => match[1]);
  const keys = controls.map(control => control.match(/data-setting="([^"]+)"/)![1]);
  assert.equal(keys.length, 13); assert.equal(new Set(keys).size, keys.length);
  for (const attributes of controls) {
    const key = attributes.match(/data-setting="([^"]+)"/)![1];
    const description = attributes.match(/aria-describedby="([^"]+)"/)![1];
    assert.ok(markup.includes(`data-setting-output="${key}"`));
    assert.ok(markup.includes(`id="${description}"`));
  }
  assert.ok(markup.includes('data-action="reset-settings"'));
  assert.equal((markup.match(/data-autofocus/g) ?? []).length, 1);
});
