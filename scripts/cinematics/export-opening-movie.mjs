import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'src/assets/cinematics/opening.mp4');
const temporaryOutput = `${output}.partial.mp4`;
const width = 1920, height = 1080, fps = 30;
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status !== 0) {
  throw new Error('FFmpeg with libx264 is required. Install it or set FFMPEG_PATH.');
}
if (!process.argv.includes('--force')) {
  const exists = await access(output).then(() => true, () => false);
  if (exists) throw new Error('opening.mp4 already exists; pass --force to replace this generated asset.');
}
await mkdir(dirname(output), { recursive: true });
const preview = join(root, 'artifacts/opening-movie-preview');
await mkdir(preview, { recursive: true });
// Editing the player while exporting must never hot-reload the capture page.
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0,
  hmr: false, watch: null }, logLevel: 'error' });
server.middlewares.use('/__opening_export__', (_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><html><head><title>Offline opening export</title></head><body></body></html>');
});
await server.listen();
let browser, encoder;
try {
  browser = await chromium.launch({ headless: true, args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  ] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  let pageError;
  page.on('pageerror', error => { pageError = error; });
  await page.goto(`${server.resolvedUrls.local[0]}__opening_export__`);
  const timing = await page.evaluate(async ({ width, height }) => {
    const { createOpeningMovieCapture } = await import('/src/cinematics/OpeningMovieCapture.ts');
    const { OPENING_GAME_TIMING } = await import('/src/cinematics/OpeningGameTimeline.ts');
    window.__openingCapture = await createOpeningMovieCapture(width, height);
    return { start: OPENING_GAME_TIMING.blackoutEnd, end: OPENING_GAME_TIMING.end };
  }, { width, height });
  const frames = Math.round((timing.end - timing.start) * fps) + 1;
  encoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-level:v', '4.0', '-g', '60', '-movflags', '+faststart',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-threads', '2', temporaryOutput], { stdio: ['pipe', 'ignore', 'pipe'] });
  let encoderError = '';
  encoder.stderr.on('data', chunk => { encoderError = (encoderError + chunk).slice(-4000); });
  const encoded = once(encoder, 'close');
  encoder.stdin.on('error', () => {});
  const previews = new Set([0, 5.46, 24.3, 35.2, 40.3, 44.8, 48.1, 53.9].map(time =>
    Math.max(0, Math.min(frames - 1, Math.round((time - timing.start) * fps)))));
  console.log(`Exporting ${frames} authored frames at ${width}x${height}/${fps}fps (source ${timing.start}-${timing.end}s).`);
  for (let index = 0; index < frames; index++) {
    if (pageError) throw pageError;
    if (encoder.exitCode !== null) throw new Error(`FFmpeg stopped early: ${encoderError}`);
    const seconds = Math.min(timing.end, timing.start + index / fps);
    const base64 = await page.evaluate(seconds => window.__openingCapture.frame(seconds), seconds);
    const png = Buffer.from(base64, 'base64');
    if (previews.has(index)) await writeFile(join(preview, `source-${seconds.toFixed(2)}.png`), png);
    // The write callback reports a closed encoder too; waiting only for drain
    // could otherwise hang forever if FFmpeg exits on a bad input frame.
    await new Promise((resolve, reject) => {
      encoder.stdin.write(png, error => error ? reject(error) : resolve());
    });
    if (index % 90 === 0) console.log(`  ${index}/${frames} frames; source ${seconds.toFixed(2)}s`);
  }
  encoder.stdin.end();
  const [code] = await encoded;
  if (code !== 0) throw new Error(`FFmpeg failed (${code}): ${encoderError}`);
  await rename(temporaryOutput, output);
  const bytes = await readFile(output);
  const metadata = { width, height, fps, frames, durationSeconds: frames / fps,
    sourceStartSeconds: timing.start, sourceEndSeconds: timing.end, codec: 'h264',
    pixelFormat: 'yuv420p', audio: false, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
  await writeFile(output.replace(/\.mp4$/, '.json'), JSON.stringify(metadata, null, 2) + '\n');
  await page.evaluate(() => window.__openingCapture.dispose());
  console.log(`Created ${output} (${bytes.length} bytes).`);
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill('SIGTERM');
  await browser?.close();
  await server.close();
}
