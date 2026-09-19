import { test, expect, type Page } from '@playwright/test';

/**
 * Live smoker journey (281): the smoker uses the real placement, interaction,
 * shared furnace menu, fixed-tick host, IndexedDB reload, and break paths.
 */

type Pos = { x: number; y: number; z: number };
type TargetFace = {
  blockX: number;
  blockY: number;
  blockZ: number;
  nx: number;
  ny: number;
  nz: number;
};
interface SmokerStateView {
  input: { item: string | null; count: number };
  fuel: { item: string | null; count: number };
  output: { item: string | null; count: number };
  burnTime: number;
  burnTimeTotal: number;
  smeltTime: number;
  smeltTimeTotal: number;
  xp: number;
}

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
}

async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(
    () => document.pointerLockElement !== null,
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () =>
      (window as unknown as { __voxelGame?: { inputHandle?: { isLocked(): boolean } } }).__voxelGame?.inputHandle?.isLocked?.() === true,
    { timeout: 5000 },
  );
}

function rightClick(page: Page): void {
  void page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
  });
}

async function acquireTarget(page: Page): Promise<TargetFace> {
  const poses = [
    { yaw: 0, pitch: -0.5 },
    { yaw: 0.35, pitch: -0.5 },
    { yaw: -0.35, pitch: -0.5 },
    { yaw: 0, pitch: -0.3 },
    { yaw: 0, pitch: -0.7 },
    { yaw: 0.7, pitch: -0.3 },
    { yaw: -0.7, pitch: -0.3 },
  ];
  for (const pose of poses) {
    await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: { player?: { yaw: number; pitch: number } } }).__voxelGame;
      if (g?.player) {
        g.player.yaw = p.yaw;
        g.player.pitch = p.pitch;
      }
    }, pose);
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(100);
      const target = await page.evaluate(() => {
        const g = (window as unknown as {
          __voxelGame?: {
            interaction?: { getTargetFace(): TargetFace | null };
            world?: { getBlock(x: number, y: number, z: number): number };
          };
        }).__voxelGame;
        const t = g?.interaction?.getTargetFace();
        if (!t || !g?.world) return null;
        const cell = {
          x: Math.floor(t.blockX + t.nx),
          y: Math.floor(t.blockY + t.ny),
          z: Math.floor(t.blockZ + t.nz),
        };
        return g.world.getBlock(cell.x, cell.y, cell.z) === 0 ? t : null;
      });
      if (target) return target;
    }
  }
  throw new Error('no smoker placement target acquired');
}

