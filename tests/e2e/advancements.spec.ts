import { test, expect, type Page } from '@playwright/test';

/**
 * Live advancement panel journey (263) over the VERIFIED headless
 * AdvancementFramework (185) + CoreProgressionAdvancements (186).
 *
 * Drives the REAL production artifact through the player loop: open the panel
 * from the HUD chip, see all 7 core definitions with title/description and
 * 0/1 progress, complete `stone_age` through a REAL one-click craft
 * (obtain_item choke via onCrafted), complete `enter_the_nether` through the
 * specified `fireAdvancementTrigger` seam (no live Nether travel exists yet),
 * watch both rows flip live with toasts, and survive a page reload via the
 * world save path with progress field-for-field preserved. The `__voxelGame`
 * handle is used only for inventory setup, seam triggers, and read-only
 * observation — every panel action under test goes through real DOM clicks.
 */

const PLANKS = 12;
const STICK = 19;
const WOODEN_PICKAXE = 20;

type RowView = {
  key: string;
  title: string;
  description: string;
  achieved: boolean;
  achievedTick: number | null;
  achievedCount: number;
  totalCount: number;
};

type GameHandle = {
  isAdvancementOpen(): boolean;
  getAdvancementRows(): RowView[];
  fireAdvancementTrigger(trigger: unknown): string[];
  inventory?: {
    addItem(id: number, amount: number): number;
    removeItem(id: number, amount: number): boolean;
    getItemCount(id: number): number;
    slots: Array<{ id: number; count: number } | null>;
    storage: Array<{ id: number; count: number } | null>;
  };
};

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
}

function game(page: Page) {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame handle');
    return {
      open: g.isAdvancementOpen(),
      rows: g.getAdvancementRows(),
    };
  });
}

async function rows(page: Page): Promise<RowView[]> {
  return (await game(page)).rows;
}

async function grant(page: Page, id: number, amount: number): Promise<void> {
  await page.evaluate(
    ({ item, count }) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.inventory?.addItem(item, count);
    },
    { item: id, count: amount },
  );
}

async function itemCount(page: Page, id: number): Promise<number> {
  return page.evaluate((item) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.inventory?.getItemCount(item) ?? -1;
  }, id);
}

async function fireTrigger(page: Page, trigger: unknown): Promise<string[]> {
  return page.evaluate((t) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.fireAdvancementTrigger(t) ?? [];
  }, trigger as never);
}

/**
 * Empty the player inventory through the real transaction path so granted
 * plank/stick counts are exact.
 */
async function drainInventory(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    const inv = g?.inventory;
    if (!inv) return;
    for (const stack of [...inv.slots, ...inv.storage]) {
      if (stack && stack.count > 0) inv.removeItem(stack.id, stack.count);
    }
  });
}

/**
 * Open the panel through the HUD chip (gamerule-chip precedent, 261):
 * pointer lock routes raw mouse input to the canvas, so the chip is revealed
 * with a canvas click and activated through its wired listener directly.
 */
async function openPanel(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await expect(page.locator('#advancements-open')).toBeVisible();
  await page.evaluate(() => {
    (document.querySelector('#advancements-open') as HTMLButtonElement | null)?.click();
  });
  await expect(page.locator('#advancements:not(.hidden)')).toBeVisible();
}

async function closePanel(page: Page): Promise<void> {
  await page.click('#advancements-close');
  await expect(page.locator('#advancements.hidden')).toBeAttached();
}

