import { test, expect, type Page } from '@playwright/test';

/**
 * Live statistics panel journey (271) over the VERIFIED headless
 * StatisticsFramework (187) + StatisticsView rows.
 *
 * Drives the REAL production artifact through the player loop: real walking
 * (KeyW), a real jump (Space), a real mined block (hold-mine through the
 * interaction choke), and a deterministic death (`debugKillPlayer`, 267
 * seam) bump the world-scoped store; the panel opens via `H` and the HUD
 * chip with all 7 labeled rows; closing persists; a page reload restores
 * every counter field-for-field through `__statistics__`. The `__voxelGame`
 * handle is used only for seam triggers and read-only observation — every
 * panel action under test goes through real DOM/keyboard input.
 */

type StatSnapshot = {
  walk_distance: number;
  mob_kills: number;
  blocks_broken: number;
  deaths: number;
  time_played: number;
  damage_taken: number;
  jumps: number;
};

type RowView = {
  key: string;
  label: string;
  value: number;
  valueText: string;
};

type GameHandle = {
  isStatisticsOpen(): boolean;
  getStatisticsSnapshot(): StatSnapshot;
  listStatisticRows(): RowView[];
  debugKillPlayer(): void;
};

const ROW_KEYS = [
  'walk_distance',
  'mob_kills',
  'blocks_broken',
  'deaths',
  'time_played',
  'damage_taken',
  'jumps',
];

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
}

async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(() => document.pointerLockElement !== null, { timeout: 5000 });
  await page.waitForFunction(
    () =>
      (window as unknown as { __voxelGame?: { inputHandle?: { isLocked(): boolean } } }).__voxelGame?.inputHandle?.isLocked?.() === true,
    { timeout: 5000 },
  );
}

function game(page: Page) {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame handle');
    return {
      open: g.isStatisticsOpen(),
      snapshot: g.getStatisticsSnapshot(),
      rows: g.listStatisticRows(),
    };
  });
}

async function snapshot(page: Page): Promise<StatSnapshot> {
  return (await game(page)).snapshot;
}

async function openPanelViaKey(page: Page): Promise<void> {
  await page.keyboard.press('h');
  await expect(page.locator('#statistics:not(.hidden)')).toBeVisible();
}

async function openPanelViaChip(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await expect(page.locator('#statistics-open')).toBeVisible();
  await page.evaluate(() => {
    (document.querySelector('#statistics-open') as HTMLButtonElement | null)?.click();
  });
  await expect(page.locator('#statistics:not(.hidden)')).toBeVisible();
}

async function closePanel(page: Page): Promise<void> {
  await page.click('#statistics-close');
  await expect(page.locator('#statistics.hidden')).toBeAttached();
}

