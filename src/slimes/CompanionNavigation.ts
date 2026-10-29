import type { CompanionId, CompanionWalk, CompanionLane, CompanionPoint } from './CompanionRegroup.ts';

const MAX_NODES = 192;
const MAX_EDGE_LENGTH = 3;

export interface CompanionEdge {
  readonly a: number;
  readonly b: number;
  readonly length: number;
  readonly lane: CompanionLane;
}

/** Small, immutable room graphs. Geometry is compiled once, never searched from render meshes. */
export class CompanionNavigation {
  readonly points: CompanionPoint[] = [];
  readonly edges: CompanionEdge[] = [];
  readonly neighbours: number[][] = [];
  readonly goal: number;
  private readonly slimes: readonly CompanionId[] | undefined;
  private readonly costs: Float64Array;
  private readonly scores: Float64Array;
  private readonly previous: Int16Array;
  private readonly closed: Uint8Array;
  private readonly candidateEdges = new Int16Array(4);
  private readonly candidateDistances = new Float64Array(4);
  private readonly candidateFractions = new Float64Array(4);
  joinX = 0;
  joinZ = 0;
  joinEdge = -1;
  distance = 0;

  constructor(walk: CompanionWalk) {
    this.slimes = walk.slimes;
    const addPoint = (p: CompanionPoint): number => {
      const existing = this.points.findIndex(q => Math.hypot(q[0] - p[0], q[2] - p[2]) < .001);
      if (existing >= 0) return existing;
      if (this.points.length >= MAX_NODES) throw new Error('Companion route exceeds its room graph budget.');
      this.neighbours.push([]);
      return this.points.push(p) - 1;
    };
    const addLane = (lane: CompanionLane): void => {
      for (let i = 1; i < lane.points.length; i++) {
        const a = lane.points[i - 1], b = lane.points[i];
        const divisions = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / MAX_EDGE_LENGTH));
        let from = addPoint(a);
        for (let j = 1; j <= divisions; j++) {
          const t = j / divisions;
          const to = addPoint([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
          if (from === to) continue;
          const p = this.points[from], q = this.points[to];
          const edge = this.edges.push({ a: from, b: to, length: Math.hypot(p[0] - q[0], p[2] - q[2]), lane }) - 1;
          this.neighbours[from].push(edge);
          this.neighbours[to].push(edge);
          from = to;
        }
      }
    };
    addLane(walk);
    for (const lane of walk.alternatives ?? []) addLane(lane);
    this.goal = addPoint(walk.points.at(-1)!);
    this.costs = new Float64Array(this.points.length);
    this.scores = new Float64Array(this.points.length);
    this.previous = new Int16Array(this.points.length);
    this.closed = new Uint8Array(this.points.length);
  }

  allowed(edge: CompanionEdge, id: CompanionId, radius: number): boolean {
    return (!this.slimes || this.slimes.includes(id)) && (!edge.lane.slimes || edge.lane.slimes.includes(id)) &&
      (edge.lane.widthMetres ?? 1.8) >= radius * 2 + .1;
  }

  /** A* with a bounded linear open set. Scratch buffers are reused between companions. */
  findPath(
    x: number, z: number, id: CompanionId, radius: number,
    blockedUntil: Float64Array, now: number, path: number[],
    canJoin: (x: number, z: number) => boolean,
  ): boolean {
    path.length = 0;
    this.candidateEdges.fill(-1);
    this.candidateDistances.fill(Infinity);
    // Consider several nearby lane joins: the closest one may lie behind a crate.
    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i];
      if (!this.allowed(edge, id, radius) || blockedUntil[i] > now) continue;
      const a = this.points[edge.a], b = this.points[edge.b];
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (edge.length * edge.length)));
      const distance = (a[0] + dx * t - x) ** 2 + (a[2] + dz * t - z) ** 2;
      for (let j = 0; j < this.candidateEdges.length; j++) {
        if (distance > this.candidateDistances[j]) continue;
        for (let k = this.candidateEdges.length - 1; k > j; k--) {
          this.candidateEdges[k] = this.candidateEdges[k - 1];
          this.candidateDistances[k] = this.candidateDistances[k - 1];
          this.candidateFractions[k] = this.candidateFractions[k - 1];
        }
        this.candidateEdges[j] = i;
        this.candidateDistances[j] = distance;
        this.candidateFractions[j] = t;
        break;
      }
    }
    for (let candidate = 0; candidate < this.candidateEdges.length; candidate++) {
      const edgeIndex = this.candidateEdges[candidate];
      if (edgeIndex < 0) break;
      const edge = this.edges[edgeIndex], a = this.points[edge.a], b = this.points[edge.b];
      const t = this.candidateFractions[candidate];
      this.joinX = a[0] + (b[0] - a[0]) * t;
      this.joinZ = a[2] + (b[2] - a[2]) * t;
      if (!canJoin(this.joinX, this.joinZ)) continue;
      this.costs.fill(Infinity); this.scores.fill(Infinity); this.previous.fill(-1); this.closed.fill(0);
      this.costs[edge.a] = edge.length * t;
      this.costs[edge.b] = edge.length * (1 - t);
      this.scores[edge.a] = this.costs[edge.a] + this.heuristic(edge.a);
      this.scores[edge.b] = this.costs[edge.b] + this.heuristic(edge.b);
      for (let visited = 0; visited < this.points.length; visited++) {
        let current = -1, best = Infinity;
        for (let i = 0; i < this.points.length; i++) {
          if (!this.closed[i] && this.scores[i] < best) { best = this.scores[i]; current = i; }
        }
        if (current < 0) break;
        if (current === this.goal) {
          this.distance = Math.sqrt(this.candidateDistances[candidate]) + this.costs[current];
          while (current >= 0) { path.push(current); current = this.previous[current]; }
          path.reverse(); this.joinEdge = edgeIndex;
          return true;
        }
        this.closed[current] = 1;
        for (const index of this.neighbours[current]) {
          const nextEdge = this.edges[index];
          if (!this.allowed(nextEdge, id, radius) || blockedUntil[index] > now) continue;
          const next = nextEdge.a === current ? nextEdge.b : nextEdge.a;
          const cost = this.costs[current] + nextEdge.length;
          if (cost >= this.costs[next]) continue;
          this.costs[next] = cost; this.previous[next] = current;
          this.scores[next] = cost + this.heuristic(next);
        }
      }
    }
    return false;
  }

  edgeBetween(a: number, b: number): number {
    return this.neighbours[a].find(index => {
      const edge = this.edges[index];
      return edge.a === b || edge.b === b;
    }) ?? -1;
  }

  private heuristic(index: number): number {
    const p = this.points[index], goal = this.points[this.goal];
    return Math.hypot(goal[0] - p[0], goal[2] - p[2]);
  }
}
