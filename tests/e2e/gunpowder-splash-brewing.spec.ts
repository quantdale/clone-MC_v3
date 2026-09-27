import { test, expect, type Page } from '@playwright/test';

/**
 * Gunpowder + splash brewing survival loop (297).
 *
 * Drives the REAL production artifact: a raid witch dies (same
 * `damageRaider` death path as melee) and drops gunpowder as a real item
 * entity (drop RNG scripted so the roll is gunpowder), the player walks onto
 * it and the fixed tick picks it up; a real brewing stand brews awkward +
 * redstone into speed, then + gunpowder into SPLASH speed with the effect
 * preserved; the collected splash potion is thrown through the real throw path
 * and applies speed to the player. `__voxelGame` is used for setup (stand,
 * awkward bottle via the 260 seam since glass/water bottles do not exist,
 * redstone, blaze powder), the scripted drop RNG, teleporting onto the drop,
 * clearing the remaining raid waves, and read-only observation.
 */

type Pos = { x: number; y: number; z: number };
type TargetFace = Pos & { nx: number; ny: number; nz: number };
type Effect = { typeId: string; duration: number; amplifier: number };
type Contents = { base?: string; kind: string; customEffects: Effect[] };
type SlotView = { item: string | null; count: number; components?: Record<string, unknown> };
type BrewingStateView = { bottle: SlotView; fuel: SlotView; ingredient: SlotView; brewTime: number };

type GameHandle = {
  debugSetMobDropRandomSequence(values: number[] | null): boolean;
  getLastMobDrops(): { typeKey: string; x: number; y: number; z: number; stacks: { item: number; count: number }[] } | null;
  debugStartRaid(badOmenLevel?: number): { status: string };
  debugClearRaidWave(): { status: string } | null;
  getRaiderRenderState(): { expected: { kind: string; entityId: number }[] };
  debugDamageRaidEntity(entityId: number, amount: number): boolean;
  debugThrowSplashPotion(yaw?: number, pitch?: number): boolean;
  debugTickSplashPotions(n?: number): number;
  getSplashPotionState(): {
    potions: { thrower: string; effects: string[] }[];
    shatters: { thrower: string; affected: { kind: string; effects: { typeId: string; durationSeconds: number; amplifier: number }[] }[] }[];
  };
  getPlayerEffect(key: string): { duration: number; amplifier: number } | null;
  testGrantAwkwardBottle(): number;
  itemEntities: { getItemEntities(): { item: number; count: number; x: number; y: number; z: number }[] };
  inventory: {
    slots: Array<{ id: number; count: number }>;
    addItem(id: number, amount: number): number;
    getItemCount(id: number): number;
    select(i: number): void;
    getSelectedStack(): { id: number; count: number } | null;
  };
  player: { position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void } };
  blockEntityHost: { getBrewingState(x: number, y: number, z: number): BrewingStateView | null };
};

const GUNPOWDER = 73;
const REDSTONE = 37;
const BLAZE_POWDER = 65;
const POTION = 66;
const STAND_ITEM = 64;
const STAND_BLOCK = 62;
const CONTENTS_KEY = 'minecraft:potion_contents';

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null,
    null,
    { timeout: 120_000 },
  );
}

async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(() => document.pointerLockElement !== null, { timeout: 5000 });
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

