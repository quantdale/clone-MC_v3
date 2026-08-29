import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

const RELEASE_HEADLESS_RENDER_DISTANCE = 1;

function currentCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Change-255 release-build baseline characterization.
 *
 * This is intentionally a measurement-only suite. It runs the production build
 * served by Playwright's preview server and records actual browser frame timing,
 * WebGL drawing-buffer/DPR/GPU data, heap data, and canonical resource counters.
 * It does not assert a performance threshold before the worker/upload/LOD design
 * has produced an evidence-backed budget.
 */

test.describe('255 release performance baseline characterization', () => {
  test.setTimeout(600_000);

  type Scenario =
    | 'cold-spawn'
    | 'straight-flight'
    | 'spin-stress'
    | 'edit-storm'
    | 'lighting-storm'
    | 'forest'
    | 'water-coast'
    | 'long-traversal'
    | 'lod-horizon';

  interface Sample {
    frameCount: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    worstMs: number;
    heapBeforeBytes: number;
    heapAfterBytes: number;
    heapDeltaBytes: number;
    residentColumns: number;
    pendingJobs: number;
    sectionGeometries: number;
    renderCalls: number;
    triangles: number;
    textures: number;
    programs: number;
    drawingBufferWidth: number;
    drawingBufferHeight: number;
    devicePixelRatio: number;
    monitorFrameP95Ms: number;
    monitorFrameP99Ms: number;
    monitorMeshBuildMs: number;
    uploadBytesThisFrame: number;
    uploadBytesLastFrame: number;
    queueDepths: Record<string, number>;
    oldestJobAgeMs: number;
    workerPoolSize: number;
    workerBusyMsLastFrame: number;
    workerBusyMsTotal: number;
    workerJobsCompletedTotal: number;
  }

  interface Result {
    scenario: Scenario;
    status: 'measured' | 'unavailable';
    note: string;
    seed: number;
    startupMs: number;
    sample: Sample | null;
  }

  interface Environment {
    commit: string;
    browser: string;
    userAgent: string;
    platform: string;
    hardwareConcurrency: number;
    devicePixelRatio: number;
    viewport: { width: number; height: number };
    drawingBuffer: { width: number; height: number };
    webglVersion: string;
    gpu: string;
    qualityTier: 'release-headless';
    renderDistance: number;
  }

  async function waitForReady(page: Page, seed: number): Promise<number> {
    const start = Date.now();
    await page.goto(`/?seed=${seed}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 90_000 });
    await page.waitForFunction(
      () => (window as unknown as { __voxelGame?: object }).__voxelGame !== undefined,
      { timeout: 30_000, polling: 100 },
    );
    return Date.now() - start;
  }

  async function environment(page: Page): Promise<Environment> {
    const commit = currentCommit();
    return page.evaluate(({ commitValue, renderDistance }) => {
      const game = (window as unknown as {
        __voxelGame?: {
          renderer?: { renderer?: { domElement?: HTMLCanvasElement } };
          world?: { getStats(): { loadedChunks: number } };
        };
      }).__voxelGame;
      const canvas = game?.renderer?.renderer?.domElement ?? document.getElementById('game-canvas');
      const gl = canvas instanceof HTMLCanvasElement
        ? canvas.getContext('webgl2') ?? canvas.getContext('webgl')
        : null;
      const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info') as {
        UNMASKED_RENDERER_WEBGL: number;
      } | null;
      return {
        commit: commitValue,
        browser: navigator.userAgent,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        devicePixelRatio: window.devicePixelRatio,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        drawingBuffer: {
          width: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
          height: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
        },
        webglVersion: gl?.getParameter(gl.VERSION) as string ?? 'unavailable',
        gpu: gl && debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string
          : 'unavailable',
        qualityTier: 'release-headless' as const,
        // The E2E runtime profile uses the documented headless render distance.
        renderDistance,
      };
    }, { commitValue: commit, renderDistance: RELEASE_HEADLESS_RENDER_DISTANCE });
  }

  async function sampleFrames(page: Page, scenario: Scenario, durationMs = 2_500): Promise<Sample> {
    return page.evaluate(async ({ scenario: activeScenario, duration }) => {
      const root = (window as unknown as {
        __voxelGame?: {
          world?: {
            getStats(): {
              residentColumns: number;
              pendingGeneration: number;
              pendingMesh: number;
              pendingLight: number;
              pendingSave: number;
              pendingUnload: number;
              geometries: number;
            };
            setBlock(x: number, y: number, z: number, id: number): void;
          };
          player?: {
            position: {
              x: number;
              y: number;
              z: number;
              set(x: number, y: number, z: number): void;
            };
          };
          testSetCameraPose?(yaw: number, pitch: number): void;
          getPerformanceSnapshot?(): string;
          getCanonicalResourceMetrics?(): {
            residentColumns: number;
            pendingGenerationJobs: number;
            pendingMeshJobs: number;
            pendingLightJobs: number;
            pendingSaveJobs: number;
            pendingUnloadJobs: number;
            sectionGeometries: number;
          };
          renderer?: {
            renderer?: {
              domElement?: HTMLCanvasElement;
              info?: {
                render?: { calls: number; triangles: number };
                memory?: { textures: number };
                programs?: number | { length?: number };
              };
            };
          };
        };
      }).__voxelGame;
      if (!root?.world) throw new Error('release baseline game seam unavailable');

      const readHeap = (): number => {
        const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
        return memory?.usedJSHeapSize ?? 0;
      };
      const readSample = (): Omit<Sample, 'frameCount' | 'p50Ms' | 'p95Ms' | 'p99Ms' | 'worstMs' | 'heapBeforeBytes' | 'heapAfterBytes' | 'heapDeltaBytes'> => {
        const metrics = root.getCanonicalResourceMetrics?.();
        const stats = root.world!.getStats();
        const info = root.renderer?.renderer?.info;
        const programs = typeof info?.programs === 'number' ? info.programs : info?.programs?.length ?? -1;
        const canvas = root.renderer?.renderer?.domElement;
        const snapshotText = root.getPerformanceSnapshot?.();
        if (snapshotText === undefined) throw new Error('release performance monitor seam unavailable');
        const monitor = JSON.parse(snapshotText) as {
          frame?: { p95Millis?: number; p99Millis?: number };
          render?: { meshBuildMillis?: number };
          upload?: { bytesThisFrame?: number; bytesLastFrame?: number };
          queues?: { depths?: Record<string, number>; oldestJobAgeMillis?: number };
          workers?: {
            poolSize?: number;
            busyMillisLastFrame?: number;
            busyMillisTotal?: number;
            jobsCompletedTotal?: number;
          };
        };
        const queueDepths = monitor.queues?.depths;
        if (queueDepths === undefined) throw new Error('release queue metrics unavailable');
        return {
          residentColumns: metrics?.residentColumns ?? stats.residentColumns,
          pendingJobs: metrics
            ? metrics.pendingGenerationJobs + metrics.pendingMeshJobs + metrics.pendingLightJobs + metrics.pendingSaveJobs + metrics.pendingUnloadJobs
            : stats.pendingGeneration + stats.pendingMesh + stats.pendingLight + stats.pendingSave + stats.pendingUnload,
          sectionGeometries: metrics?.sectionGeometries ?? stats.geometries,
          renderCalls: info?.render?.calls ?? -1,
          triangles: info?.render?.triangles ?? -1,
          textures: info?.memory?.textures ?? -1,
          programs,
          drawingBufferWidth: canvas?.width ?? 0,
          drawingBufferHeight: canvas?.height ?? 0,
          devicePixelRatio: window.devicePixelRatio,
          monitorFrameP95Ms: monitor.frame?.p95Millis ?? -1,
          monitorFrameP99Ms: monitor.frame?.p99Millis ?? -1,
          monitorMeshBuildMs: monitor.render?.meshBuildMillis ?? -1,
          uploadBytesThisFrame: monitor.upload?.bytesThisFrame ?? -1,
          uploadBytesLastFrame: monitor.upload?.bytesLastFrame ?? -1,
          queueDepths,
          oldestJobAgeMs: monitor.queues?.oldestJobAgeMillis ?? -1,
          workerPoolSize: monitor.workers?.poolSize ?? -1,
          workerBusyMsLastFrame: monitor.workers?.busyMillisLastFrame ?? -1,
          workerBusyMsTotal: monitor.workers?.busyMillisTotal ?? -1,
          workerJobsCompletedTotal: monitor.workers?.jobsCompletedTotal ?? -1,
        };
      };

      const heapBeforeBytes = readHeap();
      const frameTimes: number[] = [];
      let frameCount = 0;
      let previous = performance.now();
      const start = previous;
      await new Promise<void>((resolve) => {
        const frame = (now: number): void => {
          const elapsed = now - previous;
          previous = now;
          if (elapsed > 0) frameTimes.push(elapsed);
          frameCount++;

          if (activeScenario === 'straight-flight' && frameCount % 12 === 0) {
            root.player?.position.set(Math.floor(frameCount / 12) * 16 + 8, root.player.position.y, root.player.position.z);
          } else if (activeScenario === 'spin-stress') {
            root.testSetCameraPose?.((frameCount % 360) * Math.PI / 180, 0);
          } else if (activeScenario === 'edit-storm' && frameCount % 3 === 0) {
            for (let i = 0; i < 20; i++) {
              root.world!.setBlock(4 + ((frameCount * 20 + i) & 15), 32 + ((frameCount + i) % 32), 4 + ((frameCount * 7 + i * 3) & 15), i & 1 ? 0 : 3);
            }
          } else if (activeScenario === 'lighting-storm' && frameCount % 6 === 0) {
            for (let i = 0; i < 8; i++) {
              root.world!.setBlock(6 + ((frameCount + i) & 7), 48 + ((frameCount + i) & 15), 6 + ((frameCount * 3 + i) & 7), frameCount & 1 ? 18 : 0);
            }
          } else if (activeScenario === 'long-traversal' && frameCount % 60 === 0) {
            const phase = Math.floor(frameCount / 60) % 4;
            const x = phase === 0 ? 8 : phase === 1 ? 136 : phase === 2 ? -120 : 8;
            const z = phase === 2 ? 136 : phase === 3 ? -120 : 8;
            root.player?.position.set(x, root.player.position.y, z);
          }

          if (now - start >= duration) {
            resolve();
          } else {
            requestAnimationFrame(frame);
          }
        };
        requestAnimationFrame(frame);
      });

      const heapAfterBytes = readHeap();
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const q = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
      return {
        frameCount,
        p50Ms: q(0.5),
        p95Ms: q(0.95),
        p99Ms: q(0.99),
        worstMs: sorted[sorted.length - 1] ?? 0,
        heapBeforeBytes,
        heapAfterBytes,
        heapDeltaBytes: heapAfterBytes - heapBeforeBytes,
        ...readSample(),
      };
    }, { scenario, duration: durationMs });
  }

  test('records the production-browser baseline without threshold claims', async ({ page }) => {
    const results: Result[] = [];
    let firstEnvironment: Environment | null = null;

    const measured = async (
      scenario: Exclude<Scenario, 'lod-horizon'>,
      seed: number,
      note: string,
    ): Promise<void> => {
      const startupMs = await waitForReady(page, seed);
      firstEnvironment ??= await environment(page);
      const sample = await sampleFrames(page, scenario);
      results.push({ scenario, status: 'measured', note, seed, startupMs, sample });
    };

    await measured('cold-spawn', 1337, 'Fresh production preview boot and settled browser frame/resource sample.');
    await measured('straight-flight', 1337, 'Deterministic forward movement through chunk centers; player position is driven through the E2E seam.');
    await measured('spin-stress', 1337, 'Deterministic camera rotation through the E2E seam while the production renderer remains active.');
    await measured('edit-storm', 1337, 'Twenty deterministic block edits per second across the live Overworld; browser frame and queue cost sampled.');
    await measured('lighting-storm', 1337, 'Eight deterministic emissive/air edits per second; browser frame and light queue cost sampled.');
    await measured('forest', 42, 'Seed-specific production browser control; no semantic forest fixture exists yet, so this is not a foliage-only claim.');
    await measured('water-coast', 1234, 'Seed-specific production browser control; no semantic coast fixture exists yet, so this is not a fluid-only claim.');
    await measured('long-traversal', 1337, 'Repeated deterministic teleport traversal with browser resource counters sampled after each boot.');
    results.push({
      scenario: 'lod-horizon',
      status: 'unavailable',
      note: 'No Change-255 LOD implementation exists yet; no horizon or transition metric is fabricated.',
      seed: 1337,
      startupMs: 0,
      sample: null,
    });

    console.log(`[255 release baseline] ${JSON.stringify({ environment: firstEnvironment, results })}`);
    expect(firstEnvironment).not.toBeNull();
    expect(results).toHaveLength(9);
    expect(results.filter((result) => result.status === 'measured')).toHaveLength(8);
    expect(results.find((result) => result.scenario === 'lod-horizon')?.status).toBe('unavailable');
    for (const result of results.filter((candidate) => candidate.sample !== null)) {
      expect(result.sample!.frameCount).toBeGreaterThan(0);
      expect(result.sample!.drawingBufferWidth).toBeGreaterThan(0);
      expect(result.sample!.drawingBufferHeight).toBeGreaterThan(0);
      expect(result.sample!.devicePixelRatio).toBeGreaterThan(0);
    }
  });
});
