import { test, expect, type Page } from '@playwright/test';

/**
 * Live trading-post coverage (278): the browser exercises the real Game store,
 * DOM panel, inventory transaction, raw __trades__ persistence, and lifecycle
 * rules. The game handle is used only for deterministic setup/observation;
 * offer selection and application go through real panel controls.
 */

type TradeOffer = {
  inputA: { item: string; count: number };
  inputB: { item: string; count: number } | null;
  result: { item: string; count: number };
  maxUses: number;
  usesRemaining: number;
  xpReward: number;
  unlockLevel: number;
};

type TradeState = { offers: TradeOffer[]; level: number; xp: number };

type GameHandle = {
  getTradingState(profession: string): TradeState | null;
  getTradingProfession(): string;
  isTradingOpen(): boolean;
  applyTradeOffer(profession: string, index: number): { ok: boolean; reason?: string };
  restockTrades(): void;
  inventory?: {
    addItem(id: number, amount: number): number;
    removeItem(id: number, amount: number): boolean;
    getItemCount(id: number): number;
    slots: Array<{ id: number; count: number } | null>;
    storage: Array<{ id: number; count: number }>;
  };
};

const WHEAT = 33;

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __voxelGame?: unknown }).__voxelGame != null, null, {
    timeout: 10_000,
  });
}

async function tradingIsOpen(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.isTradingOpen() ?? false,
  );
}

async function addWheat(page: Page, count: number): Promise<void> {
  await page.evaluate(({ id, amount }) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    g?.inventory?.addItem(id, amount);
  }, { id: WHEAT, amount: count });
}

async function itemCount(page: Page, id: number): Promise<number> {
  return page.evaluate((itemId) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.inventory?.getItemCount(itemId) ?? -1;
  }, id);
}

async function drainInventory(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    const inventory = g?.inventory;
    if (!inventory) return;
    for (const stack of [...inventory.slots, ...inventory.storage]) {
      if (stack && stack.count > 0) inventory.removeItem(stack.id, stack.count);
    }
  });
}

async function openTrading(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.querySelector('#trading-open') as HTMLButtonElement | null)?.click();
  });
  await expect(page.locator('#trading:not(.hidden)')).toBeVisible();
}

async function closeTrading(page: Page): Promise<void> {
  await page.click('#trading-close');
  await expect(page.locator('#trading.hidden')).toBeAttached();
}

async function persistAndReload(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.waitForTimeout(1_000);
  await page.reload();
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
}

test.describe('live trading journey (278)', () => {
  test('open → trade → reload preserves uses/XP → trade again', async ({ page }) => {
    test.setTimeout(240_000);
    await waitForGame(page);
    await drainInventory(page);
    await addWheat(page, 45);

    const before = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const state = g.getTradingState('farmer')!;
      return { state, wheat: g.inventory!.getItemCount(33), emerald: g.inventory!.getItemCount(68) };
    });
    expect(before.state.level).toBe(1);
    expect(before.state.xp).toBe(0);
    expect(before.state.offers[0]!.usesRemaining).toBe(before.state.offers[0]!.maxUses);

    await openTrading(page);
    await expect(page.locator('#trading-profession-0')).toHaveClass(/selected/);
    await expect(page.locator('#trading-offer-0')).toContainText('20× Wheat');
    await expect(page.locator('#trading-offer-0')).toContainText('Emerald');
    await page.click('#trading-offer-0');
    await page.click('#trading-apply');

    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return (g?.getTradingState('farmer')?.offers[0]?.usesRemaining ?? 16) === 15;
    });
    const afterFirst = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return {
        state: g.getTradingState('farmer')!,
        wheat: g.inventory!.getItemCount(33),
        emerald: g.inventory!.getItemCount(68),
      };
    });
    expect(afterFirst.wheat).toBe(before.wheat - 20);
    expect(afterFirst.emerald).toBe(before.emerald + 1);
    expect(afterFirst.state.xp).toBe(2);
    expect(afterFirst.state.offers[0]!.usesRemaining).toBe(15);
    await expect(page.locator('#toast')).toContainText('Traded');

    await persistAndReload(page);
    const afterReload = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return {
        state: g.getTradingState('farmer')!,
        wheat: g.inventory!.getItemCount(33),
        emerald: g.inventory!.getItemCount(68),
      };
    });
    expect(afterReload.state).toEqual(afterFirst.state);
    expect(afterReload.wheat).toBe(afterFirst.wheat);
    expect(afterReload.emerald).toBe(afterFirst.emerald);

    await openTrading(page);
    await page.click('#trading-offer-0');
    await page.click('#trading-apply');
    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return (g?.getTradingState('farmer')?.offers[0]?.usesRemaining ?? 16) === 14;
    });
    const finalState = await page.evaluate(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.getTradingState('farmer')!,
    );
    expect(finalState.xp).toBe(4);
    expect(finalState.offers[0]!.usesRemaining).toBe(14);
  });
});