test.describe('live advancement journey (263)', () => {
  test('open → see defs → craft completes → seam completes → reload preserves', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    await drainInventory(page);

    // ── The panel opens from the HUD chip with all 7 defs unachieved ──
    await openPanel(page);
    let seen = await rows(page);
    expect(seen.map((r) => r.key)).toEqual([
      'minecraft:stone_age',
      'minecraft:acquire_hardware',
      'minecraft:iron_tools',
      'minecraft:diamonds',
      'minecraft:enter_the_nether',
      'minecraft:enter_the_end',
      'minecraft:free_the_end',
    ]);
    expect(seen[0]).toMatchObject({ title: 'Stone Age', description: 'Obtain Wooden Pickaxe' });
    expect(seen.every((r) => !r.achieved)).toBe(true);
    for (const key of seen.map((r) => r.key)) {
      await expect(page.locator(`[data-advancement-row="${key}"]`)).toBeVisible();
    }
    await expect(page.locator('#advancement-status')).toContainText('7 advancements, 0 complete.');
    await closePanel(page);

    // ── Real-craft completion: planks+sticks → wooden pickaxe ──────────
    await grant(page, PLANKS, 3);
    await grant(page, STICK, 2);
    await page.keyboard.press('c');
    await expect(page.locator('#crafting:not(.hidden)')).toBeVisible();
    await page.click('button[data-recipe="wooden_pickaxe"]');
    await expect(page.locator('#toast')).toContainText('Advancement made: Stone Age');
    expect(await itemCount(page, WOODEN_PICKAXE)).toBe(1);
    // The one-click crafting list stays open after a craft; close it before
    // reopening the panel so the canvas click is not intercepted.
    await page.keyboard.press('c');
    await expect(page.locator('#crafting.hidden')).toBeAttached();

    // ── The panel reflects the completion live ────────────────────────
    await openPanel(page);
    seen = await rows(page);
    const stoneAge = seen.find((r) => r.key === 'minecraft:stone_age')!;
    expect(stoneAge.achieved).toBe(true);
    expect(typeof stoneAge.achievedTick).toBe('number');
    await expect(page.locator('[data-advancement-row="minecraft:stone_age"]')).toContainText(
      'Completed',
    );
    await expect(page.locator('#advancement-status')).toContainText('7 advancements, 1 complete.');

    // ── Seam completion flips the row live without reopening ──────────
    const completed = await fireTrigger(page, {
      type: 'dimension_enter',
      dimensionKey: 'minecraft:the_nether',
    });
    expect(completed).toEqual(['minecraft:enter_the_nether']);
    await expect(page.locator('#toast')).toContainText('Advancement made: We Need to Go Deeper');
    await expect(page.locator('[data-advancement-row="minecraft:enter_the_nether"]')).toContainText(
      'Completed',
    );

    // ── Persist across reload: keys + ticks field-for-field preserved ──
    const before = await rows(page);
    const achievedBefore = before.filter((r) => r.achieved);
    expect(achievedBefore.map((r) => r.key)).toEqual([
      'minecraft:stone_age',
      'minecraft:enter_the_nether',
    ]);
    await closePanel(page);
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForGame(page);
    const after = await rows(page);
    expect(after.filter((r) => r.achieved)).toEqual(achievedBefore);
    await openPanel(page);
    await expect(page.locator('[data-advancement-row="minecraft:stone_age"]')).toContainText(
      'Completed',
    );
    await expect(page.locator('#advancement-status')).toContainText('7 advancements, 2 complete.');
    await closePanel(page);
  });
});

test.describe('advancement lifecycle (263)', () => {
  test('close button, C closes, crafting entry closes panel, blur keeps, no double toast', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    await drainInventory(page);

    await openPanel(page);

    // Close button closes with the overlay returned.
    await closePanel(page);
    await expect(page.locator('#overlay:not(.hidden)')).toBeVisible();

    // Reopen; C closes the panel instead of stacking crafting.
    await openPanel(page);
    await page.keyboard.press('c');
    await expect(page.locator('#advancements.hidden')).toBeAttached();
    await expect(page.locator('#crafting.hidden')).toBeAttached();

    // Opening crafting, then the HUD chip, closes crafting (one container).
    // The chip listener is invoked directly: crafting hides the HUD while open.
    await page.keyboard.press('c');
    await expect(page.locator('#crafting:not(.hidden)')).toBeVisible();
    await page.evaluate(() => {
      (document.querySelector('#advancements-open') as HTMLButtonElement | null)?.click();
    });
    await expect(page.locator('#advancements:not(.hidden)')).toBeVisible();
    await expect(page.locator('#crafting.hidden')).toBeAttached();

    // Blur keeps the panel open exactly once (no stacking).
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(500);
    await expect(page.locator('#advancements:not(.hidden)')).toBeVisible();

    // A repeat trigger after completion changes nothing.
    await fireTrigger(page, {
      type: 'dimension_enter',
      dimensionKey: 'minecraft:the_nether',
    });
    const once = await rows(page);
    const repeat = await fireTrigger(page, {
      type: 'dimension_enter',
      dimensionKey: 'minecraft:the_nether',
    });
    expect(repeat).toEqual([]);
    expect(await rows(page)).toEqual(once);
    await closePanel(page);
  });
});
