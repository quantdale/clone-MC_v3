import { type ResourceId, resourceIdToString, parseResourceId } from './ResourceId';
import { RegistryError } from './Registry';

/** A member of a tag: either a direct resource or a nested same-domain tag. */
export type TagMember =
  | { readonly kind: 'resource'; readonly id: ResourceId }
  | { readonly kind: 'tag'; readonly id: ResourceId };

/** A tag definition: a stable ResourceId plus an ordered list of members. */
export interface TagDefinition {
  readonly id: ResourceId;
  readonly members: readonly TagMember[];
}

/**
 * Typed tag registry bound to one domain.
 *
 * Tags resolve to an immutable set of resource members after validation and
 * finalization. A tag references either direct resource members (validated to
 * exist in the associated value registry) or nested tags from the same tag
 * registry. Finalization detects duplicate definitions, missing references, and
 * cycles, and it is atomic: a failed finalization exposes no partially resolved
 * membership. After finalization, membership queries are constant-time and never
 * re-traverse the definition graph.
 */
export class TagRegistry {
  private readonly domain: string;
  private readonly byId = new Map<string, TagDefinition>();
  /**
   * Resolved membership per tag, populated only after a successful finalize.
   * Stored as string resource ids so membership checks use value (not reference)
   * equality; members are reconstructed to ResourceId on read.
   */
  private resolved: ReadonlyMap<string, ReadonlySet<string>> | null = null;

  constructor(domain: string, definitions: readonly TagDefinition[] = []) {
    this.domain = domain;
    for (const def of definitions) {
      this.add(def);
    }
  }

  /** The domain this registry is bound to. */
  get domainName(): string {
    return this.domain;
  }

  /** Whether the registry has been successfully finalized. */
  get isFinalized(): boolean {
    return this.resolved !== null;
  }

  /** Whether a tag id is registered. */
  has(id: ResourceId): boolean {
    return this.byId.has(resourceIdToString(id));
  }

  /** Strict tag lookup. Throws MISSING_ID when absent. */
  get(id: ResourceId): TagDefinition {
    const def = this.byId.get(resourceIdToString(id));
    if (def === undefined) {
      throw new RegistryError('MISSING_ID', resourceIdToString(id), `unknown tag ${resourceIdToString(id)}`);
    }
    return def;
  }

  /** All registered tag ids in registration order. */
  ids(): readonly ResourceId[] {
    return [...this.byId.values()].map((def) => def.id);
  }

  /** Number of registered tags. */
  get size(): number {
    return this.byId.size;
  }

  private add(def: TagDefinition): void {
    const key = resourceIdToString(def.id);
    if (this.byId.has(key)) {
      throw new RegistryError('DUPLICATE_ID', key, `duplicate tag ${key}`);
    }
    this.byId.set(key, def);
  }

  /**
   * Freeze and resolve all tags.
   *
   * `memberExists` validates that each direct resource member exists in the
   * associated value registry. Resolves nested tags transitively, deduplicates
   * members, and rejects missing references and cycles. Idempotent once finalized;
   * a failed attempt leaves the registry unfinalized and exposes nothing.
   */
  finalize(memberExists: (id: ResourceId) => boolean): void {
    if (this.resolved !== null) {
      return;
    }

    const resolvedSet = new Map<string, ReadonlySet<string>>();
    const visiting = new Set<string>();

    const resolve = (def: TagDefinition): ReadonlySet<string> => {
      const key = resourceIdToString(def.id);
      const cached = resolvedSet.get(key);
      if (cached !== undefined) {
        return cached;
      }
      if (visiting.has(key)) {
        throw new RegistryError('CYCLE', key, `cycle detected at tag ${key}`);
      }
      visiting.add(key);

      const set = new Set<string>();
      for (const member of def.members) {
        if (member.kind === 'resource') {
          if (!memberExists(member.id)) {
            throw new RegistryError(
              'MISSING_ID',
              resourceIdToString(member.id),
              `tag ${key} references missing resource ${resourceIdToString(member.id)}`,
            );
          }
          set.add(resourceIdToString(member.id));
        } else {
          const nestedKey = resourceIdToString(member.id);
          const nested = this.byId.get(nestedKey);
          if (nested === undefined) {
            throw new RegistryError(
              'MISSING_ID',
              nestedKey,
              `tag ${key} references missing tag ${nestedKey}`,
            );
          }
          for (const resource of resolve(nested)) {
            set.add(resource);
          }
        }
      }

      visiting.delete(key);
      // Freeze the resolved set so finalized membership cannot mutate.
      const frozen = Object.freeze(set);
      resolvedSet.set(key, frozen);
      return frozen;
    };

    for (const def of this.byId.values()) {
      resolve(def);
    }
    this.resolved = resolvedSet;
  }

  /**
   * Resolved resource members of a tag in deterministic insertion order.
   * Throws NOT_FINALIZED before finalization and MISSING_ID for unknown tags.
   */
  membersOf(id: ResourceId): readonly ResourceId[] {
    const set = this.requireResolved(id);
    return Object.freeze([...set].map((value) => parseResourceId(value)));
  }

  /** Number of resolved members of a tag. */
  memberCount(id: ResourceId): number {
    return this.requireResolved(id).size;
  }

  /** Whether the finalized tag contains the given resource member. */
  contains(id: ResourceId, member: ResourceId): boolean {
    const set = this.requireResolved(id);
    return set.has(resourceIdToString(member));
  }

  private requireResolved(id: ResourceId): ReadonlySet<string> {
    if (this.resolved === null) {
      throw new RegistryError('NOT_FINALIZED', resourceIdToString(id), 'tag registry not finalized');
    }
    const set = this.resolved.get(resourceIdToString(id));
    if (set === undefined) {
      throw new RegistryError('MISSING_ID', resourceIdToString(id), `unknown tag ${resourceIdToString(id)}`);
    }
    return set;
  }
}
