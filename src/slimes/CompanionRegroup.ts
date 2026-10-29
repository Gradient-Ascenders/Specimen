import * as THREE from 'three';

import { CollisionHit, CollisionLayer, type CollisionWorld } from '../physics/CollisionWorld.ts';
import type { JumpInputState, KinematicBody } from '../physics/KinematicBody.ts';
import type { SlimePassiveInteraction, CompanionPhase, CompanionWaitReason } from './SlimeHUDState.ts';
import { CompanionNavigation } from './CompanionNavigation.ts';

export type CompanionId = 'bob' | 'goop' | 'volt';
export type CompanionPoint = readonly [number, number, number];
const IDS = ['bob', 'goop', 'volt'] as const;
const DECISION_INTERVAL = .25;
const ACTIVATION_DELAY = .75;
const STALL_SECONDS = .9;
const graphCache = new WeakMap<CompanionWalk, CompanionNavigation>();

export interface CompanionLane {
  readonly points: readonly CompanionPoint[];
  readonly widthMetres?: number;
  readonly slimes?: readonly CompanionId[];
}

/** An authored safe corridor graph in the supplied room root's coordinates. */
export interface CompanionWalk extends CompanionLane {
  readonly id?: string;
  readonly bounds: readonly [CompanionPoint, CompanionPoint];
  readonly alternatives?: readonly CompanionLane[];
  readonly stepUps?: readonly CompanionPoint[];
  /** A released passage must finish at its safe landing even when the remaining gap is small. */
  readonly finishPassage?: boolean;
}

export interface CompanionContext {
  /** Level owners invalidate cached decisions when a door, bridge or hazard state changes. */
  readonly revision?: number;
  readonly holdReason?: CompanionWaitReason;
  readonly waitReason?: CompanionWaitReason;
}
const DEFAULT_CONTEXT: CompanionContext = {};

interface Agent {
  phase: CompanionPhase;
  reason: CompanionWaitReason | undefined;
  publishedPhase: CompanionPhase;
  publishedReason: CompanionWaitReason | undefined;
  touched: boolean;
  walk: CompanionWalk | undefined;
  graph: CompanionNavigation | undefined;
  revision: number;
  eligibleSeconds: number;
  decisionAt: number;
  retrySeconds: number;
  committed: boolean;
  path: number[];
  pathIndex: number;
  joinX: number;
  joinZ: number;
  joining: boolean;
  edge: number;
  blockedUntil: Float64Array;
  progressX: number;
  progressZ: number;
  stalledSeconds: number;
  nearby: boolean;
}

function agent(): Agent {
  return { phase: 'idle', reason: undefined, publishedPhase: 'idle', publishedReason: undefined,
    touched: false, walk: undefined, graph: undefined, revision: 0, eligibleSeconds: 0, decisionAt: 0,
    retrySeconds: .5, committed: false, path: [], pathIndex: 0, joinX: 0, joinZ: 0, joining: false,
    edge: -1, blockedUntil: new Float64Array(0), progressX: 0, progressZ: 0, stalledSeconds: 0, nearby: false };
}

const REASONS: Record<CompanionWaitReason, string> = {
  door: 'Waiting for door', obstacle: 'Waiting for a clear path', floor: 'Waiting for safe ground',
  hazard: 'Waiting for hazards to clear', route: 'Waiting for a safe route', stalled: 'Path blocked · needs you',
  switch: 'Holding switch', power: 'Powering a connection', mounted: 'Staying on drone', combat: 'Waiting for combat to clear',
  manual: 'Traversal needs you',
  platforms: "Lower Bob's platforms",
};

