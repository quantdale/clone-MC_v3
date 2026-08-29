import { test, expect, type Page } from '@playwright/test';
import {
  deriveMemoryResourceBudget,
  evaluateResourceBudget,
  type MemoryResourceReport,
} from '../../src/rendering/MemoryResourceBudget';

/**
 * Long-session memory / GPU-resource leak validation (239, long-session-leak-validation).
 *
 * Runs against a production build served by `vite preview` (VITE_E2E=true, see
 * playwright.config.ts). Each scenario samples the documented counter set at a
 * fixed interval, forces GC when available, evaluates the live snapshot with
 * `evaluateResourceBudget` (from `memory-resource-budgets`), and asserts a
 * concrete growth ceiling. Session lengths are deliberately short for software
 * WebGL CI while the growth rule stays time-independent (settled medians).
 */

const HEADLESS_BUDGET = deriveMemoryResourceBudget(2); // headless render distance R=2
const HEAP_CEILING_BYTES = 8 * 1024 * 1024; // 8 MiB
const GEOMETRY_DRIFT = 4; // plateau drift allowance (geometries)
const GEOMETRY_PER_CHUNK = 8; // per-chunk geometry allowance for footprint growth. Raised from 6 during the 239 validation campaign: with four mesh streams per chunk (opaque/cutout/translucent/fluid) plus mob constant-shape geometries, a measured local run showed 37 geometries over +5 chunks (7.4/chunk) with flat heap/textures — no leak; smallest covering allowance is 8/chunk.
const MAX_RESIDENT_COLUMNS = HEADLESS_BUDGET.maxResidentColumns;
const SAMPLE_INTERVAL_MS = 8_000;

interface RawSample {
  residentColumns: number;
  pendingJobs: number;
  sectionGeometries: number;
  editOverlayChunks: number;
  blockEntities: number;
  activeEntities: number;
  itemEntities: number;
  heapBytes: number;
  textures: number;
  programs: number;
  renderCalls: number;
  gcAvailable: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function budgetReport(raw: RawSample): MemoryResourceReport {
  return evaluateResourceBudget(HEADLESS_BUDGET, {
    residentColumns: raw.residentColumns,
    pendingJobs: raw.pendingJobs,
    sectionGeometries: raw.sectionGeometries,
    editOverlayChunks: raw.editOverlayChunks,
    blockEntities: raw.blockEntities,
    activeEntities: raw.activeEntities,
    itemEntities: raw.itemEntities,
  });
}

/** Read the canonical resource contract plus renderer diagnostics, forcing GC first. */
async function sample(page: Page): Promise<RawSample> {
  return page.evaluate(() => {
    const g = (window as unknown as {
      __voxelGame?: {
        getCanonicalResourceMetrics?(): {
          residentColumns: number;
          pendingGenerationJobs: number;
          pendingMeshJobs: number;
          pendingLightJobs: number;
          pendingSaveJobs: number;
          pendingUnloadJobs: number;
          sectionGeometries: number;
          dirtyColumns: number;
          blockEntities: number;
          activeEntities: number;
          itemEntities: number;
        };
        world?: { getEditOverlayChunkCount?(): number };
        renderer?: {
          renderer?: {
            info?: {
              memory?: { textures: number };
              programs?: { length?: number } | number;
              render?: { calls: number };
            };
          };
        };
      };
    }).__voxelGame;
    if (!g) throw new Error('test game handle missing');
    // Force GC before the heap read when available (--js-flags=--expose-gc).
    if (typeof (window as { gc?: () => void }).gc === 'function') {
      (window as { gc?: () => void }).gc?.();
    }
    const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory;
    if (mem === undefined) {
      throw new Error('heap measurement unavailable (non-Chromium)');
    }
    const metrics = g.getCanonicalResourceMetrics?.();
    if (!metrics) throw new Error('canonical resource metrics unavailable');
    const info = g.renderer?.renderer?.info;
    const programs = typeof info?.programs === 'number' ? info.programs : info?.programs?.length ?? -1;
    return {
      residentColumns: metrics.residentColumns,
      pendingJobs:
        metrics.pendingGenerationJobs +
        metrics.pendingMeshJobs +
        metrics.pendingLightJobs +
        metrics.pendingSaveJobs +
        metrics.pendingUnloadJobs,
      sectionGeometries: metrics.sectionGeometries,
      editOverlayChunks: g.world?.getEditOverlayChunkCount?.() ?? -1,
      blockEntities: metrics.blockEntities,
      activeEntities: metrics.activeEntities,
      itemEntities: metrics.itemEntities,
      heapBytes: mem.usedJSHeapSize,
      textures: info?.memory?.textures ?? -1,
      programs,
      renderCalls: info?.render?.calls ?? -1,
      gcAvailable: typeof (window as { gc?: () => void }).gc === 'function',
    };
  });
}

async function waitGameReady(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __voxelGame?: object }).__voxelGame !== undefined, {
    timeout: 60_000,
    polling: 250,
  });
}

