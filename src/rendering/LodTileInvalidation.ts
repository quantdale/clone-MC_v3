import {
  lodTileBlockSpan,
  lodTileKey,
  validateLodTileIdentity,
  type LodLevel,
  type LodTileIdentity,
  type LodTileIdentityInput,
} from './LodTile';
import {
  LodTileRenderCache,
  type LodTileRenderResource,
} from './LodTileRender';
import type { ResourceId } from '../data/ResourceId';

/** Every canonical edit invalidates exactly one presentation tile at each far tier. */
export const LOD_INVALIDATION_LEVELS: readonly LodLevel[] = [1, 2, 3];

export interface LodEditCoordinates {
  readonly dimensionId: ResourceId;
  readonly seed: number;
  readonly generationVersion: string;
  /** Canonical block coordinates; no canonical storage is read by this module. */
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
}

export interface LodTileRebuildToken {
  readonly key: string;
  readonly identity: LodTileIdentity;
  readonly revision: number;
}

export interface LodInvalidationResult {
  readonly edit: Readonly<LodEditCoordinates>;
  /** One affected tile per LOD1/LOD2/LOD3, in ascending LOD order. */
  readonly invalidated: readonly LodTileRebuildToken[];
}

export interface LodTileVisibility {
  readonly key: string;
  readonly hasResource: boolean;
  /** False when no derived tile exists; gameplay must never use this status. */
  readonly visible: boolean;
  /** True while an edit is awaiting a matching rebuild. */
  readonly conservative: boolean;
  readonly invalidated: boolean;
  readonly revision: number;
}

interface InvalidationState {
  readonly identity: LodTileIdentity;
  revision: number;
  invalidated: boolean;
  conservative: boolean;
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`LodTileInvalidation: ${name} must be a safe integer`);
  }
}

function validateEdit(edit: LodEditCoordinates): Readonly<LodEditCoordinates> {
  if (!edit || typeof edit !== 'object') {
    throw new TypeError('LodTileInvalidation: edit must be an object');
  }
  assertSafeInteger(edit.worldX, 'worldX');
  assertSafeInteger(edit.worldY, 'worldY');
  assertSafeInteger(edit.worldZ, 'worldZ');
  // Validate dimension/seed/version once without reading canonical state.
  validateLodTileIdentity({
    dimensionId: edit.dimensionId,
    seed: edit.seed,
    generationVersion: edit.generationVersion,
    lod: 1,
    tileX: 0,
    tileZ: 0,
  });
  return Object.freeze({ ...edit });
}

function tileIdentityForEdit(edit: LodEditCoordinates, lod: LodLevel): LodTileIdentity {
  const span = lodTileBlockSpan(lod);
  return validateLodTileIdentity({
    dimensionId: edit.dimensionId,
    seed: edit.seed,
    generationVersion: edit.generationVersion,
    lod,
    tileX: Math.floor(edit.worldX / span),
    tileZ: Math.floor(edit.worldZ / span),
  });
}

/**
 * Coordinates presentation-only LOD invalidation. It deliberately accepts
 * canonical edit coordinates rather than a world/storage object: the caller
 * owns canonical writes and gameplay reads remain on the authoritative path.
 */
export class LodTileInvalidationCoordinator {
  private readonly cache: LodTileRenderCache;
  private readonly states = new Map<string, InvalidationState>();
  private nextRevision = 0;

  constructor(cache: LodTileRenderCache) {
    this.cache = cache;
  }

  /** Number of currently invalidated tile states awaiting rebuild. */
  get pendingCount(): number {
    let count = 0;
    for (const state of this.states.values()) if (state.invalidated) count++;
    return count;
  }

  /** Invalidate the affected tile and its bounded LOD1→LOD3 ancestors. */
  invalidateEdit(editInput: LodEditCoordinates): LodInvalidationResult {
    const edit = validateEdit(editInput);
    const invalidated = LOD_INVALIDATION_LEVELS.map((lod) =>
      this.invalidateIdentity(tileIdentityForEdit(edit, lod)),
    );
    return Object.freeze({ edit, invalidated });
  }

  /**
   * Start an explicit derived-tile rebuild. This is useful for initial loads;
   * normal edits should use `invalidateEdit` and its returned tokens.
   */
  beginRebuild(identityInput: LodTileIdentityInput | LodTileIdentity): LodTileRebuildToken {
    return this.invalidateIdentity(validateLodTileIdentity(identityInput));
  }

  /** Current conservative/visible status for one derived tile. */
  visibility(identityInput: LodTileIdentityInput | LodTileIdentity): LodTileVisibility {
    const identity = validateLodTileIdentity(identityInput);
    const key = lodTileKey(identity);
    const state = this.states.get(key);
    const hasResource = this.cache.has(key);
    return {
      key,
      hasResource,
      visible: hasResource,
      conservative: state?.conservative ?? false,
      invalidated: state?.invalidated ?? false,
      revision: state?.revision ?? 0,
    };
  }

  /** Return only currently invalidated keys in deterministic key order. */
  invalidatedKeys(): readonly string[] {
    return [...this.states]
      .filter(([, state]) => state.invalidated)
      .map(([key]) => key)
      .sort();
  }

  /**
   * Commit a rebuilt derived resource only when its token is current. A stale
   * result is disposed and cannot replace a conservative previous resource.
   */
  commitRebuild(token: LodTileRebuildToken, resource: LodTileRenderResource): boolean {
    const state = this.states.get(token.key);
    if (!this.isCurrent(token, state) || resource.key !== token.key) {
      resource.dispose();
      return false;
    }
    const admitted = this.cache.set(resource);
    if (!admitted) {
      // Cache admission failure retains the previous resource and conservative state.
      return false;
    }
    this.states.delete(token.key);
    return true;
  }

  /** Keep the old resource conservative after a failed rebuild. */
  failRebuild(token: LodTileRebuildToken): boolean {
    const state = this.states.get(token.key);
    return this.isCurrent(token, state);
  }

  private invalidateIdentity(identity: LodTileIdentity): LodTileRebuildToken {
    const key = lodTileKey(identity);
    const revision = ++this.nextRevision;
    const previous = this.states.get(key);
    const state: InvalidationState = previous ?? {
      identity,
      revision,
      invalidated: true,
      conservative: true,
    };
    state.revision = revision;
    state.invalidated = true;
    state.conservative = true;
    this.states.set(key, state);
    return Object.freeze({ key, identity, revision });
  }

  private isCurrent(token: LodTileRebuildToken, state: InvalidationState | undefined): boolean {
    return (
      state !== undefined &&
      state.invalidated &&
      state.revision === token.revision &&
      lodTileKey(state.identity) === token.key
    );
  }
}