/** Plans on a budget; normal body input and immediate local safety remain authoritative. */
export class CompanionRegroup {
  readonly movement = { bob: new THREE.Vector3(), goop: new THREE.Vector3(), volt: new THREE.Vector3() };
  readonly jump: Record<CompanionId, JumpInputState> = {
    bob: { pressed: false, held: false, released: false }, goop: { pressed: false, held: false, released: false },
    volt: { pressed: false, held: false, released: false },
  };
  readonly locomotion = {
    bob: { speedMultiplier: 1, accelerationMultiplier: 1 }, goop: { speedMultiplier: 1, accelerationMultiplier: 1 },
    volt: { speedMultiplier: 1, accelerationMultiplier: 1 },
  };
  readonly diagnostics = { plans: 0, safetyQueries: 0, stalls: 0, plansThisFrame: 0, maximumPlansPerFrame: 0 };
  private readonly agents = { bob: agent(), goop: agent(), volt: agent() };
  private interactions: readonly SlimePassiveInteraction[] = [];
  private time = 0;
  private dt = 1 / 60;
  private frameBounded = false;
  private readonly local = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();
  private readonly displacement = new THREE.Vector3();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly hit = new CollisionHit();
  private joinBody!: KinematicBody;
  private joinWorld!: CollisionWorld;
  private joinRoot: THREE.Object3D | undefined;
  private joinId: CompanionId = 'bob';
  private readonly canJoin = (x: number, z: number): boolean => {
    this.target.set(x, this.local.y, z);
    if (this.joinRoot) this.joinRoot.localToWorld(this.target);
    return this.clearConnector(this.joinId, this.joinBody, this.target, this.joinWorld);
  };

  get passiveInteractions(): readonly SlimePassiveInteraction[] { return this.interactions; }

  /** Called once by each runtime render. Several fixed steps still share one search budget. */
  beginFrame(): void { this.frameBounded = true; this.diagnostics.plansThisFrame = 0; }

  beginStep(deltaSeconds = 1 / 60): void {
    this.dt = Math.max(0, Math.min(deltaSeconds, .1));
    this.time += this.dt;
    if (!this.frameBounded) this.diagnostics.plansThisFrame = 0;
    for (const id of IDS) {
      this.movement[id].set(0, 0, 0);
      this.locomotion[id].speedMultiplier = 1;
      this.jump[id].pressed = this.jump[id].released = this.jump[id].held = false;
      this.agents[id].touched = false;
    }
  }

  committedWalk(id: CompanionId): string | undefined {
    const a = this.agents[id];
    return a.committed ? a.walk?.id : undefined;
  }

  hold(id: CompanionId, reason: CompanionWaitReason): void {
    const a = this.agents[id];
    this.clear(a); a.touched = true; a.phase = 'holding'; a.reason = reason;
  }

  /** HUD snapshots are allocated only when an actual state/reason changes. */
  commit(): boolean {
    let changed = false;
    for (const id of IDS) {
      const a = this.agents[id];
      if (!a.touched) this.clear(a);
      if (a.phase !== a.publishedPhase || a.reason !== a.publishedReason) changed = true;
      a.publishedPhase = a.phase; a.publishedReason = a.reason;
    }
    if (!changed) return false;
    const interactions: SlimePassiveInteraction[] = [];
    for (const id of IDS) {
      const a = this.agents[id];
      if (a.phase === 'idle') continue;
      interactions.push({ slimeId: id, kind: 'companion', state: a.phase, reason: a.reason,
        label: a.phase === 'catching-up' ? 'Catching up' : a.phase === 'arrived' ? 'Together' : REASONS[a.reason ?? 'route'] });
    }
    this.interactions = interactions;
    return true;
  }

  reset(): boolean { this.beginStep(0); return this.commit(); }