/** Aim down-forward and wait until a placeable interaction target exists. */
async function acquireTarget(page: Page, pitch = -0.5): Promise<TargetFace> {
  const poses = [
    { yaw: 0, pitch },
    { yaw: 0.35, pitch },
    { yaw: -0.35, pitch },
    { yaw: 0, pitch: pitch + 0.2 },
    { yaw: 0, pitch: pitch - 0.2 },
    { yaw: 0.7, pitch: pitch + 0.2 },
    { yaw: -0.7, pitch: pitch + 0.2 },
    { yaw: Math.PI, pitch },
    { yaw: Math.PI / 2, pitch },
    { yaw: -Math.PI / 2, pitch },
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
      const t = await page.evaluate(() => {
        const g = (window as unknown as {
          __voxelGame?: {
            interaction?: {
              getTargetFace(): { blockX: number; blockY: number; blockZ: number; nx: number; ny: number; nz: number } | null;
            };
            world?: { getBlock(x: number, y: number, z: number): number };
          };
        }).__voxelGame;
        const target = g?.interaction?.getTargetFace();
        if (!g || !target || !g.world) return null;
        if (target.ny !== 1) return null; // place on top of a surface
        const cell = { x: target.blockX + target.nx, y: target.blockY + target.ny, z: target.blockZ + target.nz };
        if (g.world.getBlock(cell.x, cell.y, cell.z) !== 0) return null;
        return { x: target.blockX, y: target.blockY, z: target.blockZ, nx: target.nx, ny: target.ny, nz: target.nz };
      });
      if (t) return t;
    }
  }
  throw new Error('no interaction target acquired');
}

async function aimAt(page: Page, pos: Pos): Promise<void> {
  await page.evaluate((p) => {
    const g = (window as unknown as {
      __voxelGame?: { player?: { eyePosition: { x: number; y: number; z: number }; yaw: number; pitch: number } };
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
      const g = (window as unknown as { __voxelGame?: { interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null } } }).__voxelGame;
      const t = g?.interaction?.getTarget();
      return !!t && t.blockX === p.x && t.blockY === p.y && t.blockZ === p.z;
    },
    pos,
    { timeout },
  );
}

async function hotbarSlotWith(page: Page, id: number): Promise<number> {
  return page.evaluate((itemId) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
    return g.inventory.slots.findIndex((s) => s && s.id === itemId && s.count > 0);
  }, id);
}

async function brewingState(page: Page, pos: Pos): Promise<BrewingStateView | null> {
  return page.evaluate((p) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
    return g.blockEntityHost.getBrewingState(p.x, p.y, p.z);
  }, pos);
}

async function waitForBrewing(page: Page, pos: Pos, field: 'bottle' | 'fuel' | 'ingredient', item: string | null): Promise<void> {
  await page.waitForFunction(
    ({ p, f, it }) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return g.blockEntityHost.getBrewingState(p.x, p.y, p.z)?.[f].item === it;
    },
    { p: pos, f: field, it: item },
    { timeout: 5000 },
  );
}

async function quickMoveIntoStand(page: Page, id: number): Promise<void> {
  const slot = await hotbarSlotWith(page, id);
  expect(slot).toBeGreaterThanOrEqual(0);
  await page.click(`#brewing [data-slot-index="${3 + slot}"]`, { modifiers: ['Shift'] });
}

async function openStand(page: Page, pos: Pos): Promise<void> {
  await enterPointerLock(page);
  await waitForTargetAt(page, pos);
  rightClick(page);
  await expect(page.locator('#brewing')).toBeVisible();
}

async function closeStand(page: Page): Promise<void> {
  await page.click('#brewing-close');
  await expect(page.locator('#brewing')).toBeHidden();
  await expect(page.locator('#overlay')).toBeVisible();
}

function contentsOf(s: SlotView | undefined): Contents | undefined {
  return s?.components?.[CONTENTS_KEY] as Contents | undefined;
}