test.describe('trading lifecycle and refusal paths (278)', () => {
  test('T toggle, blur, one-container, insufficient, exhausted, and close are stable', async ({ page }) => {
    test.setTimeout(240_000);
    await waitForGame(page);
    await drainInventory(page);
    await addWheat(page, 20);

    await page.keyboard.press('KeyT');
    await expect(page.locator('#trading:not(.hidden)')).toBeVisible();
    expect(await tradingIsOpen(page)).toBe(true);
    await page.keyboard.press('KeyT');
    await expect(page.locator('#trading.hidden')).toBeAttached();
    await expect(page.locator('#overlay:not(.hidden)')).toBeVisible();

    await page.keyboard.press('KeyT');
    await expect(page.locator('#trading:not(.hidden)')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(300);
    await expect(page.locator('#trading:not(.hidden)')).toBeVisible();

    // C closes trading; a second C opens crafting. T then closes crafting and
    // opens trading, proving both directions of the one-container rule.
    await page.keyboard.press('KeyC');
    await expect(page.locator('#trading.hidden')).toBeAttached();
    await page.keyboard.press('KeyC');
    await expect(page.locator('#crafting:not(.hidden)')).toBeVisible();
    await page.keyboard.press('KeyT');
    await expect(page.locator('#crafting.hidden')).toBeAttached();
    await expect(page.locator('#trading:not(.hidden)')).toBeVisible();

    // Arm a valid row, remove its input behind the open panel, then apply via
    // the real button. The refusal is surfaced and inventory stays empty.
    await page.click('#trading-offer-0');
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.inventory!.removeItem(33, g.inventory!.getItemCount(33));
    });
    await page.click('#trading-apply');
    await expect(page.locator('#trading-status')).toContainText('Need more items');
    expect(await itemCount(page, WHEAT)).toBe(0);

    // Exhaust the offer through the public Game seam after selecting it; the
    // panel remains armed and the final DOM click must report the refusal.
    await addWheat(page, 320);
    await page.click('#trading-offer-0');
    await page.click('#trading-offer-0');
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      for (let i = 0; i < 16; i++) {
        if (!g.applyTradeOffer('farmer', 0).ok) throw new Error(`trade ${i} unexpectedly refused`);
      }
    });
    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getTradingState('farmer')?.offers[0]?.usesRemaining === 0;
    });
    await page.click('#trading-apply');
    await expect(page.locator('#trading-status')).toContainText('Offer exhausted');

    await closeTrading(page);
    expect(await tradingIsOpen(page)).toBe(false);
    // Closing and reopening clears the panel-local pending selection.
    await page.keyboard.press('KeyT');
    await expect(page.locator('#trading:not(.hidden)')).toBeVisible();
    await expect(page.locator('#trading-apply')).toBeDisabled();
    await closeTrading(page);
  });

  test('unknown offers are no-ops and a full inventory drops the result', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    await drainInventory(page);
    await addWheat(page, 21);
    // Fill the remaining 35 inventory slots with stone. The wheat stack stays
    // non-empty after paying 20, so the emerald has no compatible or empty
    // destination and must become a world item entity.
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.inventory!.addItem(2, 64 * 35);
    });
    const before = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return {
        state: g.getTradingState('farmer')!,
        wheat: g.inventory!.getItemCount(33),
        entities: (g as GameHandle & { itemEntities?: { size: number } }).itemEntities?.size ?? -1,
      };
    });
    const refusals = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return {
        profession: g.applyTradeOffer('unknown', 0),
        offer: g.applyTradeOffer('farmer', 999),
      };
    });
    expect(refusals).toEqual({ profession: { ok: false, reason: 'unknown' }, offer: { ok: false, reason: 'unknown' } });
    expect(await itemCount(page, WHEAT)).toBe(before.wheat);

    const applied = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return g.applyTradeOffer('farmer', 0);
    });
    expect(applied).toEqual({ ok: true });
    await page.waitForFunction((previous) => {
      const g = (window as unknown as { __voxelGame?: GameHandle & { itemEntities?: { size: number } } }).__voxelGame;
      return (g?.itemEntities?.size ?? previous) > previous;
    }, before.entities);
    expect(await itemCount(page, WHEAT)).toBe(1);
    expect(await itemCount(page, 68)).toBe(0);
  });
});
