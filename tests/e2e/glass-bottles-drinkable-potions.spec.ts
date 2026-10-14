import { test, expect, type Page } from '@playwright/test';

/**
 * Glass bottles + drinkable potions survival loop (298).
 *
 * Drives the REAL production artifact:
 * - a raid witch dies and drops glass bottles as real item entities (drop RNG
 *   scripted so the roll is glass_bottle), and the player picks them up by
 *   walking onto them;
 * - a placed water block is filled with a real right-click (fluid raycast);
 * - a real brewing stand brews water + nether wart → awkward (base-only, no
 *   seam) and then + redstone → speed;
 * - holding right-click drinks the potion over 32 fixed ticks → speed effect
 *   plus an empty bottle; releasing early cancels;
 * - water/glass bottles survive a reload through the durable player save.
 * The second test covers instant harming, creative (potion kept, no bottle,
 * no duplicate water bottle) and spectator refusal. `__voxelGame` is used for
 * setup only (raid start, scripted drop RNG, teleport onto the drop, nether
 * wart/redstone/blaze powder/stand/water grants, test potions for harming and
 * creative) and read-only observation.
 */

type Pos = { x: number; y: number; z: number };
type TargetFace = Pos & { nx: number; ny: number; nz: number };
type Effect = { typeId: string; duration: number; amplifier: number };
type Contents = { base?: string; kind: string; customEffects: Effect[] };
type SlotView = { item: string | null; count: number; components?: Record<string, unknown> };
type BrewingStateView = { bottle: SlotView; fuel: SlotView; ingredient: SlotView; brewTime: number };
type ComponentMap = { get(id: unknown): unknown; entries?(): unknown };
type Stack = { id: number; count: number; components?: ComponentMap };

type GameHandle = {
  debugSetMobDropRandomSequence(values: number[] | null): boolean;
  getLastMobDrops(): { typeKey: string; x: number; y: number; z: number; stacks: { item: number; count: number }[] } | null;
  debugStartRaid(badOmenLevel?: number): { status: string };
  debugClearRaidWave(): { status: string } | null;
  getRaiderRenderState(): { expected: { kind: string; entityId: number }[] };
  debugDamageRaidEntity(entityId: number, amount: number): boolean;
  getPlayerEffect(key: string): { duration: number; amplifier: number } | null;
  getDrinkState(): { active: true; slot: number; ticksUsed: number; durationTicks: number } | null;
  getLastDrinkOutcome(): {
    outcome: { heal: number; damage: number; effects: { typeId: string; durationSeconds: number; amplifier: number }[]; consumePotion: boolean; returnBottle: boolean; creative: boolean } | null;
    lastCancel: string | null;
  };
  getLastBottleFill(): { filled: boolean; reason: string | null } | null;
  testGrantPotion(effectKey: string, durationSeconds?: number, amplifier?: number): number;
  setGameMode(mode: string): boolean;
  survival: { health: number };
  itemEntities: { getItemEntities(): { item: number; count: number; x: number; y: number; z: number }[] };
  inventory: {
    slots: Stack[];
    storage: Stack[];
    selected: number;
    addItem(id: number, amount: number): number;
    getItemCount(id: number): number;
    select(i: number): void;
    getSelectedStack(): Stack | null;
  };
  player: { position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }; yaw: number; pitch: number };
  blockEntityHost: { getBrewingState(x: number, y: number, z: number): BrewingStateView | null };
  persistence?: { flush(): Promise<{ committed: number; failed: number }>; pendingCount: number };
};

const GLASS_BOTTLE = 74;
const POTION = 66;
const WATER_ITEM = 5;
const WATER_BLOCK = 5;
const NETHER_WART = 59;
const REDSTONE = 37;
const BLAZE_POWDER = 65;
const STAND_ITEM = 64;
const STAND_BLOCK = 62;
const CONTENTS_KEY = 'minecraft:potion_contents';
const WATER_BASE = 'minecraft:potion/water';
const AWKWARD_BASE = 'minecraft:potion/awkward';

/**
 * Browser-side accessor. Page callbacks are serialized, so `game()` inside
 * them resolves to the `window.game` global installed by the init script below
 * (re-installed on every navigation/reload).
 */
function game(): GameHandle {
  return (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
}

async function waitForGame(page: Page, navigate = true): Promise<void> {
  if (navigate) {
    await page.addInitScript(() => {
      (window as unknown as { game: () => unknown }).game = () => (window as unknown as { __voxelGame: unknown }).__voxelGame;
    });
    await page.goto('/');
  }
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

async function rightDown(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })));
}

