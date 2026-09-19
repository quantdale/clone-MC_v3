import { test, expect, type Page } from '@playwright/test';

type ShieldState = {
  equipped: boolean;
  raised: boolean;
  disabled: boolean;
  durability: number;
  maxDurability: number;
};

type GameHandle = {
  getShieldState(): ShieldState;
  debugEquipShield(): boolean;
  debugDamageFrom(amount: number, sourceX?: number, sourceZ?: number, axe?: boolean): void;
  grantCreativeItem(itemId: number): boolean;
  player?: { yaw: number; position: { x: number; z: number } };
  survival?: { health: number };
  inventory?: {
    slots: Array<{ id: number; count: number } | null>;
    storage: Array<{ id: number; count: number }>;
    selected: number;
    select(index: number): void;
    addItem(id: number, amount: number): number;
    removeItem(id: number, amount: number): boolean;
    equipment?: { clear(): void };
  };
};

const SHIELD = 71;

async function waitForGame(page: Page, seed: number): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __voxelGame?: unknown }).__voxelGame != null, null, {
    timeout: 10_000,
  });
}

async function clearInventory(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    const inventory = g?.inventory;
    if (!inventory) return;
    for (const stack of [...inventory.slots, ...inventory.storage]) {
      if (stack && stack.count > 0) inventory.removeItem(stack.id, stack.count);
    }
    inventory.equipment?.clear();
  });
}

async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(() => document.pointerLockElement !== null, { timeout: 5_000 });
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: { inputHandle?: { isLocked(): boolean } } })
      .__voxelGame?.inputHandle?.isLocked?.() === true,
    { timeout: 5_000 },
  );
}

async function shieldState(page: Page): Promise<ShieldState> {
  return page.evaluate(() =>
    (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.getShieldState(),
  );
}

async function holdRight(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  });
}

async function releaseRight(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
  });
}

async function frontSource(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(() => {
    const game = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
    const p = game.player!;
    // The deterministic setup uses yaw 0: Player forward is -Z.
    return { x: p.position.x, z: p.position.z - 4 };
  });
}

test.describe('live shield wiring (279)', () => {
  test('V swaps the selected stack and a real right hold raises/lower the shield', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page, 279901);
    await clearInventory(page);

    await page.evaluate((shieldId) => {
      const game = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      if (!game.inventory) throw new Error('inventory seam missing');
      game.inventory.addItem(shieldId, 1);
      const slot = game.inventory.slots.findIndex((stack) => stack?.id === shieldId && stack.count > 0);
      if (slot < 0) throw new Error('shield was not granted');
      game.inventory.select(slot);
    }, SHIELD);
    await enterPointerLock(page);
    await page.keyboard.press('v');
    await page.waitForFunction(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getShieldState().equipped === true,
    );

    await holdRight(page);
    await page.waitForFunction(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getShieldState().raised === true,
    );
    await releaseRight(page);
    await page.waitForFunction(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getShieldState().raised === false,
    );

    const state = await shieldState(page);
    expect(state.equipped).toBe(true);
    expect(state.durability).toBe(state.maxDurability);
  });

  test('front blocks, rear damage passes, axe disables, and a shield breaks visibly', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page, 279902);
    await clearInventory(page);
    await enterPointerLock(page);
    await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      if (!game.debugEquipShield()) throw new Error('shield setup failed');
      if (game.player) game.player.yaw = 0;
    });
    await holdRight(page);
    await page.waitForFunction(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getShieldState().raised === true,
    );

    const front = await frontSource(page);
    const beforeFront = await page.evaluate(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.survival!.health,
    );
    await page.evaluate((source) => {
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugDamageFrom(6, source.x, source.z);
    }, front);
    await page.waitForFunction((health) =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.survival?.health === health,
      beforeFront,
    );
    expect((await shieldState(page)).durability).toBe(330);

    const beforeRear = await page.evaluate(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.survival!.health,
    );
    await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const p = game.player!;
      game.debugDamageFrom(4, p.position.x, p.position.z + 4);
    });
    await page.waitForFunction((health) =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.survival?.health === health - 4,
      beforeRear,
    );

    await page.evaluate((source) => {
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugDamageFrom(3, source.x, source.z, true);
    }, front);
    await page.waitForFunction(() => {
      const state = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getShieldState();
      return state?.disabled === true && state.raised === false;
    });
    // SurvivalSystem retains its normal 0.55s damage invulnerability window;
    // wait for that existing rule before proving the disabled hit lands.
    await page.waitForTimeout(800);
    const beforeDisabledHit = await page.evaluate(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.survival!.health,
    );
    await page.evaluate((source) => {
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugDamageFrom(3, source.x, source.z);
    }, front);
    await page.waitForFunction((health) =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.survival?.health === health - 3,
      beforeDisabledHit,
    );

    await releaseRight(page);
    await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      game.debugEquipShield();
      if (game.player) game.player.yaw = 0;
    });
    await holdRight(page);
    await page.waitForFunction(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getShieldState().raised === true,
    );
    await page.evaluate((source) => {
      const game = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      for (let i = 0; i < 336; i++) game.debugDamageFrom(1, source.x, source.z);
    }, front);
    await page.waitForFunction(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getShieldState().equipped === false,
    );
    await expect(page.locator('#shield-indicator')).toContainText('Shield: broken');
    await expect(page.locator('#toast')).toContainText('Shield broke');
  });

  test('offhand durability persists through the existing pagehide inventory save', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page, 279903);
    await clearInventory(page);
    await enterPointerLock(page);
    await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      game.debugEquipShield();
      if (game.player) game.player.yaw = 0;
    });
    await holdRight(page);
    await page.waitForFunction(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getShieldState().raised === true,
    );
    const source = await frontSource(page);
    await page.evaluate((target) => {
      const game = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      game.debugDamageFrom(2, target.x, target.z);
      game.debugDamageFrom(3, target.x, target.z);
    }, source);
    await page.waitForFunction(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getShieldState().durability === 331,
    );
    await releaseRight(page);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(1_000);
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
    await page.waitForFunction(() =>
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame?.getShieldState().equipped === true,
    );
    const afterReload = await shieldState(page);
    expect(afterReload.durability).toBe(331);
  });
});
