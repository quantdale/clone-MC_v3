/**
 * Enchantment/potion content expansion (219): data-driven enchantment, status-effect, and
 * potion definitions over 012/014/118/122 — the established no-new-architecture pattern
 * (215-218; the runtime consumes these definitions through the existing registries, untouched).
 * Pure and headless-safe.
 *
 * Determinism rules:
 * - Ids are valid namespaced ids (004 rules) whose path does NOT start with the kind's prefix
 *   ('enchantment/', 'effect/', 'potion/').
 * - Enchantment: `maxLevel` positive integer (default 1); `appliesTo` non-empty strings;
 *   `incompatible` strings (default []).
 * - Effect: `beneficial` boolean; `maxAmplifier` integer >= 0 (default 3).
 * - Potion: `effectId` non-empty; `durationTicks` positive integer; `amplifier` integer >= 0.
 * - Per-kind duplicate ids are rejected; the whole payload validates before anything is
 *   accepted. `potionsForEffect` filters by reference; dangling effect ids are allowed.
 */
import {
  createResourceId,
  isValidResourceNamespace,
  isValidResourcePath,
  resourceIdEquals,
  resourceIdToString,
  tryParseResourceId,
  type ResourceId,
} from './ResourceId';

/** One data-driven enchantment definition. */
export interface EnchantmentDefinition {
  readonly id: ResourceId;
  readonly name: string;
  /** Positive integer (default 1). */
  readonly maxLevel: number;
  readonly appliesTo: readonly string[];
  /** Default []. */
  readonly incompatible: readonly string[];
}

/** One data-driven status-effect definition. */
export interface StatusEffectDefinition {
  readonly id: ResourceId;
  readonly name: string;
  readonly beneficial: boolean;
  /** Integer >= 0 (default 3). */
  readonly maxAmplifier: number;
}

/** One data-driven potion definition. */
export interface PotionDefinition {
  readonly id: ResourceId;
  readonly name: string;
  /** Status-effect reference (runtime-resolved; dangling allowed). */
  readonly effectId: string;
  /** Positive integer. */
  readonly durationTicks: number;
  /** Integer >= 0. */
  readonly amplifier: number;
}

function toResourceId(value: unknown, what: string): ResourceId {
  if (typeof value === 'string') {
    const parsed = tryParseResourceId(value, 'minecraft');
    if (parsed === null) {
      throw new Error(`EnchantmentPotion: ${what} must be a valid namespaced id`);
    }
    return parsed;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).namespace === 'string' &&
    typeof (value as Record<string, unknown>).path === 'string'
  ) {
    const r = value as { namespace: string; path: string };
    if (!isValidResourceNamespace(r.namespace) || !isValidResourcePath(r.path)) {
      throw new Error(`EnchantmentPotion: ${what} must be a valid namespaced id`);
    }
    return createResourceId(r.namespace, r.path);
  }
  throw new Error(`EnchantmentPotion: ${what} must be a valid namespaced id`);
}

function requireName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('EnchantmentPotion: name must be a non-empty string');
  }
  return value;
}

function requireNonEmptyStrings(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`EnchantmentPotion: ${what} must be non-empty strings`);
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(`EnchantmentPotion: ${what} must be non-empty strings`);
    }
  }
  return [...value];
}

export interface EnchantmentDefinitionInput {
  readonly id: ResourceId | string;
  readonly name: string;
  readonly maxLevel?: number;
  readonly appliesTo: readonly string[];
  readonly incompatible?: readonly string[];
}

/** Build a validated enchantment definition. */
export function createEnchantmentDefinition(input: EnchantmentDefinitionInput): EnchantmentDefinition {
  const id = toResourceId(input.id, 'id');
  if (id.path.startsWith('enchantment/')) {
    throw new Error(`EnchantmentPotion: id path must not start with 'enchantment/'`);
  }
  const name = requireName(input.name);
  const maxLevel = input.maxLevel ?? 1;
  if (!Number.isInteger(maxLevel) || maxLevel < 1) {
    throw new Error('EnchantmentPotion: maxLevel must be a positive integer');
  }
  if (input.appliesTo.length === 0) {
    throw new Error('EnchantmentPotion: appliesTo must not be empty');
  }
  return {
    id,
    name,
    maxLevel,
    appliesTo: requireNonEmptyStrings(input.appliesTo, 'appliesTo'),
    incompatible: requireNonEmptyStrings(input.incompatible ?? [], 'incompatible'),
  };
}

export interface StatusEffectDefinitionInput {
  readonly id: ResourceId | string;
  readonly name: string;
  readonly beneficial: boolean;
  readonly maxAmplifier?: number;
}