test.describe('live statistics journey (271)', () => {
  test('walk/jump/break bump stats → panel shows them → reload persists', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    await enterPointerLock(page);
    const before = await snapshot(page);

    // ── Real walk: hold KeyW until the counter moves ──
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      (prev) => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        return (g?.getStatisticsSnapshot().walk_distance ?? 0) > prev;
      },
      before.walk_distance,
      { timeout: 30_000 },
    );
    await page.keyboard.up('KeyW');

    // ── Real jump: settle onto the ground first (the blind walk above can
    // end mid-fall), then hold Space until the impulse lands (a tap can fall
    // between frames at headless ~5 FPS; game.spec holds keys the same way) ──
    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: { player?: { onGround: boolean } } }).__voxelGame;
      return g?.player?.onGround === true;
    }, { timeout: 20_000 });
    await page.keyboard.down('Space');
    await page.waitForFunction(
      (prev) => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        return (g?.getStatisticsSnapshot().jumps ?? 0) > prev;
      },
      before.jumps,
      { timeout: 15_000 },
    );
    await page.keyboard.up('Space');

    // ── Real break: aim down at the terrain and hold-mine (game.spec pattern) ──
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { player: { pitch: number } } }).__voxelGame;
      if (g) g.player.pitch = -1.0;
    });
    let target: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(100);
      target = await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: { interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null } } }).__voxelGame;
        const t = g?.interaction?.getTarget();
        return t ? { x: t.blockX, y: t.blockY, z: t.blockZ } : null;
      });
      if (target) break;
    }
    expect(target).not.toBeNull();
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    });
    await page.waitForFunction((t) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return (g?.world?.getBlock(t.x, t.y, t.z) ?? -1) === 0;
    }, target!, { timeout: 15_000 });
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    });

    const afterActions = await snapshot(page);
    expect(afterActions.walk_distance).toBeGreaterThan(before.walk_distance);
    expect(afterActions.jumps).toBeGreaterThan(before.jumps);
    expect(afterActions.blocks_broken).toBeGreaterThan(before.blocks_broken);
    expect(afterActions.time_played).toBeGreaterThan(before.time_played);

    // ── The panel opens via H with 7 labeled rows showing live values ──
    await openPanelViaKey(page);
    const seen = (await game(page)).rows;
    expect(seen.map((r) => r.key)).toEqual(ROW_KEYS);
    expect(seen.map((r) => r.label)).toEqual([
      'Distance Walked',
      'Mob Kills',
      'Blocks Mined',
      'Deaths',
      'Time Played',
      'Damage Taken',
      'Jumps',
    ]);
    for (const key of ROW_KEYS) {
      await expect(page.locator(`[data-statistic-row="${key}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-statistic-row="walk_distance"]')).toContainText(
      `${afterActions.walk_distance} m`,
    );
    await expect(page.locator('#statistics-status')).toContainText('7 statistics,');
    await closePanel(page);

    // ── Deterministic death bumps deaths and persists immediately ──
    await page.evaluate(() => {
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.debugKillPlayer();
    });
    await page.waitForFunction((prev) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return (g?.getStatisticsSnapshot().deaths ?? 0) === prev + 1;
    }, afterActions.deaths, { timeout: 15_000 });

    // ── Reload preserves every counter field-for-field (pagehide flush +
    // settle, hardcore 76-80 pattern) ──
    const beforeReload = await snapshot(page);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForGame(page);
    expect(await snapshot(page)).toEqual(beforeReload);
    await openPanelViaChip(page);
    await expect(page.locator('[data-statistic-row="walk_distance"]')).toContainText(
      `${beforeReload.walk_distance} m`,
    );
    await expect(page.locator('#statistics-status')).toContainText('7 statistics,');
    await closePanel(page);
  });
});

test.describe('statistics lifecycle (271)', () => {
  test('H toggles, close button, C closes, chip one-container, blur keeps, no double', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    await enterPointerLock(page);

    // H opens; H closes with the overlay returned.
    await openPanelViaKey(page);
    await page.keyboard.press('h');
    await expect(page.locator('#statistics.hidden')).toBeAttached();
    await expect(page.locator('#overlay:not(.hidden)')).toBeVisible();

    // Reopen; C closes the panel instead of stacking crafting.
    await openPanelViaKey(page);
    await page.keyboard.press('c');
    await expect(page.locator('#statistics.hidden')).toBeAttached();
    await expect(page.locator('#crafting.hidden')).toBeAttached();

    // Opening crafting, then the HUD chip, closes crafting (one container).
    await page.keyboard.press('c');
    await expect(page.locator('#crafting:not(.hidden)')).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('#statistics-open') as HTMLButtonElement | null)?.click();
    });
    await expect(page.locator('#statistics:not(.hidden)')).toBeVisible();
    await expect(page.locator('#crafting.hidden')).toBeAttached();

    // Blur keeps the panel open exactly once (no stacking).
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(500);
    await expect(page.locator('#statistics:not(.hidden)')).toBeVisible();

    // Closing settles (overlay returned); reopening shows the same 7 rows.
    await closePanel(page);
    await expect(page.locator('#overlay:not(.hidden)')).toBeVisible();
    await openPanelViaChip(page);
    expect((await game(page)).rows.map((r) => r.key)).toEqual(ROW_KEYS);
    await closePanel(page);
  });
});
