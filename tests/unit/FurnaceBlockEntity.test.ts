import { describe, it, expect } from 'vitest';
import { BlockEntityManager } from '../../src/simulation/BlockEntityManager';
import {
  DEFAULT_FURNACE_SLOT_MAX_STACK,
  FURNACE_BLOCK_ID,
  FURNACE_INPUT_SLOT,
  FURNACE_ITEM_ID,
  FURNACE_MENU_SLOT_COUNT,
  FURNACE_PLAYER_SLOT_START,
  FURNACE_SLOT_COUNT,
  FURNACE_TYPE_KEY,
  type FurnaceContext,
  type FurnaceState,
  applyFurnaceMenuTransaction,
  createFurnaceBlockEntity,
  createFurnaceMenu,
  createFurnaceState,
  deserializeFurnaceState,
  extractFurnacePlayerSlots,
  extractFurnaceSlots,
  furnaceBurnFraction,
  furnaceIsLit,
  furnaceTickProgress,
  readFurnaceState,
  serializeFurnaceState,
  tickFurnace,
  updateFurnaceState,
  validateFurnaceState,
  withFurnaceSlots,
} from '../../src/world/FurnaceBlockEntity';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import {
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';

const COAL = 'minecraft:coal';
const SAND = 'minecraft:sand';
const GLASS = 'minecraft:glass';
const IRON_ORE = 'minecraft:iron_ore';
const RAW_IRON = 'minecraft:raw_iron';
const NOTHING = 'minecraft:nothing';

const ctx: FurnaceContext = {
  fuelBurnTicks: (item) => (item === COAL ? 1600 : 0),
  cookTicks: (item) => (item === SAND ? 200 : item === IRON_ORE ? 200 : 0),
  resultOf: (item) => {
    if (item === SAND) return { item: GLASS, count: 1 };
    if (item === IRON_ORE) return { item: RAW_IRON, count: 1 };
    return null;
  },
};

function slot(item: string | null, count: number, maxStack = DEFAULT_FURNACE_SLOT_MAX_STACK): MenuSlot {
  return { item, count, maxStack };
}

function state(partial: Partial<FurnaceState>): FurnaceState {
  return { ...createFurnaceState(), ...partial };
}

function playerSlots(): MenuSlot[] {
  const slots: MenuSlot[] = [];
  for (let i = 0; i < 36; i++) {
    slots.push(slot(null, 0));
  }
  return slots;
}

describe('furnace state construction and validation', () => {
  it('creates an empty state with three empty slots and zero timers', () => {
    const s = createFurnaceState();
    expect(s).toEqual({
      input: slot(null, 0),
      fuel: slot(null, 0),
      output: slot(null, 0),
      burnTime: 0,
      burnTimeTotal: 0,
      smeltTime: 0,
      smeltTimeTotal: 0,
      xp: 0,
    });
    expect(validateFurnaceState(s)).toEqual(s);
    expect(furnaceIsLit(s)).toBe(false);
  });

  it('rejects malformed states', () => {
    expect(() => validateFurnaceState(null)).toThrow(/must be an object/);
    const badSlot = state({ input: { item: COAL, count: 0, maxStack: 64 } });
    expect(() => validateFurnaceState(badSlot)).toThrow(/count must be an integer/);
    expect(() => validateFurnaceState(state({ burnTime: -1 }))).toThrow(/non-negative integer/);
    expect(() => validateFurnaceState(state({ burnTime: 1.5 }))).toThrow(/non-negative integer/);
    expect(() => validateFurnaceState(state({ burnTime: 10, burnTimeTotal: 5 }))).toThrow(/must not exceed/);
    expect(() => validateFurnaceState(state({ burnTimeTotal: 0, burnTime: 1 }))).toThrow(/requires burnTime 0/);
    expect(() => validateFurnaceState(state({ smeltTime: 10, smeltTimeTotal: 5 }))).toThrow(/must not exceed/);
    expect(() => validateFurnaceState(state({ smeltTimeTotal: 0, smeltTime: 1 }))).toThrow(/requires smeltTime 0/);
  });
});

describe('furnace tick engine', () => {
  it('lights the furnace and consumes fuel on the first tick', () => {
    const s = state({ input: slot(SAND, 1), fuel: slot(COAL, 3) });
    const next = tickFurnace(s, ctx);
    expect(next.fuel).toEqual(slot(COAL, 2));
    expect(next.burnTimeTotal).toBe(1600);
    expect(next.burnTime).toBe(1599);
    expect(next.smeltTime).toBe(1);
    expect(next.smeltTimeTotal).toBe(200);
    expect(next.input).toEqual(slot(SAND, 1));
    expect(next.output).toEqual(slot(null, 0));
    expect(furnaceIsLit(next)).toBe(true);
    // Immutable source.
    expect(s.fuel).toEqual(slot(COAL, 3));
    expect(s.burnTime).toBe(0);
  });

  it('does not progress without fuel', () => {
    const s = state({ input: slot(SAND, 1) });
    const next = tickFurnace(s, ctx, 10);
    expect(next.burnTime).toBe(0);
    expect(next.smeltTime).toBe(0);
    expect(next.input).toEqual(slot(SAND, 1));
  });

  it('never consumes non-fuel items', () => {
    const s = state({ input: slot(SAND, 1), fuel: slot(NOTHING, 5) });
    const next = tickFurnace(s, ctx, 10);
    expect(next.fuel).toEqual(slot(NOTHING, 5));
    expect(next.burnTime).toBe(0);
    expect(next.smeltTime).toBe(0);
  });

  it('pauses everything when the output is blocked', () => {
    const s = state({
      input: slot(SAND, 1),
      fuel: slot(COAL, 3),
      output: slot(RAW_IRON, 64),
      burnTime: 100,
      burnTimeTotal: 1600,
      smeltTime: 50,
      smeltTimeTotal: 200,
    });
    const next = tickFurnace(s, ctx, 5);
    expect(next).toEqual(s);
  });

  it('resets progress when the input is removed', () => {
    const s = state({ smeltTime: 50, smeltTimeTotal: 200, burnTime: 100, burnTimeTotal: 1600 });
    const next = tickFurnace(s, ctx);
    expect(next.smeltTime).toBe(0);
    expect(next.smeltTimeTotal).toBe(0);
    // The furnace stays lit with the remaining fuel; only progress resets.
    expect(next.burnTime).toBe(100);
    expect(next.burnTimeTotal).toBe(1600);
  });

  it('completes a cook and merges the result into the output', () => {
    const s = state({
      input: slot(SAND, 2),
      fuel: slot(COAL, 1),
      output: slot(GLASS, 63),
      burnTime: 1,
      burnTimeTotal: 1600,
      smeltTime: 199,
      smeltTimeTotal: 200,
    });
    const next = tickFurnace(s, ctx);
    expect(next.input).toEqual(slot(SAND, 1));
    expect(next.output).toEqual(slot(GLASS, 64));
    expect(next.smeltTime).toBe(0);
    expect(next.smeltTimeTotal).toBe(0);
    expect(next.burnTime).toBe(0);
    expect(next.burnTimeTotal).toBe(1600);
  });

  it('cooks through the whole fuel run deterministically', () => {
    const s = state({ input: slot(IRON_ORE, 8), fuel: slot(COAL, 1) });
    // One coal = 1600 ticks; iron ore cooks in 200 -> 8 results.
    const next = tickFurnace(s, ctx, 1600);
    expect(next.input).toEqual(slot(null, 0, 64));
    expect(next.output).toEqual(slot(RAW_IRON, 8));
    expect(next.smeltTime).toBe(0);
    expect(next.burnTime).toBe(0);
  });

  it('multi-tick matches repeated single ticks and leaves inputs unchanged', () => {
    const s = state({ input: slot(IRON_ORE, 2), fuel: slot(COAL, 1) });
    const batched = tickFurnace(s, ctx, 250);
    let manual = s;
    for (let i = 0; i < 250; i++) {
      manual = tickFurnace(manual, ctx);
    }
    expect(batched).toEqual(manual);
    expect(s.input).toEqual(slot(IRON_ORE, 2));
  });

  it('rejects invalid tick counts', () => {
    const s = createFurnaceState();
    expect(() => tickFurnace(s, ctx, 0)).toThrow(/positive integer/);
    expect(() => tickFurnace(s, ctx, -1)).toThrow(/positive integer/);
    expect(() => tickFurnace(s, ctx, 1.5)).toThrow(/positive integer/);
  });

  it('refills burn time when the fuel slot is restocked mid-run', () => {
    const s = state({
      input: slot(IRON_ORE, 2),
      fuel: slot(COAL, 1),
      burnTime: 1,
      burnTimeTotal: 1600,
      smeltTime: 0,
      smeltTimeTotal: 200,
    });
    const next = tickFurnace(s, ctx, 1);
    // Burn ran out; the new coal lights the next tick... after this tick burnTime 0.
    expect(next.burnTime).toBe(0);
    const relit = tickFurnace(next, ctx, 1);
    expect(relit.burnTimeTotal).toBe(1600);
    expect(relit.burnTime).toBe(1599);
    expect(relit.fuel).toEqual(slot(null, 0, 64));
  });
});

describe('furnace serialization', () => {
  it('round-trips empty and burning states exactly', () => {
    const empty = createFurnaceState();
    expect(deserializeFurnaceState(serializeFurnaceState(empty))).toEqual(empty);

    const burning = state({
      input: slot(SAND, 3),
      fuel: slot(COAL, 2),
      output: slot(GLASS, 5),
      burnTime: 800,
      burnTimeTotal: 1600,
      smeltTime: 100,
      smeltTimeTotal: 200,
    });
    expect(deserializeFurnaceState(serializeFurnaceState(burning))).toEqual(burning);
  });

  it('rejects malformed payloads', () => {
    expect(() => deserializeFurnaceState(null)).toThrow(/must be an object/);
    expect(() => deserializeFurnaceState({})).toThrow(/must be an object/);
    const payload = serializeFurnaceState(createFurnaceState()) as Record<string, unknown>;
    expect(() => deserializeFurnaceState({ ...payload, burnTime: 5 })).toThrow(/requires burnTime 0/);
    expect(() => deserializeFurnaceState({ ...payload, smeltTimeTotal: -2 })).toThrow(/non-negative integer/);
  });
});

describe('furnace menu bridge', () => {
  it('builds a 39-slot menu with playerSlotStart 3 and extracts regions', () => {
    const s = state({ input: slot(SAND, 2), fuel: slot(COAL, 1) });
    const menu = createFurnaceMenu(s, playerSlots());
    expect(menu.slots).toHaveLength(FURNACE_MENU_SLOT_COUNT);
    expect(menu.playerSlotStart).toBe(FURNACE_PLAYER_SLOT_START);
    expect(menu.cursor).toEqual({ item: null, count: 0 });
    const slots = extractFurnaceSlots(menu);
    expect(slots.input).toEqual(slot(SAND, 2));
    expect(slots.fuel).toEqual(slot(COAL, 1));
    expect(slots.output).toEqual(slot(null, 0));
    expect(extractFurnacePlayerSlots(menu)).toEqual(playerSlots());
  });

  it('validates player slots and cursors and rejects foreign menus', () => {
    const bad = playerSlots();
    bad[0] = { item: null, count: 1, maxStack: 64 };
    expect(() => createFurnaceMenu(createFurnaceState(), bad)).toThrow(/null item must have count 0/);
    expect(() => createFurnaceMenu(createFurnaceState(), playerSlots().slice(0, 35))).toThrow(/exactly 39 slots/);
    expect(() =>
      createFurnaceMenu(createFurnaceState(), playerSlots(), { item: COAL, count: 65 }),
    ).toThrow(/cursor/);

    const menu = createFurnaceMenu(createFurnaceState(), playerSlots());
    const foreign = { ...menu, slots: menu.slots.slice(0, 10), playerSlotStart: 5 };
    expect(() => extractFurnaceSlots(foreign)).toThrow(/not a furnace menu/);
    expect(() => extractFurnacePlayerSlots(foreign)).toThrow(/not a furnace menu/);
  });

  it('applies transactions across the furnace/player boundary', () => {
    const s = state({ input: slot(SAND, 2), fuel: slot(COAL, 1) });
    const player = playerSlots();
    player[0] = slot(RAW_IRON, 3);
    const menu = createFurnaceMenu(s, player);

    // Quick-move the player raw_iron stack into the furnace output slot (index 2):
    // the input and fuel slots are occupied, so the first empty furnace slot wins.
    const quick = applyFurnaceMenuTransaction(menu, { type: 'quickMove', index: 3 });
    expect(extractFurnaceSlots(quick).output).toEqual(slot(RAW_IRON, 3));
    expect(extractFurnacePlayerSlots(quick)[0]).toEqual(slot(null, 0));

    // Pick up the input (slot 0).
    const picked = applyFurnaceMenuTransaction(quick, { type: 'leftClick', index: FURNACE_INPUT_SLOT });
    expect(picked.cursor).toEqual({ item: SAND, count: 2 });

    // Place one sand back into the input slot.
    const placed = applyFurnaceMenuTransaction(picked, { type: 'placeOne', index: FURNACE_INPUT_SLOT });
    expect(extractFurnaceSlots(placed).input).toEqual(slot(SAND, 1));
    expect(placed.cursor).toEqual({ item: SAND, count: 1 });

    // Source menu unchanged.
    expect(menu.cursor).toEqual({ item: null, count: 0 });
    expect(extractFurnaceSlots(menu).input).toEqual(slot(SAND, 2));
  });

  it('preserves timers through withFurnaceSlots', () => {
    const s = state({
      input: slot(SAND, 2),
      burnTime: 100,
      burnTimeTotal: 1600,
      smeltTime: 50,
      smeltTimeTotal: 200,
    });
    const next = withFurnaceSlots(s, { input: slot(SAND, 1), fuel: slot(COAL, 1), output: slot(null, 0) });
    expect(next.burnTime).toBe(100);
    expect(next.burnTimeTotal).toBe(1600);
    expect(next.smeltTime).toBe(50);
    expect(next.smeltTimeTotal).toBe(200);
    expect(next.input).toEqual(slot(SAND, 1));
  });
});

describe('furnace entity lifecycle', () => {
  it('creates a tickable furnace instance whose payload round-trips', () => {
    const entity = createFurnaceBlockEntity(1, 2, 3);
    expect(entity.typeKey).toBe(FURNACE_TYPE_KEY);
    expect(entity.tickable).toBe(true);
    expect(readFurnaceState(entity)).toEqual(createFurnaceState());

    const s = state({ input: slot(SAND, 1), fuel: slot(COAL, 1), smeltTimeTotal: 200 });
    const entity2 = createFurnaceBlockEntity(1, 2, 3, s);
    expect(readFurnaceState(entity2)).toEqual(s);
  });

  it('updateFurnaceState returns a new instance and leaves the old unchanged', () => {
    const entity = createFurnaceBlockEntity(4, 5, 6);
    const s = state({ input: slot(SAND, 1), fuel: slot(COAL, 2) });
    const updated = updateFurnaceState(entity, s);
    expect(updated).not.toBe(entity);
    expect(updated.x).toBe(4);
    expect(readFurnaceState(updated)).toEqual(s);
    expect(readFurnaceState(entity)).toEqual(createFurnaceState());
  });

  it('rejects reads of non-furnace instances and malformed payloads', () => {
    const entity = createFurnaceBlockEntity(1, 2, 3);
    const foreign = { ...entity, typeKey: 'chest' } as typeof entity;
    expect(() => readFurnaceState(foreign)).toThrow(/expected typeKey 'furnace'/);
    const malformed = { ...entity, data: { input: 'garbage' } } as typeof entity;
    expect(() => readFurnaceState(malformed)).toThrow(/must be an object/);
  });
});

describe('progress helpers', () => {
  it('returns fractions in [0,1]', () => {
    expect(
      furnaceTickProgress(state({ smeltTime: 100, smeltTimeTotal: 200 })),
    ).toBe(0.5);
    expect(furnaceBurnFraction(state({ burnTime: 800, burnTimeTotal: 1600 }))).toBe(0.5);
    expect(furnaceTickProgress(createFurnaceState())).toBe(0);
    expect(furnaceBurnFraction(createFurnaceState())).toBe(0);
    expect(furnaceTickProgress(state({ smeltTime: 200, smeltTimeTotal: 200 }))).toBe(1);
  });
});

describe('manager chunk round-trip', () => {
  it('restores a furnace entity exactly', () => {
    const manager = new BlockEntityManager();
    const s = state({ input: slot(SAND, 1), fuel: slot(COAL, 1), burnTime: 5, burnTimeTotal: 1600, smeltTime: 3, smeltTimeTotal: 200 });
    const entity = createFurnaceBlockEntity(10, 20, 30, s);
    expect(manager.add(entity)).toBe(true);
    expect(manager.serializeChunk(0, 1)).toHaveLength(1);

    const fresh = new BlockEntityManager();
    expect(fresh.deserializeChunk(0, 1, manager.serializeChunk(0, 1))).toBe(1);
    expect(readFurnaceState(fresh.get(10, 20, 30)!)).toEqual(s);
  });
});

describe('registry integration', () => {
  it('registers furnace block 20 and item 26 with valid cross-references', () => {
    const blocks = createDefaultBlockRegistry();
    const items = createDefaultItemRegistry();
    expect(() => validateItemBlockCrossReferences(blocks, items)).not.toThrow();

    const block = blocks.get(FURNACE_BLOCK_ID);
    expect(block.key).toBe('furnace');
    expect(block.solid).toBe(true);
    expect(block.breakable).toBe(true);
    expect(block.hardness).toBe(3.5);
    expect(blocks.getByResourceId(block.dropItem!)!.id).toBe(FURNACE_BLOCK_ID);
    expect(items.hasByResourceId(block.dropItem!)).toBe(true);

    const item = items.get(FURNACE_ITEM_ID);
    expect(item.key).toBe('furnace');
    expect(item.stackSize).toBe(64);
    expect(blocks.getByResourceId(item.placeBlock!)!.id).toBe(FURNACE_BLOCK_ID);
    expect(FURNACE_SLOT_COUNT).toBe(3);
  });
});
