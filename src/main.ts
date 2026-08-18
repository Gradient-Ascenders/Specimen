import * as THREE from 'three';

import { GreyboxTestPanel } from './debug/GreyboxTestPanel';
import { GreyboxCollisionScene } from './levels/GreyboxCollisionScene';
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

const testPanel = new GreyboxTestPanel({
  onReset: () => testScene.resetProbe(),
  onTestRecovery: (onRecovered) => testScene.simulateFall(onRecovered),
});

app.replaceChildren(renderer.domElement, testPanel.element);

const resize = (): void => {
  const width = app.clientWidth;
  const height = app.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
};

const timer = new THREE.Timer();
timer.connect(document);

renderer.setAnimationLoop(() => {
  timer.update();
  testScene.update(timer.getDelta());
  renderer.render(scene, camera);
});

window.addEventListener('resize', resize);
resize();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    timer.dispose();
    testPanel.dispose();
    testScene.dispose();
    renderer.dispose();
  });
}
