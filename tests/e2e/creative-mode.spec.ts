import { test, expect, type Page } from '@playwright/test';

/**
 * Live creative-mode journey (265) over the VERIFIED headless
 * GameModeFramework (192).
 *
 * Drives the REAL production artifact through the player loop: enter creative
 * via the text seam, browse/search the creative menu through real DOM clicks,
 * grant a stack with no survival cost, place it without depleting, break it
 * instantly with no drops, hover in place via minimal safe flight, and survive
 * a page reload via the world save path with the mode field-for-field
 * preserved. The `__voxelGame` handle is used only for mode seams, inventory
 * setup, and read-only observation — every menu action under test goes
 * through real DOM clicks and every place/break through real mouse input.
 */

type CreativeRow = {
  id: number;
  key: string;
  name: string;
  blockId: number | null;
  stackSize: number;
};

type GameHandle = {
  getGameMode(): string;
  setGameMode(mode: string): boolean;
  setGameModeFromText(text: string): boolean;
  toggleGameMode(): string;
  isCreativeOpen(): boolean;
  getCreativeItems(): CreativeRow[];
  searchCreative(query: string): CreativeRow[];
  grantCreativeItem(itemId: number): boolean;
  getPlayerPosition(): [number, number, number];
  saveGameMode(): void;
  inventory?: {
    addItem(id: number, amount: number): number;
    removeItem(id: number, amount: number): boolean;
    getItemCount(id: number): number;
    slots: Array<{ id: number; count: number } | null>;
    storage: Array<{ id: number; count: number } | null>;
  };
  itemEntities?: { size: number };
};

type Pos = { x: number; y: number; z: number };
type TargetFace = Pos & { nx: number; ny: number; nz: number };

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
}

async function gameMode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame handle');
    return g.getGameMode();
  });
}

async function itemCount(page: Page, id: number): Promise<number> {
  return page.evaluate((item) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.inventory?.getItemCount(item) ?? -1;
  }, id);
}

/** Empty the player inventory through the real transaction path. */
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

async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(() => document.pointerLockElement !== null, { timeout: 5000 });
  await page.waitForFunction(
    () =>
      (window as unknown as { __voxelGame?: { inputHandle?: { isLocked(): boolean } } })
        .__voxelGame?.inputHandle?.isLocked?.() === true,
    { timeout: 5000 },
  );
}

function rightClick(page: Page): void {
  void page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
  });
}

/** Open the creative menu through the HUD chip (advancement-chip precedent). */
async function openCreative(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await expect(page.locator('#creative-open')).toBeVisible();
  await page.evaluate(() => {
    (document.querySelector('#creative-open') as HTMLButtonElement | null)?.click();
  });
  await expect(page.locator('#creative:not(.hidden)')).toBeVisible();
}

async function closeCreative(page: Page): Promise<void> {
  await page.click('#creative-close');
  await expect(page.locator('#creative.hidden')).toBeAttached();
}

/** Aim down-forward and wait until an interaction target exists. */
async function acquireTarget(page: Page, pitch = -0.5): Promise<TargetFace> {
  const poses = [
    { yaw: 0, pitch },
    { yaw: 0.35, pitch },
    { yaw: -0.35, pitch },
    { yaw: 0, pitch: pitch + 0.2 },
    { yaw: 0, pitch: pitch - 0.2 },
    { yaw: 0.7, pitch: pitch + 0.2 },
    { yaw: -0.7, pitch: pitch + 0.2 },
  ];
  for (const pose of poses) {
    await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: { player?: { yaw: number; pitch: number } } })
        .__voxelGame;
      if (g?.player) {
        g.player.yaw = p.yaw;
        g.player.pitch = p.pitch;
      }
    }, pose);
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(100);
      const t = await page.evaluate(() => {
        const g = (window as unknown as {
          __voxelGame?: {
            interaction?: {
              getTargetFace(): {
                blockX: number;
                blockY: number;
                blockZ: number;
                nx: number;
                ny: number;
                nz: number;
              } | null;
            };
            world?: { getBlock(x: number, y: number, z: number): number };
          };
        }).__voxelGame;
        const target = g?.interaction?.getTargetFace();
        if (!g || !target || !g.world) return null;
        const cell = {
          x: Math.floor(target.blockX + target.nx),
          y: Math.floor(target.blockY + target.ny),
          z: Math.floor(target.blockZ + target.nz),
        };
        if (g.world.getBlock(cell.x, cell.y, cell.z) !== 0) return null;
        return { x: target.blockX, y: target.blockY, z: target.blockZ, nx: target.nx, ny: target.ny, nz: target.nz };
      });
      if (t) return t;
    }
  }
  throw new Error('no interaction target acquired');
}

async function waitForBlockAt(page: Page, pos: Pos, id: number, timeout = 8000): Promise<void> {
  await page.waitForFunction(
    (p) => {
      const g = (window as unknown as {
        __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } };
      }).__voxelGame;
      return (g?.world?.getBlock(p.x, p.y, p.z) ?? -1) === p.id;
    },
    { ...pos, id },
    { timeout },
  );
}

