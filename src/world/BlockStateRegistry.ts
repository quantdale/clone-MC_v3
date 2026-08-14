import { type ResourceId, resourceIdToString } from '../data/ResourceId';
import { RegistryError } from '../data/Registry';
import { BlockTypeRegistry, createDefaultBlockRegistry } from './BlockRegistry';
import { type PropertySpec } from './BlockPropertySchema';

/** Dense runtime identity for one canonical block state. Local, not persistent. */
export type BlockStateId = number;

/**
 * Documented finite per-block state-count limit. A block whose Cartesian
 * property product exceeds this is rejected before the full state set is
 * allocated.
 */
export const MAX_STATES_PER_BLOCK = 65536;

/**
 * Immutable canonical block state: one block type plus one legal value for every
 * declared property. Identity is the dense runtime BlockStateId.
 */
export class BlockState {
  readonly id: BlockStateId;
  readonly blockId: number;
  readonly resourceId: ResourceId;
  private readonly values: ReadonlyMap<string, string>;
  private readonly order: readonly string[];

  constructor(
    id: BlockStateId,
    blockId: number,
    resourceId: ResourceId,
    values: ReadonlyMap<string, string>,
    order: readonly string[],
  ) {
    this.id = id;
    this.blockId = blockId;
    this.resourceId = resourceId;
    this.values = values;
    this.order = order;
  }

  /** Canonical text value of a property, or undefined when absent. */
  getProperty(name: string): string | undefined {
    return this.values.get(name);
  }

  /** Ordered [name, canonicalText] pairs in authored property order. */
  get assignments(): ReadonlyArray<readonly [string, string]> {
    return this.order.map((name) => [name, this.values.get(name) as string] as const);
  }

  /** Read-only copy of the property value map. */
  get valuesMap(): ReadonlyMap<string, string> {
    return new Map(this.values);
  }

  /** Stable debug form: `namespace:path[prop=val,...]`. Not parsed on hot paths. */
  debugString(): string {
    const body = this.order.map((name) => `${name}=${this.values.get(name)}`).join(',');
    return `${resourceIdToString(this.resourceId)}[${body}]`;
  }
}

/**
 * Enumerates canonical immutable block states from 006 property schemas and
 * assigns dense deterministic BlockStateIds. Does not migrate world storage.
 *
 * For each block type, every legal (block, complete-property-assignment)
 * combination becomes one state. Empty-schema blocks produce exactly one state.
 * Each block resolves exactly one default state. Failed construction throws
 * before any partial registry is observable.
 */
export class BlockStateRegistry {
  private readonly blockRegistry: BlockTypeRegistry;
  private readonly byId: BlockState[] = [];
  private readonly byBlock = new Map<number, BlockState[]>();
  private readonly defaultByBlock = new Map<number, BlockState>();
  private readonly index = new Map<string, BlockState>();

  constructor(blockRegistry: BlockTypeRegistry) {
    this.blockRegistry = blockRegistry;
    let nextId = 0;

    // Deterministic by ascending block id regardless of definition insertion order.
    const blocks = blockRegistry.all().slice().sort((a, b) => a.id - b.id);

    for (const def of blocks) {
      const schema = blockRegistry.getPropertySchema(def.id);
      const states: BlockState[] = [];
      let blockDefault: BlockState;

      if (schema.isEmpty) {
        blockDefault = new BlockState(nextId++, def.id, def.resourceId, new Map(), []);
        states.push(blockDefault);
      } else {
        const props = schema.properties as PropertySpec[];
        const order = props.map((p) => p.name);

        // Reject an oversized product before allocating the full state set.
        let size = 1;
        for (const p of props) size *= schema.legalValues(p.name).length;
        if (size > MAX_STATES_PER_BLOCK) {
          throw new RegistryError(
            'INVALID_RUNTIME_ID',
            String(def.id),
            `block declares ${String(size)} states, exceeds limit ${String(MAX_STATES_PER_BLOCK)}`,
          );
        }

        // Validate and canonicalize the default assignment.
        const raw = def.defaultState;
        if (raw === undefined) {
          throw new RegistryError('MISSING_ID', String(def.id), 'block with properties requires a default state');
        }
        const defaultText = new Map<string, string>();
        for (const p of props) {
          const value = (raw as Record<string, unknown>)[p.name];
          if (value === undefined) {
            throw new RegistryError('MISSING_ID', `${def.id}.${p.name}`, 'default state omits a declared property');
          }
          defaultText.set(p.name, schema.serialize(p.name, value as boolean | number | string));
        }
        for (const key of Object.keys(raw)) {
          if (!props.some((p) => p.name === key)) {
            throw new RegistryError('INVALID_ID', `${def.id}.${key}`, 'default state contains an unknown property');
          }
        }

        // Enumerate the Cartesian product in deterministic property/value order.
        const choices = props.map((p) => [...schema.legalValues(p.name)]);
        const combo: string[] = new Array(props.length).fill('');
        let defaultState: BlockState | undefined;

        const enumerate = (depth: number): void => {
          if (depth === props.length) {
            const values = new Map<string, string>();
            for (let k = 0; k < props.length; k++) {
              const name = order[k];
              const value = combo[k];
              if (name === undefined || value === undefined) continue;
              values.set(name, value);
            }
            const state = new BlockState(nextId++, def.id, def.resourceId, values, order);
            states.push(state);
            this.index.set(this.key(def.id, values, order), state);
            if (this.matches(values, defaultText)) defaultState = state;
            return;
          }
          const step = choices[depth];
          if (step === undefined) return;
          for (const choice of step) {
            combo[depth] = choice;
            enumerate(depth + 1);
          }
        };
        enumerate(0);

        if (defaultState === undefined) {
          throw new RegistryError('MISSING_ID', String(def.id), 'default state not found in enumerated states');
        }
        blockDefault = defaultState;
      }

      for (const state of states) this.byId[state.id] = state;
      this.byBlock.set(def.id, states);
      this.defaultByBlock.set(def.id, blockDefault);
    }
  }

