import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PERFORMANCE_RECORDER_CONFIG,
  HitchDetector,
  PerformanceFlightRecorder,
  type ShaderProgramGrowthEvent,
} from '../src/debug/PerformanceFlightRecorder.ts';
import type { LoopStats } from '../src/core/Loop.ts';

test('flight recorder detects absolute missed-vsync frame times', () => {
  const detector = new HitchDetector(DEFAULT_PERFORMANCE_RECORDER_CONFIG);
  for (let frame = 0; frame < 120; frame += 1) detector.sample(16.67);

  const sample = detector.sample(33.3);

  assert.equal(sample.detected, true);
  assert.equal(sample.absoluteTrigger, true);
  assert.ok(sample.baselineMs > 16 && sample.baselineMs < 17);
});

test('flight recorder detects a significant increase below its absolute threshold', () => {
  const detector = new HitchDetector(DEFAULT_PERFORMANCE_RECORDER_CONFIG);
  for (let frame = 0; frame < 120; frame += 1) detector.sample(13.5);

  const sample = detector.sample(24);

  assert.equal(sample.absoluteTrigger, false);
  assert.equal(sample.relativeTrigger, true);
  assert.equal(sample.detected, true);
});

test('small baseline jitter does not produce a hitch', () => {
  const detector = new HitchDetector(DEFAULT_PERFORMANCE_RECORDER_CONFIG);
  for (let frame = 0; frame < 120; frame += 1) detector.sample(16.67);

  assert.equal(detector.sample(20).detected, false);
  assert.equal(detector.sample(22).detected, false);
});

class FakeControl extends EventTarget {
  textContent = '';
  innerHTML = '';
  disabled = false;
}

class FakeRecorderElement extends EventTarget {
  className = '';
  innerHTML = '';
  removed = false;
  readonly status = new FakeControl();
  readonly shaderProgramGuardStatus = new FakeControl();
  readonly toggle = new FakeControl();
  readonly marker = new FakeControl();
  readonly exportButton = new FakeControl();

  querySelector(selector: string): FakeControl | null {
    if (selector === '[data-recorder-status]') return this.status;
    if (selector === '[data-shader-program-guard]') {
      return this.shaderProgramGuardStatus;
    }
    if (selector === '[data-recorder-action="toggle"]') return this.toggle;
    if (selector === '[data-recorder-action="marker"]') return this.marker;
    if (selector === '[data-recorder-action="export"]') return this.exportButton;
    return null;
  }

  remove(): void {
    this.removed = true;
  }
}

test('recorder disposal disconnects observers, input, and pending GPU queries', () => {
  const originalObserver = Object.getOwnPropertyDescriptor(
    globalThis,
    'PerformanceObserver',
  );
  const originalWebGl2 = Object.getOwnPropertyDescriptor(
    globalThis,
    'WebGL2RenderingContext',
  );
  let observerDisconnects = 0;
  let deletedQueries = 0;

  class FakeObserver {
    static readonly supportedEntryTypes = ['longtask'];
    constructor(_callback: PerformanceObserverCallback) {}
    observe(): void {}
    disconnect(): void { observerDisconnects += 1; }
  }
  class FakeWebGl2Context {
    readonly QUERY_RESULT_AVAILABLE = 1;
    readonly QUERY_RESULT = 2;
    getExtension(name: string): object | null {
      return name === 'EXT_disjoint_timer_query_webgl2'
        ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }
        : null;
    }
    getParameter(): boolean { return false; }
    createQuery(): object { return {}; }
    beginQuery(): void {}
    endQuery(): void {}
    getQueryParameter(): boolean { return false; }
    deleteQuery(): void { deletedQueries += 1; }
  }
  Object.defineProperty(globalThis, 'PerformanceObserver', {
    configurable: true,
    value: FakeObserver,
  });
  Object.defineProperty(globalThis, 'WebGL2RenderingContext', {
    configurable: true,
    value: FakeWebGl2Context,
  });

  try {
    const element = new FakeRecorderElement();
    const host = { append: () => undefined };
    let addedKeyListeners = 0;
    let removedKeyListeners = 0;
    const hostWindow = Object.assign(new EventTarget(), {
      performance,
      navigator: {
        userAgent: 'test',
        platform: 'test',
        hardwareConcurrency: 4,
      },
      location: { href: 'http://test/' },
      crossOriginIsolated: false,
    });
    const nativeAdd = hostWindow.addEventListener.bind(hostWindow);
    const nativeRemove = hostWindow.removeEventListener.bind(hostWindow);
    hostWindow.addEventListener = (...args: Parameters<EventTarget['addEventListener']>) => {
      if (args[0] === 'keydown') addedKeyListeners += 1;
      nativeAdd(...args);
    };
    hostWindow.removeEventListener = (
      ...args: Parameters<EventTarget['removeEventListener']>
    ) => {
      if (args[0] === 'keydown') removedKeyListeners += 1;
      nativeRemove(...args);
    };
    const context = new FakeWebGl2Context();
    const renderLayer = {
      renderer: { getContext: () => context },
      writePerformanceSnapshot: () => undefined,
    };
    const gameSession = { writePerformanceSnapshot: () => undefined };
    const recorder = new PerformanceFlightRecorder({
      host: host as unknown as HTMLElement,
      document: {
        createElement: () => element,
      } as unknown as Document,
      window: hostWindow as unknown as Window,
      renderLayer: renderLayer as never,
      gameSession: gameSession as never,
    });
    recorder.start();
    const markerShortcut = new Event('keydown', { cancelable: true });
    Object.defineProperties(markerShortcut, {
      code: { value: 'KeyM' },
      shiftKey: { value: true },
      altKey: { value: false },
      ctrlKey: { value: false },
      metaKey: { value: false },
      repeat: { value: false },
    });
    hostWindow.dispatchEvent(markerShortcut);
    assert.match(element.status.textContent, /marker 1/);
    assert.equal(markerShortcut.defaultPrevented, true);
    recorder.beginFrame(16.7);
    recorder.beginRender();
    recorder.endFrame({
      fixedDeltaSeconds: 1 / 60,
      rawFrameDeltaSeconds: 1 / 60,
      frameDeltaSeconds: 1 / 60,
      stepsThisFrame: 1,
      interpolationAlpha: 0,
      droppedSimulationTimeSeconds: 0,
      renderFps: 60,
    } satisfies LoopStats, 0.2, 0.5);

    recorder.dispose();

    assert.equal(observerDisconnects, 1);
    assert.equal(deletedQueries, 1);
    assert.equal(addedKeyListeners, 1);
    assert.equal(removedKeyListeners, 1);
    assert.equal(element.removed, true);
  } finally {
    restoreGlobal('PerformanceObserver', originalObserver);
    restoreGlobal('WebGL2RenderingContext', originalWebGl2);
  }
});