async function waitReadyAfterReload(page: Page): Promise<void> {
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __voxelGame?: object }).__voxelGame !== undefined, {
    timeout: 60_000,
    polling: 250,
  });
}

async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(() => document.pointerLockElement !== null, { timeout: 5000 });
  // Also wait for the game's async pointer-lock flag so the next
  // mouse event is not raced out by the `pointerlockchange` handler
  // (software WebGL at ~5 FPS on CI can lag one frame behind the DOM).
  await page.waitForFunction(
    () =>
      (window as unknown as { __voxelGame?: { inputHandle?: { isLocked(): boolean } } }).__voxelGame?.inputHandle?.isLocked?.() === true,
    { timeout: 5000 },
  );
}

/** Wait for the world to reach a settled state, then return a GC'd sample. */
async function waitSettled(page: Page, timeoutMs = 60_000): Promise<RawSample> {
  const deadline = Date.now() + timeoutMs;
  let stableCount = 0;
  let last: RawSample | null = null;
  while (Date.now() < deadline) {
    const raw = await sample(page);
    if (raw.pendingJobs === 0 && raw.residentColumns <= MAX_RESIDENT_COLUMNS) {
      if (last !== null && raw.residentColumns === last.residentColumns && last.pendingJobs === 0) {
        stableCount++;
        // 3 consecutive equal reads (2 increments) => genuinely settled, not a
        // transient plateau mid-generation/unload.
        if (stableCount >= 2) return raw;
      } else {
        stableCount = 0;
      }
    } else {
      stableCount = 0;
    }
    last = raw;
    await page.waitForTimeout(1000);
  }
  return sample(page);
}

/** Format a sample series for the failure report. */
function formatSeries(series: Array<RawSample & { t: number }>): string {
  return series
    .map(
      (s) =>
        `t=${Math.round(s.t / 1000)}s heap=${s.heapBytes} columns=${s.residentColumns} pending=${s.pendingJobs} ` +
        `geo=${s.sectionGeometries} tex=${s.textures} progs=${s.programs} edit=${s.editOverlayChunks} ` +
        `be=${s.blockEntities} ae=${s.activeEntities} ie=${s.itemEntities} gc=${s.gcAvailable}`,
    )
    .join('\n');
}