async function rightUp(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })));
}

/** Aim down-forward and wait until a placeable top face with an empty cell above exists. */
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
        if (target.ny !== 1) return null;
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
  return page.evaluate((itemId) => game().inventory.slots.findIndex((s) => s && s.id === itemId && s.count > 0), id);
}

/** Hotbar slot holding a potion whose contents match `base` (and optionally an effect id). */
async function potionSlot(page: Page, base: string | null, effect: string | null = null): Promise<number> {
  return page.evaluate(
    ({ b, e, key }) => {
      const g = game();
      return g.inventory.slots.findIndex((s) => {
        if (!s || s.id !== 66 || s.count <= 0 || !s.components) return false;
        const entries = (s.components as unknown as { entries(): readonly (readonly [{ namespace: string; path: string }, unknown])[] }).entries();
        const hit = entries.find(([id]) => `${id.namespace}:${id.path}` === key);
        const c = hit?.[1] as { base?: string; customEffects?: { typeId: string }[] } | undefined;
        if (!c || !Array.isArray(c.customEffects)) return false;
        if (b !== null && c.base !== b) return false;
        if (e !== null && !c.customEffects.some((x) => x.typeId === e)) return false;
        return true;
      });
    },
    { b: base, e: effect, key: CONTENTS_KEY },
  );
}

async function brewingState(page: Page, pos: Pos): Promise<BrewingStateView | null> {
  return page.evaluate((p) => game().blockEntityHost.getBrewingState(p.x, p.y, p.z), pos);
}

async function waitForBrewing(page: Page, pos: Pos, field: 'bottle' | 'fuel' | 'ingredient', item: string | null): Promise<void> {
  await page.waitForFunction(
    ({ p, f, it }) => game().blockEntityHost.getBrewingState(p.x, p.y, p.z)?.[f].item === it,
    { p: pos, f: field, it: item },
    { timeout: 5000 },
  );
}

