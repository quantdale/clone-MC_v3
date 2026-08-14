/**
 * Fluid-type registry (change 015).
 *
 * A fluid type is a ResourceId-identified, immutable data record describing one fluid
 * (water/lava, source/flowing) with category, flags, emitted light, and density. A
 * `FluidRegistry` validates and finalizes a set of definitions on the 003 generic registry
 * core. `createDefaultFluidRegistry()` provides water/lava source and flowing variants.
 *
 * 015 is additive and gameplay-free: the current `water`/`lava` *blocks* are not migrated;
 * this is the typed data foundation for future fluid/block separation.
 */

import { type ResourceId, createResourceId, resourceIdToString } from './ResourceId';
import { Registry } from './Registry';

/** Whether a fluid is water or lava. */
export type FluidCategory = 'WATER' | 'LAVA';

/** Category/behavior tag attached to a fluid type. */
export type FluidFlag = 'WATER' | 'LAVA' | 'SOURCE' | 'FLOWING' | 'LIGHT_EMITTING' | 'DENSER';

/** An immutable data record describing one fluid type. */
export interface FluidTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly category: FluidCategory;
  readonly flags: readonly FluidFlag[];
  /** Emitted light level in [0, 15]. */
  readonly lightLevel?: number;
  /** Relative density (> 0); denser fluids displace lighter ones. */
  readonly density?: number;
  /** Whether this variant is a stationary source block. */
  readonly isSource?: boolean;
}

/** Failure category for fluid-type validation. */
export type FluidErrorReason = 'DUPLICATE_ID' | 'INVALID_VALUE' | 'INVALID_FLAG' | 'INVALID_DEFINITION';

/** Thrown when a fluid-type definition or registry operation fails validation. */
export class FluidError extends Error {
  readonly reason: FluidErrorReason;
  readonly identifier: string | undefined;

  constructor(reason: FluidErrorReason, identifier: string | undefined, detail: string) {
    super(`Fluid error (${reason}): ${detail}`);
    this.name = 'FluidError';
    this.reason = reason;
    this.identifier = identifier;
  }
}

const KNOWN_FLAGS: readonly FluidFlag[] = ['WATER', 'LAVA', 'SOURCE', 'FLOWING', 'LIGHT_EMITTING', 'DENSER'];

const CATEGORY_FLAG: Record<FluidCategory, FluidFlag> = { WATER: 'WATER', LAVA: 'LAVA' };

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function validate(def: FluidTypeDefinition): void {
  if (def.category !== 'WATER' && def.category !== 'LAVA') {
    throw new FluidError('INVALID_DEFINITION', def.key, `unknown fluid category: ${def.category}`);
  }
  if (!def.flags.includes(CATEGORY_FLAG[def.category])) {
    throw new FluidError(
      'INVALID_DEFINITION',
      def.key,
      `fluid category ${def.category} must carry the matching ${CATEGORY_FLAG[def.category]} flag`,
    );
  }
  for (const flag of def.flags) {
    if (!KNOWN_FLAGS.includes(flag)) {
      throw new FluidError('INVALID_FLAG', def.key, `unknown fluid flag: ${String(flag)}`);
    }
  }
  if (def.lightLevel !== undefined && (!isFiniteNumber(def.lightLevel) || def.lightLevel < 0 || def.lightLevel > 15)) {
    throw new FluidError('INVALID_VALUE', def.key, 'lightLevel must be a finite number in [0, 15]');
  }
  if (def.density !== undefined && (!isFiniteNumber(def.density) || def.density <= 0)) {
    throw new FluidError('INVALID_VALUE', def.key, 'density must be a finite positive number');
  }
}

/**
 * Registry of fluid-type definitions built on the 003 generic registry core.
 *
 * Construction validates every definition (unique id, known flags, category/flag
 * consistency, finite bounded light/density) and finalizes before any lookup.
 */
export class FluidRegistry {
  private readonly inner: Registry<FluidTypeDefinition>;

  constructor(definitions: FluidTypeDefinition[]) {
    this.inner = new Registry<FluidTypeDefinition>();
    for (const def of definitions) {
      validate(def);
      if (this.inner.has(def.id)) {
        throw new FluidError('DUPLICATE_ID', resourceIdToString(def.id), 'fluid id already registered');
      }
      this.inner.register(def.id, def);
    }
    this.inner.finalize();
  }

  /** Whether the registry has been finalized and can no longer accept mutations. */
  get finalized(): boolean {
    return this.inner.finalized;
  }

  /** Number of registered fluid-type definitions. */
  get size(): number {
    return this.inner.size;
  }

  /** Strict lookup by ResourceId. */
  get(id: ResourceId): FluidTypeDefinition {
    return this.inner.get(id);
  }

  /** Optional lookup by ResourceId. */
  getOptional(id: ResourceId): FluidTypeDefinition | undefined {
    return this.inner.getOptional(id);
  }

  /** Whether a fluid ResourceId is registered. */
  has(id: ResourceId): boolean {
    return this.inner.has(id);
  }

  /** All definitions in ascending registration order (deterministic). */
  entries(): readonly FluidTypeDefinition[] {
    return this.inner.entries().map((entry) => entry.value);
  }
}

const rid = (path: string): ResourceId => createResourceId('minecraft', `fluid/${path}`);

/**
 * Default fluid-type registry. Water and lava each have a source and a flowing variant;
 * lava emits light and is denser. The current `water`/`lava` blocks are not migrated.
 */
export function createDefaultFluidRegistry(): FluidRegistry {
  return new FluidRegistry([
    { id: rid('water'), key: 'water', name: 'Water', category: 'WATER', flags: ['WATER', 'FLOWING'], lightLevel: 0, density: 1, isSource: false },
    { id: rid('water_source'), key: 'water_source', name: 'Water Source', category: 'WATER', flags: ['WATER', 'SOURCE'], lightLevel: 0, density: 1, isSource: true },
    { id: rid('lava'), key: 'lava', name: 'Lava', category: 'LAVA', flags: ['LAVA', 'FLOWING', 'DENSER'], lightLevel: 0, density: 2, isSource: false },
    { id: rid('lava_source'), key: 'lava_source', name: 'Lava Source', category: 'LAVA', flags: ['LAVA', 'SOURCE', 'LIGHT_EMITTING', 'DENSER'], lightLevel: 15, density: 2, isSource: true },
  ]);
}