  steer(
    id: CompanionId, body: KinematicBody, walk: CompanionWalk | undefined,
    world: CollisionWorld, root?: THREE.Object3D, context: CompanionContext = DEFAULT_CONTEXT,
  ): THREE.Vector3 {
    const a = this.agents[id], movement = this.movement[id];
    a.touched = true; movement.set(0, 0, 0);
    if (context.holdReason) {
      this.clear(a); a.touched = true; a.phase = 'holding'; a.reason = context.holdReason;
      return movement;
    }
    if (!walk && context.waitReason) {
      this.clear(a); a.touched = true; a.phase = 'waiting'; a.reason = context.waitReason;
      return movement;
    }
    if (!walk || body.usingSurfaceGravity || body.chargingJump) { this.clear(a); return movement; }
    this.local.copy(body.position);
    if (root) root.worldToLocal(this.local);
    const [min, max] = walk.bounds;
    if (this.local.x < min[0] || this.local.x > max[0] || this.local.z < min[2] || this.local.z > max[2] ||
      this.local.y < min[1] || this.local.y > max[1] + (a.committed && !body.grounded ? 1.5 : 0)) {
      this.clear(a); return movement;
    }
    if (a.walk !== walk) {
      this.clear(a); a.touched = true; a.walk = walk;
      a.progressX = this.local.x; a.progressZ = this.local.z;
      a.decisionAt = this.time + IDS.indexOf(id) * .04;
    }
    if (a.revision !== (context.revision ?? 0)) {
      a.revision = context.revision ?? 0;
      a.blockedUntil.fill(0); a.path.length = 0; a.decisionAt = this.time; a.retrySeconds = .5; a.nearby = false;
    }
    const end = walk.points.at(-1)!;
    const endDistance = Math.hypot(end[0] - this.local.x, end[2] - this.local.z);
    if ((a.phase === 'arrived' && endDistance < (walk.finishPassage ? 3 : 8)) ||
      endDistance < Math.max(walk.finishPassage ? .6 : 3, body.groundStoppingDistanceMetres + .1)) {
      a.phase = 'arrived'; a.reason = undefined; a.committed = true; a.stalledSeconds = 0;
      return movement;
    }
    if (a.phase === 'arrived') {
      a.phase = 'idle'; a.committed = false; a.eligibleSeconds = 0; a.path.length = 0;
    }
    // An approved tap jump keeps its status but supplies no new airborne controls.
    if (!body.grounded) return movement;
    a.eligibleSeconds += this.dt;
    if (!a.committed && a.eligibleSeconds < ACTIVATION_DELAY) return movement;
    if (a.nearby && Math.hypot(this.local.x - a.progressX, this.local.z - a.progressZ) < .5) return movement;
    a.nearby = false;

    if (a.path.length === 0 && this.time >= a.decisionAt && this.diagnostics.plansThisFrame < 1) {
      a.graph ??= this.graph(walk);
      if (a.blockedUntil.length !== a.graph.edges.length) a.blockedUntil = new Float64Array(a.graph.edges.length);
      this.joinId = id; this.joinBody = body; this.joinWorld = world; this.joinRoot = root;
      this.diagnostics.plans++; this.diagnostics.plansThisFrame++;
      this.diagnostics.maximumPlansPerFrame = Math.max(this.diagnostics.maximumPlansPerFrame, this.diagnostics.plansThisFrame);
      const found = a.graph.findPath(this.local.x, this.local.z, id, body.radiusMetres, a.blockedUntil,
        this.time, a.path, this.canJoin);
      a.decisionAt = this.time + DECISION_INTERVAL;
      if (!found) { this.wait(a, a.reason ?? 'route'); return movement; }
      if (!a.committed && !walk.finishPassage && a.graph.distance < 8) {
        a.path.length = 0; a.nearby = true; a.progressX = this.local.x; a.progressZ = this.local.z;
        a.decisionAt = this.time + DECISION_INTERVAL; return movement;
      }
      a.joinX = a.graph.joinX; a.joinZ = a.graph.joinZ; a.edge = a.graph.joinEdge;
      a.pathIndex = 0; a.joining = true; a.committed = true;
    }
    if (!a.path.length || !a.graph) return movement;
    const graph = a.graph;
    // Carrier motion or an external displacement can leave the cached corridor.
    if (a.edge >= 0 && !a.joining && this.time >= a.decisionAt) {
      const edge = graph.edges[a.edge], p = graph.points[edge.a], q = graph.points[edge.b];
      const dx = q[0] - p[0], dz = q[2] - p[2];
      const t = THREE.MathUtils.clamp(((this.local.x - p[0]) * dx + (this.local.z - p[2]) * dz) / (edge.length ** 2), 0, 1);
      if (Math.hypot(this.local.x - p[0] - dx * t, this.local.z - p[2] - dz * t) > (edge.lane.widthMetres ?? 1.8)) {
        a.path.length = 0; a.decisionAt = this.time; return movement;
      }
      a.decisionAt = this.time + DECISION_INTERVAL;
    }
    if (a.joining && Math.hypot(a.joinX - this.local.x, a.joinZ - this.local.z) < .2) a.joining = false;
    if (!a.joining) {
      while (a.pathIndex < a.path.length - 1) {
        const point = graph.points[a.path[a.pathIndex]];
        const width = a.edge >= 0 ? graph.edges[a.edge].lane.widthMetres ?? 1.8 : 1.8;
        const clearance = Math.max(.08, Math.min(.3, width / 2 - body.radiusMetres - .05));
        if (Math.hypot(point[0] - this.local.x, point[2] - this.local.z) > clearance) break;
        a.edge = graph.edgeBetween(a.path[a.pathIndex], a.path[a.pathIndex + 1]);
        a.pathIndex++;
      }
    }
    const point = graph.points[a.path[a.pathIndex]];
    this.target.set(a.joining ? a.joinX : point[0], this.local.y, a.joining ? a.joinZ : point[2]);
    if (root) root.localToWorld(this.target);
    movement.copy(this.target).sub(body.position).setY(0);
    const distance = movement.length();
    if (distance < .03) return movement.set(0, 0, 0);
    movement.divideScalar(distance);

    const reason = this.safety(id, body, movement, Math.min(distance, Math.max(.9, body.groundStoppingDistanceMetres + .2)), world, walk);
    if (reason) {
      movement.set(0, 0, 0); this.jump[id].pressed = this.jump[id].released = false;
      if (a.edge >= 0) a.blockedUntil[a.edge] = this.time + 1.5;
      this.wait(a, reason);
      return movement;
    }
    if (Math.hypot(this.local.x - a.progressX, this.local.z - a.progressZ) >= .12) {
      a.progressX = this.local.x; a.progressZ = this.local.z; a.stalledSeconds = 0; a.retrySeconds = .5;
    } else a.stalledSeconds += this.dt;
    if (a.stalledSeconds >= STALL_SECONDS) {
      this.diagnostics.stalls++;
      if (a.edge >= 0) a.blockedUntil[a.edge] = this.time + 2;
      movement.set(0, 0, 0); this.wait(a, 'stalled');
      return movement;
    }
    a.phase = 'catching-up'; a.reason = undefined;
    // Ease into real corners; collinear subdivision nodes retain full speed.
    if (!a.joining && a.pathIndex < a.path.length - 1 && a.edge >= 0) {
      const next = graph.points[a.path[a.pathIndex + 1]], edge = graph.edges[a.edge];
      const from = graph.points[edge.a === a.path[a.pathIndex] ? edge.b : edge.a];
      const ax = point[0] - from[0], az = point[2] - from[2], bx = next[0] - point[0], bz = next[2] - point[2];
      const cosine = (ax * bx + az * bz) / Math.max(.001, Math.hypot(ax, az) * Math.hypot(bx, bz));
      if (cosine < .9 && distance < 1.5) this.locomotion[id].speedMultiplier = .5 + .5 * distance / 1.5;
    }
    return movement;
  }

