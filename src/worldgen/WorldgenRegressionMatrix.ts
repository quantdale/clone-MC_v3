/**
 * Worldgen regression matrix (244). Extends the 102 golden-seed idea from four seams to the full
 * produced-world outcome space: `hash2`/`hash3` (the noise-hash layer), `surface`, `biome`,
 * `block`, `ore`, `cave`, and `structure`. Fixtures pin what a player actually sees and digs —
 * the biome classification of a column, whether a cave carved a cell, where coal/iron appears,
 * and whether a structure start is placed — through a headless `TerrainGenerator`-backed probe
 * (`MatrixWorldProbe`), never through the unwired standalone pipeline modules.
 *
 * `verifyWorldgenMatrix` reports exact per-fixture pass/fail and never throws on value
 * mismatches; a probe/generation exception surfaces as a failed entry carrying the error text and
 * verification continues. `worldgenMatrixHash` is one stable 32-bit digest over every fixture's
 * actual value (the top-level determinism-break signal). `fingerprintWorldgenState` digests the
 * generation-relevant block-id → resource-id mapping plus the structure template/placement
 * registries in registration order, so a block-id renumber or a template/placement change fails
 * the suite even when the noise math is untouched.
 *
 * A deliberate worldgen/registry change MUST bump `WORLDGEN_MATRIX_VERSION`, re-pin the
 * fixtures/hash/fingerprint via the authoring script, and update
 * `SUPPORTED_WORLDGEN_MATRIX_VERSIONS`. Additive alongside `GoldenSeed.ts` (102), whose contract
 * is unchanged.
 */

import { hash2, hash3 } from '../math/PRNG';
import { resourceIdToString } from '../data/ResourceId';
import type { BlockRegistry } from '../world/BlockRegistry';
import type { StructureTemplateRegistry } from './StructureTemplate';
import type { StructurePlacementRegistry } from './StructurePlacement';

/** Fixture kinds: the 102 seams (`hash2`/`hash3`/`surface`/`block`) plus `biome`/`ore`/`cave`/`structure`. */
export type MatrixFixtureKind =
  | 'hash2'
  | 'hash3'
  | 'surface'
  | 'biome'
  | 'block'
  | 'ore'
  | 'cave'
  | 'structure';

/** The valid biome ids (`TerrainGenerator.getBiomeAt`). */
const BIOME_IDS: readonly string[] = ['plains', 'forest', 'desert', 'taiga'];

/** A pinned produced-world outcome for a seed and coordinates. */
export interface MatrixFixture {
  key: string;
  kind: MatrixFixtureKind;
  /** Matrix version (e.g. `'v1'`); must be in `SUPPORTED_WORLDGEN_MATRIX_VERSIONS`. */
  version: string;
  /** Non-negative safe integer. */
  seed: number;
  /** World coordinate (safe integer; negative allowed). */
  x: number;
  /** World coordinate; used by `hash3`/`block`/`ore`/`cave` (ignored by the others). */
  y: number;
  /** World coordinate (safe integer; negative allowed). */
  z: number;
  /** Number for numeric kinds; biome id / `'present'|'absent'` for string kinds. */
  expected: number | string;
}

/**
 * The current matrix version. A deliberate worldgen/registry change must bump and re-pin.
 * v1→v2: 2026-08-22 deterministic depth pipeline change (five-field climate classifier with new
 * biome thresholds, declarative surface rules, region-owned ore veins) intentionally changed
 * generated content; determinism of the new pipeline proven by tests/unit/WorldgenDeterminism.test.ts.
 */
export const WORLDGEN_MATRIX_VERSION = 'v2';

/** Versions the suite enforces green. Today exactly `['v2']`. */
export const SUPPORTED_WORLDGEN_MATRIX_VERSIONS: readonly string[] = ['v2'];

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isSafeInteger(v: unknown): v is number {
  return isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER;
}

/**
 * Validate an unknown value as a matrix fixture; throws descriptively (naming the offending
 * field) otherwise. Kind-inconsistent `expected` shapes and unsupported versions are rejected.
 */
