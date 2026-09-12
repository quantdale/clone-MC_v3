import { test, expect, type Page } from '@playwright/test';

/**
 * Live hardcore-mode integration (267) over the VERIFIED headless
 * HardcoreFramework (193) and WorldDifficulty (188), alongside the VERIFIED
 * 265/266 mode wiring.
 *
 * Drives the REAL production artifact: defaults off/normal/survival; a
 * configured difficulty with the hardcore lock forcing effective hard;
 * deterministic death via the `debugKillPlayer` seam landing in spectator
 * with the hardcore toast; repeated deaths never returning to survival;
 * reload persisting hardcore + spectator + hard; and a normal world still
 * respawning in survival. The `__voxelGame` handle is used only for store
 * seams and read-only observation — the settings toggle/select go through
 * real DOM and persistence through `pagehide` + reload (265 precedent).
 */

type GameHandle = {
  getGameMode(): string;
  setGameModeFromText(text: string): boolean;
  isHardcore(): boolean;
  setHardcore(enabled: boolean): boolean;
  getDifficulty(): string;
  getConfiguredDifficulty(): string;
  setDifficultyFromText(text: string): boolean;
  debugKillPlayer(): void;
  isGameruleOpen(): boolean;
};

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
}

function game(page: Page): PromiseExposed {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame handle');
    return {
      mode: g.getGameMode(),
      hardcore: g.isHardcore(),
      difficulty: g.getDifficulty(),
      configured: g.getConfiguredDifficulty(),
    };
  });
}

type PromiseExposed = Promise<{ mode: string; hardcore: boolean; difficulty: string; configured: string }>;

async function waitForMode(page: Page, mode: string, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction((m) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.getGameMode() === m;
  }, mode, { timeout: timeoutMs });
}

async function health(page: Page): Promise<number> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: { survival?: { health: number } } })
      .__voxelGame;
    return g?.survival?.health ?? -1;
  });
}

async function toastText(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('#toast')?.textContent ?? '');
}

async function waitForToast(page: Page, fragment: string, timeoutMs = 10_000): Promise<void> {
  await page.waitForFunction((f) => document.querySelector('#toast')?.textContent?.includes(f) === true, fragment, {
    timeout: timeoutMs,
  });
}

async function reload(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.waitForTimeout(1500);
  await page.reload();
  await waitForGame(page);
}

