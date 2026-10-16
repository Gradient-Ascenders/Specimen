import { RenderLayer } from '../render/RenderLayer.ts';
import { GRAPHICS_PROFILES } from '../render/GraphicsProfiles.ts';
import { TitleScreenScene } from '../ui/TitleScreenScene.ts';
import { OpeningGameScene } from './OpeningGameScene.ts';
import { sampleOpeningGame } from './OpeningGameTimeline.ts';

/** Offline-export entry only; not imported by the shipped game. Absolute-time
 * frame capture never records the exporting machine's real-time lag spikes. */
export async function createOpeningMovieCapture(width: number, height: number) {
  const host = document.createElement('div');
  Object.assign(document.body.style, { margin: '0', background: '#020608', overflow: 'hidden' });
  Object.assign(host.style, { width: `${width}px`, height: `${height}px` });
  document.body.append(host);
  const layer = new RenderLayer({ host, graphics: GRAPHICS_PROFILES.standard.settings });
  const room = new TitleScreenScene();
  room.update(0, width / height, true);
  const scene = new OpeningGameScene(room, layer);
  scene.begin();
  const output = document.createElement('canvas');
  output.width = width; output.height = height; host.append(output);
  const context = output.getContext('2d', { alpha: false })!;
  await scene.prepare(layer);
  return {
    frame(seconds: number): string {
      const frame = sampleOpeningGame(seconds);
      scene.apply(frame, width / height);
      layer.withShadowPreparation(true, () => {
        layer.renderer.shadowMap.needsUpdate = scene.needsShadowUpdate;
        layer.renderer.render(room.scene, room.camera);
      });
      context.globalAlpha = 1;
      context.drawImage(layer.canvas, 0, 0, width, height);
      context.fillStyle = '#020608';
      context.globalAlpha = frame.fade; context.fillRect(0, 0, width, height);
      context.globalAlpha = 1;
      const bar = Math.min(64, height * .06);
      context.fillRect(0, 0, width, bar); context.fillRect(0, height - bar, width, bar);
      return output.toDataURL('image/png').slice('data:image/png;base64,'.length);
    },
    dispose(): void { scene.dispose(); layer.dispose(); host.remove(); },
  };
}
