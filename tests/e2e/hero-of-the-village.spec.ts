import { test, expect, type Page } from '@playwright/test';

/**
 * Hero of the Village (290): win a raid via debug seams, observe HOTV on
 * playerEffects, see discounted emerald prices in the trading UI, clear the
 * effect to restore catalog prices, and prove reload of VICTORY does not
 * double-grant.
 */

type RaidStateView = {
  status: string;
  raidersRemaining: number;
  waveIndex: number;
  totalWaves: number;
  badOmenLevel: number;
};

type TradeOffer = {
  inputA: { item: string; count: number };
  inputB: { item: string; count: number } | null;
  result: { item: string; count: number };
};

type GameHandle = {
  getRaidState(): RaidStateView | null;
  debugStartRaid(badOmenLevel?: number): RaidStateView;
  debugClearRaidWave(): RaidStateView | null;
  debugClearHeroOfTheVillage(): boolean;
  debugSetTradingLevel(profession: string, level: number): boolean;
  getHeroOfTheVillageAmplifier(): number | null;
  getDiscountedTradingOffers(profession: string): TradeOffer[];
  getTradingState(profession: string): { offers: TradeOffer[]; level: number } | null;
  playerEffects: {
    get(id: { namespace: string; path: string }): { amplifier: number; duration: number } | undefined;
    serialize(): Array<{ typeId: string; duration: number; amplifier: number }>;
  };
  openTrading?: () => void;
  isTradingOpen?: () => boolean;
  persistence?: { flush?: () => Promise<void> };
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

async function winRaid(page: Page, omen = 1): Promise<RaidStateView> {
  return page.evaluate((badOmenLevel) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
    g.debugStartRaid(badOmenLevel);
    let guard = 0;
    while (g.getRaidState()?.status === 'ACTIVE' && guard++ < 20) {
      g.debugClearRaidWave();
    }
    return g.getRaidState()!;
  }, omen);
}

/** Unlock librarian level-2 catalog so the 9-emerald book offer exists for discount checks. */
async function unlockLibrarianLevel2(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
    g.debugSetTradingLevel('librarian', 2);
  });
}

test.describe('hero of the village (290)', () => {
  test('VICTORY grants HOTV; trading shows discount; clear restores; DEFEAT grants nothing', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    await unlockLibrarianLevel2(page);
    const victory = await winRaid(page, 1);
    expect(victory.status).toBe('VICTORY');

    const afterVictory = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const effects = g.playerEffects.serialize();
      const hero = effects.find((e) => e.typeId.includes('hero_of_the_village'));
      const amp = g.getHeroOfTheVillageAmplifier();
      const offers = g.getDiscountedTradingOffers('librarian');
      const book = offers.find((o) => o.result.item === 'book' && o.inputA.item === 'emerald');
      const catalog = g.getTradingState('librarian')!.offers.find((o) => o.result.item === 'book' && o.inputA.item === 'emerald');
      return { hero, amp, book, catalog };
    });
    expect(afterVictory.amp).toBe(0);
    expect(afterVictory.hero?.amplifier).toBe(0);
    expect(afterVictory.hero?.duration).toBeGreaterThan(2000);
    expect(afterVictory.catalog?.inputA.count).toBe(9);
    expect(afterVictory.book?.inputA.count).toBe(7);

    // Open trading UI — select librarian tab — assert discounted emerald text.
    await page.evaluate(() => {
      (document.querySelector('#trading-open') as HTMLButtonElement | null)?.click();
    });
    await expect(page.locator('#trading:not(.hidden)')).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('#trading-profession-1') as HTMLButtonElement | null)?.click(); // librarian
    });
    await expect(page.locator('#trading-offers')).toContainText('7× Emerald');
    await expect(page.locator('#trading-offers')).toContainText('Book');

    // Clear HOTV → catalog price returns.
    const restored = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugClearHeroOfTheVillage();
      return {
        amp: g.getHeroOfTheVillageAmplifier(),
        book: g.getDiscountedTradingOffers('librarian').find((o) => o.result.item === 'book' && o.inputA.item === 'emerald'),
      };
    });
    expect(restored.amp).toBeNull();
    expect(restored.book?.inputA.count).toBe(9);
    await expect(page.locator('#trading-offers')).toContainText('9× Emerald');

    // DEFEAT grants nothing.
    const defeat = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugStartRaid(1);
      // Kill player while ACTIVE if debugKillPlayer exists; else force via survival.
      const anyG = g as GameHandle & {
        debugKillPlayer?: () => void;
        survival?: { health: number; damage: (n: number, r: string) => void };
      };
      if (typeof anyG.debugKillPlayer === 'function') {
        anyG.debugKillPlayer();
      } else if (anyG.survival) {
        anyG.survival.damage(999, 'test');
      }
      const effects = g.playerEffects.serialize();
      return {
        status: g.getRaidState()?.status ?? 'NONE',
        hero: effects.find((e) => e.typeId.includes('hero_of_the_village')),
      };
    });
    expect(defeat.status).toBe('DEFEAT');
    expect(defeat.hero).toBeUndefined();
  });

  test('reload after VICTORY does not double-grant HOTV', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    await winRaid(page, 2);
    const beforeReload = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return {
        status: g.getRaidState()?.status,
        amp: g.getHeroOfTheVillageAmplifier(),
      };
    });
    expect(beforeReload.status).toBe('VICTORY');
    expect(beforeReload.amp).toBe(1); // omen 2 → amp 1

    await page.evaluate(async () => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      if (g.persistence?.flush) await g.persistence.flush();
    });
    await page.waitForTimeout(800);
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
    await page.waitForFunction(
      () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null,
      null,
      { timeout: 120_000 },
    );

    const afterReload = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const effects = g.playerEffects.serialize();
      return {
        status: g.getRaidState()?.status,
        amp: g.getHeroOfTheVillageAmplifier(),
        hero: effects.find((e) => e.typeId.includes('hero_of_the_village')),
      };
    });
    // Raid terminal state may persist; HOTV must not be re-granted on hydrate.
    expect(afterReload.status).toBe('VICTORY');
    expect(afterReload.amp).toBeNull();
    expect(afterReload.hero).toBeUndefined();
  });
});