  /** Total number of enumerated states. */
  get size(): number {
    return this.byId.length;
  }

  /** Strict lookup by runtime state id. Throws for unknown ids. */
  getState(id: BlockStateId): BlockState {
    const state = this.byId[id];
    if (state === undefined) {
      throw new RegistryError('MISSING_ID', String(id), 'unknown block state id');
    }
    return state;
  }

  /** Default state for a block type. Throws for unknown blocks. */
  getDefaultState(blockId: number): BlockState {
    const state = this.defaultByBlock.get(blockId);
    if (state === undefined) {
      throw new RegistryError('MISSING_ID', String(blockId), 'unknown block');
    }
    return state;
  }

  /** All states for a block type in enumeration order. Throws for unknown blocks. */
  statesForBlock(blockId: number): readonly BlockState[] {
    const states = this.byBlock.get(blockId);
    if (states === undefined) {
      throw new RegistryError('MISSING_ID', String(blockId), 'unknown block');
    }
    return states;
  }

  /** All enumerated states ordered by runtime id. */
  allStates(): readonly BlockState[] {
    return this.byId;
  }

  /** Look up a state from a complete property assignment. Throws on any defect. */
  lookup(blockId: number, assignment: Record<string, boolean | number | string>): BlockState {
    const schema = this.blockRegistry.getPropertySchema(blockId);
    const props = schema.properties as PropertySpec[];
    const declared = new Set(props.map((p) => p.name));
    const keys = Object.keys(assignment);

    if (keys.length !== props.length) {
      throw new RegistryError('INVALID_ID', String(blockId), 'assignment must name exactly the block properties');
    }
    for (const key of keys) {
      if (!declared.has(key)) {
        throw new RegistryError('INVALID_ID', `${String(blockId)}.${key}`, 'assignment names an unknown property');
      }
    }

    const values = new Map<string, string>();
    for (const p of props) {
      const value = assignment[p.name];
      if (value === undefined) {
        throw new RegistryError('MISSING_ID', `${String(blockId)}.${p.name}`, 'assignment omits a property');
      }
      values.set(p.name, schema.serialize(p.name, value)); // throws INVALID_ID for illegal values
    }
    const order = props.map((p) => p.name);
    const state = this.index.get(this.key(blockId, values, order));
    if (state === undefined) {
      throw new RegistryError('MISSING_ID', String(blockId), 'state not found');
    }
    return state;
  }

  /**
   * Return the canonical registered state with one property changed. Existing
   * states are not mutated. Throws when the property is not part of this block's
   * schema (cross-block safety) or the value is illegal.
   */
  with(state: BlockState, property: string, value: boolean | number | string): BlockState {
    const schema = this.blockRegistry.getPropertySchema(state.blockId);
    if (!schema.has(property)) {
      throw new RegistryError('INVALID_ID', `${String(state.blockId)}.${property}`, 'property does not belong to this block');
    }
    const newText = schema.serialize(property, value); // throws INVALID_ID for illegal values
    if (state.getProperty(property) === newText) return state;

    const values = new Map(state.valuesMap);
    values.set(property, newText);
    const order = schema.properties.map((p) => p.name);
    const target = this.index.get(this.key(state.blockId, values, order));
    if (target === undefined) {
      throw new RegistryError('MISSING_ID', String(state.blockId), 'transition target state not found');
    }
    return target;
  }

  private key(blockId: number, values: ReadonlyMap<string, string>, order: readonly string[]): string {
    let key = `${blockId}|`;
    key += order.map((name) => `${name}=${values.get(name)}`).join('|');
    return key;
  }

  private matches(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (b.get(k) !== v) return false;
    }
    return true;
  }
}

/** Build the default block-state registry from the default block registry. */
export function createDefaultBlockStateRegistry(): BlockStateRegistry {
  return new BlockStateRegistry(createDefaultBlockRegistry());
}
