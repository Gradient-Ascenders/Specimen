import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

const STEP = 1 / 120;
const FLOOR = 0.003;
const GRAVITY = 9.81;
const STRIDE = 7;
const UP = new THREE.Vector3(0, 1, 0);
const TANGENTS = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];

interface Contact {
  readonly arm: THREE.Vector3;
  readonly bounce: number;
  normalImpulse: number;
  readonly friction: number[];
}

/** Floor-only rigid-body motion baked once, never integrated by playback frames. */
export class TrailerDebrisMotion {
  private readonly support: readonly THREE.Vector3[];
  private readonly poses: Float64Array;
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly nextRotation = new THREE.Quaternion();
  private readonly inverse = new THREE.Quaternion();
  private readonly inverseInertia = new THREE.Vector3();
  private readonly angular = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly torque = new THREE.Vector3();
  private readonly impulse = new THREE.Vector3();
  private readonly response = new THREE.Vector3();
  private readonly contactVelocity = new THREE.Vector3();

  constructor(vertices: THREE.Vector3[], origin: THREE.Vector3, velocity: THREE.Vector3,
    angular: THREE.Vector3, duration: number) {
    // Only hull vertices can touch a plane. Keep the real silhouette, not a
    // bounding sphere/box that would leave thin hardware visibly floating.
    const hull = new ConvexHull().setFromPoints(vertices);
    const support = new Set<THREE.Vector3>();
    for (const face of hull.faces) {
      for (let i = 0; i < 3; i++) support.add(face.getEdge(i).head().point);
    }
    this.support = [...support];
    const size = new THREE.Box3().setFromPoints(vertices).getSize(new THREE.Vector3());
    this.inverseInertia.set(
      12 / Math.max(0.001, size.y ** 2 + size.z ** 2),
      12 / Math.max(0.001, size.x ** 2 + size.z ** 2),
      12 / Math.max(0.001, size.x ** 2 + size.y ** 2),
    );
    this.position.copy(origin);
    this.velocity.copy(velocity);
    this.angular.copy(angular);
    this.poses = new Float64Array((Math.ceil(duration / STEP) + 1) * STRIDE);
    this.bake();
  }

  apply(seconds: number, root: THREE.Object3D): void {
    const frame = THREE.MathUtils.clamp(seconds / STEP, 0, this.poses.length / STRIDE - 1);
    const before = Math.floor(frame) * STRIDE;
    const after = Math.min(before + STRIDE, this.poses.length - STRIDE);
    const fraction = frame % 1;
    this.position.fromArray(this.poses, before);
    this.point.fromArray(this.poses, after);
    root.position.lerpVectors(this.position, this.point, fraction);
    this.rotation.fromArray(this.poses, before + 3);
    this.nextRotation.fromArray(this.poses, after + 3);
    root.quaternion.slerpQuaternions(this.rotation, this.nextRotation, fraction);
    // Rotation interpolation must not let a corner cut below the floor.
    let bottom = Infinity;
    for (const vertex of this.support) bottom = Math.min(bottom, this.point.copy(vertex).applyQuaternion(root.quaternion).y);
    root.position.y = Math.max(root.position.y, FLOOR - bottom);
  }

