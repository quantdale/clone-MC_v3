import { RegistryError } from '../data/Registry';

/** The three supported block-property kinds. */
export type PropertyKind = 'boolean' | 'integer' | 'named';

/** Authored boolean property: exposes exactly false/true. */
export interface BooleanPropertySpec {
  readonly kind: 'boolean';
  readonly name: string;
}

/** Authored integer-range property: inclusive finite min/max. */
export interface IntegerPropertySpec {
  readonly kind: 'integer';
  readonly name: string;
  readonly min: number;
  readonly max: number;
}

/** Authored named-value property: ordered set of unique lowercase values. */
export interface NamedPropertySpec {
  readonly kind: 'named';
  readonly name: string;
  readonly values: readonly string[];
}

/** Union of all authored property specs. */
export type PropertySpec = BooleanPropertySpec | IntegerPropertySpec | NamedPropertySpec;

/** Restricted lowercase identifier syntax for property names and named values. */
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/** Canonical integer text must be free of sign/leading-zero coercion. */
const INTEGER_TEXT = /^-?\d+$/;

/**
 * Ordered immutable schema of named block properties for one block type.
 *
 * Defines the finite legal values and canonical text representation for each
 * property. Validation rejects invalid names, duplicate names, illegal integer
 * bounds, and empty/duplicate/non-lowercase named values. Property and value
 * order is preserved exactly as authored and never depends on map iteration.
 * 007 consumes this schema to enumerate block-state combinations.
 */
export class BlockPropertySchema {
  private readonly specs: readonly PropertySpec[];
  private readonly byName: Map<string, PropertySpec>;
  private readonly legalCache: Map<string, readonly string[]>;

  constructor(specs: readonly PropertySpec[]) {
    const seen = new Set<string>();
    const frozen: PropertySpec[] = [];

    for (const spec of specs) {
      if (!IDENTIFIER.test(spec.name)) {
        throw new RegistryError('INVALID_ID', spec.name, 'property name must be a non-empty lowercase identifier');
      }
      if (seen.has(spec.name)) {
        throw new RegistryError('DUPLICATE_ID', spec.name, 'duplicate property name within one block type');
      }
      seen.add(spec.name);

      if (spec.kind === 'integer') {
        if (!Number.isInteger(spec.min) || !Number.isInteger(spec.max) || spec.min > spec.max) {
          throw new RegistryError('INVALID_ID', spec.name, 'integer property requires finite integer bounds with min <= max');
        }
        frozen.push(Object.freeze({ kind: 'integer', name: spec.name, min: spec.min, max: spec.max }));
      } else if (spec.kind === 'named') {
        if (spec.values.length === 0) {
          throw new RegistryError('MISSING_ID', spec.name, 'named property requires at least one value');
        }
        const valueSeen = new Set<string>();
        const values: string[] = [];
        for (const value of spec.values) {
          if (!IDENTIFIER.test(value)) {
            throw new RegistryError('INVALID_ID', `${spec.name}.${value}`, 'named value must be a non-empty lowercase identifier');
          }
          if (valueSeen.has(value)) {
            throw new RegistryError('DUPLICATE_ID', `${spec.name}.${value}`, 'duplicate named value');
          }
          valueSeen.add(value);
          values.push(value);
        }
        frozen.push(Object.freeze({ kind: 'named', name: spec.name, values: Object.freeze([...values]) }));
      } else {
        frozen.push(Object.freeze({ kind: 'boolean', name: spec.name }));
      }
    }

    this.specs = Object.freeze(frozen);
    this.byName = new Map(frozen.map((spec) => [spec.name, spec]));
    this.legalCache = new Map();
  }

  /** Whether the schema declares any property. */
  get isEmpty(): boolean {
    return this.specs.length === 0;
  }

  /** All property specs in authored order. Returns a frozen copy. */
  get properties(): readonly PropertySpec[] {
    return this.specs;
  }

  /** Whether a property with the given name is declared. */
  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Strict property lookup. Returns undefined when absent. */
  get(name: string): PropertySpec | undefined {
    return this.byName.get(name);
  }

  /**
   * Canonical legal values for a property, in deterministic order.
   * boolean -> ['false','true']; integer -> [min..max] as text; named -> declared values.
   */
  legalValues(name: string): readonly string[] {
    const spec = this.byName.get(name);
    if (spec === undefined) {
      throw new RegistryError('MISSING_ID', name, 'unknown property');
    }
    const cached = this.legalCache.get(name);
    if (cached !== undefined) {
      return cached;
    }
    let values: string[];
    if (spec.kind === 'boolean') {
      values = ['false', 'true'];
    } else if (spec.kind === 'integer') {
      values = [];
      for (let i = spec.min; i <= spec.max; i++) {
        values.push(String(i));
      }
    } else {
      values = [...spec.values];
    }
    const frozen = Object.freeze(values);
    this.legalCache.set(name, frozen);
    return frozen;
  }

  /**
   * Canonical-serialize a logical value to text. The value MUST be a legal
   * member of the property domain or INVALID_ID is thrown.
   */
  serialize(name: string, value: boolean | number | string): string {
    const spec = this.byName.get(name);
    if (spec === undefined) {
      throw new RegistryError('MISSING_ID', name, 'unknown property');
    }
    if (spec.kind === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new RegistryError('INVALID_ID', name, 'boolean property requires a boolean value');
      }
      return value ? 'true' : 'false';
    }
    if (spec.kind === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < spec.min || value > spec.max) {
        throw new RegistryError('INVALID_ID', name, 'integer value out of declared range');
      }
      return String(value);
    }
    if (typeof value !== 'string' || !spec.values.includes(value)) {
      throw new RegistryError('INVALID_ID', name, 'named value is not a declared member');
    }
    return value;
  }

  /**
   * Parse canonical text exactly into its logical value. Never coerces, trims,
   * changes case, or clamps. Unknown or out-of-domain text throws INVALID_ID.
   */
  parse(name: string, text: string): boolean | number | string {
    const spec = this.byName.get(name);
    if (spec === undefined) {
      throw new RegistryError('MISSING_ID', name, 'unknown property');
    }
    if (spec.kind === 'boolean') {
      if (text === 'true') return true;
      if (text === 'false') return false;
      throw new RegistryError('INVALID_ID', name, `cannot parse boolean from '${text}'`);
    }
    if (spec.kind === 'integer') {
      if (!INTEGER_TEXT.test(text)) {
        throw new RegistryError('INVALID_ID', name, `cannot parse integer from '${text}'`);
      }
      const n = Number(text);
      if (!Number.isInteger(n) || n < spec.min || n > spec.max) {
        throw new RegistryError('INVALID_ID', name, `integer '${text}' out of declared range`);
      }
      if (String(n) !== text) {
        throw new RegistryError('INVALID_ID', name, `'${text}' is not canonical integer text`);
      }
      return n;
    }
    if (!spec.values.includes(text)) {
      throw new RegistryError('INVALID_ID', name, `'${text}' is not a declared named value`);
    }
    return text;
  }
}

/** Shared empty schema for current blocks that declare no state properties. */
export const EMPTY_SCHEMA = new BlockPropertySchema([]);
