import { test, expect, type Page } from '@playwright/test';

type GameHandle = {
  debugSpawnWither(x: number, y: number, z: number): number;
  debugActivateWither(id: number): boolean;
  damageWitherById(id: number, amount: number, isProjectile?: boolean): boolean;
  getPlayerPosition(): [number, number, number];
};

async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { __voxelGame?: unknown }).__voxelGame, null, {
    timeout: 120_000,
  });
}

test.describe('boss bar hud parity (276)', () => {
  test('spawn shows bar; damage shrinks fill; defeat hides', async ({ page }) => {
    await page.goto('/');
    await waitForGame(page);

    const id = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const [x, y, z] = g.getPlayerPosition();
      const witherId = g.debugSpawnWither(x + 2, y, z);
      g.debugActivateWither(witherId);
      return witherId;
    });
    expect(id).toBeGreaterThan(0);

    await page.waitForFunction(() => {
      const el = document.getElementById('wither-boss-bar');
      return !!el && el.classList.contains('visible');
    }, null, { timeout: 15_000 });

    const widthBefore = await page.evaluate(() => {
      const fill = document.getElementById('wither-boss-bar-fill') as HTMLElement | null;
      return parseInt(fill?.style.width || '0', 10);
    });
    expect(widthBefore).toBeGreaterThan(0);

    await page.evaluate((witherId) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      for (let i = 0; i < 8; i++) g.damageWitherById(witherId, 40, false);
    }, id);

    const widthAfter = await page.evaluate(() => {
      const fill = document.getElementById('wither-boss-bar-fill') as HTMLElement | null;
      return parseInt(fill?.style.width || '0', 10);
    });
    expect(widthAfter).toBeLessThan(widthBefore);

    await page.evaluate((witherId) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      for (let i = 0; i < 40; i++) g.damageWitherById(witherId, 50, false);
    }, id);

    await page.waitForFunction(() => {
      const el = document.getElementById('wither-boss-bar');
      return !!el && !el.classList.contains('visible');
    }, null, { timeout: 15_000 });
  });
});