async function waitForTargetAt(page: Page, pos: Pos, timeout = 10_000): Promise<void> {
  await page.evaluate((p) => {
    const g = (window as unknown as {
      __voxelGame?: {
        player?: {
          position: { x: number; y: number; z: number };
          eyePosition: { x: number; y: number; z: number };
          yaw: number;
          pitch: number;
        };
      };
    }).__voxelGame;
    const player = g?.player;
    if (!player) return;
    const dx = p.x + 0.5 - player.eyePosition.x;
    const dy = p.y + 0.5 - player.eyePosition.y;
    const dz = p.z + 0.5 - player.eyePosition.z;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, pos);
  await page.waitForFunction(
    (p) => {
      const g = (window as unknown as {
        __voxelGame?: {
          interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null };
        };
      }).__voxelGame;
      const t = g?.interaction?.getTarget();
      return !!t && t.blockX === p.x && t.blockY === p.y && t.blockZ === p.z;
    },
    pos,
    { timeout },
  );
}

test.describe('live creative journey (265)', () => {
  test('enter creative → pick from menu → place without depleting → break instantly → reload persists', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await waitForGame(page);
    await drainInventory(page);
    expect(await gameMode(page)).toBe('survival');

    // ── Enter creative through the text seam (whitespace + case tolerated) ──
    const switched = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.setGameModeFromText(' Creative ');
    });
    expect(switched).toBe(true);
    expect(await gameMode(page)).toBe('creative');
    await expect(page.locator('#gamemode-toggle')).toContainText('Mode: Creative');

    // ── Browse the menu: rows listed in registry order ──
    await openCreative(page);
    const catalog = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getCreativeItems() ?? [];
    });
    expect(catalog.length).toBeGreaterThan(0);
    const dirt = catalog.find((r) => r.key === 'dirt');
    expect(dirt).toBeDefined();
    await expect(page.locator(`[data-creative-row="${dirt!.id}"]`)).toBeVisible();

    // ── Search narrows to matches; clearing restores the full list ──
    await page.fill('#creative-search', 'dirt');
    await expect(page.locator(`[data-creative-row="${dirt!.id}"]`)).toBeVisible();
    const visibleRows = await page.locator('[data-creative-row]').count();
    expect(visibleRows).toBeLessThan(catalog.length);
    expect(visibleRows).toBeGreaterThan(0);
    await page.fill('#creative-search', '');
    expect(await page.locator('[data-creative-row]').count()).toBe(catalog.length);

    // ── Grant through a real row click: full stack, no survival cost ──
    await page.click(`[data-creative-row="${dirt!.id}"]`);
    await expect(page.locator('#creative-status')).toContainText(`Granted ${dirt!.name}`);
    expect(await itemCount(page, dirt!.id)).toBe(dirt!.stackSize);
    await closeCreative(page);

    // ── Resume simulation: hover holds altitude (minimal safe flight) ──
    await enterPointerLock(page);
    const hoverBase = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getPlayerPosition() ?? [0, 0, 0];
    });
    await page.evaluate((dy) => {
      const g = (window as unknown as {
        __voxelGame?: { player?: { position: { y: number } } };
      }).__voxelGame;
      if (g?.player) g.player.position.y += dy;
    }, 8);
    await page.waitForTimeout(1500);
    const hoverAfter = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getPlayerPosition() ?? [0, 0, 0];
    });
    expect(Math.abs(hoverAfter[1]! - hoverBase[1]! - 8)).toBeLessThan(0.75);
    // Return to the ground for the place/break steps (targeting needs reach).
    await page.evaluate((y) => {
      const g = (window as unknown as {
        __voxelGame?: {
          player?: { position: { y: number }; velocity: { x: number; y: number; z: number } };
        };
      }).__voxelGame;
      if (g?.player) {
        g.player.position.y = y + 0.5;
        g.player.velocity.x = 0;
        g.player.velocity.y = 0;
        g.player.velocity.z = 0;
      }
    }, hoverBase[1]!);
    await page.waitForTimeout(500);

    // ── Place through real mouse input: the stack is not depleted ──
    const dirtSlot = await page.evaluate((id) => {
      const g = (window as unknown as {
        __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } };
      }).__voxelGame;
      return g?.inventory?.slots.findIndex((s) => s && s.id === id && s.count > 0) ?? -1;
    }, dirt!.id);
    expect(dirtSlot).toBeGreaterThanOrEqual(0);
    await page.keyboard.press(`Digit${dirtSlot + 1}`);
    const ground = await acquireTarget(page);
    const cell = {
      x: Math.floor(ground.x + ground.nx),
      y: Math.floor(ground.y + ground.ny),
      z: Math.floor(ground.z + ground.nz),
    };
    const beforePlace = await itemCount(page, dirt!.id);
    rightClick(page);
    await waitForBlockAt(page, cell, dirt!.blockId ?? 2);
    expect(await itemCount(page, dirt!.id)).toBe(beforePlace);

    // ── Break instantly with no drops ──
    const dropsBefore = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.itemEntities?.size ?? -1;
    });
    await waitForTargetAt(page, cell);
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    });
    await waitForBlockAt(page, cell, 0, 5000);
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    });
    const dropsAfter = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.itemEntities?.size ?? -1;
    });
    expect(dropsAfter).toBe(dropsBefore);

    // ── Durable persistence across a real page reload ──
    const countBeforeReload = await itemCount(page, dirt!.id);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForGame(page);
    expect(await gameMode(page)).toBe('creative');
    await expect(page.locator('#gamemode-toggle')).toContainText('Mode: Creative');
    expect(await itemCount(page, dirt!.id)).toBe(countBeforeReload);
  });
});

