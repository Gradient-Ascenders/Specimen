import * as THREE from 'three';
import { Input } from './core/Input';
import { Loop } from './core/Loop';
import { GreyboxTestPanel } from './debug/GreyboxTestPanel';
import { GreyboxCollisionScene } from './levels/GreyboxCollisionScene';
import { CollisionWorld } from './physics/CollisionWorld';
import { KinematicBody } from './physics/KinematicBody';
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

const collisionWorld = new CollisionWorld();
collisionWorld.registerAll(testScene.collisionMeshes);

const spawnPosition = testScene.copySpawnPosition(new THREE.Vector3());
const recoveryPosition = testScene.copyRecoveryPosition(new THREE.Vector3());
const renderedProbePosition = new THREE.Vector3();

const body = new KinematicBody({
  world: collisionWorld,
  initialPosition: spawnPosition,
});

const testPanel = new GreyboxTestPanel({
  onReset: () => {
    testScene.resetProbe();
    body.teleport(spawnPosition);
    puzzleTestRig.reset();
  },
  onTestRecovery: (onRecovered) => {
    body.teleport(recoveryPosition);
    testScene.simulateFall(() => {
      body.teleport(spawnPosition);
      onRecovered();
    });
  },
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

    const moveX =
      (input.isDown('moveRight') ? 1 : 0) -
      (input.isDown('moveLeft') ? 1 : 0);
    const moveZ =
      (input.isDown('moveBackward') ? 1 : 0) -
      (input.isDown('moveForward') ? 1 : 0);

    body.update(deltaSeconds, moveX, moveZ);
    testScene.update(deltaSeconds);
    puzzleTestRig.update(deltaSeconds);
    input.endFixedUpdate();
  },
  render: (interpolationAlpha, stats) => {
  const previous = body.previousPosition;
  const current = body.position;

  renderedProbePosition.set(
    THREE.MathUtils.lerp(previous.x, current.x, interpolationAlpha),
    THREE.MathUtils.lerp(previous.y, current.y, interpolationAlpha),
    THREE.MathUtils.lerp(previous.z, current.z, interpolationAlpha),
  );

  testScene.setProbePosition(renderedProbePosition);

  renderLayer.render();

    debugSampleElapsedSeconds += stats.rawFrameDeltaSeconds;
    if (debugSampleElapsedSeconds >= 0.25) {
      debugSampleElapsedSeconds = 0;
      const heldActions = Array.from(input.held).join(', ') || 'none';
      const position = body.position;
      const velocity = body.velocity;
      const groundNormal = body.groundNormal;

      const renderStats = renderLayer.getDiagnostics();
      testPanel.setRuntimeDiagnostics(
        [
          `fixed step: ${(stats.fixedDeltaSeconds * 1000).toFixed(2)} ms`,
          `render FPS: ${stats.renderFps.toFixed(1)}`,
          `steps this frame: ${stats.stepsThisFrame}`,
          `pointer lock: ${input.pointerLocked ? 'locked' : 'unlocked'}`,
          `held actions: ${heldActions}`,
          `body position: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)} m`,
          `body velocity: ${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)} m/s`,
          `grounded / attached: ${body.grounded ? 'yes' : 'no'} / ${body.attached ? 'yes' : 'no'}`,
          `ground normal: ${groundNormal.x.toFixed(2)}, ${groundNormal.y.toFixed(2)}, ${groundNormal.z.toFixed(2)}`,
          `contacts this step: ${body.contactsThisStep}`,
          `last collision: ${body.lastCollisionName}`,
          `registered colliders: ${collisionWorld.colliderCount}`,
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
  collisionWorld.clear();
  testPanel.dispose();
  puzzleTestRig.dispose();
  testScene.dispose();
  renderLayer.dispose();
};

if (import.meta.hot) {
  import.meta.hot.dispose(shutdown);
}
