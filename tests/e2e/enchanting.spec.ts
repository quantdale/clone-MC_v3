import { test, expect, type Page } from '@playwright/test';

/**
 * Live enchanting panel journey (259, closes certification debt R-3).
 *
 * Drives the REAL production artifact through the player loop: place an
 * enchanting table, open the panel with a held pickaxe, see the three
 * generated offers, reselect between offers, apply through a real Apply
 * click (XP + lapis deducted, stack enchanted), survive a page reload via
 * the player snapshot, and close cleanly. The `__voxelGame` handle is used
 * only for inventory/XP setup and read-only state observation — the apply
 * under test always goes through real DOM clicks.
 */

type Pos = { x: number; y: number; z: number };
type TargetFace = Pos & { nx: number; ny: number; nz: number };

const TABLE_ITEM = 31;
const TABLE_BLOCK = 32;
const PICKAXE_ITEM = 20;

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
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
        return {
          x: target.blockX,
          y: target.blockY,
          z: target.blockZ,
          nx: target.nx,
          ny: target.ny,
          nz: target.nz,
        };
      });
      if (t) return t;
    }
  }
  throw new Error('no interaction target acquired');
}

async function aimAt(page: Page, pos: Pos): Promise<void> {
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
}

async function waitForTargetAt(page: Page, pos: Pos, timeout = 10_000): Promise<void> {
  await aimAt(page, pos);
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

interface EnchantView {
  level: number;
  lapis: number;
  offerCount: number;
  nonEmpty: number[];
  status: string;
  enchantments: Record<string, number> | null;
  open: boolean;
}

async function enchantView(page: Page): Promise<EnchantView> {
  return page.evaluate(() => {
    const g = (window as unknown as {
      __voxelGame?: {
        experience?: { level: number };
        inventory?: {
          getItemCount(id: number): number;
          getSelectedStack(): {
            components?: { entries(): Array<[{ path?: string }, unknown]> };
          } | null;
        };
        getEnchantingSession(): {
          offers: Array<{ enchantments: Array<{ id: unknown; level: number }> }>;
        } | null;
        isEnchantingOpen?: boolean;
      };
    }).__voxelGame;
    const session = g?.getEnchantingSession() ?? null;
    const stack = g?.inventory?.getSelectedStack() ?? null;
    let enchantments: Record<string, number> | null = null;
    const entries = stack?.components?.entries?.() as
      | Array<[{ path?: string }, unknown]>
      | undefined;
    if (entries) {
      for (const [key, value] of entries) {
        if (key?.path === 'enchantments' && value && typeof value === 'object') {
          enchantments = value as Record<string, number>;
        }
      }
    }
    const nonEmpty: number[] = [];
    (session?.offers ?? []).forEach((offer, i) => {
      if (offer.enchantments.length > 0) nonEmpty.push(i);
    });
    return {
      level: g?.experience?.level ?? -1,
      lapis: g?.inventory?.getItemCount(28) ?? -1,
      offerCount: session?.offers.length ?? 0,
      nonEmpty,
      status:
        (document.querySelector('#enchanting-status') as HTMLElement | null)?.textContent ?? '',
      enchantments,
      open: g?.isEnchantingOpen ?? false,
    };
  });
}

async function selectSlotWithItem(page: Page, id: number): Promise<void> {
  const slot = await page.evaluate((itemId) => {
    const g = (window as unknown as {
      __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } };
    }).__voxelGame;
    return g?.inventory?.slots.findIndex((s) => s && s.id === itemId && s.count > 0) ?? -1;
  }, id);
  expect(slot).toBeGreaterThanOrEqual(0);
  await page.keyboard.press(`Digit${slot + 1}`);
}