export function validateMatrixFixture(input: unknown): MatrixFixture {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorldgenRegressionMatrix: fixture must be an object');
  }
  const r = input as Record<string, unknown>;
  if (typeof r.key !== 'string' || r.key.length === 0) {
    throw new Error('WorldgenRegressionMatrix: key must be a non-empty string');
  }
  if (
    r.kind !== 'hash2' &&
    r.kind !== 'hash3' &&
    r.kind !== 'surface' &&
    r.kind !== 'biome' &&
    r.kind !== 'block' &&
    r.kind !== 'ore' &&
    r.kind !== 'cave' &&
    r.kind !== 'structure'
  ) {
    throw new Error(
      `WorldgenRegressionMatrix: kind must be one of hash2/hash3/surface/biome/block/ore/cave/structure, got ${String(r.kind)}`,
    );
  }
  const kind = r.kind as MatrixFixtureKind;
  if (typeof r.version !== 'string' || r.version.length === 0) {
    throw new Error('WorldgenRegressionMatrix: version must be a non-empty string');
  }
  if (!SUPPORTED_WORLDGEN_MATRIX_VERSIONS.includes(r.version)) {
    throw new Error(
      `WorldgenRegressionMatrix: version ${r.version} is not in SUPPORTED_WORLDGEN_MATRIX_VERSIONS [${SUPPORTED_WORLDGEN_MATRIX_VERSIONS.join(', ')}]`,
    );
  }
  if (!isSafeInteger(r.seed) || (r.seed as number) < 0) {
    throw new Error(
      `WorldgenRegressionMatrix: seed must be a non-negative safe integer, got ${String(r.seed)}`,
    );
  }
  if (!isSafeInteger(r.x) || !isSafeInteger(r.y) || !isSafeInteger(r.z)) {
    throw new Error('WorldgenRegressionMatrix: x/y/z must be safe integers');
  }
  switch (kind) {
    case 'biome':
      if (typeof r.expected !== 'string' || !BIOME_IDS.includes(r.expected)) {
        throw new Error(
          `WorldgenRegressionMatrix: expected must be one of ${BIOME_IDS.join('/')} for biome fixtures, got ${String(r.expected)}`,
        );
      }
      break;
    case 'structure':
      if (r.expected !== 'present' && r.expected !== 'absent') {
        throw new Error(
          `WorldgenRegressionMatrix: expected must be 'present' or 'absent' for structure fixtures, got ${String(r.expected)}`,
        );
      }
      break;
    default:
      if (!isInteger(r.expected) || (r.expected as number) < 0) {
        throw new Error(
          `WorldgenRegressionMatrix: expected must be a non-negative integer for ${kind} fixtures, got ${String(r.expected)}`,
        );
      }
      break;
  }
  return {
    key: r.key,
    kind,
    version: r.version,
    seed: r.seed as number,
    x: r.x as number,
    y: r.y as number,
    z: r.z as number,
    expected: r.expected as number | string,
  };
}

/** The headless produced-world probe verification needs (backed by `TerrainGenerator`). */
export interface MatrixWorldProbe {
  surfaceHeight(seed: number, x: number, z: number): number;
  biomeAt(seed: number, x: number, z: number): string;
  blockAt(seed: number, x: number, y: number, z: number): number;
  /** Whether a structure start exists for the seed at this chunk. */
  structurePresent(seed: number, chunkX: number, chunkZ: number): boolean;
}

/** One verification result; mismatches are reported, never thrown. */
export interface MatrixFixtureResult {
  key: string;
  kind: MatrixFixtureKind;
  pass: boolean;
  actual: number | string | null;
  /** Set when the probe threw for this fixture; verification continues over the rest. */
  error?: string;
}

/**
 * Verify fixtures against the current implementation. Per fixture in input order: hash2/hash3
 * use `math/PRNG` directly; the rest use the probe (`structure` derives its chunk as
 * `Math.floor(x / 16)` / `Math.floor(z / 16)`). Mismatches produce `pass: false` entries and
 * never throw; a thrown probe exception produces a failed entry with `error`.
 */
