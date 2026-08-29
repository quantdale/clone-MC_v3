/** Canonical section versions captured when a live mesh/light-dependent job is submitted. */
export interface SectionVersionSnapshotEntry {
  readonly sectionX: number;
  readonly sectionY: number;
  readonly sectionZ: number;
  readonly meshVersion: number;
  readonly lightVersion: number;
  /** True when this section belongs to the submitted projection; false for a face neighbor. */
  readonly target: boolean;
}

export interface SectionVersionSnapshot {
  readonly sections: readonly SectionVersionSnapshotEntry[];
}

export interface SectionVersionLookup {
  meshVersionAt(sectionX: number, sectionY: number, sectionZ: number): number;
  lightVersionAt(sectionX: number, sectionY: number, sectionZ: number): number;
}

/**
 * Capture the canonical versions needed to validate a projection mesh. A legacy 64-block
 * projection contains `sectionsPerChunk` canonical sections; each target section includes its
 * six face-sharing neighbors because AO/face culling/light sampling can cross those boundaries.
 * Missing sections intentionally report version 0 without materializing storage.
 */
export function captureSectionVersionSnapshot(
  chunkX: number,
  chunkY: number,
  chunkZ: number,
  sectionsPerChunk: number,
  lookup: SectionVersionLookup,
): SectionVersionSnapshot {
  if (![chunkX, chunkY, chunkZ, sectionsPerChunk].every(Number.isInteger) || sectionsPerChunk <= 0) {
    throw new RangeError('captureSectionVersionSnapshot: invalid chunk or section coordinates');
  }

  const entries = new Map<string, SectionVersionSnapshotEntry>();
  const add = (sectionX: number, sectionY: number, sectionZ: number, target: boolean): void => {
    const key = `${sectionX},${sectionY},${sectionZ}`;
    const previous = entries.get(key);
    if (previous !== undefined) {
      if (target && !previous.target) entries.set(key, { ...previous, target: true });
      return;
    }
    entries.set(key, {
      sectionX,
      sectionY,
      sectionZ,
      meshVersion: lookup.meshVersionAt(sectionX, sectionY, sectionZ),
      lightVersion: lookup.lightVersionAt(sectionX, sectionY, sectionZ),
      target,
    });
  };

  const baseSectionY = chunkY * sectionsPerChunk;
  for (let offset = 0; offset < sectionsPerChunk; offset++) {
    const sectionY = baseSectionY + offset;
    add(chunkX, sectionY, chunkZ, true);
    add(chunkX - 1, sectionY, chunkZ, false);
    add(chunkX + 1, sectionY, chunkZ, false);
    add(chunkX, sectionY - 1, chunkZ, false);
    add(chunkX, sectionY + 1, chunkZ, false);
    add(chunkX, sectionY, chunkZ - 1, false);
    add(chunkX, sectionY, chunkZ + 1, false);
  }

  return { sections: [...entries.values()] };
}

/** Find a captured entry without materializing canonical storage. */
export function findSectionVersionSnapshot(
  snapshot: SectionVersionSnapshot,
  sectionX: number,
  sectionY: number,
  sectionZ: number,
): SectionVersionSnapshotEntry | undefined {
  return snapshot.sections.find((entry) =>
    entry.sectionX === sectionX && entry.sectionY === sectionY && entry.sectionZ === sectionZ,
  );
}

/** Compare structured-cloned snapshots by canonical coordinate and every captured version field. */
export function sectionVersionSnapshotsEqual(
  left: SectionVersionSnapshot | undefined,
  right: SectionVersionSnapshot | undefined,
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined || left.sections.length !== right.sections.length) {
    return false;
  }
  const rightByKey = new Map(
    right.sections.map((entry) => [`${entry.sectionX},${entry.sectionY},${entry.sectionZ}`, entry]),
  );
  return left.sections.every((entry) => {
    const other = rightByKey.get(`${entry.sectionX},${entry.sectionY},${entry.sectionZ}`);
    return other !== undefined &&
      other.meshVersion === entry.meshVersion &&
      other.lightVersion === entry.lightVersion &&
      other.target === entry.target;
  });
}

/** Check every captured target/neighbor version against current canonical storage without allocating. */
export function isSectionVersionSnapshotCurrent(
  snapshot: SectionVersionSnapshot,
  lookup: SectionVersionLookup,
): boolean {
  return snapshot.sections.every((entry) =>
    lookup.meshVersionAt(entry.sectionX, entry.sectionY, entry.sectionZ) === entry.meshVersion &&
    lookup.lightVersionAt(entry.sectionX, entry.sectionY, entry.sectionZ) === entry.lightVersion,
  );
}

/** Validate structured-cloned snapshot metadata without materializing world storage. */
export function validateSectionVersionSnapshot(input: unknown): SectionVersionSnapshot {
  if (typeof input !== 'object' || input === null) {
    throw new Error('SectionVersionSnapshot: expected an object');
  }
  const raw = input as { sections?: unknown };
  if (!Array.isArray(raw.sections)) {
    throw new Error('SectionVersionSnapshot: sections must be an array');
  }
  const sections: SectionVersionSnapshotEntry[] = [];
  const seen = new Set<string>();
  for (const value of raw.sections) {
    if (typeof value !== 'object' || value === null) {
      throw new Error('SectionVersionSnapshot: entry must be an object');
    }
    const entry = value as Record<string, unknown>;
    const sectionX = entry.sectionX;
    const sectionY = entry.sectionY;
    const sectionZ = entry.sectionZ;
    const meshVersion = entry.meshVersion;
    const lightVersion = entry.lightVersion;
    if (
      typeof sectionX !== 'number' ||
      typeof sectionY !== 'number' ||
      typeof sectionZ !== 'number' ||
      typeof meshVersion !== 'number' ||
      !Number.isInteger(sectionX) ||
      !Number.isInteger(sectionY) ||
      !Number.isInteger(sectionZ) ||
      !Number.isInteger(meshVersion) ||
      meshVersion < 0 ||
      typeof lightVersion !== 'number' ||
      !Number.isInteger(lightVersion) ||
      lightVersion < 0 ||
      typeof entry.target !== 'boolean'
    ) {
      throw new Error('SectionVersionSnapshot: invalid section entry');
    }
    const key = `${entry.sectionX},${entry.sectionY},${entry.sectionZ}`;
    if (seen.has(key)) throw new Error('SectionVersionSnapshot: duplicate section entry');
    seen.add(key);
    sections.push({
      sectionX: entry.sectionX as number,
      sectionY: entry.sectionY as number,
      sectionZ: entry.sectionZ as number,
      meshVersion: entry.meshVersion as number,
      lightVersion: entry.lightVersion as number,
      target: entry.target as boolean,
    });
  }
  return { sections };
}