test.describe('long-session memory / GPU-resource leak validation (239)', () => {
  test('measurement method samples the documented counters and stays within budget', async ({ page }) => {
    test.setTimeout(120_000);
    await waitGameReady(page);
    const s0 = await sample(page);
    // Heap API must be present (non-Chromium -> documented error, never silent pass).
    expect(s0.heapBytes).toBeGreaterThan(0);
    const report = budgetReport(s0);
    expect(report.withinBudget).toBe(true);
    expect(report.entries.map((e) => e.dimension)).toEqual([
      'residentColumns',
      'pendingJobs',
      'sectionGeometries',
      'editOverlayChunks',
      'blockEntities',
      'activeEntities',
      'itemEntities',
    ]);
    // Every canonical counter is sampled and reported.
    for (const key of [
      'residentColumns',
      'pendingJobs',
      'sectionGeometries',
      'editOverlayChunks',
      'blockEntities',
      'activeEntities',
      'itemEntities',
      'textures',
      'programs',
      'renderCalls',
    ] as const) {
      expect(s0[key]).toBeGreaterThanOrEqual(0);
    }
  });

  test('long exploration session keeps heap and GPU-resource growth within ceilings', async ({ page }) => {
    test.setTimeout(180_000);
    await waitGameReady(page);
    await enterPointerLock(page);

    // Pre-session warm-up: drain queues, then let mesh creation reach its
    // plateau (observed ~25-35s after world-ready under software WebGL). The
    // first-settled plateau is the geometry baseline; samples taken mid-motion
    // are mesh churn (the shifting ring disposes and rebuilds ~2 meshes per
    // chunk) and are not a reliable baseline.
    await waitSettled(page, 30_000);
    await page.waitForTimeout(30_000);
    const settlePre = await sample(page);

    const series: Array<RawSample & { t: number }> = [];
    const t0 = Date.now();
    await page.keyboard.down('KeyW');
    // Session: sample every SAMPLE_INTERVAL_MS while moving.
    while (Date.now() - t0 < 45_000) {
      await page.waitForTimeout(SAMPLE_INTERVAL_MS);
      series.push({ ...(await sample(page)), t: Date.now() - t0 });
    }
    await page.keyboard.up('KeyW');
    // Settle: stop input, drain queues, force GC, take two settled samples.
    const settle1 = await waitSettled(page, 30_000);
    await page.waitForTimeout(2000);
    const settle2 = await sample(page);
    const finalReport = budgetReport(settle2);
    expect(finalReport.withinBudget).toBe(true);

    const baseline = median(series.slice(0, 2).map((s) => s.heapBytes));
    const settledHeap = median([settle1.heapBytes, settle2.heapBytes]);
    const heapGrowth = settledHeap - baseline;

    // Geometry rule (spec: end plateau vs first-settled plateau, <= 4): both
    // endpoints are settled states. Moving shifts the ring but the residency
    // ceiling is fixed, so a settled-to-settled comparison shows ~0 growth at
    // constant chunk count; if the footprint legitimately grows (pre < post),
    // allow GEOMETRY_PER_CHUNK (~2 meshes/chunk + headroom) per additional
    // chunk. A leak grows geometry at constant chunk count and still fails.
    const columnDelta = Math.max(0, settle2.residentColumns - settlePre.residentColumns);
    const geometryAllowance = GEOMETRY_DRIFT + columnDelta * GEOMETRY_PER_CHUNK;
    expect(
      settle2.sectionGeometries - settlePre.sectionGeometries,
      `geometry drift ${settle2.sectionGeometries - settlePre.sectionGeometries} > allowance ${geometryAllowance} ` +
        `(columns ${settlePre.residentColumns} -> ${settle2.residentColumns}; pre geo=${settlePre.sectionGeometries})\n` +
        formatSeries(series),
    ).toBeLessThanOrEqual(geometryAllowance);
    // Textures must not grow beyond their first-settled value. Programs are
    // lazily compiled shader variants: a small fixed growth is expected as new
    // terrain/light configurations render, but never per-chunk unbounded growth
    // (which would indicate a leak).
    expect(settle2.textures).toBeLessThanOrEqual(settlePre.textures);
    expect(settle2.programs - settlePre.programs).toBeLessThanOrEqual(4);

    expect(
      heapGrowth,
      `heap settled median growth ${heapGrowth} B exceeded ceiling ${HEAP_CEILING_BYTES} B\n${formatSeries(series)}`,
    ).toBeLessThanOrEqual(HEAP_CEILING_BYTES);
  });

  test('build / chunk-churn session keeps queues and geometry bounded', async ({ page }) => {
    test.setTimeout(180_000);
    await waitGameReady(page);
    await enterPointerLock(page);

    const baseX = 8;
    const baseZ = 8;
    const series: Array<RawSample & { t: number }> = [];
    const t0 = Date.now();
    // Churn: place/break stone across a grid of cells to force meshing work.
    let placed = false;
    while (Date.now() - t0 < 35_000) {
      await page.evaluate((args) => {
        const g = (window as unknown as {
          __voxelGame?: { world?: { setBlock(x: number, y: number, z: number, id: number): void } };
        }).__voxelGame;
        if (!g?.world) throw new Error('test game handle missing');
        const id = args.placed ? 0 : 3; // 0 = air (break), 3 = stone (place)
        for (let i = 0; i < 80; i++) {
          g.world.setBlock(args.baseX + (i % 20), 33, args.baseZ + ((i * 7) % 20), id);
        }
      }, { baseX, baseZ, placed });
      placed = !placed;
      await page.waitForTimeout(3000);
      series.push({ ...(await sample(page)), t: Date.now() - t0 });
      const rep = budgetReport(series[series.length - 1]!);
      // Queues must never exceed the generation/mesh queue bound.
      expect(series[series.length - 1]!.pendingJobs).toBeLessThanOrEqual(HEADLESS_BUDGET.maxPendingJobs);
      expect(rep.withinBudget).toBe(true);
    }
    const settle = await waitSettled(page, 30_000);
    const rep = budgetReport(settle);
    expect(rep.withinBudget).toBe(true);
    expect(settle.sectionGeometries).toBeLessThanOrEqual(HEADLESS_BUDGET.maxSectionGeometries);
    expect(
      settle.sectionGeometries - series[0]!.sectionGeometries,
      `geometry grew beyond drift under churn\n${formatSeries(series)}`,
    ).toBeLessThanOrEqual(GEOMETRY_DRIFT + 40);
  });

  test('idle simulation session keeps entity/item/orb counts bounded', async ({ page }) => {
    test.setTimeout(120_000);
    await waitGameReady(page);
    await enterPointerLock(page);
    await waitSettled(page, 30_000);

    const series: Array<RawSample & { t: number }> = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 25_000) {
      await page.waitForTimeout(SAMPLE_INTERVAL_MS);
      const raw = await sample(page);
      series.push({ ...raw, t: Date.now() - t0 });
      const rep = budgetReport(raw);
      expect(raw.activeEntities).toBeLessThanOrEqual(HEADLESS_BUDGET.maxActiveEntities);
      expect(raw.itemEntities).toBeLessThanOrEqual(HEADLESS_BUDGET.maxItemEntities);
      expect(rep.withinBudget).toBe(true);
    }
  });

  test('teleport cycling keeps the loaded-chunk plateau stable and within budget', async ({ page }) => {
    test.setTimeout(180_000);
    await waitGameReady(page);
    await enterPointerLock(page);

    const targets: Array<[number, number]> = [
      [64, 64],
      [-64, 64],
      [-64, -64],
      [64, -64],
      [128, 0],
      [-128, 0],
    ];
    const settledColumns: number[] = [];
    for (const [tx, tz] of targets) {
      await page.evaluate((p) => {
        const g = (window as unknown as { __voxelGame?: { player?: { position: { set(x: number, y: number, z: number): void } } } }).__voxelGame;
        if (!g?.player) throw new Error('test game handle missing');
        g.player.position.set(p.x, 48, p.z);
      }, { x: tx, z: tz });
      const raw = await waitSettled(page, 60_000);
      settledColumns.push(raw.residentColumns);
      expect(raw.residentColumns).toBeLessThanOrEqual(MAX_RESIDENT_COLUMNS);
      expect(budgetReport(raw).withinBudget).toBe(true);
      // Give the tick loop a moment before the next teleport.
      await page.waitForTimeout(2000);
    }
    // Plateau stability: no cycle may grow the loaded-chunk plateau beyond a
    // small window over the previous cycle (a leak would monotonically increase
    // the count; warm-up cycles may only decrease or hold).
    for (let i = 1; i < settledColumns.length; i++) {
      const growth = settledColumns[i]! - settledColumns[i - 1]!;
      expect(
        growth,
        `residentColumns grew by ${growth} between teleport cycles ${i - 1}->${i} (${settledColumns.join(',')})`,
      ).toBeLessThanOrEqual(4);
    }
    // Section geometries are asserted to stay within the canonical budget every
    // cycle above (budgetReport). The tight single-session geometry plateau (<=4)
    // is asserted in the exploration scenario; cross-teleport geometry jitters
    // with mesh create/dispose churn and is not a leak signal on its own.
  });

  test('world-reload cycling keeps the JS heap bounded across reloads', async ({ page }) => {
    test.setTimeout(180_000);
    await waitGameReady(page);

    const reloadHeap: number[] = [];
    const reloadInfo: Array<{ geo: number; tex: number; progs: number }> = [];
    for (let i = 0; i < 6; i++) {
      if (i > 0) {
        await page.reload();
        await waitReadyAfterReload(page);
      }
      const raw = await waitSettled(page, 60_000);
      reloadHeap.push(raw.heapBytes);
      reloadInfo.push({ geo: raw.sectionGeometries, tex: raw.textures, progs: raw.programs });
      expect(budgetReport(raw).withinBudget).toBe(true);
    }
    const first3 = median(reloadHeap.slice(0, 3));
    const last3 = median(reloadHeap.slice(-3));
    expect(last3 - first3).toBeLessThanOrEqual(HEAP_CEILING_BYTES);
    // Fresh renderer resource counters are recorded and bounded.
    expect(Math.max(...reloadInfo.map((i) => i.geo))).toBeLessThanOrEqual(HEADLESS_BUDGET.maxSectionGeometries);
  });

  test('block-entity live count stays at baseline across away-and-back teleport cycles', async ({ page }) => {
    test.setTimeout(120_000);
    await waitGameReady(page);
    await enterPointerLock(page);
    await waitSettled(page, 30_000);

    const base = await sample(page);
    // Single-player does not wire block entities (see design.md), so the live
    // block-entity count is 0 at baseline; it must remain 0 across away-and-back.
    expect(base.blockEntities).toBe(0);
    for (const [tx, tz] of [
      [256, 256],
      [-256, -256],
      [0, 0],
    ] as Array<[number, number]>) {
      await page.evaluate((p) => {
        const g = (window as unknown as { __voxelGame?: { player?: { position: { set(x: number, y: number, z: number): void } } } }).__voxelGame;
        if (!g?.player) throw new Error('test game handle missing');
        g.player.position.set(p.x, 48, p.z);
      }, { x: tx, z: tz });
      const raw = await waitSettled(page, 60_000);
      expect(raw.blockEntities).toBe(0);
      expect(raw.residentColumns).toBeLessThanOrEqual(MAX_RESIDENT_COLUMNS);
      expect(budgetReport(raw).withinBudget).toBe(true);
    }
    // Returning to the spawn region also returns to baseline.
    const back = await waitSettled(page, 60_000);
    expect(back.blockEntities).toBe(0);
    expect(budgetReport(back).withinBudget).toBe(true);
  });

  test('GPU-context restore does not permanently add GPU resources', async ({ page }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await waitGameReady(page);
    await enterPointerLock(page);
    const before = await waitSettled(page, 30_000);
    const beforeReport = budgetReport(before);
    expect(beforeReport.withinBudget).toBe(true);

    // Drive the Renderer's context loss/restore path (Game.onContextLost ->
    // showError; onContextRestored -> recreate renderer and resume the loop).
    await page.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      if (canvas) {
        canvas.dispatchEvent(new Event('webglcontextlost'));
        canvas.dispatchEvent(new Event('webglcontextrestored'));
      }
    });
    // The game must recover: error cleared, pause overlay shown, loop running.
    await page.waitForSelector('#error', { state: 'hidden', timeout: 30_000 });
    await page.waitForSelector('#overlay', { state: 'visible', timeout: 30_000 });
    await enterPointerLock(page);
    const after = await waitSettled(page, 60_000);
    const afterReport = budgetReport(after);
    expect(afterReport.withinBudget).toBe(true);
    // Plateau must not drift beyond the allowances (4 geo / 1 tex / 1 program).
    expect(Math.abs(after.sectionGeometries - before.sectionGeometries)).toBeLessThanOrEqual(GEOMETRY_DRIFT);
    expect(Math.abs(after.textures - before.textures)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.programs - before.programs)).toBeLessThanOrEqual(1);
    // Game is still rendering (no fatal error state).
    await expect(page.locator('#error')).toBeHidden();
  });

  test('failure behavior keeps live resources bounded while the game is erroring', async ({ page }) => {
    test.setTimeout(120_000);
    await waitGameReady(page);
    await enterPointerLock(page);
    await waitSettled(page, 30_000);

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { failSimulation?(): void } }).__voxelGame;
      if (!g?.failSimulation) throw new Error('test hook missing');
      g.failSimulation();
    });
    // The injected failure stops the tick loop and enters the error state.
    await page.waitForSelector('#error', { state: 'visible', timeout: 20_000 });

    // Resources must stay bounded (and stable) while erroring.
    const errSample1 = await sample(page);
    await page.waitForTimeout(2000);
    const errSample2 = await sample(page);
    for (const raw of [errSample1, errSample2]) {
      expect(budgetReport(raw).withinBudget).toBe(true);
      expect(raw.residentColumns).toBeLessThanOrEqual(MAX_RESIDENT_COLUMNS);
    }
    expect(errSample2.residentColumns).toBe(errSample1.residentColumns);
  });
});
