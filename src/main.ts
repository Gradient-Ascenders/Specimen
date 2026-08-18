import * as THREE from 'three';

import { Input } from './core/Input';
import { Loop } from './core/Loop';
import { GreyboxTestPanel } from './debug/GreyboxTestPanel';
import { GreyboxCollisionScene } from './levels/GreyboxCollisionScene';
import { PuzzleTestRig } from './puzzle/PuzzleTestRig';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app host element.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07110f);
scene.fog = new THREE.Fog(0x07110f, 20, 38);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
camera.position.set(17, 13, 20);
camera.lookAt(0, 0.5, 1.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-hidden', 'true');

const ambientLight = new THREE.HemisphereLight(0xc8ffe0, 0x17231f, 2.2);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
keyLight.position.set(8, 14, 10);
scene.add(keyLight);

const testScene = new GreyboxCollisionScene();
scene.add(testScene.root);

const puzzleTestRig = new PuzzleTestRig();
scene.add(puzzleTestRig.root);

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

app.replaceChildren(renderer.domElement, testPanel.element);

const input = new Input({
  pointerLockElement: renderer.domElement,
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
    renderer.render(scene, camera);

    debugSampleElapsedSeconds += stats.rawFrameDeltaSeconds;
    if (debugSampleElapsedSeconds >= 0.25) {
      debugSampleElapsedSeconds = 0;
      const heldActions = Array.from(input.held).join(', ') || 'none';
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
          `plate / door / platform: ${puzzleTestRig.platePressed ? 'pressed' : 'released'} / ${puzzleTestRig.doorState} / ${puzzleTestRig.platformState}`,
          `active checkpoint: ${puzzleTestRig.activeCheckpointId}`,
        ].join('\n'),
      );
    }
  },
});

const resize = (): void => {
  const width = app.clientWidth;
  const height = app.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
};

renderer.setAnimationLoop((timestampMs) => {
  loop.tick(timestampMs);
});

window.addEventListener('resize', resize);
resize();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    loop.dispose();
    input.dispose();
    testPanel.dispose();
    puzzleTestRig.dispose();
    testScene.dispose();
    renderer.dispose();
  });
}
