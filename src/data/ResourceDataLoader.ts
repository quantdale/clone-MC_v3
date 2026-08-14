/**
 * Deterministic resource-data loader (change 020).
 *
 * A `ResourceDataLoader<T>` reads named data files through an injected `ResourceReader`, decodes each
 * with a 019 `VersionedCodec`, and collects per-file errors/warnings without aborting the batch. It
 * can build a 003 `Registry<T>` from successfully loaded values keyed by a 002 `ResourceId`. The
 * loader is source-agnostic (filesystem, fetch, in-memory) via the injected reader and is
 * browser-safe (no `fs` import). This is the reusable primitive for loading versioned game data.
 */

import { type ResourceId } from './ResourceId';
import { Registry } from './Registry';
import { type CodecError, type VersionedCodec } from './VersionedCodec';

/** Reads a named resource file, returning its text or undefined when absent. */
export type ResourceReader = (name: string) => string | undefined;

/** A per-file load failure. */
export interface LoadFileError {
  readonly file: string;
  readonly reason: 'MISSING' | 'DECODE';
  readonly detail: string;
}

/** Aggregated result of a batch load. */
export interface LoadedResource<T> {
  /** Successfully decoded values, in file order. */
  readonly values: T[];
  /** Source file name for each successfully decoded value (parallel to `values`). */
  readonly sources: string[];
  /** Per-file failures. */
  readonly errors: LoadFileError[];
  /** Non-fatal notices. */
  readonly warnings: string[];
  /** True iff no errors occurred. */
  readonly ok: boolean;
}

/** Construction options for a {@link ResourceDataLoader}. */
export interface ResourceDataLoaderOptions<T> {
  readonly codec: VersionedCodec<T>;
  readonly reader: ResourceReader;
  readonly files: readonly string[];
}

/**
 * Deterministic, source-agnostic loader that decodes named files with a versioned codec.
 */
export class ResourceDataLoader<T> {
  private readonly codec: VersionedCodec<T>;
  private readonly reader: ResourceReader;
  private readonly files: readonly string[];

  constructor(options: ResourceDataLoaderOptions<T>) {
    this.codec = options.codec;
    this.reader = options.reader;
    this.files = options.files;
  }

  /** Load every configured file in order, collecting errors without aborting. */
  load(): LoadedResource<T> {
    const values: T[] = [];
    const sources: string[] = [];
    const errors: LoadFileError[] = [];
    const warnings: string[] = [];

    for (const file of this.files) {
      const text = this.reader(file);
      if (text === undefined) {
        errors.push({ file, reason: 'MISSING', detail: 'resource not found by reader' });
        continue;
      }
      const result = this.codec.tryDecode(text);
      if (!result.ok) {
        const err: CodecError = result.error;
        errors.push({ file, reason: 'DECODE', detail: err.reason });
        continue;
      }
      values.push(result.value);
      sources.push(file);
    }

    return { values, sources, errors, warnings, ok: errors.length === 0 };
  }
}

/** Result of building a registry from a loader. */
export interface RegistryBuildResult<T> {
  readonly registry: Registry<T>;
  readonly errors: LoadFileError[];
}

/**
 * Load resources and build a 003 `Registry` keyed by `keyOf(value)` (a 002 `ResourceId`).
 * Duplicate keys are surfaced as `DECODE` errors; the registry keeps the first registered entry.
 */
export function loadIntoRegistry<T>(
  loader: ResourceDataLoader<T>,
  keyOf: (value: T) => ResourceId,
): RegistryBuildResult<T> {
  const loaded = loader.load();
  const registry = new Registry<T>();
  const errors: LoadFileError[] = [...loaded.errors];

  loaded.values.forEach((value, index) => {
    const id = keyOf(value);
    try {
      registry.register(id, value);
    } catch {
      errors.push({
        file: loaded.sources[index] ?? `entry#${index}`,
        reason: 'DECODE',
        detail: 'DUPLICATE_ID: resource id already registered',
      });
    }
  });

  return { registry, errors };
}