/** Build a validated status-effect definition. */
export function createStatusEffectDefinition(input: StatusEffectDefinitionInput): StatusEffectDefinition {
  const id = toResourceId(input.id, 'id');
  if (id.path.startsWith('effect/')) {
    throw new Error(`EnchantmentPotion: id path must not start with 'effect/'`);
  }
  const name = requireName(input.name);
  if (typeof input.beneficial !== 'boolean') {
    throw new Error('EnchantmentPotion: beneficial must be a boolean');
  }
  const maxAmplifier = input.maxAmplifier ?? 3;
  if (!Number.isInteger(maxAmplifier) || maxAmplifier < 0) {
    throw new Error('EnchantmentPotion: maxAmplifier must be an integer >= 0');
  }
  return { id, name, beneficial: input.beneficial, maxAmplifier };
}

export interface PotionDefinitionInput {
  readonly id: ResourceId | string;
  readonly name: string;
  readonly effectId: string;
  readonly durationTicks: number;
  readonly amplifier: number;
}

/** Build a validated potion definition. */
export function createPotionDefinition(input: PotionDefinitionInput): PotionDefinition {
  const id = toResourceId(input.id, 'id');
  if (id.path.startsWith('potion/')) {
    throw new Error(`EnchantmentPotion: id path must not start with 'potion/'`);
  }
  const name = requireName(input.name);
  if (typeof input.effectId !== 'string' || input.effectId.length === 0) {
    throw new Error('EnchantmentPotion: effectId must be a non-empty string');
  }
  if (!Number.isInteger(input.durationTicks) || input.durationTicks < 1) {
    throw new Error('EnchantmentPotion: durationTicks must be a positive integer');
  }
  if (!Number.isInteger(input.amplifier) || input.amplifier < 0) {
    throw new Error('EnchantmentPotion: amplifier must be an integer >= 0');
  }
  return { id, name, effectId: input.effectId, durationTicks: input.durationTicks, amplifier: input.amplifier };
}

/** The validated catalog expansion (registration order per kind). */
export interface CatalogExpansion {
  readonly enchantments: readonly EnchantmentDefinition[];
  readonly effects: readonly StatusEffectDefinition[];
  readonly potions: readonly PotionDefinition[];
}

function rejectDuplicates<T extends { id: ResourceId }>(
  definitions: readonly T[],
  what: string,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const definition of definitions) {
    const key = resourceIdToString(definition.id);
    if (seen.has(key)) {
      throw new Error(`EnchantmentPotion: duplicate ${what} id ${key}`);
    }
    seen.add(key);
    out.push(definition);
  }
  return out;
}

/** Build a catalog; per-kind duplicate ids are rejected wholesale. */
export function createCatalogExpansion(input: {
  enchantments?: readonly EnchantmentDefinition[];
  effects?: readonly StatusEffectDefinition[];
  potions?: readonly PotionDefinition[];
}): CatalogExpansion {
  return {
    enchantments: rejectDuplicates(input.enchantments ?? [], 'enchantment'),
    effects: rejectDuplicates(input.effects ?? [], 'effect'),
    potions: rejectDuplicates(input.potions ?? [], 'potion'),
  };
}

function resolveId(id: ResourceId | string): ResourceId | null {
  return typeof id === 'string' ? tryParseResourceId(id, 'minecraft') : id;
}

/** Look up an enchantment by id; undefined when missing. */
export function enchantmentById(
  expansion: CatalogExpansion,
  id: ResourceId | string,
): EnchantmentDefinition | undefined {
  const target = resolveId(id);
  if (target === null) return undefined;
  return expansion.enchantments.find((e) => resourceIdEquals(e.id, target));
}

/** Look up a status effect by id; undefined when missing. */
export function effectById(
  expansion: CatalogExpansion,
  id: ResourceId | string,
): StatusEffectDefinition | undefined {
  const target = resolveId(id);
  if (target === null) return undefined;
  return expansion.effects.find((e) => resourceIdEquals(e.id, target));
}

/** Look up a potion by id; undefined when missing. */
export function potionById(
  expansion: CatalogExpansion,
  id: ResourceId | string,
): PotionDefinition | undefined {
  const target = resolveId(id);
  if (target === null) return undefined;
  return expansion.potions.find((p) => resourceIdEquals(p.id, target));
}

/** The potions referencing an effect id, in registration order (dangling ids allowed). */
export function potionsForEffect(expansion: CatalogExpansion, effectId: string): readonly PotionDefinition[] {
  return expansion.potions.filter((p) => p.effectId === effectId);
}
