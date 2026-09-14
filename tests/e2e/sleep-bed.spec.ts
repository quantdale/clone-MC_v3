import { test, expect, type Page } from '@playwright/test';

/**
 * Live sleep / bed integration (274) over the VERIFIED SleepFramework (198).
 *
 * Places a bed via world.setBlock, drives night/day with debugFreezeClock +
 * debugSetTimeOfDay, exercises useBedAt (enter/leave/occupied/daytime), HUD
 * #sleep-indicator, pagehide+reload wake-on-boot persistence, and bed-aware
 * respawn after debugKillPlayer. __voxelGame seams only.
 */

const BED_BLOCK_ID = 63;
const NIGHT_TICK = 13000;
const DAY_TICK = 1000;

type SleepStateView = {
  sleeping: boolean;
  spawnSet: boolean;
  spawn: readonly [number, number, number] | [number, number, number];
};

type GameHandle = {
  getSleepState(): SleepStateView;
  useBedAt(x: number, y: number, z: number, occupied?: boolean): { ok: boolean; reason?: string };
  debugSetTimeOfDay(tick: number): void;
  debugGetTimeOfDay(): number;
  debugFreezeClock(): void;
  debugKillPlayer(): void;
  getPlayerPosition(): [number, number, number];
  getGameMode(): string;
  setHardcore(enabled: boolean): boolean;
  player: { position: { x: number; y: number; z: number } };
  world: {
    setBlock(x: number, y: number, z: number, id: number): void;
    getMotionBlockingHeight(x: number, z: number): number;
  };
};

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(() => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null, null, {
    timeout: 120_000,
  });
}

async function sleepState(page: Page): Promise<SleepStateView> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame');
    const s = g.getSleepState();
    return {
      sleeping: s.sleeping,
      spawnSet: s.spawnSet,
      spawn: [s.spawn[0], s.spawn[1], s.spawn[2]] as [number, number, number],
    };
  });
}

async function placeBedNearPlayer(page: Page): Promise<{ x: number; y: number; z: number }> {
  return page.evaluate((bedId) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame');
    const [px, , pz] = g.getPlayerPosition();
    const x = Math.floor(px) + 2;
    const z = Math.floor(pz);
    const surface = g.world.getMotionBlockingHeight(x, z);
    // Place in the air cell above the solid surface (Minecraft bed placement).
    // Replacing the surface solid with a non-solid bed hollows support and can
    // soft-lock reload via no-safe-spawn-support.
    const y = Math.max(1, surface + 1);
    g.world.setBlock(x, y, z, bedId);
    return { x, y, z };
  }, BED_BLOCK_ID);
}

async function reloadPersist(page: Page): Promise<void> {
  // pagehide drains autosave (265/267 precedent); prefer goto('/') over reload()
  // so a second full boot gets a clean document (avoids overlay stall flakes).
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.waitForTimeout(2500);
  await waitForGame(page);
}

async function waitForToast(page: Page, fragment: string, timeoutMs = 10_000): Promise<void> {
  await page.waitForFunction(
    (f) => (document.querySelector('#toast')?.textContent ?? '').includes(f) === true,
    fragment,
    { timeout: timeoutMs },
  );
}

async function sleepingReload(page: Page): Promise<void> {
  // The pagehide handler persists the current (sleeping) state; the boot then
  // forces sleeping false and keeps the spawn (wake-on-boot, I-5).
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.waitForTimeout(2500);
  await waitForGame(page);
}

