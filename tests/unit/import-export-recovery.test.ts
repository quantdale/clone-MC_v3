import { describe, expect, it } from 'vitest';
import { SaveRecoveryMatrix } from '../../src/storage/SaveRecoveryMatrix';
import { WorldArchiver } from '../../src/storage/WorldArchiver';
import { makeSaveRecoveryFixture, makeCoordinator } from './saveRecoveryFixture';

function makeMatrix(): SaveRecoveryMatrix {
  return new SaveRecoveryMatrix({
    makeRepositories: () => makeSaveRecoveryFixture(),
    makeCoordinator,
  });
}

async function populate(fixture: ReturnType<typeof makeSaveRecoveryFixture>, worldId: string): Promise<void> {
  await fixture.openAll();
  await fixture.deps.metadata.putMetadata({ schemaVersion: 1, worldId, seed: 0, dimensionId: 'minecraft:overworld', minY: -64, height: 384, createdAt: 1, updatedAt: 1 });
  await fixture.deps.chunkSections.putColumn(worldId, { version: 1, chunkX: 1, chunkZ: 2, sectionCount: 1, minSectionY: 0, sections: { 0: { version: 1, capacity: 4096, bitsPerEntry: 4, palette: [0, 1], storage: [0] } } });
  await fixture.deps.blockEntities.putChunkEntities(worldId, 1, 2, [{ schemaVersion: 1, typeKey: 'minecraft:chest', x: 16, y: 64, z: 32, data: { items: [] } }]);
  await fixture.deps.entities.putChunkEntities(worldId, 1, 2, [{ schemaVersion: 1, typeKey: 'minecraft:zombie', x: 16, y: 65, z: 32, data: { health: 20 } }]);
  await fixture.deps.playerStates.putPlayerState({ key: worldId, worldId, seed: 0, position: [1.5, 64, 2.5], yaw: 45, pitch: -30, inventory: { slots: [] }, survival: { hunger: 20 }, experience: { version: 1, level: 0, xp: 0 } });
}

describe('import-export-recovery', () => {
  it('export-complete: export contains every store and passes validation', async () => {
    const results = await makeMatrix().runImportExport();
    const r = results.find((x) => x.scenarioId === 'import-export.export-complete')!;
    expect(r.outcome).toBe('pass');
    expect(r.detail).toContain('columns=2');
  });

  it('round-trip-stable: export -> import -> export is stable apart from timestamps', async () => {
    const results = await makeMatrix().runImportExport();
    const r = results.find((x) => x.scenarioId === 'import-export.round-trip-stable')!;
    expect(r.outcome).toBe('pass');
  });

  it('atomic-rejection: malformed archives reject before any store write', async () => {
    const results = await makeMatrix().runImportExport();
    const r = results.find((x) => x.scenarioId === 'import-export.atomic-rejection')!;
    expect(r.outcome).toBe('pass');
  });

  it('worldid-normalization: a mismatched playerState.worldId is normalized on import', async () => {
    const results = await makeMatrix().runImportExport();
    const r = results.find((x) => x.scenarioId === 'import-export.worldid-normalization')!;
    expect(r.outcome).toBe('pass');
  });

  it('worldid-normalization is exercised directly', async () => {
    const source = makeSaveRecoveryFixture();
    await populate(source, 'world-7');
    const exported = await new WorldArchiver(source.deps).exportWorld('world-7');
    const tampered = { ...exported, playerState: { ...exported.playerState!, key: 'other', worldId: 'other' } };
    const target = makeSaveRecoveryFixture();
    await target.openAll();
    await new WorldArchiver(target.deps).importWorld(tampered);
    expect(await target.deps.playerStates.getPlayerState('world-7')).not.toBeNull();
    expect(await target.deps.playerStates.getPlayerState('other')).toBeNull();
  });

  it('export-read-only: two exports leave all stores unchanged', async () => {
    const results = await makeMatrix().runImportExport();
    const r = results.find((x) => x.scenarioId === 'import-export.export-read-only')!;
    expect(r.outcome).toBe('pass');
  });

  it('all five import-export scenarios are present and pass', async () => {
    const results = await makeMatrix().runImportExport();
    const ids = results.map((x) => x.scenarioId);
    expect(ids).toEqual([
      'import-export.export-complete',
      'import-export.round-trip-stable',
      'import-export.atomic-rejection',
      'import-export.worldid-normalization',
      'import-export.export-read-only',
    ]);
    for (const r of results) expect(r.outcome).toBe('pass');
  });
});
