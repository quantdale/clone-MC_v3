/**
 * Resource reload (213): the atomic validate-then-commit transaction over 211's resource-pack
 * and 212's data-pack manifests. Pure and headless-safe: no registry access (the check is
 * injected), no mutation of inputs, no IO.
 *
 * Determinism rules:
 * - Manifests MUST enter via 211/212 constructors (already validated); the reload adds a
 *   defensive `formatVersion === 1` check and 212's resolution check via the injected
 *   `hasEntry`.
 * - Failed proposals NEVER mutate runtime state; only `commitReload` produces a new state,
 *   ALWAYS with `version = current.version + 1` (monotonically increasing).
 * - `abortReload` returns the current state (identity) — the documented no-op for failed
 *   proposals.
 */
import { resolveEntries, type DataKind, type DataPackManifest } from './DataPackManifest';
import type { ResourcePackManifest } from './ResourcePackManifest';
import type { ResourceId } from './ResourceId';

/** The loaded resource state (the only thing reload can change). */
export interface ResourceState {
  readonly version: number;
  readonly resources: ResourcePackManifest | null;
  readonly data: DataPackManifest | null;
}

/** A fresh state: version 0, no manifests. */
export function createInitialResourceState(): ResourceState {
  return { version: 0, resources: null, data: null };
}

/** The reload inputs: validated manifests plus the injected registry check. */
export interface ReloadInput {
  readonly resources?: ResourcePackManifest;
  readonly data?: DataPackManifest;
  readonly hasEntry: (kind: DataKind, id: ResourceId) => boolean;
}

/** A validated proposal ready for commit. */
export interface ReloadProposal {
  readonly resources: ResourcePackManifest | null;
  readonly data: DataPackManifest | null;
}

export type ReloadResult =
  | { ok: true; proposal: ReloadProposal }
  | { ok: false; reason: string };

/**
 * Validate a reload: at least one manifest must be present; present manifests must carry
 * formatVersion 1; every data entry must resolve through the injected `hasEntry` (212). Failed
 * proposals are structured results — the current state is never touched here.
 */
export function proposeReload(current: ResourceState, input: ReloadInput): ReloadResult {
  void current;
  if (input.resources === undefined && input.data === undefined) {
    return { ok: false, reason: 'no resources or data provided' };
  }
  if (input.resources !== undefined && input.resources.formatVersion !== 1) {
    return { ok: false, reason: 'invalid resource pack manifest' };
  }
  if (input.data !== undefined && input.data.formatVersion !== 1) {
    return { ok: false, reason: 'invalid data pack manifest' };
  }
  if (input.data !== undefined) {
    const missing = resolveEntries(input.data, input.hasEntry);
    if (missing.length > 0) {
      const ids = missing
        .map((entry) => `${entry.kind} ${entry.id.namespace}:${entry.id.path}`)
        .join(', ');
      return { ok: false, reason: `unresolved data entries: ${ids}` };
    }
  }
  return {
    ok: true,
    proposal: {
      resources: input.resources ?? null,
      data: input.data ?? null,
    },
  };
}

/**
 * The ONLY mutation point: commit a successful proposal, stamping `version + 1`.
 */
export function commitReload(
  current: ResourceState,
  result: Extract<ReloadResult, { ok: true }>,
): ResourceState {
  return {
    version: current.version + 1,
    resources: result.proposal.resources,
    data: result.proposal.data,
  };
}

/**
 * The documented no-op for failed proposals: the current state is returned unchanged (identity).
 */
export function abortReload(current: ResourceState): ResourceState {
  return current;
}
