import { test, expect, type Page } from '@playwright/test';

/**
 * Live recipe book journey (262) over the VERIFIED headless RecipeBook (204).
 *
 * Drives the REAL production artifact through the player loop: open the book
 * from the crafting UI, see R2 craftable-discovery unlock the affordable
 * recipe, search/filter the known list, select a recipe to preview its
 * laid-out ingredient grid, craft through a real DOM click, prove the
 * unaffordable craft is a status-surfaced no-op with the inventory intact,
 * and survive a page reload via the world save path with the known set
 * field-for-field preserved. The `__voxelGame` handle is used only for
 * inventory setup and read-only observation — every book action under test
 * goes through real DOM clicks.
 */

const LOG = 7;
const PLANKS = 12;
const STICKS = 19;

type SelectionView = {
  key: string;
  missingCount: number;
  canCraft: boolean;
} | null;

type GameHandle = {
  isRecipeBookOpen(): boolean;
  getRecipeBook(): { known: string[] };
  getRecipeBookQuery(): string;
  getRecipeBookSelection(): SelectionView;
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

async function knownKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.getRecipeBook().known ?? [];
  });
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

/**
 * Empty the player inventory through the real transaction path. The default
 * spawn kit already affords glass/gravel/cobblestone, so the journey drains
 * it first to pin the empty-book start deterministically.
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

/** Open crafting (C) then the book through its dialog button. */
async function openBook(page: Page): Promise<void> {
  await page.keyboard.press('c');
  await expect(page.locator('#crafting:not(.hidden)')).toBeVisible();
  await page.click('#crafting-recipebook-open');
  await expect(page.locator('#recipebook:not(.hidden)')).toBeVisible();
}

async function closeBook(page: Page): Promise<void> {
  await page.click('#recipebook-close');
  await expect(page.locator('#recipebook.hidden')).toBeAttached();
}

test.describe('live recipe book journey (262)', () => {
  test('open → discover → search → select → craft → reload preserves', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    await drainInventory(page);

    // ── Drained world: the book opens from crafting and starts empty ──
    await openBook(page);
    await expect(page.locator('#crafting.hidden')).toBeAttached();
    expect(await knownKeys(page)).toEqual([]);
    await expect(page.locator('#recipebook-list')).toContainText('No known recipes match.');
    await closeBook(page);

    // ── R2 discovery: holding a log teaches planks on open ────────────
    await grant(page, LOG, 1);
    await openBook(page);
    expect(await knownKeys(page)).toEqual(['planks']);
    await expect(page.locator('#recipebook-status')).toContainText('Learned 1 recipe.');
    await expect(page.locator('button[data-recipebook-recipe="planks"]')).toBeVisible();

    // ── Search filters; clearing restores the full known list ─────────
    await grant(page, PLANKS, 2);
    await closeBook(page);
    await openBook(page);
    expect(await knownKeys(page)).toEqual(['planks', 'sticks']);
    await page.fill('#recipebook-search', 'stick');
    await expect(page.locator('button[data-recipebook-recipe="sticks"]')).toBeVisible();
    await expect(page.locator('button[data-recipebook-recipe="planks"]')).toBeHidden();
    await page.fill('#recipebook-search', '');
    await expect(page.locator('button[data-recipebook-recipe="planks"]')).toBeVisible();
    await expect(page.locator('button[data-recipebook-recipe="sticks"]')).toBeVisible();

    // ── Select previews the laid-out grid with have/missing ───────────
    await page.click('button[data-recipebook-recipe="sticks"]');
    await expect(page.locator('#recipebook-detail:not(.hidden)')).toBeVisible();
    expect(await page.locator('#recipebook-grid > div').count()).toBe(9);
    await expect(page.locator('#recipebook-missing')).toContainText('All ingredients available.');

    // ── Real-click craft consumes and produces through the real engine ─
    expect(await itemCount(page, PLANKS)).toBe(2);
    await page.click('#recipebook-craft');
    await expect(page.locator('#recipebook-status')).toContainText('Crafted Sticks.');
    expect(await itemCount(page, PLANKS)).toBe(0);
    expect(await itemCount(page, STICKS)).toBe(4);
    expect(await knownKeys(page)).toEqual(['planks', 'sticks']);

    // ── Unaffordable craft is a no-op with the inventory intact ───────
    await page.click('#recipebook-craft');
    await expect(page.locator('#recipebook-status')).toContainText('Missing ingredients:');
    expect(await itemCount(page, PLANKS)).toBe(0);
    expect(await itemCount(page, STICKS)).toBe(4);
    expect(await knownKeys(page)).toEqual(['planks', 'sticks']);

    // ── Persist across reload: known set field-for-field preserved ────
    await closeBook(page);
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForGame(page);
    expect(await knownKeys(page)).toEqual(['planks', 'sticks']);
    await openBook(page);
    await expect(page.locator('button[data-recipebook-recipe="planks"]')).toBeVisible();
    await expect(page.locator('button[data-recipebook-recipe="sticks"]')).toBeVisible();
    await closeBook(page);
  });
});

test.describe('recipe book lifecycle (262)', () => {
  test('close button, C closes, blur keeps unstacked, search no-match guard', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    await drainInventory(page);

    await openBook(page);

    // Close button closes with the overlay returned.
    await closeBook(page);

    // Reopen; C closes the book instead of stacking crafting.
    await openBook(page);
    await page.keyboard.press('c');
    await expect(page.locator('#recipebook.hidden')).toBeAttached();
    await expect(page.locator('#crafting.hidden')).toBeAttached();

    // Reopen; blur keeps the panel open exactly once (no stacking).
    await openBook(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(500);
    await expect(page.locator('#recipebook:not(.hidden)')).toBeVisible();

    // Search with no match renders the notice and no buttons.
    await grant(page, LOG, 1);
    await closeBook(page);
    await openBook(page);
    expect(await knownKeys(page)).toEqual(['planks']);
    await page.fill('#recipebook-search', 'zzz-no-such-recipe');
    await expect(page.locator('#recipebook-list')).toContainText('No known recipes match.');
    expect(await page.locator('#recipebook-list > button').count()).toBe(0);
    await closeBook(page);
  });
});