  private graph(walk: CompanionWalk): CompanionNavigation {
    let graph = graphCache.get(walk);
    if (!graph) { graph = new CompanionNavigation(walk); graphCache.set(walk, graph); }
    return graph;
  }

  private wait(a: Agent, reason: CompanionWaitReason): void {
    a.phase = 'waiting'; a.reason = reason; a.path.length = 0; a.stalledSeconds = 0;
    a.decisionAt = this.time + a.retrySeconds;
    a.retrySeconds = Math.min(2, a.retrySeconds * 2);
  }

  private clear(a: Agent): void {
    a.phase = 'idle'; a.reason = undefined; a.walk = undefined; a.graph = undefined;
    a.path.length = 0; a.eligibleSeconds = 0; a.committed = false; a.stalledSeconds = 0; a.retrySeconds = .5;
    a.blockedUntil.fill(0); a.revision = 0; a.nearby = false;
  }

  private acid(id: CompanionId): boolean {
    return id !== 'goop' && (this.hit.object?.userData.textureRole === 'acid-floor' || this.hit.object?.userData.locomotionMedium === 'acid');
  }

  /** A new lane join validates the whole connector, not just its distant endpoint. */
  private clearConnector(id: CompanionId, body: KinematicBody, target: THREE.Vector3, world: CollisionWorld): boolean {
    this.displacement.copy(target).sub(body.position).setY(0);
    const distance = this.displacement.length();
    if (distance < .1) return true;
    if (distance > 32) return false;
    this.diagnostics.safetyQueries++;
    this.origin.copy(body.position);
    if (world.sweepSphere(this.origin, this.displacement, body.radiusMetres, this.hit, CollisionLayer.Movement,
      body.supportCollider ?? undefined) && this.hit.normal.y < .1) return false;
    const samples = Math.ceil(distance / .6);
    for (let i = 1; i <= samples; i++) {
      this.probe.copy(this.displacement).multiplyScalar(i / samples).add(body.position); this.probe.y += .3;
      this.diagnostics.safetyQueries++;
      if (!world.raycast(this.probe, this.down, body.radiusMetres + .9, this.hit, CollisionLayer.Movement) ||
        this.hit.normal.y < .7 || this.acid(id)) return false;
    }
    return true;
  }

