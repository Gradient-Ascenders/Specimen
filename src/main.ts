import * as THREE from 'three';

import './style.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app host element.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07110f);
scene.fog = new THREE.Fog(0x07110f, 5, 11);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0.15, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-hidden', 'true');

const geometry = new THREE.IcosahedronGeometry(1.15, 4);
const material = new THREE.MeshStandardMaterial({
  color: 0x7de2a1,
  emissive: 0x123d2b,
  emissiveIntensity: 0.65,
  metalness: 0.05,
  roughness: 0.3,
});
const specimen = new THREE.Mesh(geometry, material);
scene.add(specimen);

const keyLight = new THREE.DirectionalLight(0xc8ffe0, 4);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);

const rimLight = new THREE.PointLight(0x6f8cff, 18, 8);
rimLight.position.set(-3, -1, 2);
scene.add(rimLight);

const status = document.createElement('section');
status.className = 'status';
status.innerHTML = `
  <p class="eyebrow">Research subject 03</p>
  <h1>Specimen</h1>
  <p>Containment environment online.</p>
`;

app.replaceChildren(renderer.domElement, status);

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
  const elapsed = timer.getElapsed();
  specimen.rotation.x = elapsed * 0.12;
  specimen.rotation.y = elapsed * 0.2;
  specimen.position.y = Math.sin(elapsed * 0.8) * 0.08;
  renderer.render(scene, camera);
});

window.addEventListener('resize', resize);
resize();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    timer.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  });
}
