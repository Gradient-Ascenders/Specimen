import * as THREE from 'three';

const EPSILON = 1e-9;

/** Exact sphere/box contact for authored ramp joins. Reuses scratch storage. */
export class SphereBoxSweep {
  private readonly times = new Float64Array(8);

  sweep(bounds: THREE.Box3, start: THREE.Vector3, delta: THREE.Vector3, radius: number,
    normal: THREE.Vector3): number | undefined {
    bounds.clampPoint(start, normal);
    normal.subVectors(start, normal);
    const distanceSquared = normal.lengthSq();
    if (distanceSquared <= radius * radius + EPSILON) {
      if (distanceSquared < EPSILON) {
        // Recover an initial overlap by selecting the closest physical face.
        let nearest = Infinity;
        for (let axis = 0; axis < 3; axis++) for (let side = -1; side <= 1; side += 2) {
          const distance = side < 0 ? start.getComponent(axis) - bounds.min.getComponent(axis)
            : bounds.max.getComponent(axis) - start.getComponent(axis);
          if (distance < nearest) { nearest = distance; normal.set(0, 0, 0).setComponent(axis, side); }
        }
      } else normal.normalize();
      return delta.dot(normal) < -EPSILON ? 0 : undefined;
    }

    // Between crossings of box face planes, the closest feature is constant.
    // Its squared distance is quadratic: solve each interval in time order.
    let count = 2;
    this.times[0] = 0; this.times[1] = 1;
    for (let axis = 0; axis < 3; axis++) {
      const speed = delta.getComponent(axis);
      if (Math.abs(speed) < EPSILON) continue;
      for (let side = 0; side < 2; side++) {
        const edge = (side === 0 ? bounds.min : bounds.max).getComponent(axis);
        const t = (edge - start.getComponent(axis)) / speed;
        if (t > 0 && t < 1) this.times[count++] = t;
      }
    }
    for (let i = 1; i < count; i++) {
      const value = this.times[i]; let j = i;
      while (j > 0 && this.times[j - 1] > value) { this.times[j] = this.times[j - 1]; j--; }
      this.times[j] = value;
    }
    for (let i = 0; i < count - 1; i++) {
      const low = this.times[i], high = this.times[i + 1], middle = (low + high) / 2;
      let a = 0, b = 0, c = -radius * radius;
      for (let axis = 0; axis < 3; axis++) {
        const p = start.getComponent(axis), v = delta.getComponent(axis), at = p + v * middle;
        const min = bounds.min.getComponent(axis), max = bounds.max.getComponent(axis);
        if (at >= min && at <= max) continue;
        const offset = p - (at < min ? min : max);
        a += v * v; b += 2 * offset * v; c += offset * offset;
      }
      const discriminant = b * b - 4 * a * c;
      if (a < EPSILON || discriminant < 0) continue;
      const t = (-b - Math.sqrt(discriminant)) / (2 * a);
      if (t < low - EPSILON || t > high + EPSILON || 2 * a * t + b >= -EPSILON) continue;
      normal.copy(delta).multiplyScalar(t).add(start);
      normal.set(
        normal.x - THREE.MathUtils.clamp(normal.x, bounds.min.x, bounds.max.x),
        normal.y - THREE.MathUtils.clamp(normal.y, bounds.min.y, bounds.max.y),
        normal.z - THREE.MathUtils.clamp(normal.z, bounds.min.z, bounds.max.z));
      normal.normalize();
      return THREE.MathUtils.clamp(t, 0, 1);
    }
    return undefined;
  }
}