export function verifyWorldgenMatrix(
  fixtures: readonly MatrixFixture[],
  world: MatrixWorldProbe,
): MatrixFixtureResult[] {
  const results: MatrixFixtureResult[] = [];
  for (const fixture of fixtures) {
    let actual: number | string;
    try {
      switch (fixture.kind) {
        case 'hash2':
          actual = hash2(fixture.x, fixture.z, fixture.seed);
          break;
        case 'hash3':
          actual = hash3(fixture.x, fixture.y, fixture.z, fixture.seed);
          break;
        case 'surface':
          actual = world.surfaceHeight(fixture.seed, fixture.x, fixture.z);
          break;
        case 'biome':
          actual = world.biomeAt(fixture.seed, fixture.x, fixture.z);
          break;
        case 'block':
        case 'ore':
        case 'cave':
          actual = world.blockAt(fixture.seed, fixture.x, fixture.y, fixture.z);
          break;
        case 'structure':
          actual = world.structurePresent(
            fixture.seed,
            Math.floor(fixture.x / 16),
            Math.floor(fixture.z / 16),
          )
            ? 'present'
            : 'absent';
          break;
      }
    } catch (e) {
      results.push({
        key: fixture.key,
        kind: fixture.kind,
        pass: false,
        actual: null,
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    results.push({
      key: fixture.key,
      kind: fixture.kind,
      pass: actual === fixture.expected,
      actual,
    });
  }
  return results;
}

/** FNV-1a 32-bit over a string (UTF-16 code units), matching `SeedRng.hashString`'s style. */
function fnv1a(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One stable 32-bit digest over every fixture's canonical
 * `version|key|kind|seed|x|y|z|actual` record (in fixture order, `\n`-joined). Stable for
 * identical verification outputs; changes iff some fixture's `actual` changes.
 */
export function worldgenMatrixHash(
  fixtures: readonly MatrixFixture[],
  world: MatrixWorldProbe,
): number {
  const results = verifyWorldgenMatrix(fixtures, world);
  const lines = results.map((r, i) => {
    const f = fixtures[i]!;
    return `${f.version}|${f.key}|${f.kind}|${f.seed}|${f.x}|${f.y}|${f.z}|${String(r.actual)}`;
  });
  return fnv1a(lines.join('\n'));
}

/** The generation-relevant block resource paths, fingerprinted as `legacyId:path` records. */
const GENERATION_RELEVANT_BLOCK_PATHS: readonly string[] = [
  'bedrock',
  'grass',
  'dirt',
  'stone',
  'sand',
  'water',
  'gravel',
  'coal_ore',
  'iron_ore',
  'lava',
  'wood',
  'leaves',
  'snow',
  'cobblestone',
];

/**
 * A deterministic digest of the generation-relevant registry state: (a) every
 * generation-relevant block's `legacyId:resourcePath` in ascending legacy-id order; (b) every
 * structure template in registration order as `key|width|height|depth|blocksLength`; (c) every
 * placement config in registration order as
 * `key|templateKey|spacing|separation|salt|minSurfaceHeight|biomeKeys`. A block-id renumber or
 * any template/placement change therefore changes the fingerprint even when the noise math is
 * untouched.
 */
export function fingerprintWorldgenState(options: {
  blockRegistry: BlockRegistry;
  templates: StructureTemplateRegistry;
  placements: StructurePlacementRegistry;
}): string {
  const lines: string[] = [];

  // (a) Generation-relevant blocks by resource path, ascending legacy id.
  const relevant = new Set(GENERATION_RELEVANT_BLOCK_PATHS);
  const blockRecords: Array<{ id: number; path: string }> = [];
  for (const def of options.blockRegistry.all()) {
    const path = resourceIdToString(def.resourceId);
    const shortPath = path.includes(':') ? path.slice(path.indexOf(':') + 1) : path;
    if (!relevant.has(shortPath)) continue;
    blockRecords.push({ id: def.id, path: shortPath });
  }
  blockRecords.sort((a, b) => a.id - b.id);
  for (const rec of blockRecords) {
    lines.push(`${rec.id}:${rec.path}`);
  }

  // (b) Structure templates in registration order.
  for (const template of options.templates.all()) {
    lines.push(
      `${template.key}|${template.size.width}|${template.size.height}|${template.size.depth}|${template.blocks.length}`,
    );
  }

  // (c) Placement configs in registration order.
  for (const placement of options.placements.all()) {
    lines.push(
      `${placement.key}|${placement.templateKey}|${placement.spacing}|${placement.separation}|${placement.salt}|${placement.minSurfaceHeight}|${placement.biomeKeys.join(',')}`,
    );
  }

  const digest = fnv1a(lines.join('\n'));
  return digest.toString(16).padStart(8, '0');
}

/**
 * Re-pinned after the 2026-08-22 worldgen depth pipeline change; determinism proven by
 * tests/unit/WorldgenDeterminism.test.ts. Regenerated via the authoring script
 * (`npx vitest run --config scripts/worldgen/vitest.author.config.ts`).
 */
export const PINNED_V2_MATRIX_HASH = 1619101606;
// (Authoring-script output 1517357792 was computed with fixtures still stamped version:'v1';
// `worldgenMatrixHash` records include the version field, so the v2-stamped digest is this.)

/** The pinned default registry-state fingerprint (authoring-script generated). Unchanged from
 * v1: the block registry and structure template/placement registries were not touched by the
 * 2026-08-22 pipeline change, so `fingerprintWorldgenState` digests identically. */
export const PINNED_WORLDGEN_STATE_FINGERPRINT = '6e654848';

/**
 * The pinned v2 catalog (authoring-script generated; embedded verbatim — never hand-tuned).
 * Biome coordinates, surface blocks, and ore positions re-pinned after the 2026-08-22 worldgen
 * depth pipeline change (biome keys shifted plains↔forest↔taiga under the new five-field climate
 * thresholds; surface rules changed near-surface blocks; ores became region-owned veins);
 * determinism proven by tests/unit/WorldgenDeterminism.test.ts.
 */
const PINNED_V2_CATALOG: readonly MatrixFixture[] = [
  // prettier-ignore
    { key: 'hash2/origin/42', kind: 'hash2', version: 'v2', seed: 42, x: 0, y: 0, z: 0, expected: 1973702734 },
    { key: 'hash2/negative/1234', kind: 'hash2', version: 'v2', seed: 1234, x: -77, y: 0, z: 33, expected: 672145738 },
    { key: 'hash2/boundary-seed/0', kind: 'hash2', version: 'v2', seed: 0, x: 48, y: 0, z: 64, expected: 3656787307 },
    { key: 'hash3/depth/42', kind: 'hash3', version: 'v2', seed: 42, x: 1, y: -64, z: 1, expected: 848142630 },
    { key: 'hash3/negative/9999', kind: 'hash3', version: 'v2', seed: 9999, x: -5, y: 30, z: -5, expected: 2437147272 },
    { key: 'hash3/boundary-seed/0', kind: 'hash3', version: 'v2', seed: 0, x: 48, y: 12, z: 64, expected: 3274001703 },
    { key: 'biome/spawn-origin/42', kind: 'biome', version: 'v2', seed: 42, x: 0, y: 0, z: 0, expected: "plains" },
    { key: 'biome/forest/0', kind: 'biome', version: 'v2', seed: 0, x: -512, y: 0, z: -320, expected: "forest" },
    { key: 'biome/desert/0', kind: 'biome', version: 'v2', seed: 0, x: -512, y: 0, z: 496, expected: "desert" },
    { key: 'biome/taiga/0', kind: 'biome', version: 'v2', seed: 0, x: -512, y: 0, z: -512, expected: "taiga" },
    { key: 'surface/0', kind: 'surface', version: 'v2', seed: 0, x: -512, y: 0, z: -512, expected: 35 },
    { key: 'block/surface/0', kind: 'block', version: 'v2', seed: 0, x: -512, y: 34, z: -512, expected: 2 },
    { key: 'surface/1', kind: 'surface', version: 'v2', seed: 1, x: 16, y: 0, z: -16, expected: 32 },
    { key: 'block/surface/1', kind: 'block', version: 'v2', seed: 1, x: 16, y: 31, z: -16, expected: 11 },
    { key: 'surface/42', kind: 'surface', version: 'v2', seed: 42, x: 0, y: 0, z: 0, expected: 35 },
    { key: 'block/surface/42', kind: 'block', version: 'v2', seed: 42, x: 0, y: 34, z: 0, expected: 2 },
    { key: 'surface/1337', kind: 'surface', version: 'v2', seed: 1337, x: 21392, y: 0, z: -16, expected: 32 },
    { key: 'block/surface/1337', kind: 'block', version: 'v2', seed: 1337, x: 21392, y: 31, z: -16, expected: 4 },
    { key: 'surface/1234', kind: 'surface', version: 'v2', seed: 1234, x: 19744, y: 0, z: -16, expected: 35 },
    { key: 'block/surface/1234', kind: 'block', version: 'v2', seed: 1234, x: 19744, y: 34, z: -16, expected: 2 },
    { key: 'surface/9999', kind: 'surface', version: 'v2', seed: 9999, x: 159984, y: 0, z: -16, expected: 37 },
    { key: 'block/surface/9999', kind: 'block', version: 'v2', seed: 9999, x: 159984, y: 36, z: -16, expected: 2 },
    { key: 'biome/1', kind: 'biome', version: 'v2', seed: 1, x: 16, y: 0, z: -16, expected: "plains" },
    { key: 'biome/42', kind: 'biome', version: 'v2', seed: 42, x: 0, y: 0, z: 0, expected: "plains" },
    { key: 'biome/1337', kind: 'biome', version: 'v2', seed: 1337, x: 21392, y: 0, z: -16, expected: "desert" },
    { key: 'biome/1234', kind: 'biome', version: 'v2', seed: 1234, x: 19744, y: 0, z: -16, expected: "plains" },
    { key: 'biome/9999', kind: 'biome', version: 'v2', seed: 9999, x: 159984, y: 0, z: -16, expected: "plains" },
    { key: 'block/bedrock/0', kind: 'block', version: 'v2', seed: 0, x: 0, y: 0, z: 0, expected: 6 },
    { key: 'block/boundary-column/1337', kind: 'block', version: 'v2', seed: 1337, x: 48, y: 10, z: 64, expected: 0 },
    { key: 'ore/coal/0', kind: 'ore', version: 'v2', seed: 0, x: -256, y: 15, z: -192, expected: 14 },
    { key: 'ore/iron/0', kind: 'ore', version: 'v2', seed: 0, x: -256, y: 8, z: 240, expected: 15 },
    { key: 'ore/no-ore-control/0', kind: 'ore', version: 'v2', seed: 0, x: -256, y: 3, z: -256, expected: 3 },
    { key: 'cave/carved/0', kind: 'cave', version: 'v2', seed: 0, x: -256, y: 23, z: -192, expected: 0 },
    { key: 'cave/not-carved-control/0', kind: 'cave', version: 'v2', seed: 0, x: -256, y: 2, z: -256, expected: 3 },
    { key: 'structure/present/42', kind: 'structure', version: 'v2', seed: 42, x: -552, y: 0, z: 648, expected: "present" },
    { key: 'structure/absent/42', kind: 'structure', version: 'v2', seed: 42, x: -632, y: 0, z: -632, expected: "absent" },
];

/**
 * The documented matrix catalog for `version` (default: the current `WORLDGEN_MATRIX_VERSION`).
 * Throws for a version outside `SUPPORTED_WORLDGEN_MATRIX_VERSIONS` or without a pinned catalog.
 */
export function createDefaultWorldgenMatrix(version: string = WORLDGEN_MATRIX_VERSION): MatrixFixture[] {
  if (!SUPPORTED_WORLDGEN_MATRIX_VERSIONS.includes(version)) {
    throw new Error(
      `WorldgenRegressionMatrix: version ${version} is not in SUPPORTED_WORLDGEN_MATRIX_VERSIONS [${SUPPORTED_WORLDGEN_MATRIX_VERSIONS.join(', ')}]`,
    );
  }
  if (version !== WORLDGEN_MATRIX_VERSION) {
    throw new Error(`WorldgenRegressionMatrix: no catalog pinned for version ${version}`);
  }
  return PINNED_V2_CATALOG.map((f) => ({ ...f }));
}