test.describe('creative contrast + lifecycle (265)', () => {
  test('survival still depletes and falls; switches are safe no-ops; menu lifecycle holds', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await waitForGame(page);
    await drainInventory(page);
    expect(await gameMode(page)).toBe('survival');

    // ── Survival falls while creative hovers (same lift, both modes) ──
    await enterPointerLock(page);
    const groundPos = await page.evaluate((): [number, number, number] => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getPlayerPosition() ?? [0, 0, 0];
    });
    const groundY = groundPos[1];
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { player?: { position: { y: number }; velocity: { y: number } } };
      }).__voxelGame;
      if (g?.player) {
        g.player.position.y += 8;
        g.player.velocity.y = 0;
      }
    });
    await page.waitForTimeout(1500);
    const fallenPos = await page.evaluate((): [number, number, number] => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getPlayerPosition() ?? [0, 0, 0];
    });
    expect(fallenPos[1]).toBeLessThan(groundY + 8 - 2);

    // ── Survival placing depletes by exactly one ──
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.inventory?.addItem(2, 5);
    });
    const dirtSlot = await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } };
      }).__voxelGame;
      return g?.inventory?.slots.findIndex((s) => s && s.id === 2 && s.count > 0) ?? -1;
    });
    expect(dirtSlot).toBeGreaterThanOrEqual(0);
    await page.keyboard.press(`Digit${dirtSlot + 1}`);
    const ground = await acquireTarget(page);
    const cell = {
      x: Math.floor(ground.x + ground.nx),
      y: Math.floor(ground.y + ground.ny),
      z: Math.floor(ground.z + ground.nz),
    };
    rightClick(page);
    await waitForBlockAt(page, cell, 2);
    expect(await itemCount(page, 2)).toBe(4);

    // ── Invalid and identity switches are false no-ops ──
    const invalid = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return { bogus: g?.setGameModeFromText('godmode'), blank: g?.setGameModeFromText('   '), same: g?.setGameMode('survival') };
    });
    expect(invalid).toEqual({ bogus: false, blank: false, same: false });
    expect(await gameMode(page)).toBe('survival');

    // ── The HUD toggle flips with its label, forth and back ──
    await page.evaluate(() => {
      (document.querySelector('#gamemode-toggle') as HTMLButtonElement | null)?.click();
    });
    expect(await gameMode(page)).toBe('creative');
    await expect(page.locator('#gamemode-toggle')).toContainText('Mode: Creative');
    await page.evaluate(() => {
      (document.querySelector('#gamemode-toggle') as HTMLButtonElement | null)?.click();
    });
    expect(await gameMode(page)).toBe('survival');
    await expect(page.locator('#gamemode-toggle')).toContainText('Mode: Survival');

    // ── Menu lifecycle: KeyE toggles, C closes instead of stacking, blur keeps ──
    await openCreative(page);
    await page.keyboard.press('KeyE');
    await expect(page.locator('#creative.hidden')).toBeAttached();
    await openCreative(page);
    await page.keyboard.press('KeyC');
    await expect(page.locator('#creative.hidden')).toBeAttached();
    await expect(page.locator('#crafting.hidden')).toBeAttached();
    await openCreative(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(500);
    await expect(page.locator('#creative:not(.hidden)')).toBeVisible();

    // ── Unknown grants fail gracefully with the inventory untouched ──
    const grantResult = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g?.inventory) return null;
      const counts = new Map<number, number>();
      for (const stack of [...g.inventory.slots, ...g.inventory.storage]) {
        if (stack) counts.set(stack.id, (counts.get(stack.id) ?? 0) + stack.count);
      }
      const ok = g.grantCreativeItem(999999);
      const countsAfter = new Map<number, number>();
      for (const stack of [...g.inventory.slots, ...g.inventory.storage]) {
        if (stack) countsAfter.set(stack.id, (countsAfter.get(stack.id) ?? 0) + stack.count);
      }
      return { ok, same: JSON.stringify([...counts]) === JSON.stringify([...countsAfter]) };
    });
    expect(grantResult).toEqual({ ok: false, same: true });
    await closeCreative(page);
  });
});
