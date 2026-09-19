import { test, expect, type Page } from '@playwright/test';

/** Live death/respawn presentation coverage (280). */

type DeathView = {
  open: boolean;
  cause: string;
  outcome: 'respawned' | 'spectating' | null;
  actionLabel: string;
};

type GameHandle = {
  debugKillPlayer(): void;
  getDeathPresentationState(): DeathView;
  dismissDeathScreen(): boolean;
  getGameMode(): string;
  setHardcore(enabled: boolean): boolean;
};

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null,
    null,
    { timeout: 120_000 },
  );
}

async function deathState(page: Page): Promise<DeathView> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame handle');
    return g.getDeathPresentationState();
  });
}

async function waitForDeathCard(page: Page): Promise<void> {
  await expect(page.locator('#death-screen')).not.toHaveClass(/hidden/);
  await expect(page.locator('#death-cause')).not.toBeEmpty();
  await expect(page.locator('#death-outcome')).not.toBeEmpty();
}

test.describe('live death and respawn presentation (280)', () => {
  test('normal death shows a safe cause/outcome card and dismisses idempotently', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.debugKillPlayer();
    });
    await waitForDeathCard(page);
    await expect(page.locator('#death-cause')).toHaveText('Cause: Debug damage');
    await expect(page.locator('#death-outcome')).toHaveText('Respawned safely');
    await expect(page.locator('#death-continue')).toHaveText('Continue');
    expect(await deathState(page)).toEqual({
      open: true,
      cause: 'Debug damage',
      outcome: 'respawned',
      actionLabel: 'Continue',
    });

    await page.click('#death-continue');
    await expect(page.locator('#death-screen.hidden')).toBeAttached();
    expect(
      await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        return g?.dismissDeathScreen();
      }),
    ).toBe(false);
    expect(await deathState(page)).toMatchObject({
      open: false,
      outcome: 'respawned',
    });
  });

  test('hardcore death keeps spectator mode and labels the card accordingly', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    expect(
      await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        return g?.setHardcore(true);
      }),
    ).toBe(true);

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.debugKillPlayer();
    });
    await waitForDeathCard(page);
    await expect(page.locator('#death-cause')).toHaveText('Cause: Debug damage');
    await expect(page.locator('#death-outcome')).toHaveText('Hardcore death — now spectating');
    await expect(page.locator('#death-continue')).toHaveText('Continue spectating');
    await page.waitForFunction(
      () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getGameMode() === 'spectator',
    );
    expect(await deathState(page)).toMatchObject({
      open: true,
      outcome: 'spectating',
    });

    await page.click('#death-continue');
    await expect(page.locator('#death-screen.hidden')).toBeAttached();
    expect(
      await page.evaluate(() => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getGameMode()),
    ).toBe('spectator');
  });
});
