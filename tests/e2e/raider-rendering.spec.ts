import { test, expect, type Page } from '@playwright/test';
import { comparePng } from '../visual/goldenCompare';

/**
 * Raider + patrol rendering (293): the renderer's scene holds exactly one
 * `raider-*` group per ACTIVE raid-wave raider and patrol pillager, with the
 * right kind, a single banner-marked captain and the projected facing; groups
 * disappear on death, patrol dismissal, raid end and dispose. A non-golden
 * screenshot sanity check confirms the meshes actually draw pixels.
 */

type Kind = 'pillager' | 'vindicator' | 'ravager' | 'witch';
type Entry = { key: string; kind: Kind; captain: boolean; x: number; y: number; z: number; facing: number };
type MeshView = {
  key: string;
  kind: Kind;
  captain: boolean;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  childCount: number;
  inScene: boolean;
  visible: boolean;
};
type RenderState = {
  visible: boolean;
  expected: Entry[];
  meshes: MeshView[];
  sceneRaiderGroups: number;
  camera: { x: number; y: number; z: number };
};
type PatrolView = { memberIds: number[]; captainId: number | null } | null;
type RaidView = { status: string; raidersRemaining: number } | null;

type GameHandle = {
  getRaiderRenderState(): RenderState;
  debugSetRaiderMeshesVisible(v: boolean): void;
  debugStartRaid(level?: number): RaidView;
  debugClearRaidWave(): RaidView;
  debugDamageRaidEntity(id: number, amount: number): boolean;
  getRaidWaveEntityIds(): number[];
  getRaidState(): RaidView;
  debugSpawnPatrol(): PatrolView;
  getPatrolState(): PatrolView;
  setVillageQuery(q: (() => null) | null): void;
  clearBadOmen(): void;
  testSetCameraPose(yaw: number, pitch: number): void;
  testFreezeDynamicResolution(): void;
  dispose(): void;
};

const PARTS: Record<Kind, number> = { pillager: 6, vindicator: 6, witch: 7, ravager: 8 };

async function waitForGame(page: Page): Promise<void> {
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null,
    null,
    { timeout: 120_000 },
  );
}

async function nextFrames(page: Page, n = 2): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const step = (): void => {
          if (--left <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    n,
  );
}

async function state(page: Page): Promise<RenderState> {
  return page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.getRaiderRenderState());
}

/** Wait until the rendered groups match the projected entries exactly. */
async function settled(page: Page): Promise<RenderState> {
  let s = await state(page);
  for (let i = 0; i < 60; i++) {
    const keys = (xs: Array<{ key: string }>): string => xs.map((x) => x.key).sort().join(',');
    if (keys(s.meshes) === keys(s.expected) && s.sceneRaiderGroups === s.meshes.length) return s;
    await nextFrames(page);
    s = await state(page);
  }
  return s;
}

function assertMatches(s: RenderState): void {
  expect(s.meshes.map((m) => m.key).sort()).toEqual(s.expected.map((e) => e.key).sort());
  expect(s.sceneRaiderGroups).toBe(s.meshes.length);
  for (const e of s.expected) {
    const m = s.meshes.find((x) => x.key === e.key)!;
    expect(m.kind).toBe(e.kind);
    expect(m.captain).toBe(e.captain);
    expect(m.inScene).toBe(true);
    expect(m.childCount).toBe(PARTS[e.kind] + (e.captain ? 2 : 0));
    expect(m.x).toBeCloseTo(e.x, 5);
    expect(m.y).toBeCloseTo(e.y, 5);
    expect(m.z).toBeCloseTo(e.z, 5);
    expect(m.rotationY).toBeCloseTo(e.facing, 5);
  }
}

async function spawnPatrol(page: Page): Promise<NonNullable<PatrolView>> {
  let last: PatrolView = null;
  for (let i = 0; i < 30; i++) {
    last = await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.debugSpawnPatrol());
    if (last && last.memberIds.length >= 1) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(`could not force a patrol: ${JSON.stringify(last)}`);
}

async function hideUi(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const sel of ['#overlay', '#hud', '#hotbar', '#crosshair', '#debug-overlay', '#raid-bar', '#wither-boss-bar']) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) el.style.visibility = 'hidden';
    }
  });
}

