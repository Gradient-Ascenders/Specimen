import { Input } from './core/Input.ts';
import { Loop } from './core/Loop.ts';
import { GreyboxLevelRuntime } from './levels/GreyboxLevelRuntime.ts';
import { RenderLayer } from './render/RenderLayer.ts';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app host element.');
}

const renderLayer = new RenderLayer({ host: app });
const input = new Input({ pointerLockElement: renderLayer.canvas });
const levelRuntime = new GreyboxLevelRuntime({
  host: app,
  input,
  renderLayer,
  debugAvailable:
    import.meta.env.DEV ||
    new URLSearchParams(window.location.search).get('debug') === '1',
});

app.replaceChildren(renderLayer.canvas);
levelRuntime.load();
levelRuntime.start();

const loop = new Loop({
  fixedUpdate: (deltaSeconds) => levelRuntime.fixedUpdate(deltaSeconds),
  render: (interpolationAlpha, stats) =>
    levelRuntime.render(interpolationAlpha, stats),
});

renderLayer.setAnimationLoop((timestampMs) => loop.tick(timestampMs));

const shutdown = (): void => {
  loop.dispose();
  levelRuntime.dispose();
  input.dispose();
  renderLayer.dispose();
};

if (import.meta.hot) import.meta.hot.dispose(shutdown);