test.describe('live sleep bed integration (274)', () => {
  test('night enter → leave keeps spawn → occupied/daytime refuse → reload + respawn', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    // Defaults: awake, no spawn, indicator hidden.
    expect(await sleepState(page)).toMatchObject({ sleeping: false, spawnSet: false });
    await expect(page.locator('#sleep-indicator.hidden')).toBeAttached();

    const bed = await placeBedNearPlayer(page);

    // Freeze clock so night skip lands deterministically, then go to night.
    await page.evaluate((tick) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.debugFreezeClock();
      g?.debugSetTimeOfDay(tick);
    }, NIGHT_TICK);
    expect(
      await page.evaluate(() => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugGetTimeOfDay()),
    ).toBe(NIGHT_TICK);

    // Daytime refuse first (flip to day) — no mutation.
    await page.evaluate((tick) => {
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugSetTimeOfDay(tick);
    }, DAY_TICK);
    const dayRefuse = await page.evaluate((b) => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.useBedAt(b.x, b.y, b.z);
    }, bed);
    expect(dayRefuse).toEqual({ ok: false, reason: 'daytime' });
    expect(await sleepState(page)).toMatchObject({ sleeping: false, spawnSet: false });

    // Back to night; occupied refuse — no mutation.
    await page.evaluate((tick) => {
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugSetTimeOfDay(tick);
    }, NIGHT_TICK);
    const occRefuse = await page.evaluate((b) => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.useBedAt(b.x, b.y, b.z, true);
    }, bed);
    expect(occRefuse).toEqual({ ok: false, reason: 'occupied' });
    expect(await sleepState(page)).toMatchObject({ sleeping: false, spawnSet: false });

    // Successful night enter: sleeping + spawn + indicator + morning skip.
    const enter = await page.evaluate((b) => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.useBedAt(b.x, b.y, b.z);
    }, bed);
    expect(enter).toEqual({ ok: true });
    await waitForToast(page, 'You set your spawn point.');
    const afterEnter = await sleepState(page);
    expect(afterEnter.sleeping).toBe(true);
    expect(afterEnter.spawnSet).toBe(true);
    expect(afterEnter.spawn).toEqual([bed.x, bed.y, bed.z]);
    await expect(page.locator('#sleep-indicator.hidden')).not.toBeAttached();
    expect(
      await page.evaluate(() => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugGetTimeOfDay()),
    ).toBe(0);

    // Leave same bed (morning): awake, spawn kept, indicator hidden.
    const leave = await page.evaluate((b) => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.useBedAt(b.x, b.y, b.z);
    }, bed);
    expect(leave).toEqual({ ok: true });
    const afterLeave = await sleepState(page);
    expect(afterLeave.sleeping).toBe(false);
    expect(afterLeave.spawnSet).toBe(true);
    expect(afterLeave.spawn).toEqual([bed.x, bed.y, bed.z]);
    await expect(page.locator('#sleep-indicator.hidden')).toBeAttached();

    // Reload: wake-on-boot (sleeping false) keeps spawn.
    await reloadPersist(page);
    const afterReload = await sleepState(page);
    expect(afterReload.sleeping).toBe(false);
    expect(afterReload.spawnSet).toBe(true);
    expect(afterReload.spawn).toEqual([bed.x, bed.y, bed.z]);

    // Move far away, die, respawn near bed column (not world spawn far away).
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { player?: { position: { x: number; y: number; z: number } } };
      }).__voxelGame;
      if (g?.player) {
        g.player.position.x += 80;
        g.player.position.z += 80;
      }
    });
    const far = await page.evaluate(() => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.getPlayerPosition();
    });
    expect(Math.hypot(far[0] - bed.x, far[2] - bed.z)).toBeGreaterThan(40);

    await page.evaluate(() => {
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugKillPlayer();
    });
    await page.waitForFunction(
      (b) => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        if (!g) return false;
        const [x, , z] = g.getPlayerPosition();
        return Math.hypot(x - b.x, z - b.z) < 16;
      },
      bed,
      { timeout: 30_000 },
    );
    const near = await page.evaluate(() => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.getPlayerPosition();
    });
    expect(Math.hypot(near[0] - bed.x, near[2] - bed.z)).toBeLessThan(16);
  });

  test('no bed: death respawns at the world spawn (spawnSet stays false)', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    expect(await sleepState(page)).toMatchObject({ sleeping: false, spawnSet: false });
    // Fresh world: the boot player position is the world spawn; death with no
    // bed must land back exactly there (pre-274 behavior).
    const boot = await page.evaluate(() => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.getPlayerPosition();
    });
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.player.position.x += 80;
      g.player.position.z += 80;
    });
    await page.evaluate(() => {
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugKillPlayer();
    });
    // Respawn is synchronous with the death; assert before the world tick can drift.
    const after = await page.evaluate(() => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.getPlayerPosition();
    });
    expect(Math.hypot(after[0] - boot[0], after[2] - boot[2])).toBeLessThan(2);
    expect(await sleepState(page)).toMatchObject({ sleeping: false, spawnSet: false });
  });

  test('hardcore + bed spawn: death goes spectator (267) and resets at the bed column', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    const bed = await placeBedNearPlayer(page);
    await page.evaluate((tick) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.debugFreezeClock();
      g?.debugSetTimeOfDay(tick);
    }, NIGHT_TICK);
    const enter = await page.evaluate((b) => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.useBedAt(b.x, b.y, b.z);
    }, bed);
    expect(enter).toEqual({ ok: true });
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setHardcore(true);
    });
    await page.evaluate(() => {
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugKillPlayer();
    });
    // 267 routing: permanent death lands in spectator (mode is async).
    await page.waitForFunction(() => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getGameMode() === 'spectator';
    }, null, { timeout: 30_000 });
    const after = await page.evaluate(() => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.getPlayerPosition();
    });
    expect(Math.hypot(after[0] - bed.x, after[2] - bed.z)).toBeLessThan(16);
    expect(await sleepState(page)).toMatchObject({ spawnSet: true });
  });

  test('reload while sleeping boots awake with the spawn kept (wake-on-boot)', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    const bed = await placeBedNearPlayer(page);
    await page.evaluate((tick) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.debugFreezeClock();
      g?.debugSetTimeOfDay(tick);
    }, NIGHT_TICK);
    const enter = await page.evaluate((b) => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.useBedAt(b.x, b.y, b.z);
    }, bed);
    expect(enter).toEqual({ ok: true });
    expect((await sleepState(page)).sleeping).toBe(true);
    await sleepingReload(page);
    const after = await sleepState(page);
    expect(after.sleeping).toBe(false);
    expect(after.spawnSet).toBe(true);
    expect(after.spawn).toEqual([bed.x, bed.y, bed.z]);
  });
});
