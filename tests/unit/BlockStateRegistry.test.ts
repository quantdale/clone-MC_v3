import { describe, it, expect } from 'vitest';
import {
  BlockStateRegistry,
  createDefaultBlockStateRegistry,
  MAX_STATES_PER_BLOCK,
} from '../../src/world/BlockStateRegistry';
import {
  BlockTypeRegistry,
  createDefaultBlockRegistry,
  RenderCategory,
  BlockId,
} from '../../src/world/BlockRegistry';
import { BlockPropertySchema, EMPTY_SCHEMA } from '../../src/world/BlockPropertySchema';
import { createResourceId } from '../../src/data/ResourceId';
import type { BlockTypeDefinition } from '../../src/world/BlockRegistry';

const rid = (path: string) => createResourceId('minecraft', path);

function def(
  id: number,
  key: string,
  schema: BlockPropertySchema,
  defaultState?: Record<string, boolean | number | string>,
): BlockTypeDefinition {
  return {
    id,
    resourceId: rid(key),
    key,
    name: key,
    solid: true,
    opaque: true,
    breakable: true,
    renderCategory: RenderCategory.Opaque,
    topTile: 0,
    bottomTile: 0,
    sideTile: 0,
    hardness: 1,
    propertySchema: schema,
    defaultState,
  };
}

function buildRegistry(blocks: BlockTypeDefinition[]): BlockStateRegistry {
  return new BlockStateRegistry(new BlockTypeRegistry(blocks));
}

