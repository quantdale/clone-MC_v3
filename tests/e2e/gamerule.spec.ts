import { test, expect, type Page } from '@playwright/test';

/**
 * Live gamerule settings journey (261, closes the C252/MP-19.4-1
 * "mobGriefing seam not wired to UI" debt).
 *
 * Drives the REAL production artifact through the player loop: open the
 * settings with G, see all nine registered rules, toggle mobGriefing through
 * a real DOM click, prove invalid integer text is a no-op, survive a page
 * reload via the world save path, and observe the deterministic explosion
 * contrast (spared with mobGriefing=false, destroyed with =true) through the
 * public `applyWitherExplosion` choke point. The `__voxelGame` handle is used
 * only for world setup and read-only observation — every rule edit under test
 * goes through real DOM clicks.
 */

const STONE = 3;
const BLAST_STRENGTH = 7;

type GameHandle = {
  getGameRules(): Record<string, boolean | number | string>;
  isGameruleOpen(): boolean;
  applyWitherExplosion(center: readonly [number, number, number], strength: number): void;
  world?: {
    getBlock(x: number, y: number, z: number): number;
    setBlock(x: number, y: number, z: number, id: number): void;
  };
  player?: { position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void } };
  survival?: { health: number };
};

async function game(page: Page): Promise<GameHandle> {
  return (await page.evaluate(() => {
    return (window as unknown as { __voxelGame?: object }).__voxelGame;
  })) as unknown as GameHandle;
}

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
}

async function gameruleValue(page: Page, key: string): Promise<boolean | number | string | undefined> {
  return page.evaluate((k) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.getGameRules()[k];
  }, key);
}

/** Build a 5x5 stone platform; returns its block list + blast center. */
async function buildPlatform(
  page: Page,
): Promise<{ cells: Array<[number, number, number]>; center: [number, number, number] }> {
  return page.evaluate(({ stone }) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    const px = Math.floor(g?.player?.position.x ?? 0) + 8;
    const py = Math.floor(g?.player?.position.y ?? 64) + 1;
    const pz = Math.floor(g?.player?.position.z ?? 0) + 8;
    const cells: Array<[number, number, number]> = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        g?.world?.setBlock(px + dx, py, pz + dz, stone);
        cells.push([px + dx, py, pz + dz]);
      }
    }
    return { cells, center: [px + 0.5, py + 0.5, pz + 0.5] as [number, number, number] };
  }, { stone: STONE });
}

async function countStone(page: Page, cells: Array<[number, number, number]>): Promise<number> {
  return page.evaluate((list) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    let n = 0;
    for (const [x, y, z] of list) {
      if (g?.world?.getBlock(x, y, z) === 3) n++;
    }
    return n;
  }, cells);
}

async function blastAndCount(
  page: Page,
  cells: Array<[number, number, number]>,
  center: [number, number, number],
): Promise<number> {
  return page.evaluate(
    ({ list, at, strength }) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.applyWitherExplosion(at, strength);
      let n = 0;
      for (const [x, y, z] of list) {
        if (g?.world?.getBlock(x, y, z) === 3) n++;
      }
      return n;
    },
    { list: cells, at: center, strength: BLAST_STRENGTH },
  );
}