  private safety(
    id: CompanionId, body: KinematicBody, movement: THREE.Vector3, lookAhead: number,
    world: CollisionWorld, walk: CompanionWalk,
  ): CompanionWaitReason | undefined {
    this.origin.copy(body.position); this.probe.copy(movement).multiplyScalar(lookAhead);
    this.diagnostics.safetyQueries++;
    let obstructed = world.sweepSphere(this.origin, this.probe, body.radiusMetres, this.hit,
      CollisionLayer.Movement, body.supportCollider ?? undefined) && this.hit.normal.y < .1;
    const door = obstructed && /door|shutter|gate/i.test(this.hit.object?.name ?? '');
    const step = walk.stepUps?.some(point => Math.hypot(point[0] - this.local.x, point[2] - this.local.z) < 1.7);
    if (obstructed && step && !door) {
      const beyond = this.hit.distance + body.radiusMetres + .15;
      this.probe.copy(movement).multiplyScalar(beyond).add(this.origin); this.probe.y += .6;
      this.diagnostics.safetyQueries++;
      const landing = world.raycast(this.probe, this.down, body.radiusMetres + 1.2, this.hit, CollisionLayer.Movement);
      const rise = this.hit.point.y - (body.position.y - body.radiusMetres - .01);
      const safeLanding = landing && this.hit.normal.y > .7 && rise >= -.08 && rise <= .4 && !this.acid(id);
      this.origin.y += .45; this.probe.copy(movement).multiplyScalar(lookAhead);
      this.diagnostics.safetyQueries++;
      const clearAbove = !world.sweepSphere(this.origin, this.probe, body.radiusMetres, this.hit,
        CollisionLayer.Movement, body.supportCollider ?? undefined);
      this.origin.copy(body.position);
      if (safeLanding && clearAbove) { this.jump[id].pressed = this.jump[id].released = true; obstructed = false; }
    }
    if (obstructed) return door ? 'door' : 'obstacle';
    const samples = Math.max(1, Math.ceil(lookAhead / .6));
    for (let i = 1; i <= samples; i++) {
      this.probe.copy(movement).multiplyScalar(lookAhead * i / samples).add(this.origin); this.probe.y += .25;
      this.diagnostics.safetyQueries++;
      if (!world.raycast(this.probe, this.down, body.radiusMetres + .85, this.hit, CollisionLayer.Movement) || this.hit.normal.y < .7) return 'floor';
      if (this.acid(id)) return 'hazard';
    }
    return undefined;
  }
}
