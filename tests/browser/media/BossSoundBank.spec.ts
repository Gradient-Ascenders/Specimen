import { expect, test } from '@playwright/test';
import { BOSS_SOUND_IDS, BLACKOUT_CUTSCENE_SOUND_IDS, ENDING_SOUND_IDS, SOUND_DEFINITIONS } from '../../../src/audio/SoundCatalog.ts';

test('all boss, Blackout and ending effects decode as mono audio from the production nested base', async ({page}) => {
  // This checks shipped assets and the browser decoder, independently of game
  // rendering. Combat event routing is exercised by FinalBossAudio.test.ts.
  await page.route('**/group-folder/', route => route.fulfill({contentType:'text/html', body:'<!doctype html><title>Boss audio decoder</title>'}));
  await page.goto('./');
  const decoded = await page.evaluate(async clips => {
    const context = new AudioContext();
    try {
      return await Promise.all(clips.map(async ({id,path}) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        return {id, channels:buffer.numberOfChannels, duration:buffer.duration, sampleRate:buffer.sampleRate};
      }));
    } finally {await context.close();}
  }, [...BOSS_SOUND_IDS,...BLACKOUT_CUTSCENE_SOUND_IDS,...ENDING_SOUND_IDS].map(id => ({id,path:SOUND_DEFINITIONS[id].path})));
  expect(decoded).toHaveLength(61);
  for (const clip of decoded) {
    expect(clip.channels, clip.id).toBe(1);
    expect(clip.duration, clip.id).toBeGreaterThan(.1);
    expect(clip.sampleRate, clip.id).toBeGreaterThanOrEqual(44100);
  }
});