async function aimAt(page: Page, pos: Pos): Promise<void> {
  await page.evaluate((p) => {
    const g = (window as unknown as {
      __voxelGame?: {
        player?: {
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
}

async function waitForTargetAt(page: Page, pos: Pos): Promise<void> {
  await aimAt(page, pos);
  await page.waitForFunction(
    (p) => {
      const g = (window as unknown as {
        __voxelGame?: {
          interaction?: {
            getTarget(): { blockX: number; blockY: number; blockZ: number } | null;
          };
        };
      }).__voxelGame;
      const t = g?.interaction?.getTarget();
      return !!t && t.blockX === p.x && t.blockY === p.y && t.blockZ === p.z;
    },
    pos,
    { timeout: 10_000 },
  );
}

async function waitForBlockAt(page: Page, pos: Pos, id: number, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    (p) => {
      const g = (window as unknown as {
        __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } };
      }).__voxelGame;
      return g?.world?.getBlock(p.x, p.y, p.z) === p.id;
    },
    { ...pos, id },
    { timeout },
  );
}

async function smokerState(page: Page, pos: Pos): Promise<SmokerStateView | null> {
  return page.evaluate((p) => {
    const g = (window as unknown as {
      __voxelGame?: {
        blockEntityHost?: {
          getSmokerState(x: number, y: number, z: number): SmokerStateView | null;
        };
      };
    }).__voxelGame;
    return g?.blockEntityHost?.getSmokerState(p.x, p.y, p.z) ?? null;
  }, pos);
}

async function placeSmoker(page: Page): Promise<Pos> {
  const slot = await page.evaluate(() => {
    const g = (window as unknown as {
      __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } };
    }).__voxelGame;
    return g?.inventory?.slots.findIndex((s) => s?.id === 72 && s.count > 0) ?? -1;
  });
  expect(slot).toBeGreaterThanOrEqual(0);
  await page.keyboard.press(`Digit${slot + 1}`);
  const ground = await acquireTarget(page);
  const cell = {
    x: Math.floor(ground.blockX + ground.nx),
    y: Math.floor(ground.blockY + ground.ny),
    z: Math.floor(ground.blockZ + ground.nz),
  };
  rightClick(page);
  await waitForBlockAt(page, cell, 64);
  return cell;
}

test.describe('live smoker workstation (281)', () => {
  test('place → open → twice-fast cook → reload → break without resurrection', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { inventory?: { addItem(id: number, amount: number): number } };
      }).__voxelGame;
      g?.inventory?.addItem(72, 1);
      g?.inventory?.addItem(4, 4);
      g?.inventory?.addItem(23, 1);
    });
    await enterPointerLock(page);

    const cell = await placeSmoker(page);
    const sandSlotBeforeUse = await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } };
      }).__voxelGame;
      return g?.inventory?.slots.findIndex((s) => s?.id === 4 && s.count > 0) ?? -1;
    });
    expect(sandSlotBeforeUse).toBeGreaterThanOrEqual(0);
    await page.keyboard.press(`Digit${sandSlotBeforeUse + 1}`);
    const sandCountBeforeUse = await page.evaluate((index) => {
      const g = (window as unknown as {
        __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } };
      }).__voxelGame;
      return g?.inventory?.slots[index]?.count ?? 0;
    }, sandSlotBeforeUse);
    await waitForTargetAt(page, cell);
    rightClick(page);
    await expect(page.locator('#furnace')).toBeVisible();
    await expect(page.locator('#furnace-title')).toHaveText('Smoker');
    await expect(page.locator('#furnace')).toHaveAttribute('aria-label', 'Smoker screen');
    await expect(page.locator('#furnace-close')).toHaveAttribute('aria-label', 'Close smoker');
    const sandCountAfterUse = await page.evaluate((index) => {
      const g = (window as unknown as {
        __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } };
      }).__voxelGame;
      return g?.inventory?.slots[index]?.count ?? 0;
    }, sandSlotBeforeUse);
    expect(sandCountAfterUse).toBe(sandCountBeforeUse);

    const sandSlot = await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } };
      }).__voxelGame;
      return g?.inventory?.slots.findIndex((s) => s?.id === 4 && s.count > 0) ?? -1;
    });
    const coalSlot = await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } };
      }).__voxelGame;
      return g?.inventory?.slots.findIndex((s) => s?.id === 23 && s.count > 0) ?? -1;
    });
    expect(sandSlot).toBeGreaterThanOrEqual(0);
    expect(coalSlot).toBeGreaterThanOrEqual(0);
    await page.click(`#furnace [data-slot-index="${3 + sandSlot}"]`, { modifiers: ['Shift'] });
    await page.click(`#furnace [data-slot-index="${3 + coalSlot}"]`, { modifiers: ['Shift'] });
    await page.waitForFunction((p) => {
      const g = (window as unknown as {
        __voxelGame?: { blockEntityHost?: { getSmokerState(x: number, y: number, z: number): SmokerStateView | null } };
      }).__voxelGame;
      const s = g?.blockEntityHost?.getSmokerState(p.x, p.y, p.z);
      return s?.input.item === 'minecraft:sand' && s.fuel.item === 'minecraft:coal';
    }, cell, { timeout: 5000 });
    const inserted = await smokerState(page, cell);
    expect(inserted?.input.item).toBe('minecraft:sand');
    expect(inserted?.fuel.item).toBe('minecraft:coal');
    await page.click('#furnace-close');
    await enterPointerLock(page);

    await page.waitForFunction((p) => {
      const g = (window as unknown as {
        __voxelGame?: { blockEntityHost?: { getSmokerState(x: number, y: number, z: number): SmokerStateView | null } };
      }).__voxelGame;
      return (g?.blockEntityHost?.getSmokerState(p.x, p.y, p.z)?.output.count ?? 0) >= 1;
    }, cell, { timeout: 15_000 });
    const cooked = await smokerState(page, cell);
    expect(cooked?.output.item).toBe('minecraft:glass');
    expect(cooked?.output.count).toBeGreaterThanOrEqual(1);

    // Collect the output through the shared output slot before taking the
    // durable snapshot, matching the furnace contract while proving the
    // smoker's result is a normal menu transaction.
    await waitForTargetAt(page, cell);
    rightClick(page);
    await expect(page.locator('#furnace')).toBeVisible();
    await expect(page.locator('#furnace [data-slot-index="2"][aria-label*="Glass, 1"]')).toBeVisible();
    await page.click('#furnace [data-slot-index="2"]', { modifiers: ['Shift'] });
    await page.waitForFunction((p) => {
      const g = (window as unknown as {
        __voxelGame?: { blockEntityHost?: { getSmokerState(x: number, y: number, z: number): SmokerStateView | null } };
      }).__voxelGame;
      return g?.blockEntityHost?.getSmokerState(p.x, p.y, p.z)?.output.item === null;
    }, cell, { timeout: 5000 });
    await page.click('#furnace-close');
    const beforeReload = await smokerState(page, cell);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
    const restored = await smokerState(page, cell);
    expect(restored).not.toBeNull();
    expect(restored?.input).toEqual(beforeReload?.input);
    expect(restored?.fuel).toEqual(beforeReload?.fuel);
    expect(restored?.output).toEqual(beforeReload?.output);
    expect(restored?.burnTime).toBe(beforeReload?.burnTime);
    expect(restored?.smeltTime).toBe(beforeReload?.smeltTime);

    await enterPointerLock(page);
    await waitForTargetAt(page, cell);
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
    await waitForBlockAt(page, cell, 0, 25_000);
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })));
    const hasAfterBreak = await page.evaluate((p) => {
      const g = (window as unknown as {
        __voxelGame?: { blockEntityHost?: { hasSmoker(x: number, y: number, z: number): boolean } };
      }).__voxelGame;
      return g?.blockEntityHost?.hasSmoker(p.x, p.y, p.z) ?? true;
    }, cell);
    expect(hasAfterBreak).toBe(false);

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
    const afterReload = await smokerState(page, cell);
    expect(afterReload).toBeNull();
  });

  test('focus loss and container toggle refuse stacked sessions', async ({ page }) => {
    await waitForGame(page);
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { inventory?: { addItem(id: number, amount: number): number } };
      }).__voxelGame;
      g?.inventory?.addItem(72, 1);
    });
    await enterPointerLock(page);

    const cell = await placeSmoker(page);
    await waitForTargetAt(page, cell);
    rightClick(page);
    await expect(page.locator('#furnace')).toBeVisible();
    await expect(page.locator('#furnace-title')).toHaveText('Smoker');

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#furnace')).toBeVisible();
    await expect(page.locator('#overlay')).toBeHidden();

    // The shared container toggle closes the smoker instead of stacking a
    // second screen over it, and the live entity remains authoritative.
    await page.keyboard.press('KeyC');
    await expect(page.locator('#furnace')).toBeHidden();
    await expect(page.locator('#overlay')).toBeVisible();
    await enterPointerLock(page);
    await expect(page.locator('#furnace')).toBeHidden();
    const remains = await smokerState(page, cell);
    expect(remains).not.toBeNull();
  });
});
