import { expect, test } from '../../helpers/MusicFixtures.ts';
import { SOUND_DEFINITIONS } from '../../../src/audio/SoundCatalog.ts';

test('production laser mix retains audible telegraphs with lower beam levels and the revised continuous score', async ({ page }, info) => {
  // Decode the shipped assets without loading a scene. These are component
  // measurements, not a claim about subjective loudness or a full spatial mix.
  await page.route('**/group-folder/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Laser mix audit</title>' }));
  await page.goto('./');
  const clips = (['boss-beam-charge-01', 'boss-beam-ignite-01', 'boss-beam-sustain-loop-01', 'boss-beam-shutdown-01',
    'boss-orb-charge-01', 'boss-orb-launch-01', 'boss-orb-burst-01', 'boss-drone-shot-01'] as const)
    .map(id => ({ id, ...SOUND_DEFINITIONS[id] }));
  const report = await page.evaluate(async clips => {
    const context = new AudioContext({ sampleRate: 44100 });
    const decode = async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${response.status}: ${path}`);
      return context.decodeAudioData(await response.arrayBuffer());
    };
    const measure = (buffer: AudioBuffer, start = 0, end = buffer.duration) => {
      let sum = 0, peak = 0, count = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let frame = Math.round(start * buffer.sampleRate); frame < Math.min(data.length, Math.round(end * buffer.sampleRate)); frame++) {
          const value = data[frame]!; sum += value * value; peak = Math.max(peak, Math.abs(value)); count++;
        }
      }
      return { rms: Math.sqrt(sum / count), peak };
    };
    try {
      const boss = measure(await decode('assets/audio/music/' + (window as any).__testMusicFiles.boss));
      const research = await decode('assets/audio/music/' + (window as any).__testMusicFiles.research);
      const effects = [];
      for (const clip of clips) {
        const buffer = await decode(clip.path), raw = measure(buffer);
        const scale = clip.id === 'boss-drone-shot-01' ? .15 : 1;
        // Full sliders, before distance attenuation and the existing SFX compressor.
        effects.push({ id: clip.id, gain: clip.volume, voices: clip.maxVoices, duration: buffer.duration,
          raw, mixedRms: raw.rms * clip.volume * scale, mixedPeak: raw.peak * clip.volume * scale });
      }
      return { bossMusic: { raw: boss, mixedRms: boss.rms * .28 }, effects,
        research: { duration: research.duration, channels: research.numberOfChannels, rate: research.sampleRate,
          blackout: measure(research, 124, 133), actIII: measure(research, 134, 195), actIV: measure(research, 195, 230),
          seam: [measure(research, 194.9, 195), measure(research, 195, 195.1)] } };
    } finally { await context.close(); }
  }, clips);
  await info.attach('decoded-laser-mix', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.log('Decoded laser mix:', JSON.stringify(report));
  expect(report.research).toMatchObject({ channels: 2, rate: 44100 });
  // Chromium exposes a small Vorbis decoder tail; the OGG granule duration
  // and authoritative cinematic clock are checked as exactly 277s in Node.
  expect(report.research.duration).toBeCloseTo(277, 1);
  expect(report.research.blackout.peak).toBe(0);
  expect(report.research.actIII.rms).toBeGreaterThan(.001);
  expect(report.research.actIV.rms).toBeGreaterThan(.001);
  expect(report.research.seam.every(window => window.rms > .001)).toBe(true);
  const sustain = report.effects.find(effect => effect.id === 'boss-beam-sustain-loop-01')!;
  expect(sustain.mixedRms / (sustain.raw.rms * 4)).toBeCloseTo(1.25 / 4);
  for (const effect of report.effects) {
    expect(effect.mixedRms, effect.id).toBeGreaterThan(.001);
    expect(effect.mixedPeak, effect.id).toBeLessThan(1);
  }
});
