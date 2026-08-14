import { describe, it, expect } from 'vitest';
import {
  BlockPropertySchema,
  EMPTY_SCHEMA,
  type PropertySpec,
} from '../../src/world/BlockPropertySchema';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';

describe('block property schema', () => {
  // --- 2.1 boolean property kind ---
  it('exposes exactly false/true in deterministic order', () => {
    const schema = new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]);
    expect(schema.has('lit')).toBe(true);
    expect(schema.legalValues('lit')).toEqual(['false', 'true']);
  });

  it('serializes and parses boolean canonical text exactly', () => {
    const schema = new BlockPropertySchema([{ kind: 'boolean', name: 'open' }]);
    expect(schema.serialize('open', true)).toBe('true');
    expect(schema.serialize('open', false)).toBe('false');
    expect(schema.parse('open', 'true')).toBe(true);
    expect(schema.parse('open', 'false')).toBe(false);
  });

  // --- 2.2 integer-range property kind ---
  it('exposes every integer in an inclusive min/max range', () => {
    const schema = new BlockPropertySchema([{ kind: 'integer', name: 'age', min: 0, max: 3 }]);
    expect(schema.legalValues('age')).toEqual(['0', '1', '2', '3']);
  });

  it('serializes and parses integer canonical text', () => {
    const schema = new BlockPropertySchema([{ kind: 'integer', name: 'layers', min: 1, max: 8 }]);
    expect(schema.serialize('layers', 5)).toBe('5');
    expect(schema.parse('layers', '5')).toBe(5);
  });

  it('rejects integer values outside the declared range', () => {
    const schema = new BlockPropertySchema([{ kind: 'integer', name: 'age', min: 0, max: 3 }]);
    expect(() => schema.serialize('age', 4)).toThrow(/INVALID_ID/);
    expect(() => schema.parse('age', '4')).toThrow(/INVALID_ID/);
    expect(() => schema.parse('age', '-1')).toThrow(/INVALID_ID/);
  });

  // --- 2.3 named-value property kind ---
  it('exposes an ordered set of unique lowercase values', () => {
    const schema = new BlockPropertySchema([
      { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
    ]);
    expect(schema.legalValues('facing')).toEqual(['north', 'east', 'south', 'west']);
  });

  it('serializes and parses named values exactly', () => {
    const schema = new BlockPropertySchema([
      { kind: 'named', name: 'axis', values: ['x', 'y', 'z'] },
    ]);
    expect(schema.serialize('axis', 'y')).toBe('y');
    expect(schema.parse('axis', 'y')).toBe('y');
  });

  it('rejects empty named-value sets', () => {
    expect(() => new BlockPropertySchema([{ kind: 'named', name: 'axis', values: [] }])).toThrow(
      /MISSING_ID/,
    );
  });

  it('rejects duplicate named values', () => {
    expect(
      () => new BlockPropertySchema([{ kind: 'named', name: 'axis', values: ['x', 'x'] }]),
    ).toThrow(/DUPLICATE_ID/);
  });

  // --- 2.4 invalid integer bounds ---
  it('rejects invalid integer bounds (min > max, non-integer)', () => {
    expect(
      () => new BlockPropertySchema([{ kind: 'integer', name: 'bad', min: 5, max: 2 }]),
    ).toThrow(/INVALID_ID/);
    expect(
      () => new BlockPropertySchema([{ kind: 'integer', name: 'bad', min: 0.5, max: 2 }]),
    ).toThrow(/INVALID_ID/);
    expect(
      () => new BlockPropertySchema([{ kind: 'integer', name: 'bad', min: 0, max: Number.POSITIVE_INFINITY }]),
    ).toThrow(/INVALID_ID/);
  });

  // --- 3.2 / 3.3 / 3.4 name validation ---
  it('rejects invalid property names', () => {
    expect(() => new BlockPropertySchema([{ kind: 'boolean', name: 'Lit' }])).toThrow(/INVALID_ID/);
    expect(() => new BlockPropertySchema([{ kind: 'boolean', name: '1bad' }])).toThrow(/INVALID_ID/);
    expect(() => new BlockPropertySchema([{ kind: 'boolean', name: '' }])).toThrow(/INVALID_ID/);
    expect(() => new BlockPropertySchema([{ kind: 'boolean', name: 'has space' }])).toThrow(/INVALID_ID/);
  });

  it('rejects duplicate property names', () => {
    expect(
      () =>
        new BlockPropertySchema([
          { kind: 'boolean', name: 'lit' },
          { kind: 'boolean', name: 'lit' },
        ]),
    ).toThrow(/DUPLICATE_ID/);
  });

  it('rejects non-lowercase named values', () => {
    expect(
      () => new BlockPropertySchema([{ kind: 'named', name: 'axis', values: ['X'] }]),
    ).toThrow(/INVALID_ID/);
  });

  // --- 3.6 deterministic order ---
  it('preserves authored property and value order', () => {
    const schema = new BlockPropertySchema([
      { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
      { kind: 'integer', name: 'age', min: 0, max: 2 },
      { kind: 'boolean', name: 'lit' },
    ]);
    expect(schema.properties.map((p) => p.name)).toEqual(['facing', 'age', 'lit']);
  });

  it('produces identical order across repeated construction', () => {
    const build = (): BlockPropertySchema =>
      new BlockPropertySchema([
        { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
        { kind: 'integer', name: 'age', min: 0, max: 3 },
        { kind: 'boolean', name: 'lit' },
      ]);
    expect(build().properties.map((p) => p.name)).toEqual(build().properties.map((p) => p.name));
    expect(build().legalValues('facing')).toEqual(build().legalValues('facing'));
    expect(build().legalValues('age')).toEqual(build().legalValues('age'));
  });

  // --- 4.3 / 4.4 exact parse/serialize ---
  it('rejects unknown property on lookup/parse/serialize', () => {
    const schema = new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]);
    expect(schema.has('ghost')).toBe(false);
    expect(schema.get('ghost')).toBeUndefined();
    expect(() => schema.legalValues('ghost')).toThrow(/MISSING_ID/);
    expect(() => schema.serialize('ghost', true)).toThrow(/MISSING_ID/);
    expect(() => schema.parse('ghost', 'true')).toThrow(/MISSING_ID/);
  });

  it('never coerces, trims, or changes case on parse', () => {
    const named = new BlockPropertySchema([
      { kind: 'named', name: 'facing', values: ['north', 'east'] },
    ]);
    expect(() => named.parse('facing', 'NORTH')).toThrow(/INVALID_ID/);
    expect(() => named.parse('facing', ' north')).toThrow(/INVALID_ID/);

    const integer = new BlockPropertySchema([{ kind: 'integer', name: 'age', min: 0, max: 3 }]);
    expect(() => integer.parse('age', ' 1')).toThrow(/INVALID_ID/);
    expect(() => integer.parse('age', '01')).toThrow(/INVALID_ID/);
    expect(() => integer.parse('age', '+1')).toThrow(/INVALID_ID/);

    const bool = new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]);
    expect(() => bool.parse('lit', 'TRUE')).toThrow(/INVALID_ID/);
    expect(() => bool.parse('lit', 'yes')).toThrow(/INVALID_ID/);
  });

  it('round-trips every legal value through parse(serialize(value))', () => {
    const schema = new BlockPropertySchema([
      { kind: 'boolean', name: 'lit' },
      { kind: 'integer', name: 'age', min: 0, max: 2 },
      { kind: 'named', name: 'facing', values: ['north', 'east', 'south', 'west'] },
    ]);
    for (const text of schema.legalValues('lit')) {
      expect(schema.serialize('lit', schema.parse('lit', text) as boolean)).toBe(text);
    }
    for (const text of schema.legalValues('age')) {
      expect(schema.serialize('age', schema.parse('age', text) as number)).toBe(text);
    }
    for (const text of schema.legalValues('facing')) {
      expect(schema.serialize('facing', schema.parse('facing', text) as string)).toBe(text);
    }
  });

  it('rejects serialize of an out-of-domain logical value', () => {
    const named = new BlockPropertySchema([
      { kind: 'named', name: 'facing', values: ['north', 'east'] },
    ]);
    expect(() => named.serialize('facing', 'south')).toThrow(/INVALID_ID/);
  });

  // --- 3.5 / 3.1 immutable schema & legal-value domains ---
  it('returns frozen legal-value arrays and a frozen property list', () => {
    const schema = new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]);
    expect(Object.isFrozen(schema.legalValues('lit'))).toBe(true);
    expect(Object.isFrozen(schema.properties)).toBe(true);
    expect(() => (schema.legalValues('lit') as unknown as string[]).push('extra')).toThrow();
    expect(schema.legalValues('lit')).toEqual(['false', 'true']);
  });

  it('exposes the resolved property spec without mutation', () => {
    const schema = new BlockPropertySchema([{ kind: 'integer', name: 'age', min: 0, max: 3 }]);
    const spec = schema.get('age') as PropertySpec;
    expect(spec).toEqual({ kind: 'integer', name: 'age', min: 0, max: 3 });
    expect(Object.isFrozen(spec)).toBe(true);
  });

  // --- 5.1 / 5.2 empty schema compatibility ---
  it('EMPTY_SCHEMA resolves no properties and stays frozen', () => {
    expect(EMPTY_SCHEMA.isEmpty).toBe(true);
    expect(EMPTY_SCHEMA.properties).toEqual([]);
    expect(EMPTY_SCHEMA.has('lit')).toBe(false);
    expect(EMPTY_SCHEMA.get('lit')).toBeUndefined();
  });

  it('current blocks resolve to EMPTY_SCHEMA with unchanged gameplay', () => {
    const registry = createDefaultBlockRegistry();
    // Every current block declares no property schema and must resolve empty.
    for (const def of registry.all()) {
      expect(registry.getPropertySchema(def.id).isEmpty).toBe(true);
    }
    // Core gameplay lookups remain valid and unchanged.
    expect(registry.get(BlockId.Grass).solid).toBe(true);
    expect(registry.get(BlockId.Air).solid).toBe(false);
    expect(registry.getPropertySchema(BlockId.Stone)).toBe(EMPTY_SCHEMA);
  });
});