test.describe('raider + patrol rendering (293)', () => {
  test('scene mirrors raid/patrol entities through add, death, dismissal, raid end and dispose', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await waitForGame(page);

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      g.setVillageQuery(() => null);
      g.clearBadOmen();
    });

    // Fresh world: nothing to draw.
    await nextFrames(page);
    const fresh = await state(page);
    expect(fresh.expected).toEqual([]);
    expect(fresh.meshes).toEqual([]);
    expect(fresh.sceneRaiderGroups).toBe(0);

    // Raid wave 1.
    const raid = await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.debugStartRaid(1));
    expect(raid?.status).toBe('ACTIVE');
    const waveIds = await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.getRaidWaveEntityIds());
    expect(waveIds.length).toBeGreaterThan(0);

    // Patrol after the raid is active (a raid start dismisses patrols; forceSpawn bypasses the raid gate).
    const patrol = await spawnPatrol(page);
    expect(patrol.captainId).not.toBeNull();

    let s = await settled(page);
    assertMatches(s);
    const raidKeys = s.meshes.filter((m) => m.key.startsWith('raid:')).map((m) => m.key).sort();
    const patrolKeys = s.meshes.filter((m) => m.key.startsWith('patrol:')).map((m) => m.key).sort();
    expect(raidKeys).toEqual(waveIds.map((id) => `raid:${id}`).sort());
    expect(patrolKeys).toEqual(patrol.memberIds.map((id) => `patrol:${id}`).sort());
    expect(s.meshes.filter((m) => m.captain).map((m) => m.key)).toEqual([`patrol:${patrol.captainId}`]);
    expect(s.meshes.filter((m) => m.key.startsWith('patrol:')).every((m) => m.kind === 'pillager')).toBe(true);
    expect(s.sceneRaiderGroups).toBe(waveIds.length + patrol.memberIds.length);

    // Screenshot sanity (not a golden): the meshes change pixels versus hidden.
    await hideUi(page);
    await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.testFreezeDynamicResolution());
    const cam = s.camera;
    const byDistance = [...s.meshes].sort(
      (a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z),
    );
    let best = { visibleVsHidden: 0, hiddenVsHidden: 1 };
    let bestShot: Buffer | null = null;
    for (const target of byDistance.slice(0, 6)) {
      const dx = target.x - cam.x;
      const dz = target.z - cam.z;
      const dy = target.y + 1 - cam.y;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      await page.evaluate(
        ([y, p]) => {
          const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
          g.testSetCameraPose(y, p);
          g.debugSetRaiderMeshesVisible(true);
        },
        [yaw, pitch] as const,
      );
      await nextFrames(page, 4);
      const shown = await page.screenshot();
      await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.debugSetRaiderMeshesVisible(false));
      await nextFrames(page, 4);
      const hiddenA = await page.screenshot();
      await nextFrames(page, 4);
      const hiddenB = await page.screenshot();
      const opts = { channelTolerance: 8, maxChangedFraction: 1 };
      const frac = (r: ReturnType<typeof comparePng>): number =>
        'changedFraction' in r && typeof r.changedFraction === 'number' ? r.changedFraction : 0;
      const vh = frac(comparePng(shown, hiddenA, opts));
      const hh = frac(comparePng(hiddenB, hiddenA, opts));
      if (vh - hh > best.visibleVsHidden - best.hiddenVsHidden) {
        best = { visibleVsHidden: vh, hiddenVsHidden: hh };
        bestShot = shown;
      }
      if (vh > hh && vh > 0.001) break;
    }
    console.log(`[293] screenshot sanity: visible-vs-hidden=${best.visibleVsHidden.toFixed(4)} hidden-vs-hidden=${best.hiddenVsHidden.toFixed(4)}`);
    if (bestShot) await testInfo.attach('raiders-visible (non-golden)', { body: bestShot, contentType: 'image/png' });
    expect(best.visibleVsHidden).toBeGreaterThan(best.hiddenVsHidden);
    await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.debugSetRaiderMeshesVisible(true));
    await nextFrames(page);
    s = await state(page);
    expect(s.visible).toBe(true);
    expect(s.meshes.every((m) => m.visible)).toBe(true);

    // Death: one raid raider killed → its group is removed.
    const victim = waveIds[0]!;
    const killed = await page.evaluate(
      (id) => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.debugDamageRaidEntity(id, 10_000),
      victim,
    );
    expect(killed).toBe(true);
    s = await settled(page);
    assertMatches(s);
    expect(s.meshes.some((m) => m.key === `raid:${victim}`)).toBe(false);
    expect(s.meshes.filter((m) => m.key.startsWith('patrol:'))).toHaveLength(patrol.memberIds.length);

    // A new raid start dismisses the patrol and replaces the wave.
    await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.debugStartRaid(1));
    const patrolAfter = await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.getPatrolState());
    expect(patrolAfter?.memberIds ?? []).toEqual([]);
    s = await settled(page);
    assertMatches(s);
    expect(s.meshes.filter((m) => m.key.startsWith('patrol:'))).toEqual([]);
    const wave2 = await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.getRaidWaveEntityIds());
    expect(s.meshes.map((m) => m.key).sort()).toEqual(wave2.map((id) => `raid:${id}`).sort());

    // Raid end: clear waves until VICTORY → no raider groups remain.
    let status = 'ACTIVE';
    for (let i = 0; i < 20 && status === 'ACTIVE'; i++) {
      const r = await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.debugClearRaidWave());
      status = r?.status ?? 'NONE';
      s = await settled(page);
      assertMatches(s);
    }
    expect(status).toBe('VICTORY');
    s = await settled(page);
    expect(s.expected).toEqual([]);
    expect(s.meshes).toEqual([]);
    expect(s.sceneRaiderGroups).toBe(0);

    // Dispose with live raiders: a fresh patrol, then dispose removes everything.
    await spawnPatrol(page);
    s = await settled(page);
    expect(s.meshes.length).toBeGreaterThan(0);
    const after = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      g.dispose();
      return g.getRaiderRenderState();
    });
    expect(after.meshes).toEqual([]);
    expect(after.expected).toEqual([]);
    expect(after.sceneRaiderGroups).toBe(0);
  });
});