test.describe('gunpowder and splash brewing (297)', () => {
  test('witch gunpowder → brew splash speed in a real stand → throw → speed applied', async ({ page }) => {
    test.setTimeout(300_000); // two 400-tick brews on real frames + boot
    await waitForGame(page);

    // ── A raid witch dies and drops gunpowder (scripted roll: 1× gunpowder ×2) ──
    const kill = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      for (const s of g.inventory.slots) s.count = 0; // free the hotbar for the journey
      const refused = g.debugSetMobDropRandomSequence([1.5]);
      const scripted = g.debugSetMobDropRandomSequence([0, 5.5 / 8, 0.99]);
      const raid = g.debugStartRaid(3); // omen ≥ 3 rolls a witch into wave 1
      const witch = g.getRaiderRenderState().expected.find((e) => e.kind === 'witch')?.entityId ?? -1;
      const before = g.getLastMobDrops();
      const died = witch >= 0 ? g.debugDamageRaidEntity(witch, 1000) : false;
      const drops = g.getLastMobDrops();
      const powder = g.itemEntities.getItemEntities().filter((e) => e.item === 73);
      g.debugSetMobDropRandomSequence(null);
      // End the raid so no raider can hurt the player during the brews.
      let status = raid.status;
      for (let i = 0; i < 20 && status === 'ACTIVE'; i++) status = g.debugClearRaidWave()?.status ?? 'NONE';
      return { refused, scripted, raidStatus: raid.status, witch, before, died, drops, powder, status };
    });
    expect(kill.refused).toBe(false);
    expect(kill.scripted).toBe(true);
    expect(kill.raidStatus).toBe('ACTIVE');
    expect(kill.witch).toBeGreaterThanOrEqual(0);
    expect(kill.before).toBeNull();
    expect(kill.died).toBe(true);
    expect(kill.drops!.typeKey).toBe('witch');
    expect(kill.drops!.stacks).toEqual([{ item: GUNPOWDER, count: 2 }]);
    expect(kill.powder).toHaveLength(1);
    expect(kill.powder[0]!.count).toBe(2);
    expect(Math.hypot(kill.powder[0]!.x - kill.drops!.x, kill.powder[0]!.z - kill.drops!.z)).toBeLessThan(1.5);
    expect(kill.status).toBe('VICTORY');

    // ── Walk onto the drop: the fixed tick picks it up (real collect path) ──
    await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.player.position.set(p.x, p.y, p.z);
    }, kill.powder[0]!);
    await enterPointerLock(page);
    await page.waitForFunction(
      () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.inventory.getItemCount(73) === 2,
      null,
      { timeout: 30_000 },
    );
    expect(
      await page.evaluate(() => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.itemEntities.getItemEntities().filter((e) => e.item === 73).length),
    ).toBe(0);

    // ── Setup: stand, awkward bottle (260 seam), 1 redstone, 2 blaze powder ──
    const grant = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.inventory.addItem(64, 1);
      g.inventory.addItem(37, 1);
      g.inventory.addItem(65, 2);
      return g.testGrantAwkwardBottle();
    });
    expect(grant).toBe(0);

    const standSlot = await hotbarSlotWith(page, STAND_ITEM);
    expect(standSlot).toBeGreaterThanOrEqual(0);
    await page.keyboard.press(`Digit${standSlot + 1}`);
    const ground = await acquireTarget(page);
    const cell = { x: ground.x + ground.nx, y: ground.y + ground.ny, z: ground.z + ground.nz };
    rightClick(page);
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
        return g?.world?.getBlock(p.x, p.y, p.z) === p.id;
      },
      { ...cell, id: STAND_BLOCK },
      { timeout: 8000 },
    );

    // ── Brew 1: awkward + redstone → speed 480 s amp 1 (NORMAL) ──
    await waitForTargetAt(page, cell);
    rightClick(page);
    await expect(page.locator('#brewing')).toBeVisible();
    await quickMoveIntoStand(page, POTION);
    await waitForBrewing(page, cell, 'bottle', 'minecraft:potion');
    await quickMoveIntoStand(page, BLAZE_POWDER);
    await waitForBrewing(page, cell, 'fuel', 'minecraft:blaze_powder');
    await quickMoveIntoStand(page, REDSTONE);
    await waitForBrewing(page, cell, 'ingredient', 'minecraft:redstone');
    await closeStand(page);
    await enterPointerLock(page);
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
        const b = g.blockEntityHost.getBrewingState(p.x, p.y, p.z)?.bottle;
        const c = b?.components?.['minecraft:potion_contents'] as { customEffects?: { typeId: string; duration: number; amplifier: number }[] } | undefined;
        return c?.customEffects?.some((e) => e.typeId === 'minecraft:effect/speed' && e.duration === 480 && e.amplifier === 1) ?? false;
      },
      cell,
      { timeout: 90_000 },
    );
    const brew1 = await brewingState(page, cell);
    expect(contentsOf(brew1!.bottle)!.kind).toBe('NORMAL');
    expect(brew1!.ingredient.item).toBeNull();
    expect(brew1!.fuel).toMatchObject({ item: 'minecraft:blaze_powder', count: 1 });

    // ── Brew 2: speed + gunpowder → SPLASH speed, effect preserved ──
    await openStand(page, cell);
    await quickMoveIntoStand(page, GUNPOWDER); // bottle + fuel occupied → ingredient slot
    await waitForBrewing(page, cell, 'ingredient', 'minecraft:gunpowder');
    await closeStand(page);
    await enterPointerLock(page);
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
        const b = g.blockEntityHost.getBrewingState(p.x, p.y, p.z)?.bottle;
        const c = b?.components?.['minecraft:potion_contents'] as { kind?: string } | undefined;
        return c?.kind === 'SPLASH';
      },
      cell,
      { timeout: 90_000 },
    );
    const brew2 = await brewingState(page, cell);
    const splash = contentsOf(brew2!.bottle)!;
    expect(splash.kind).toBe('SPLASH');
    expect(splash.base).toBe(contentsOf(brew1!.bottle)!.base);
    expect(splash.customEffects).toEqual([{ typeId: 'minecraft:effect/speed', duration: 480, amplifier: 1 }]);
    expect(brew2!.ingredient).toMatchObject({ item: 'minecraft:gunpowder', count: 1 }); // exactly one consumed
    expect(brew2!.brewTime).toBe(0);

    // ── Collect the splash potion with a real shift-click ──
    await openStand(page, cell);
    await expect(page.locator('#brewing [data-slot-index="0"][aria-label*="Potion, 1"]')).toBeVisible();
    await page.click('#brewing [data-slot-index="0"]', { modifiers: ['Shift'] });
    await waitForBrewing(page, cell, 'bottle', null);
    await closeStand(page);
    const potionSlot = await hotbarSlotWith(page, POTION);
    expect(potionSlot).toBeGreaterThanOrEqual(0);

    // ── Throw it at the player's feet through the real throw path ──
    const thrown = await page.evaluate((slot) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.inventory.select(slot);
      const speedBefore = g.getPlayerEffect('speed');
      const ok = g.debugThrowSplashPotion(0, -Math.PI / 2);
      const after = g.inventory.getSelectedStack()?.count ?? 0;
      const inFlight = g.getSplashPotionState().potions.map((p) => ({ thrower: p.thrower, effects: p.effects }));
      const left = g.debugTickSplashPotions(40);
      const shatter = g.getSplashPotionState().shatters.at(-1);
      return { speedBefore, ok, after, inFlight, left, shatter, speed: g.getPlayerEffect('speed') };
    }, potionSlot);
    expect(thrown.speedBefore).toBeNull();
    expect(thrown.ok).toBe(true);
    expect(thrown.after).toBe(0); // survival consumes the potion
    expect(thrown.inFlight).toEqual([{ thrower: 'player', effects: ['minecraft:effect/speed'] }]);
    expect(thrown.left).toBe(0);
    const self = thrown.shatter!.affected.find((a) => a.kind === 'player')!;
    expect(self).toBeDefined();
    expect(self.effects[0]!.typeId).toBe('minecraft:effect/speed');
    expect(self.effects[0]!.amplifier).toBe(1);
    expect(thrown.speed).not.toBeNull();
    expect(thrown.speed!.amplifier).toBe(1);
    expect(thrown.speed!.duration).toBeGreaterThan(1);
    expect(thrown.speed!.duration).toBeLessThanOrEqual(480);
  });
});