test.describe('live gamerule settings journey (261)', () => {
  test('open → toggle mobGriefing → persist reload → explosion contrast', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);

    // ── Open with G: all nine registered rules render at defaults ──────
    await page.keyboard.press('g');
    await expect(page.locator('#gamerule:not(.hidden)')).toBeVisible();
    expect(await page.locator('#gamerule-rows > div').count()).toBe(9);
    expect(await gameruleValue(page, 'mobGriefing')).toBe(true);
    expect(await gameruleValue(page, 'randomTickSpeed')).toBe(3);
    expect(await gameruleValue(page, 'doFireTick')).toBe(true);

    // ── Real-click toggle off ───────────────────────────────────────────
    await page.click('#gamerule-toggle-mobGriefing');
    await expect(page.locator('#gamerule-toggle-mobGriefing')).toHaveAttribute('aria-pressed', 'false');
    expect(await gameruleValue(page, 'mobGriefing')).toBe(false);
    await expect(page.locator('#gamerule-status')).toContainText('mobGriefing set to false.');

    // ── Invalid integer text is a no-op with status ─────────────────────
    await page.evaluate(() => {
      const input = document.querySelector('#gamerule-input-randomTickSpeed') as HTMLInputElement | null;
      if (!input) throw new Error('missing randomTickSpeed input');
      input.value = 'abc';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(await gameruleValue(page, 'randomTickSpeed')).toBe(3);
    await expect(page.locator('#gamerule-status')).toContainText(
      `randomTickSpeed:`,
    );
    await expect(page.locator('#gamerule-status')).toContainText(`is not a valid value`);

    // ── Persist across reload ───────────────────────────────────────────
    await page.keyboard.press('g');
    await expect(page.locator('#gamerule.hidden')).toBeAttached();
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForGame(page);
    expect(await gameruleValue(page, 'mobGriefing')).toBe(false);
    expect(await gameruleValue(page, 'randomTickSpeed')).toBe(3);

    // ── Effect observable: blast spares the platform while false ────────
    const first = await buildPlatform(page);
    expect(await countStone(page, first.cells)).toBe(25);
    expect(await blastAndCount(page, first.cells, first.center)).toBe(25);

    // ── Contrast: real-click toggle on, blast destroys ──────────────────
    await page.keyboard.press('g');
    await page.click('#gamerule-toggle-mobGriefing');
    await expect(page.locator('#gamerule-toggle-mobGriefing')).toHaveAttribute('aria-pressed', 'true');
    const second = await buildPlatform(page);
    const survivors = await blastAndCount(page, second.cells, second.center);
    expect(survivors).toBeLessThan(25);

    // ── Leave the world at defaults for a clean handoff ─────────────────
    await page.keyboard.press('g');
    await page.waitForTimeout(1000);
  });

  test('player blast damage is independent of mobGriefing', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);

    async function blastDamageAtFixedRange(griefing: boolean): Promise<number> {
      return page.evaluate(
        ({ grief, strength }) => {
          const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
          if (!g?.player || !g.survival) throw new Error('no player');
          // Pin the player 13 blocks from the blast (damage 3, no death).
          g.player.position.set(100.5, 70.5, 100.5);
          (g as unknown as { setGameRule(k: string, v: boolean): boolean }).setGameRule(
            'mobGriefing',
            grief,
          );
          const before = g.survival.health;
          g.applyWitherExplosion([113.5, 70.5, 100.5], strength);
          const dealt = before - g.survival.health;
          // SurvivalSystem.damage grants 0.55s i-frames (decayed by ticks,
          // which are paused here); reset the documented field so the second
          // blast measures the same mechanic instead of the i-frame gate.
          (g.survival as unknown as { invulnerability: number }).invulnerability = 0;
          return dealt;
        },
        { grief: griefing, strength: BLAST_STRENGTH },
      );
    }

    const withoutGrief = await blastDamageAtFixedRange(false);
    const withGrief = await blastDamageAtFixedRange(true);
    expect(withoutGrief).toBeGreaterThan(0);
    expect(withGrief).toBe(withoutGrief);
  });
});

test.describe('gamerule panel lifecycle (261)', () => {
  test('G toggles, C closes, HUD button opens, blur keeps unstacked', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    const g = await game(page);
    expect(g).toBeTruthy();

    // HUD button opens (pointer lock routes raw mouse input to the canvas,
    // so the click goes through the wired listener directly; visibility
    // proves discoverability during locked play).
    await page.click('#game-canvas');
    await expect(page.locator('#gamerule-open')).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('#gamerule-open') as HTMLButtonElement | null)?.click();
    });
    await expect(page.locator('#gamerule:not(.hidden)')).toBeVisible();

    // G closes.
    await page.keyboard.press('g');
    await expect(page.locator('#gamerule.hidden')).toBeAttached();

    // G opens again; C closes the settings instead of stacking crafting.
    await page.keyboard.press('g');
    await expect(page.locator('#gamerule:not(.hidden)')).toBeVisible();
    await page.keyboard.press('c');
    await expect(page.locator('#gamerule.hidden')).toBeAttached();
    await expect(page.locator('#crafting.hidden')).toBeAttached();

    // Reopen via the HUD button itself (re-lock for HUD visibility).
    await page.click('#game-canvas');
    await expect(page.locator('#gamerule-open')).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('#gamerule-open') as HTMLButtonElement | null)?.click();
    });
    await expect(page.locator('#gamerule:not(.hidden)')).toBeVisible();

    // Blur keeps the panel open exactly once (no stacking, no overlay trap).
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(500);
    await expect(page.locator('#gamerule:not(.hidden)')).toBeVisible();

    // Close button returns the overlay.
    await page.click('#gamerule-close');
    await expect(page.locator('#gamerule.hidden')).toBeAttached();
  });
});
