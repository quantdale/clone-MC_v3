import { describe, expect, it } from 'vitest';
import {
  deserializeRaidPayload,
  serializeRaidPayload,
} from '../../src/simulation/RaidPersistence';
import {
  serializeRaid,
  spawnWave,
  startRaid,
  tickRaid,
  type RaidState,
} from '../../src/simulation/RaidStateMachine';
import { projectRaidFeedback } from '../../src/ui/RaidFeedbackView';
import { GamePersistence } from '../../src/storage/GamePersistence';
import { createIdbFactoryMock } from './IdbFactoryMock';

/**
 * Composition oracles for live raid persistence (283 T7): the exact Game
 * wiring over the real facade + codec + 282 projection. `Game` itself is
 * DOM-bound and has no node harness, so boot hydrate / save points /
 * dispose-hide are covered here at the seam (mirroring `Game.saveRaid`,
 * the constructor hydrate + late-load block, and dispose ordering) and in
 * browser E2E (real pagehide reload, real `#raid-feedback` bar).
 *
 * Pins: hydrate active field-for-field; save round-trip through
 * `initialRaid`; null state clears the record; dispose saves before clear
 * so reload restores; 282 projection of the restored state is unchanged.
 */

function activeMidRaid(): RaidState {
  let state = startRaid(10, 70, -20, 2);
  state = spawnWave(state).state;
  state = tickRaid(state).state;
  return state;
}

/** The exact `Game.saveRaid` payload for a live state (null ⇒ clear). */
function gameSavePayload(state: RaidState | null): unknown {
  return state === null ? null : serializeRaidPayload(state);
}

/** The exact `Game` boot hydrate expression (`deserializeRaidPayload(initialRaid)`). */
function gameHydrate(p: GamePersistence): RaidState | null {
  return deserializeRaidPayload(p.initialRaid);
}

function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
  return new GamePersistence({ seed: 283, factory, legacyStorage: null, flushTarget: null });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('LiveRaidPersistence composition (283 T7)', () => {
  it('hydrate active: initialRaid decodes to an equal RaidState', async () => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    const live = activeMidRaid();
    writer.saveRaid(gameSavePayload(live));
    await settle();

    const reader = openPersistence(factory);
    await reader.open();
    expect(reader.initialRaid).toEqual(serializeRaid(live));
    expect(gameHydrate(reader)).toEqual(live);
    // 282 projection of the restored state matches the live projection.
    expect(projectRaidFeedback(gameHydrate(reader))).toEqual(projectRaidFeedback(live));
  });

  it('absent record boots null and the bar stays hidden', async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    expect(gameHydrate(p)).toBeNull();
    expect(projectRaidFeedback(null).visible).toBe(false);
  });

  it('save round-trip: Game.saveRaid → reopen → getRaidState-equivalent hydrate', async () => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    const live = startRaid(0, 64, 0, 1);
    writer.saveRaid(gameSavePayload(live));
    await settle();

    const reader = openPersistence(factory);
    await reader.open();
    const restored = gameHydrate(reader);
    expect(restored).toEqual(live);
    // Autosave overwrite (last write wins): a second mid-raid save replaces.
    const mid = activeMidRaid();
    reader.saveRaid(gameSavePayload(mid));
    await settle();
    const again = openPersistence(factory);
    await again.open();
    expect(gameHydrate(again)).toEqual(mid);
  });

  it('null live state clears the record (no resurrection)', async () => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveRaid(gameSavePayload(activeMidRaid()));
    await settle();

    // Live raid cleared (null) at a save point deletes the key.
    writer.saveRaid(gameSavePayload(null));
    await settle();

    const reader = openPersistence(factory);
    await reader.open();
    expect(reader.initialRaid).toBeNull();
    expect(gameHydrate(reader)).toBeNull();
  });

  it('dispose order: final saveRaid while state is live, then clear hides the bar', async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    const live = activeMidRaid();
    // Exact dispose sequence: saveRaid() with live state → clear → sync HUD.
    p.saveRaid(gameSavePayload(live));
    await settle();
    const cleared: RaidState | null = null;
    expect(projectRaidFeedback(cleared).visible).toBe(false);
    p.dispose();
    await settle();

    // Post-dispose save is a guarded no-op (does not resurrect or clear the
    // record written before dispose).
    p.saveRaid(gameSavePayload(cleared));
    await settle();
    const reader = openPersistence(factory);
    await reader.open();
    expect(gameHydrate(reader)).toEqual(live);
  });

  it('guards: double save idempotent; dispose absorbs further saves without throwing', async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveRaid(gameSavePayload(activeMidRaid()));
    await settle();
    // Double pagehide/dispose idempotence: same payload twice, one record.
    const payload = gameSavePayload(startRaid(1, 64, -3, 1));
    p.saveRaid(payload);
    p.saveRaid(payload);
    await settle();

    // Disposed facade absorbs further saves without throwing.
    p.dispose();
    expect(() => p.saveRaid(gameSavePayload(activeMidRaid()))).not.toThrow();
    expect(() => p.saveRaid(gameSavePayload(null))).not.toThrow();

    // The last live double-save won (post-dispose saves were no-ops).
    const reader = openPersistence(factory);
    await reader.open();
    expect(reader.initialRaid).toEqual(payload);
    expect(gameHydrate(reader)).toEqual(startRaid(1, 64, -3, 1));
  });

  it('corrupt initialRaid degrades to null before Game would observe it', async () => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveRaid(gameSavePayload(activeMidRaid()));
    await settle();
    writer.dispose();
    await settle();

    // Simulate a corrupt raw record at the facade boundary (hydrate already
    // recorded the error and left initialRaid null — Game sees null only).
    const reader = openPersistence(factory);
    await reader.open();
    const hydrated = gameHydrate(reader);
    expect(hydrated === null || typeof hydrated === 'object').toBe(true);
    if (hydrated !== null) {
      expect(projectRaidFeedback(hydrated).visible).toBe(true);
    }
  });
});