  private bake(): void {
    let quietSeconds = 0, asleep = false;
    for (let offset = 0; offset < this.poses.length; offset += STRIDE) {
      if (offset > 0 && !asleep) {
        this.velocity.y -= GRAVITY * STEP;
        this.velocity.multiplyScalar(Math.exp(-0.035 * STEP));
        this.angular.multiplyScalar(Math.exp(-0.08 * STEP));
        this.position.addScaledVector(this.velocity, STEP);
        const speed = this.angular.length();
        if (speed > 1e-8) {
          this.nextRotation.setFromAxisAngle(this.point.copy(this.angular).multiplyScalar(1 / speed), speed * STEP);
          this.rotation.premultiply(this.nextRotation).normalize();
        }
        this.inverse.copy(this.rotation).invert();
        const arms = this.support.map(vertex => vertex.clone().applyQuaternion(this.rotation));
        const minimum = Math.min(...arms.map(arm => arm.y));
        const touching = this.position.y + minimum <= FLOOR + 0.0005;
        if (touching) {
          this.position.y = Math.max(this.position.y, FLOOR - minimum);
          const contacts: Contact[] = arms.filter(arm => arm.y < minimum + 0.003).map(arm => {
            const incoming = this.contactVelocity.crossVectors(this.angular, arm).add(this.velocity).y;
            return { arm, bounce: incoming < -1 ? -incoming * 0.18 : 0, normalImpulse: 0, friction: [0, 0] };
          });
          // Accumulated impulses share the load across a face. Restitution is
          // applied only to the first impact, not on every solver iteration.
          for (let iteration = 0; iteration < 8; iteration++) for (const contact of contacts) {
            const incoming = this.contactVelocity.crossVectors(this.angular, contact.arm).add(this.velocity).y;
            const previous = contact.normalImpulse;
            contact.normalImpulse = Math.max(0, previous + (contact.bounce - incoming) / this.effectiveMass(contact.arm, UP));
            this.applyImpulse(contact.arm, this.impulse.set(0, contact.normalImpulse - previous, 0));
            for (let axis = 0; axis < TANGENTS.length; axis++) {
              const tangent = TANGENTS[axis]!;
              const slip = this.contactVelocity.crossVectors(this.angular, contact.arm).add(this.velocity).dot(tangent);
              const old = contact.friction[axis]!;
              const limit = 0.62 * contact.normalImpulse;
              const other = contact.friction[1 - axis]!;
              const available = Math.sqrt(Math.max(0, limit * limit - other * other));
              contact.friction[axis] = THREE.MathUtils.clamp(old - slip / this.effectiveMass(contact.arm, tangent), -available, available);
              this.applyImpulse(contact.arm, this.impulse.copy(tangent).multiplyScalar(contact.friction[axis]! - old));
            }
          }
          // Rolling resistance dissipates the last small wobble after impact.
          this.angular.multiplyScalar(Math.exp(-2.4 * STEP));
          const quiet = this.velocity.lengthSq() < 0.0036 && this.angular.lengthSq() < 0.0144;
          quietSeconds = quiet && supportedByFace(contacts.map(contact => contact.arm)) ? quietSeconds + STEP : 0;
          asleep = quietSeconds >= 0.24;
        } else quietSeconds = 0;
      }
      this.position.toArray(this.poses, offset);
      this.rotation.toArray(this.poses, offset + 3);
    }
  }

  private effectiveMass(arm: THREE.Vector3, axis: THREE.Vector3): number {
    this.torque.crossVectors(arm, axis);
    this.inertiaResponse(this.torque, this.response);
    return 1 + this.torque.dot(this.response);
  }

  private applyImpulse(arm: THREE.Vector3, impulse: THREE.Vector3): void {
    this.velocity.add(impulse);
    this.torque.crossVectors(arm, impulse);
    this.inertiaResponse(this.torque, this.response);
    this.angular.add(this.response);
  }

  private inertiaResponse(torque: THREE.Vector3, target: THREE.Vector3): void {
    target.copy(torque).applyQuaternion(this.inverse).multiply(this.inverseInertia).applyQuaternion(this.rotation);
  }
}

/** A corner/edge contact cannot balance the centre of mass and go to sleep. */
function supportedByFace(contacts: readonly THREE.Vector3[]): boolean {
  if (contacts.length < 3) return false;
  const points = [...contacts].sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const half = (input: readonly THREE.Vector3[]) => {
    const chain: THREE.Vector3[] = [];
    for (const point of input) {
      while (chain.length > 1 && cross(chain[chain.length - 2]!, chain[chain.length - 1]!, point) <= 0) chain.pop();
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  const outline = [...half(points), ...half([...points].reverse())];
  if (outline.length < 3) return false;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!, b = outline[(i + 1) % outline.length]!;
    if ((b.x - a.x) * -a.z - (b.z - a.z) * -a.x < -1e-6) return false;
  }
  return true;
}