describe('block-state runtime registry', () => {
  // --- complete legal state set ---
  it('enumerates exactly one state for an empty-schema block', () => {
    const reg = buildRegistry([def(1000, 'stone', EMPTY_SCHEMA)]);
    expect(reg.size).toBe(1);
    expect(reg.statesForBlock(1000).length).toBe(1);
    expect(reg.getDefaultState(1000)).toBe(reg.statesForBlock(1000)[0]);
  });

  it('enumerates two states for a boolean property', () => {
    const reg = buildRegistry([def(1001, 'lamp', new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]), { lit: false })]);
    expect(reg.statesForBlock(1001).length).toBe(2);
    expect(reg.size).toBe(2);
  });

  it('enumerates the Cartesian product for multiple properties', () => {
    const schema = new BlockPropertySchema([
      { kind: 'boolean', name: 'lit' },
      { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
    ]);
    const reg = buildRegistry([def(1002, 'log', schema, { lit: false, facing: 'north' })]);
    expect(reg.statesForBlock(1002).length).toBe(8); // 2 * 4
    expect(reg.size).toBe(8);
  });

  // --- deterministic enumeration ---
  it('produces identical state order and ids across repeated construction', () => {
    const schema = new BlockPropertySchema([
      { kind: 'boolean', name: 'lit' },
      { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
    ]);
    const make = (): BlockStateRegistry =>
      buildRegistry([def(1002, 'log', schema, { lit: false, facing: 'north' })]);
    const a = make();
    const b = make();
    expect(a.allStates().map((s) => s.debugString())).toEqual(b.allStates().map((s) => s.debugString()));
    expect(a.allStates().map((s) => s.id)).toEqual(b.allStates().map((s) => s.id));
  });

  it('enumerates states in authored property/value order', () => {
    const schema = new BlockPropertySchema([
      { kind: 'boolean', name: 'lit' },
      { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
    ]);
    const reg = buildRegistry([def(1002, 'log', schema, { lit: false, facing: 'north' })]);
    const first = reg.statesForBlock(1002)[0]!;
    expect(first.getProperty('lit')).toBe('false');
    expect(first.getProperty('facing')).toBe('north');
  });

  // --- default state ---
  it('resolves the configured default state', () => {
    const schema = new BlockPropertySchema([
      { kind: 'boolean', name: 'lit' },
      { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
    ]);
    const reg = buildRegistry([def(1002, 'log', schema, { lit: true, facing: 'east' })]);
    const def0 = reg.getDefaultState(1002);
    expect(def0.getProperty('lit')).toBe('true');
    expect(def0.getProperty('facing')).toBe('east');
  });

  it('rejects a block with properties but no default state', () => {
    const schema = new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]);
    expect(() => buildRegistry([def(1003, 'lamp', schema)])).toThrow(/MISSING_ID/);
  });

  it('rejects an incomplete or extra default assignment', () => {
    const schema = new BlockPropertySchema([
      { kind: 'boolean', name: 'lit' },
      { kind: 'named', name: 'facing', values: ['north', 'east'] },
    ]);
    // missing 'facing'
    expect(() => buildRegistry([def(1004, 'x', schema, { lit: false })])).toThrow(/MISSING_ID/);
    // illegal 'facing' value
    expect(() =>
      buildRegistry([def(1004, 'x', schema, { lit: false, facing: 'up' } as unknown as Record<string, string>)]),
    ).toThrow(/INVALID_ID/);
    // extra unknown property
    expect(() =>
      buildRegistry([def(1004, 'x', schema, { lit: false, facing: 'north', extra: true } as unknown as Record<string, string>)]),
    ).toThrow(/INVALID_ID/);
  });

  // --- dense runtime ids + lookups ---
  it('maps state ids directly to states', () => {
    const reg = buildRegistry([def(1001, 'lamp', new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]), { lit: false })]);
    const defaultState = reg.getDefaultState(1001);
    expect(reg.getState(defaultState.id)).toBe(defaultState);
    expect(reg.allStates()[defaultState.id]).toBe(defaultState);
  });

  it('round-trips complete assignment lookups', () => {
    const schema = new BlockPropertySchema([
      { kind: 'boolean', name: 'lit' },
      { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
    ]);
    const reg = buildRegistry([def(1002, 'log', schema, { lit: true, facing: 'east' })]);
    const byDefault = reg.lookup(1002, { lit: true, facing: 'east' });
    expect(byDefault).toBe(reg.getDefaultState(1002));

    const alt = reg.lookup(1002, { lit: false, facing: 'west' });
    expect(alt.getProperty('lit')).toBe('false');
    expect(alt.getProperty('facing')).toBe('west');
  });

  it('rejects incomplete, extra, unknown, or illegal assignment lookups', () => {
    const schema = new BlockPropertySchema([
      { kind: 'boolean', name: 'lit' },
      { kind: 'named', name: 'facing', values: ['north', 'east'] },
    ]);
    const reg = buildRegistry([def(1005, 'x', schema, { lit: false, facing: 'north' })]);
    expect(() => reg.lookup(1005, { lit: false } as unknown as Record<string, string>)).toThrow(/INVALID_ID/);
    expect(() => reg.lookup(1005, { lit: false, facing: 'north', extra: true } as unknown as Record<string, string>)).toThrow(
      /INVALID_ID/,
    );
    expect(() => reg.lookup(1005, { lit: false, facing: 'up' } as unknown as Record<string, string>)).toThrow(/INVALID_ID/);
    expect(() => reg.lookup(1005, { lit: false, facing: 7 } as unknown as Record<string, string>)).toThrow(/INVALID_ID/);
  });

  // --- immutable transition ---
  it('transitions to the canonical registered target without mutating the source', () => {
    const schema = new BlockPropertySchema([
      { kind: 'boolean', name: 'lit' },
      { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
    ]);
    const reg = buildRegistry([def(1002, 'log', schema, { lit: false, facing: 'north' })]);

    const initial = reg.getDefaultState(1002);
    const turnedOn = reg.with(initial, 'lit', true);
    expect(turnedOn.getProperty('lit')).toBe('true');
    expect(initial.getProperty('lit')).toBe('false'); // source unchanged
    expect(turnedOn.id).not.toBe(initial.id);

    // Same value yields the same state (no new object/identity drift).
    const sameAgain = reg.with(initial, 'lit', false);
    expect(sameAgain).toBe(initial);

    const rotated = reg.with(initial, 'facing', 'east');
    expect(rotated.getProperty('facing')).toBe('east');
    expect(rotated.getProperty('lit')).toBe('false');
  });

  // --- cross-block safety ---
  it('rejects transitions using a property from another block', () => {
    const a = buildRegistry([
      def(2001, 'alpha', new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]), { lit: false }),
    ]);
    const b = buildRegistry([
      def(2002, 'beta', new BlockPropertySchema([{ kind: 'boolean', name: 'powered' }]), { powered: false }),
    ]);
    const stateA = a.getDefaultState(2001);
    // 'powered' belongs to beta, not alpha's schema.
    expect(() => a.with(stateA, 'powered', true)).toThrow(/INVALID_ID/);
    // Confirm beta is independently valid.
    expect(b.getDefaultState(2002).getProperty('powered')).toBe('false');
  });

  // --- state-count bound ---
  it('rejects a Cartesian product that exceeds the per-block limit', () => {
    const schema = new BlockPropertySchema([
      { kind: 'integer', name: 'x', min: 0, max: 300 },
      { kind: 'integer', name: 'y', min: 0, max: 300 },
    ]);
    // 301 * 301 = 90601 > MAX_STATES_PER_BLOCK
    expect(() => buildRegistry([def(3001, 'big', schema, { x: 0, y: 0 })])).toThrow(/INVALID_RUNTIME_ID/);
    expect(MAX_STATES_PER_BLOCK).toBeLessThan(90601);
  });

  // --- construction atomicity ---
  it('exposes no partial registry when construction fails', () => {
    const good = def(1000, 'stone', EMPTY_SCHEMA);
    const bad = def(3002, 'bad', new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }])); // no default
    let thrown = false;
    let reg: BlockStateRegistry | undefined;
    try {
      reg = buildRegistry([good, bad]);
    } catch (err) {
      thrown = err instanceof Error && /MISSING_ID/.test(err.message);
    }
    expect(thrown).toBe(true);
    expect(reg).toBeUndefined(); // never observable
  });

  // --- deterministic debug form ---
  it('produces a stable debug string with resource id and assignments', () => {
    const schema = new BlockPropertySchema([
      { kind: 'boolean', name: 'lit' },
      { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
    ]);
    const reg = buildRegistry([def(1002, 'log', schema, { lit: true, facing: 'east' })]);
    const dbg = reg.getDefaultState(1002).debugString();
    expect(dbg).toBe('minecraft:log[lit=true,facing=east]');
  });

  // --- current-block compatibility / no storage migration ---
  it('keeps current simple blocks at one state each; wheat/farmland enumerate 8, fire 16, redstone wire 1296 (125/126/128/155)', () => {
    const blockRegistry = createDefaultBlockRegistry();
    const stateRegistry = createDefaultBlockStateRegistry();
    // Single-state blocks + 8 wheat + 8 farmland + 16 fire + 1296 redstone-wire states.
    expect(stateRegistry.size).toBe(blockRegistry.all().length - 9 + 8 + 8 + 16 + 1296 + 8 + 64);
    for (const defn of blockRegistry.all()) {
      const states = stateRegistry.statesForBlock(defn.id);
      if (defn.key === 'wheat') {
        expect(states.length).toBe(8);
        expect(states.map((s) => s.getProperty('age'))).toEqual(
          ['0', '1', '2', '3', '4', '5', '6', '7'],
        );
        expect(stateRegistry.getDefaultState(defn.id).getProperty('age')).toBe('0');
      } else if (defn.key === 'farmland') {
        expect(states.length).toBe(8);
        expect(states.map((s) => s.getProperty('moisture'))).toEqual(
          ['0', '1', '2', '3', '4', '5', '6', '7'],
        );
        expect(stateRegistry.getDefaultState(defn.id).getProperty('moisture')).toBe('0');
      } else if (defn.key === 'redstone_repeater') {
        expect(states.length).toBe(64);
        const def = stateRegistry.getDefaultState(defn.id);
        expect(def.getProperty('facing')).toBe('north');
        expect(def.getProperty('delay')).toBe('1');
        expect(def.getProperty('locked')).toBe('false');
        expect(def.getProperty('powered')).toBe('false');
      } else if (defn.key === 'redstone_torch') {
        expect(states.length).toBe(2);
        expect(stateRegistry.getDefaultState(defn.id).getProperty('lit')).toBe('false');
      } else if (defn.key === 'lever' || defn.key === 'stone_button' || defn.key === 'pressure_plate') {
        expect(states.length).toBe(2);
        expect(stateRegistry.getDefaultState(defn.id).getProperty('powered')).toBe('false');
      } else if (defn.key === 'redstone_wire') {
        // 16 power values x 3 connection values ^ 4 sides.
        expect(states.length).toBe(1296);
        const def = stateRegistry.getDefaultState(defn.id);
        expect(def.getProperty('power')).toBe('0');
        for (const side of ['north', 'south', 'east', 'west']) {
          expect(def.getProperty(side)).toBe('none');
        }
      } else if (defn.key === 'fire') {
        expect(states.length).toBe(16);
        expect(states.map((s) => s.getProperty('age'))).toEqual(
          ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
        );
        expect(stateRegistry.getDefaultState(defn.id).getProperty('age')).toBe('0');
      } else {
        expect(states.length).toBe(1);
        expect(states[0]).toBe(stateRegistry.getDefaultState(defn.id));
        // Block registry itself is untouched by state enumeration.
        expect(blockRegistry.getPropertySchema(defn.id).isEmpty).toBe(true);
      }
    }
    // Sanity: a known block still resolves through the original registry.
    expect(blockRegistry.get(BlockId.Grass).solid).toBe(true);
  });
});
