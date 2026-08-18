import { Input } from './core/Input';
import { Loop } from './core/Loop';
import { GreyboxTestPanel } from './debug/GreyboxTestPanel';
import { GreyboxCollisionScene } from './levels/GreyboxCollisionScene';
import { PuzzleTestRig } from './puzzle/PuzzleTestRig';
import { RenderLayer } from './render/RenderLayer';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app host element.');
}

const renderLayer = new RenderLayer({ host: app });

const testScene = new GreyboxCollisionScene();
renderLayer.scene.add(testScene.root);

const puzzleTestRig = new PuzzleTestRig();
renderLayer.scene.add(puzzleTestRig.root);

const testPanel = new GreyboxTestPanel({
  onReset: () => {
    testScene.resetProbe();
    puzzleTestRig.reset();
  },
  onTestRecovery: (onRecovered) => testScene.simulateFall(onRecovered),
  onTogglePuzzleTest: () => puzzleTestRig.toggleTestSlime(),
  onRunSensorRegression: () => puzzleTestRig.runTriggerRegression(),
  onRunResetRegression: () => puzzleTestRig.runResetRegression(),
  onActivateCheckpoint: () => puzzleTestRig.activateElevatedCheckpoint(),
  onRecoverCheckpoint: () => puzzleTestRig.recoverTestSlime(),
});

app.replaceChildren(renderLayer.canvas, testPanel.element);

const input = new Input({
  pointerLockElement: renderLayer.canvas,
});

let debugSampleElapsedSeconds = 0;

const loop = new Loop({
  fixedUpdate: (deltaSeconds) => {
    if (input.wasPressed('debugReset')) testPanel.resetProbe();
    if (input.wasPressed('debugTestRecovery')) testPanel.testRecovery();

    testScene.update(deltaSeconds);
    puzzleTestRig.update(deltaSeconds);
    input.endFixedUpdate();
  },
  render: (_interpolationAlpha, stats) => {
    renderLayer.render();

    debugSampleElapsedSeconds += stats.rawFrameDeltaSeconds;
    if (debugSampleElapsedSeconds >= 0.25) {
      debugSampleElapsedSeconds = 0;
      const heldActions = Array.from(input.held).join(', ') || 'none';
      const renderStats = renderLayer.getDiagnostics();
      testPanel.setRuntimeDiagnostics(
        [
          `fixed step: ${(stats.fixedDeltaSeconds * 1000).toFixed(2)} ms`,
          `render FPS: ${stats.renderFps.toFixed(1)}`,
          `raw delta: ${(stats.rawFrameDeltaSeconds * 1000).toFixed(2)} ms`,
          `clamped delta: ${(stats.frameDeltaSeconds * 1000).toFixed(2)} ms`,
          `steps this frame: ${stats.stepsThisFrame}`,
          `dropped sim time: ${(stats.droppedSimulationTimeSeconds * 1000).toFixed(2)} ms`,
          `pointer lock: ${input.pointerLocked ? 'locked' : 'unlocked'}`,
          `held actions: ${heldActions}`,
          `viewport: ${renderStats.viewportWidth} × ${renderStats.viewportHeight} CSS px`,
          `drawing buffer: ${renderStats.drawingBufferWidth} × ${renderStats.drawingBufferHeight} px (${renderStats.pixelRatio.toFixed(2)}× DPR)`,
          `draw calls / triangles: ${renderStats.drawCalls} / ${renderStats.triangles}`,
          `GPU geometries / textures: ${renderStats.geometries} / ${renderStats.textures}`,
          `plate / door / platform: ${puzzleTestRig.platePressed ? 'pressed' : 'released'} / ${puzzleTestRig.doorState} / ${puzzleTestRig.platformState}`,
          `active checkpoint: ${puzzleTestRig.activeCheckpointId}`,
        ].join('\n'),
      );
    }
  },
});

renderLayer.setAnimationLoop((timestampMs) => {
  loop.tick(timestampMs);
});

const shutdown = (): void => {
  loop.dispose();
  input.dispose();
  testPanel.dispose();
  puzzleTestRig.dispose();
  testScene.dispose();
  renderLayer.dispose();
};

if (import.meta.hot) {
  import.meta.hot.dispose(shutdown);
}