test.describe('hardcore death and difficulty lock (267)', () => {
  test('enable hardcore → die → spectator-locked with hard difficulty, reload persists', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    // Defaults: off / normal / survival, badge hidden, controls synced.
    expect(await game(page)).toEqual({
      mode: 'survival',
      hardcore: false,
      difficulty: 'normal',
      configured: 'normal',
    });
    await expect(page.locator('#hardcore-badge.hidden')).toBeAttached();
    await expect(page.locator('#hardcore-toggle')).toHaveText('false');
    await expect(page.locator('#difficulty-select')).toHaveValue('normal');
    await expect(page.locator('#difficulty-select')).toBeEnabled();

    // Configure easy, then enable hardcore: the lock forces effective hard
    // while the configured level is preserved underneath.
    expect(
      await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        return g?.setDifficultyFromText('easy');
      }),
    ).toBe(true);
    expect((await game(page)).difficulty).toBe('easy');
    expect(
      await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        return g?.setHardcore(true);
      }),
    ).toBe(true);
    expect(await game(page)).toEqual({
      mode: 'survival',
      hardcore: true,
      difficulty: 'hard',
      configured: 'easy',
    });

    // Locked edits are refused without mutation.
    expect(
      await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        return g?.setDifficultyFromText('normal');
      }),
    ).toBe(false);
    expect(await game(page)).toEqual({
      mode: 'survival',
      hardcore: true,
      difficulty: 'hard',
      configured: 'easy',
    });
    // The badge state tracks the store at the class level; it becomes
    // actually visible once the HUD is up (first canvas click).
    await expect(page.locator('#hardcore-badge')).not.toHaveClass(/hidden/);
    await page.click('#game-canvas');
    await expect(page.locator('#hardcore-badge:not(.hidden)')).toBeVisible();
    await expect(page.locator('#hardcore-toggle')).toHaveText('true');
    await expect(page.locator('#difficulty-select')).toBeDisabled();

    // Death forces permanent death: spectator with the hardcore toast, vitals reset.
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.debugKillPlayer();
    });
    await waitForMode(page, 'spectator');
    await waitForToast(page, 'now spectating');
    expect(await health(page)).toBe(20);
    expect(await game(page)).toEqual({
      mode: 'spectator',
      hardcore: true,
      difficulty: 'hard',
      configured: 'easy',
    });
    await expect(page.locator('#gamemode-toggle')).toContainText('Mode: Spectator');

    // Normal respawn can never return a hardcore spectator to survival: a
    // second death keeps spectator (the death path owns the mode).
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.debugKillPlayer();
    });
    await page.waitForTimeout(1000);
    expect((await game(page)).mode).toBe('spectator');

    // Reload persists hardcore + spectator + the lock.
    await reload(page);
    await page.click('#game-canvas');
    expect(await game(page)).toEqual({
      mode: 'spectator',
      hardcore: true,
      difficulty: 'hard',
      configured: 'easy',
    });
    await expect(page.locator('#hardcore-badge:not(.hidden)')).toBeVisible();
    await expect(page.locator('#difficulty-select')).toBeDisabled();
  });
});

test.describe('normal world contrast and settings DOM (267)', () => {
  test('normal death respawns in survival; settings toggle/select work through real DOM', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    expect((await game(page)).hardcore).toBe(false);

    // Normal death: still survival with the normal respawn toast.
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.debugKillPlayer();
    });
    await page.waitForTimeout(1000);
    expect(await game(page)).toEqual({
      mode: 'survival',
      hardcore: false,
      difficulty: 'normal',
      configured: 'normal',
    });
    expect(await health(page)).toBe(20);
    await waitForToast(page, 'Respawned at spawn');

    // Settings section through real DOM: select a difficulty, toggle
    // hardcore on (select locks), toggle off (select unlocks, value kept).
    await page.click('#game-canvas');
    await expect(page.locator('#gamerule-open')).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('#gamerule-open') as HTMLButtonElement | null)?.click();
    });
    await expect(page.locator('#gamerule:not(.hidden)')).toBeVisible();

    await page.selectOption('#difficulty-select', 'peaceful');
    expect((await game(page)).configured).toBe('peaceful');
    expect((await game(page)).difficulty).toBe('peaceful');

    await page.click('#hardcore-toggle');
    expect(await game(page)).toEqual({
      mode: 'survival',
      hardcore: true,
      difficulty: 'hard',
      configured: 'peaceful',
    });
    await expect(page.locator('#difficulty-select')).toBeDisabled();
    // The settings dialog hides the whole HUD while open (261 behavior),
    // so the badge is asserted at the class level here.
    await expect(page.locator('#hardcore-badge')).not.toHaveClass(/hidden/);

    await page.click('#hardcore-toggle');
    expect(await game(page)).toEqual({
      mode: 'survival',
      hardcore: false,
      difficulty: 'peaceful',
      configured: 'peaceful',
    });
    await expect(page.locator('#difficulty-select')).toBeEnabled();
    expect(await toastText(page)).toContain('Hardcore mode disabled');

    // Close the dialog, then reload: the non-hardcore world with its
    // configured difficulty persists.
    await page.click('#gamerule-close');
    await expect(page.locator('#gamerule.hidden')).toBeAttached();
    await reload(page);
    expect(await game(page)).toEqual({
      mode: 'survival',
      hardcore: false,
      difficulty: 'peaceful',
      configured: 'peaceful',
    });
  });
});