async function quickMoveSlotIntoStand(page: Page, slot: number): Promise<void> {
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

/** Place the selected block item on a fresh top face; returns the placed cell. */
async function placeSelectedOnGround(page: Page, blockId: number): Promise<Pos> {
  const ground = await acquireTarget(page);
  const cell = { x: ground.x + ground.nx, y: ground.y + ground.ny, z: ground.z + ground.nz };
  rightClick(page);
  await page.waitForFunction(
    (p) => (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame?.world?.getBlock(p.x, p.y, p.z) === p.id,
    { ...cell, id: blockId },
    { timeout: 8000 },
  );
  return cell;
}

/** Aim through the centre of a water cell and right-click with the bottle selected. */
async function fillAt(page: Page, water: Pos): Promise<void> {
  await aimAt(page, water);
  await page.waitForTimeout(150);
  rightClick(page);
}

/** Look up at the sky so right-click has no block target (pure item use). */
async function lookUp(page: Page): Promise<void> {
  await page.evaluate(() => {
    game().player.pitch = 1.2;
  });
  await page.waitForTimeout(100);
}

/** Hold right-click until a drink completes; returns the outcome. */
async function drinkSelected(page: Page): Promise<NonNullable<ReturnType<GameHandle['getLastDrinkOutcome']>['outcome']>> {
  const before = await page.evaluate(() => JSON.stringify(game().getLastDrinkOutcome().outcome));
  await rightDown(page);
  await page.waitForFunction(() => game().getDrinkState()?.active === true, null, { timeout: 5000 });
  await page.waitForFunction(
    (b) => game().getDrinkState() === null && JSON.stringify(game().getLastDrinkOutcome().outcome) !== b,
    before,
    { timeout: 20_000 },
  );
  await rightUp(page);
  const outcome = await page.evaluate(() => game().getLastDrinkOutcome().outcome);
  expect(outcome).not.toBeNull();
  return outcome!;
}

test.describe('glass bottles and drinkable potions (298)', () => {
  test('witch bottles → fill at water → brew water/awkward/speed → drink (+cancel) → reload', async ({ page }) => {
    test.setTimeout(300_000); // two 400-tick brews on real frames + boot + reload
    await waitForGame(page);

    // ── A raid witch dies and drops glass bottles (scripted roll: 1× glass_bottle ×2) ──
    const kill = await page.evaluate(() => {
      const g = game();
      for (const s of g.inventory.slots) s.count = 0; // free the hotbar for the journey
      const scripted = g.debugSetMobDropRandomSequence([0, 4.5 / 8, 0.99]);
      const raid = g.debugStartRaid(3); // omen ≥ 3 rolls a witch into wave 1
      const witch = g.getRaiderRenderState().expected.find((e) => e.kind === 'witch')?.entityId ?? -1;
      const died = witch >= 0 ? g.debugDamageRaidEntity(witch, 1000) : false;
      const drops = g.getLastMobDrops();
      const bottles = g.itemEntities.getItemEntities().filter((e) => e.item === 74);
      g.debugSetMobDropRandomSequence(null);
      let status = raid.status;
      for (let i = 0; i < 20 && status === 'ACTIVE'; i++) status = g.debugClearRaidWave()?.status ?? 'NONE';
      return { scripted, raidStatus: raid.status, witch, died, drops, bottles, status };
    });
    expect(kill.scripted).toBe(true);
    expect(kill.raidStatus).toBe('ACTIVE');
    expect(kill.died).toBe(true);
    expect(kill.drops!.typeKey).toBe('witch');
    expect(kill.drops!.stacks).toEqual([{ item: GLASS_BOTTLE, count: 2 }]);
    expect(kill.bottles).toHaveLength(1);
    expect(kill.bottles[0]!.count).toBe(2);
    expect(kill.status).toBe('VICTORY');

    // ── Walk onto the drop: the fixed tick picks the bottles up ──
    await page.evaluate((p) => game().player.position.set(p.x, p.y, p.z), kill.bottles[0]!);
    await enterPointerLock(page);
    await page.waitForFunction(() => game().inventory.getItemCount(74) === 2, null, { timeout: 30_000 });

    // ── Place a water block (real placement with the water item) ──
    await page.evaluate(() => game().inventory.addItem(5, 1));
    await page.keyboard.press(`Digit${(await hotbarSlotWith(page, WATER_ITEM)) + 1}`);
    const water = await placeSelectedOnGround(page, WATER_BLOCK);

    // ── Fill one bottle with a real right-click: 2 bottles → 1 bottle + water bottle ──
    const bottleSlot = await hotbarSlotWith(page, GLASS_BOTTLE);
    await page.keyboard.press(`Digit${bottleSlot + 1}`);
    await fillAt(page, water);
    await page.waitForFunction(() => game().inventory.getItemCount(74) === 1, null, { timeout: 8000 });
    const fill1 = await page.evaluate(() => ({ fill: game().getLastBottleFill(), potions: game().inventory.getItemCount(66) }));
    expect(fill1.fill).toEqual({ filled: true, reason: null });
    expect(fill1.potions).toBe(1);
    expect(await potionSlot(page, WATER_BASE)).toBeGreaterThanOrEqual(0);

    // ── Setup: stand, 1 nether wart (no Nether: creative/setup item), 1 redstone, 2 blaze powder
    //    (the second keeps the fuel slot occupied so redstone routes to the ingredient slot) ──
    await page.evaluate(() => {
      const g = game();
      g.inventory.addItem(64, 1);
      g.inventory.addItem(59, 1);
      g.inventory.addItem(37, 1);
      g.inventory.addItem(65, 2);
    });
    await page.keyboard.press(`Digit${(await hotbarSlotWith(page, STAND_ITEM)) + 1}`);
    const stand = await placeSelectedOnGround(page, STAND_BLOCK);

    // ── Brew 1: water bottle + nether wart → awkward (base-only; no seam) ──
    await waitForTargetAt(page, stand);
    rightClick(page);
    await expect(page.locator('#brewing')).toBeVisible();
    await quickMoveSlotIntoStand(page, await potionSlot(page, WATER_BASE));
    await waitForBrewing(page, stand, 'bottle', 'minecraft:potion');
    await quickMoveSlotIntoStand(page, await hotbarSlotWith(page, BLAZE_POWDER));
    await waitForBrewing(page, stand, 'fuel', 'minecraft:blaze_powder');
    await quickMoveSlotIntoStand(page, await hotbarSlotWith(page, NETHER_WART));
    await waitForBrewing(page, stand, 'ingredient', 'minecraft:nether_wart');
    await closeStand(page);
    await enterPointerLock(page);
    await page.waitForFunction(
      (p) => {
        const b = game().blockEntityHost.getBrewingState(p.x, p.y, p.z)?.bottle;
        const c = b?.components?.['minecraft:potion_contents'] as { base?: string } | undefined;
        return c?.base === 'minecraft:potion/awkward';
      },
      stand,
      { timeout: 90_000 },
    );
    const brew1 = await brewingState(page, stand);
    expect(contentsOf(brew1!.bottle)).toEqual({ base: AWKWARD_BASE, kind: 'NORMAL', customEffects: [] });
    expect(brew1!.ingredient.item).toBeNull(); // the wart was consumed
    expect(brew1!.brewTime).toBe(0);
    expect(brew1!.fuel).toMatchObject({ item: 'minecraft:blaze_powder', count: 1 }); // one lit, one left

    // ── Brew 2: awkward + redstone → speed 480 s amp 1 ──
    await openStand(page, stand);
    await quickMoveSlotIntoStand(page, await hotbarSlotWith(page, REDSTONE));
    await waitForBrewing(page, stand, 'ingredient', 'minecraft:redstone');
    await closeStand(page);
    await enterPointerLock(page);
    await page.waitForFunction(
      (p) => {
        const b = game().blockEntityHost.getBrewingState(p.x, p.y, p.z)?.bottle;
        const c = b?.components?.['minecraft:potion_contents'] as { customEffects?: { typeId: string }[] } | undefined;
        return c?.customEffects?.some((e) => e.typeId === 'minecraft:effect/speed') ?? false;
      },
      stand,
      { timeout: 90_000 },
    );
    const brew2 = await brewingState(page, stand);
    expect(contentsOf(brew2!.bottle)).toEqual({
      base: AWKWARD_BASE,
      kind: 'NORMAL',
      customEffects: [{ typeId: 'minecraft:effect/speed', duration: 480, amplifier: 1 }],
    });

    // ── Collect the potion with a real shift-click ──
    await openStand(page, stand);
    await page.click('#brewing [data-slot-index="0"]', { modifiers: ['Shift'] });
    await waitForBrewing(page, stand, 'bottle', null);
    await closeStand(page);
    const speedSlot = await potionSlot(page, AWKWARD_BASE, 'minecraft:effect/speed');
    expect(speedSlot).toBeGreaterThanOrEqual(0);

    // ── Drink it by holding right-click: speed + an empty bottle in the same slot ──
    await enterPointerLock(page);
    await page.keyboard.press(`Digit${speedSlot + 1}`);
    await lookUp(page);
    expect(await page.evaluate(() => game().getPlayerEffect('speed'))).toBeNull();
    const drank = await drinkSelected(page);
    expect(drank.effects).toEqual([{ typeId: 'minecraft:effect/speed', durationSeconds: 480, amplifier: 1 }]);
    expect(drank).toMatchObject({ consumePotion: true, returnBottle: true, creative: false });
    const afterDrink = await page.evaluate((slot) => {
      const g = game();
      return { speed: g.getPlayerEffect('speed'), slot: g.inventory.slots[slot], bottles: g.inventory.getItemCount(74), potions: g.inventory.getItemCount(66) };
    }, speedSlot);
    expect(afterDrink.speed!.amplifier).toBe(1);
    expect(afterDrink.speed!.duration).toBeGreaterThan(470);
    expect(afterDrink.speed!.duration).toBeLessThanOrEqual(480);
    expect(afterDrink.slot).toMatchObject({ id: GLASS_BOTTLE, count: 1 });
    expect(afterDrink.bottles).toBe(2);
    expect(afterDrink.potions).toBe(0);

    // ── Fill again, then cancel a drink mid-way (release before 32 ticks) ──
    await page.keyboard.press(`Digit${speedSlot + 1}`); // the slot now holds the returned bottle
    await fillAt(page, water);
    await page.waitForFunction(() => game().inventory.getItemCount(66) === 1, null, { timeout: 8000 });
    expect(await page.evaluate(() => game().inventory.getItemCount(74))).toBe(1);
    const waterSlot = await potionSlot(page, WATER_BASE);
    expect(waterSlot).toBeGreaterThanOrEqual(0);
    await page.keyboard.press(`Digit${waterSlot + 1}`);
    await lookUp(page);
    await rightDown(page);
    await page.waitForFunction(() => (game().getDrinkState()?.ticksUsed ?? 0) >= 5, null, { timeout: 5000 });
    await rightUp(page);
    await page.waitForFunction(() => game().getDrinkState() === null, null, { timeout: 5000 });
    const cancelled = await page.evaluate(() => ({
      cancel: game().getLastDrinkOutcome().lastCancel,
      potions: game().inventory.getItemCount(66),
      bottles: game().inventory.getItemCount(74),
    }));
    expect(cancelled).toEqual({ cancel: 'released', potions: 1, bottles: 1 });

    // ── Reload: the durable player save kept 1 glass bottle + the water bottle ──
    const flushed = await page.evaluate(async () => {
      const p = game().persistence;
      if (!p) return null;
      const r = await p.flush();
      return { pending: p.pendingCount, failed: r.failed };
    });
    expect(flushed).toEqual({ pending: 0, failed: 0 });
    await page.reload();
    await waitForGame(page, false);
    const reloaded = await page.evaluate(() => ({ bottles: game().inventory.getItemCount(74), potions: game().inventory.getItemCount(66) }));
    expect(reloaded).toEqual({ bottles: 1, potions: 1 });
    const waterAfter = await potionSlot(page, WATER_BASE);
    expect(waterAfter).toBeGreaterThanOrEqual(0);

    // ── Drink the water bottle: no effect, bottle returned ──
    await enterPointerLock(page);
    await page.keyboard.press(`Digit${waterAfter + 1}`);
    await lookUp(page);
    const waterDrink = await drinkSelected(page);
    expect(waterDrink).toMatchObject({ heal: 0, damage: 0, effects: [], returnBottle: true });
    expect(await page.evaluate(() => ({ bottles: game().inventory.getItemCount(74), potions: game().inventory.getItemCount(66) }))).toEqual({
      bottles: 2,
      potions: 0,
    });
  });

  test('instant harming, creative keeps the potion (no bottle, no duplicate fill), spectator refused', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    await page.evaluate(() => {
      for (const s of game().inventory.slots) s.count = 0;
    });
    await enterPointerLock(page);

    // ── Survival: harming (instant) deals 6 magic damage on completion; bottle returned ──
    const harmSlot = await page.evaluate(() => game().testGrantPotion('instant_damage', 0, 0));
    expect(harmSlot).toBeGreaterThanOrEqual(0);
    await lookUp(page);
    const hp0 = await page.evaluate(() => game().survival.health);
    const harm = await drinkSelected(page);
    expect(harm).toMatchObject({ damage: 6, heal: 0, effects: [], returnBottle: true });
    const hp1 = await page.evaluate(() => game().survival.health);
    expect(hp0 - hp1).toBe(6);
    expect(await page.evaluate((s) => game().inventory.slots[s], harmSlot)).toMatchObject({ id: GLASS_BOTTLE, count: 1 });

    // ── Creative: drinking applies the effect, keeps the potion, gives no bottle ──
    expect(await page.evaluate(() => game().setGameMode('creative'))).toBe(true);
    const speedSlot = await page.evaluate(() => game().testGrantPotion('speed', 30, 0));
    await lookUp(page);
    const creativeDrink = await drinkSelected(page);
    expect(creativeDrink).toMatchObject({ consumePotion: false, returnBottle: false, creative: true });
    const afterCreative = await page.evaluate((s) => {
      const g = game();
      return { slot: g.inventory.slots[s], bottles: g.inventory.getItemCount(74), speed: g.getPlayerEffect('speed') };
    }, speedSlot);
    expect(afterCreative.slot).toMatchObject({ id: POTION, count: 1 });
    expect(afterCreative.bottles).toBe(1);
    expect(afterCreative.speed!.amplifier).toBe(0);
    expect(afterCreative.speed!.duration).toBeGreaterThan(25);

    // ── Creative fill: the bottle stays, one water bottle is added, never a duplicate ──
    await page.evaluate(() => game().inventory.addItem(5, 1));
    await page.keyboard.press(`Digit${(await hotbarSlotWith(page, WATER_ITEM)) + 1}`);
    const water = await placeSelectedOnGround(page, WATER_BLOCK);
    await page.keyboard.press(`Digit${(await hotbarSlotWith(page, GLASS_BOTTLE)) + 1}`);
    await fillAt(page, water);
    await page.waitForFunction(() => game().inventory.getItemCount(66) === 2, null, { timeout: 8000 });
    expect(await page.evaluate(() => game().inventory.getItemCount(74))).toBe(1);
    expect(await potionSlot(page, WATER_BASE)).toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(400); // action cooldown
    await fillAt(page, water);
    await page.waitForFunction(() => game().getLastBottleFill()?.reason === 'ALREADY_HELD', null, { timeout: 8000 });
    expect(await page.evaluate(() => ({ potions: game().inventory.getItemCount(66), bottles: game().inventory.getItemCount(74) }))).toEqual({
      potions: 2,
      bottles: 1,
    });

    // ── Spectator: holding use on a potion never starts a drink ──
    expect(await page.evaluate(() => game().setGameMode('spectator'))).toBe(true);
    await page.evaluate((s) => game().inventory.select(s), speedSlot);
    await lookUp(page);
    await rightDown(page);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => game().getDrinkState())).toBeNull();
    await rightUp(page);
    expect(await page.evaluate((s) => game().inventory.slots[s]!.count, speedSlot)).toBe(1);
  });
});
