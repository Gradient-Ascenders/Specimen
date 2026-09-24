import * as THREE from 'three';

const REFLECTION_MAP_SIZE = 128;
const REFLECTION_BLUR_RADIANS = 0.055;

export interface BobReflectionEnvironmentDiagnostics {
  readonly textureName: string;
  readonly mapSize: number;
  readonly sourcePanelCount: number;
  readonly disposed: boolean;
}

interface LabReflectionScene extends THREE.Scene {
  userData: {
    sourcePanelCount: number;
  };
}

function hdrColour(
  colour: THREE.ColorRepresentation,
  intensity: number,
): THREE.Color {
  return new THREE.Color(colour).multiplyScalar(intensity);
}

/**
 * Small, synthetic laboratory used only to generate Bob's reflection probe.
 * It is never mounted into gameplay and contributes no lights or draw calls.
 */
export function createBobLabReflectionScene(): LabReflectionScene {
  const scene = new THREE.Scene() as LabReflectionScene;
  scene.name = 'bob-laboratory-reflection-source';
  scene.background = new THREE.Color(0x020608);

  const enclosure = new THREE.Mesh(
    new THREE.BoxGeometry(16, 12, 16),
    new THREE.MeshBasicMaterial({
      name: 'bob-reflection-dark-laboratory-enclosure',
      color: 0x071116,
      side: THREE.BackSide,
      toneMapped: false,
    }),
  );
  enclosure.name = 'bob-reflection-dark-enclosure';
  scene.add(enclosure);

  const panelGeometry = new THREE.PlaneGeometry(1, 1);
  const panels: THREE.Mesh[] = [];
  const addPanel = (
    name: string,
    colour: THREE.ColorRepresentation,
    intensity: number,
    position: readonly [number, number, number],
    scale: readonly [number, number],
    rotation: readonly [number, number, number],
  ): void => {
    const material = new THREE.MeshBasicMaterial({
      name: `${name}-material`,
      color: hdrColour(colour, intensity),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const panel = new THREE.Mesh(panelGeometry, material);
    panel.name = name;
    panel.position.set(...position);
    panel.scale.set(scale[0], scale[1], 1);
    panel.rotation.set(...rotation);
    panels.push(panel);
    scene.add(panel);
  };

  // One broad ceiling bank gives the body and crown a single soft read.
  addPanel(
    'bob-reflection-broad-overhead-fluorescent',
    0xd7f2ff,
    6.2,
    [-1.8, 5.4, -1.3],
    [5.8, 1.25],
    [Math.PI / 2, 0, 0],
  );
  // Narrow frontal strips remain legible in the smaller, glossier eye lenses.
  addPanel(
    'bob-reflection-frontal-fluorescent-a',
    0xf2fbff,
    8.5,
    [-2.1, 1.65, -6.6],
    [0.55, 3.1],
    [0, 0, 0],
  );
  addPanel(
    'bob-reflection-frontal-fluorescent-b',
    0xd9f4ff,
    5.6,
    [2.5, 2.15, -6.8],
    [0.34, 1.9],
    [0, 0, 0],
  );
  // Low-energy cyan fill keeps the dark side from collapsing to uniform black.
  addPanel(
    'bob-reflection-cool-side-fill',
    0x62b7c8,
    1.15,
    [7.2, 0.4, 1.2],
    [2.4, 4.8],
    [0, Math.PI / 2, 0],
  );

  scene.userData.sourcePanelCount = panels.length;
  return scene;
}

function disposeReflectionSource(scene: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  scene.clear();
}

/** Owns the one Bob-only PMREM target for a loaded Level 1 runtime. */
export class BobReflectionEnvironment {
  readonly texture: THREE.Texture;

  private readonly renderTarget: THREE.WebGLRenderTarget;
  private readonly sourcePanelCount: number;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer) {
    const source = createBobLabReflectionScene();
    const generator = new THREE.PMREMGenerator(renderer);
    try {
      this.renderTarget = generator.fromScene(
        source,
        REFLECTION_BLUR_RADIANS,
        0.1,
        30,
        { size: REFLECTION_MAP_SIZE },
      );
    } finally {
      generator.dispose();
      disposeReflectionSource(source);
    }
    this.texture = this.renderTarget.texture;
    this.texture.name = 'bob-laboratory-pmrem';
    this.sourcePanelCount = source.userData.sourcePanelCount;
  }

  get diagnostics(): BobReflectionEnvironmentDiagnostics {
    return {
      textureName: this.texture.name,
      mapSize: REFLECTION_MAP_SIZE,
      sourcePanelCount: this.sourcePanelCount,
      disposed: this.disposed,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderTarget.dispose();
  }
}
