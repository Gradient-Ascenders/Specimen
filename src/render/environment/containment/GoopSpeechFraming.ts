import * as THREE from 'three';

export const GOOP_SPEECH_SIZE = Object.freeze({ width: 3.6, height: 1.8 });

/** Reuses the world balloon for a safe-area inset while its speaker is controlled.
 * Only the visual mesh moves; positional speech audio stays on Goop's root.
 */
export class GoopSpeechFraming {
  private readonly view = new THREE.Quaternion();
  private readonly inverse = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly rootScale = new THREE.Vector3();
  private controlled = false;
  private revealScale = 1;
  private readonly root: THREE.Object3D;
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(root: THREE.Object3D, mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>) {
    this.root = root; this.mesh = mesh;
    // Framing runs after the render list is built, including when the original
    // above-head anchor is outside the viewport in first-person/near-wall views.
    mesh.frustumCulled = false;
  }

  setPlayerControlled(controlled: boolean): void {
    this.controlled = controlled;
    this.mesh.material.depthTest = !controlled;
    this.mesh.renderOrder = controlled ? 1000 : 10;
  }

  setRevealScale(scale: number): void { this.revealScale = scale; }

  present(camera: THREE.Camera): void {
    camera.getWorldQuaternion(this.view);
    this.root.getWorldQuaternion(this.inverse).invert();
    this.mesh.quaternion.copy(this.inverse).multiply(this.view);
    this.mesh.position.set(0, 0, 0);
    this.mesh.scale.setScalar(this.revealScale);
    const perspective = camera as THREE.PerspectiveCamera;
    if (this.controlled && perspective.isPerspectiveCamera) {
      // Clear the right-hand roster as well as the viewport edges. Compact
      // square views use the upper-left; portrait views have more clear room
      // below the roster. Neither choice depends on the player's look angle.
      const depth = Math.max(3, perspective.near * 2);
      const halfHeight = depth * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) / perspective.zoom;
      const halfWidth = halfHeight * perspective.aspect;
      const scale = Math.min(halfWidth * 1.44 / GOOP_SPEECH_SIZE.width,
        halfHeight * .4 / GOOP_SPEECH_SIZE.height) * this.revealScale;
      const portrait = perspective.aspect < 1;
      const x = portrait ? 0 : perspective.aspect < 1.5 ? -.45 : -.06;
      this.position.set(halfWidth * x, halfHeight * (portrait ? -.42 : .64), -depth).applyMatrix4(camera.matrixWorld);
      this.root.worldToLocal(this.position);
      this.mesh.position.copy(this.position);
      this.root.getWorldScale(this.rootScale);
      this.mesh.scale.set(scale / this.rootScale.x, scale / this.rootScale.y, scale / this.rootScale.z);
    }
    this.mesh.updateMatrixWorld(true);
  }
}
