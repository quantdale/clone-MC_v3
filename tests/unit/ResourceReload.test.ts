import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import { createResourcePackManifest, type ResourceAsset } from '../../src/data/ResourcePackManifest';
import { createDataPackManifest, type DataPackEntry } from '../../src/data/DataPackManifest';
import {
  abortReload,
  commitReload,
  createInitialResourceState,
  proposeReload,
} from '../../src/data/ResourceReload';

const ASSET: ResourceAsset = {
  id: createResourceId('minecraft', 'block/stone'),
  type: 'texture',
  path: 'textures/block/stone.png',
};
const RESOURCES = createResourcePackManifest('Core', 'The internal pack', [ASSET]);

const ENTRY: DataPackEntry = {
  id: createResourceId('minecraft', 'planks'),
  kind: 'recipe',
  path: 'recipe/planks.json',
};
const DATA = createDataPackManifest('Core', 'The internal pack', [ENTRY]);

const ALL_PRESENT = () => true;
const NONE_PRESENT = () => false;

describe('initial', () => {
  it('starts at version 0 with no manifests', () => {
    expect(createInitialResourceState()).toEqual({ version: 0, resources: null, data: null });
  });
});

describe('proposals', () => {
  const current = createInitialResourceState();

  it('accepts resources-only, data-only, and both', () => {
    const resourcesOnly = proposeReload(current, { resources: RESOURCES, hasEntry: ALL_PRESENT });
    expect(resourcesOnly).toEqual({ ok: true, proposal: { resources: RESOURCES, data: null } });

    const dataOnly = proposeReload(current, { data: DATA, hasEntry: ALL_PRESENT });
    expect(dataOnly).toEqual({ ok: true, proposal: { resources: null, data: DATA } });

    const both = proposeReload(current, { resources: RESOURCES, data: DATA, hasEntry: ALL_PRESENT });
    expect(both).toEqual({ ok: true, proposal: { resources: RESOURCES, data: DATA } });
  });

  it('rejects an empty input', () => {
    expect(proposeReload(current, { hasEntry: ALL_PRESENT })).toEqual({
      ok: false,
      reason: 'no resources or data provided',
    });
  });

  it('rejects unresolved data entries with the exact ids in order', () => {
    const bad = createDataPackManifest('Core', 'x', [
      ENTRY,
      { ...ENTRY, id: createResourceId('minecraft', 'glass'), kind: 'loot_table' },
    ]);
    const result = proposeReload(current, { data: bad, hasEntry: (kind, id) => kind === 'recipe' && id.path === 'planks' });
    expect(result).toEqual({
      ok: false,
      reason: 'unresolved data entries: loot_table minecraft:glass',
    });
  });

  it('rejects bad format versions defensively', () => {
    const badResources = { ...RESOURCES, formatVersion: 0 } as unknown as typeof RESOURCES;
    expect(proposeReload(current, { resources: badResources, hasEntry: ALL_PRESENT })).toEqual({
      ok: false,
      reason: 'invalid resource pack manifest',
    });
    const badData = { ...DATA, formatVersion: 0 } as unknown as typeof DATA;
    expect(proposeReload(current, { data: badData, hasEntry: ALL_PRESENT })).toEqual({
      ok: false,
      reason: 'invalid data pack manifest',
    });
  });
});

describe('transaction', () => {
  it('commits with a bumped version and aborts as identity', () => {
    const current = createInitialResourceState();
    const result = proposeReload(current, { resources: RESOURCES, hasEntry: ALL_PRESENT });
    if (!result.ok) throw new Error('unreachable');

    const committed = commitReload(current, result);
    expect(committed).toEqual({ version: 1, resources: RESOURCES, data: null });
    expect(committed).not.toBe(current);

    const again = proposeReload(committed, { data: DATA, hasEntry: ALL_PRESENT });
    if (!again.ok) throw new Error('unreachable');
    expect(commitReload(committed, again).version).toBe(2);

    expect(abortReload(current)).toBe(current);
    expect(abortReload(committed)).toBe(committed);
  });

  it('never mutates inputs', () => {
    const current = createInitialResourceState();
    const before = JSON.stringify(current);
    const result = proposeReload(current, { resources: RESOURCES, data: DATA, hasEntry: NONE_PRESENT });
    expect(result.ok).toBe(false);
    commitReload(current, { ok: true, proposal: { resources: RESOURCES, data: null } });
    expect(JSON.stringify(current)).toBe(before);
  });
});