test('shader guard records Level 1 highs and ignores Level 2 growth after completion', () => {
  const originalObserver = Object.getOwnPropertyDescriptor(
    globalThis,
    'PerformanceObserver',
  );
  Object.defineProperty(globalThis, 'PerformanceObserver', {
    configurable: true,
    value: class FakeObserver {
      static readonly supportedEntryTypes: string[] = [];
    },
  });

  try {
    const element = new FakeRecorderElement();
    const programs: unknown[] = Array.from({ length: 86 }, () => ({}));
    const errors: unknown[][] = [];
    const hostWindow = Object.assign(new EventTarget(), {
      performance,
      console: { error: (...args: unknown[]) => errors.push(args) },
      navigator: {
        userAgent: 'test',
        platform: 'test',
        hardwareConcurrency: 4,
      },
      location: { href: 'http://test/' },
      crossOriginIsolated: false,
    });
    const recorder = new PerformanceFlightRecorder({
      host: { append: () => undefined } as unknown as HTMLElement,
      document: {
        createElement: () => element,
      } as unknown as Document,
      window: hostWindow as unknown as Window,
      renderLayer: {
        renderer: {
          info: { programs },
          getContext: () => ({
            getExtension: () => null,
            getParameter: () => 'test',
          }),
        },
        writePerformanceSnapshot: () => undefined,
      } as never,
      gameSession: {
        writePerformanceSnapshot: (snapshot: {
          level: string;
          room: string | number;
          gameplayState: string;
          activeSlime: string;
          cameraPosition: [number, number, number];
        }) => {
          snapshot.level = 'level-1';
          snapshot.room = 3;
          snapshot.gameplayState = 'playing';
          snapshot.activeSlime = 'goop';
          snapshot.cameraPosition.splice(0, 3, 2, 12, 51);
        },
      } as never,
    });

    recorder.armLevelOneShaderProgramGuard(86);
    recorder.sampleLevelOneShaderPrograms();
    programs.push({});
    recorder.sampleLevelOneShaderPrograms();
    recorder.sampleLevelOneShaderPrograms();
    programs.push({});
    recorder.sampleLevelOneShaderPrograms();

    assert.deepEqual(recorder.getShaderProgramGuardSnapshot(), {
      armed: true,
      baselineProgramCount: 86,
      highestProgramCount: 88,
      growthEventCount: 2,
    });
    assert.equal(errors.length, 2);
    assert.match(element.shaderProgramGuardStatus.textContent, /87 → 88/);
    assert.match(element.shaderProgramGuardStatus.textContent, /level level-1/);
    assert.match(element.shaderProgramGuardStatus.textContent, /room 3/);

    const exported = recorder.buildExport() as {
      shaderProgramGuard: { growthEvents: ShaderProgramGrowthEvent[] };
    };
    assert.equal(exported.shaderProgramGuard.growthEvents.length, 2);
    assert.equal(
      exported.shaderProgramGuard.growthEvents[0]?.gameplay.activeSlime,
      'goop',
    );

    recorder.completeLevelOneShaderProgramGuard();
    // Simulate legitimate Level 2 program creation after transitionStarted
    // disarms the Level 1-only guard.
    programs.push({});
    recorder.sampleLevelOneShaderPrograms();
    assert.deepEqual(recorder.getShaderProgramGuardSnapshot(), {
      armed: false,
      baselineProgramCount: 86,
      highestProgramCount: 88,
      growthEventCount: 2,
    });
    assert.equal(errors.length, 2);
    assert.match(
      element.shaderProgramGuardStatus.textContent,
      /Level 1 shader guard complete/,
    );
    recorder.dispose();
  } finally {
    restoreGlobal('PerformanceObserver', originalObserver);
  }
});

function restoreGlobal(
  name: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}