test.describe('live enchanting journey (259)', () => {
  test('place → open → reselect → apply → reload persists → close', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);

    // ── Setup: table + pickaxe + lapis + XP levels ──────────────────────
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: {
          inventory?: { addItem(id: number, amount: number): number };
          experience?: { addXp(amount: number): void };
        };
      }).__voxelGame;
      g?.inventory?.addItem(31, 1);
      g?.inventory?.addItem(20, 1);
      g?.inventory?.addItem(28, 30);
      g?.experience?.addXp(4000);
    });
    await enterPointerLock(page);

    // ── Place the enchanting table ──────────────────────────────────────
    await selectSlotWithItem(page, TABLE_ITEM);
    const ground = await acquireTarget(page);
    const cell = {
      x: Math.floor(ground.x + ground.nx),
      y: Math.floor(ground.y + ground.ny),
      z: Math.floor(ground.z + ground.nz),
    };
    rightClick(page);
    await waitForBlockAt(page, cell, TABLE_BLOCK);

    // ── Hold the pickaxe; right-clicking the table opens the panel ──────
    await selectSlotWithItem(page, PICKAXE_ITEM);
    await waitForTargetAt(page, cell);
    rightClick(page);
    await expect(page.locator('#enchanting')).toBeVisible();
    await expect(page.locator('#hotbar')).toBeHidden();

    let view = await enchantView(page);
    expect(view.open).toBe(true);
    expect(view.offerCount).toBe(3);
    expect(view.nonEmpty.length).toBeGreaterThanOrEqual(2);
    expect(view.level).toBeGreaterThan(0);
    expect(view.lapis).toBe(30);
    await expect(page.locator('#enchanting-item')).toContainText('Wooden Pickaxe');
    for (const i of view.nonEmpty) {
      await expect(page.locator(`#enchanting-offer-${i}`)).toBeVisible();
    }

    // ── Reselect: click one offer, then another ─────────────────────────
    const [first, second] = view.nonEmpty;
    await page.click(`#enchanting-offer-${first}`);
    await expect(page.locator('#enchanting-status')).toContainText(
      `Offer ${first! + 1} selected:`,
    );
    await page.click(`#enchanting-offer-${second}`);
    await expect(page.locator('#enchanting-status')).toContainText(
      `Offer ${second! + 1} selected:`,
    );

    // ── Apply through the real Apply button ─────────────────────────────
    const levelBefore = view.level;
    await page.click('#enchanting-apply');
    await expect(page.locator('#enchanting-status')).toContainText('Enchanted with');
    view = await enchantView(page);
    expect(view.enchantments).not.toBeNull();
    expect(Object.keys(view.enchantments!).length).toBeGreaterThan(0);
    expect(view.level).toBeLessThan(levelBefore);
    expect(view.lapis).toBeLessThan(30);
    const appliedEnchantments = JSON.stringify(view.enchantments);
    const appliedLevel = view.level;

    // ── Close; the overlay returns ──────────────────────────────────────
    await page.click('#enchanting-close');
    await expect(page.locator('#enchanting')).toBeHidden();
    await expect(page.locator('#overlay')).toBeVisible();

    // ── Durable persistence across a real page reload (289) ─────────────
    // Await a real persist signal rather than a bare sleep: pagehide starts
    // flush(es); we then explicitly flush and require pendingCount === 0 so
    // the post-apply inventory components are durable before reload.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    const flushResult = await page.evaluate(async () => {
      const g = (window as unknown as {
        __voxelGame?: {
          persistence?: {
            flush(): Promise<{ committed: number; failed: number }>;
            pendingCount: number;
          };
        };
      }).__voxelGame;
      if (!g?.persistence) return { ok: false as const, pending: -1, committed: -1, failed: -1 };
      const r = await g.persistence.flush();
      return {
        ok: true as const,
        pending: g.persistence.pendingCount,
        committed: r.committed,
        failed: r.failed,
      };
    });
    expect(flushResult.ok).toBe(true);
    expect(flushResult.pending).toBe(0);
    expect(flushResult.failed).toBe(0);
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
    await selectSlotWithItem(page, PICKAXE_ITEM);
    view = await enchantView(page);
    expect(JSON.stringify(view.enchantments)).toBe(appliedEnchantments);
    expect(view.level).toBe(appliedLevel);
  });

  test('walk-away closes; focus loss keeps the panel without overlay stacking', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await waitForGame(page);
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: {
          inventory?: { addItem(id: number, amount: number): number };
          experience?: { addXp(amount: number): void };
        };
      }).__voxelGame;
      g?.inventory?.addItem(31, 1);
      g?.inventory?.addItem(20, 1);
      g?.inventory?.addItem(28, 5);
      g?.experience?.addXp(4000);
    });
    await enterPointerLock(page);

    await selectSlotWithItem(page, TABLE_ITEM);
    const ground = await acquireTarget(page);
    const cell = {
      x: Math.floor(ground.x + ground.nx),
      y: Math.floor(ground.y + ground.ny),
      z: Math.floor(ground.z + ground.nz),
    };
    rightClick(page);
    await waitForBlockAt(page, cell, TABLE_BLOCK);

    await selectSlotWithItem(page, PICKAXE_ITEM);
    await waitForTargetAt(page, cell);
    rightClick(page);
    await expect(page.locator('#enchanting')).toBeVisible();

    // Focus loss while the panel is open does NOT stack the pause overlay.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#enchanting')).toBeVisible();
    await expect(page.locator('#overlay')).toBeHidden();

    // Moving the hotbar selection voids the session (guard): the panel
    // closes and the overlay returns; a later apply spends nothing.
    const selected = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { inventory?: { selected: number } } })
        .__voxelGame;
      return g?.inventory?.selected ?? 0;
    });
    await page.keyboard.press(`Digit${((selected + 1) % 9) + 1}`);
    await expect(page.locator('#enchanting')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('#overlay')).toBeVisible();

    // Reopen for the walk-away leg.
    await enterPointerLock(page);
    await selectSlotWithItem(page, PICKAXE_ITEM);
    await waitForTargetAt(page, cell);
    rightClick(page);
    await expect(page.locator('#enchanting')).toBeVisible();

    // Walking away closes the panel and returns the overlay.
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { player?: { position: { x: number; y: number; z: number } } };
      }).__voxelGame;
      if (g?.player) {
        g.player.position.x += 60;
      }
    });
    await expect(page.locator('#enchanting')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('#overlay')).toBeVisible();
  });
});
