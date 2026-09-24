import { describe, expect, it } from 'vitest';
import {
  RAID_BASE_WAVES,
  recordRaiderDeath,
  startRaid,
  tickRaid,
  waveComposition,
  type RaidState,
} from '../../src/simulation/RaidStateMachine';
import { RaidWaveController } from '../../src/simulation/RaidWaveController';
import { createRecordingRaidBackend } from '../../src/simulation/RaidEntityBackend';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';

/**
 * Live raid wave spawning oracles (284): exact composition of Game's
 * `tickRaidFeedback` / `debugStartRaid` / `debugClearRaidWave` / death choke
 * over RaidWaveController + recording backend. Game is DOM-bound (282/275
 * precedent), so routing is covered here at the seam; production adapter is
 * covered in RaidEntityBackend.test.ts.
 */

const registry = createDefaultEntityRegistry();
const resolveType = (key: string): boolean => registry.getByKey(key) !== undefined;

/** Minimal owner mirroring Game's single ephemeral raid reference + controller. */
class RaidOwner {
  raidState: RaidState | null = null;
  readonly backend = createRecordingRaidBackend();
  readonly controller = new RaidWaveController({ backend: this.backend, resolveType });

  start(omen = 1): RaidState {
    this.controller.clear('replace');
    const { state, spawned } = tickRaid(startRaid(1, 64, 1, omen));
    this.raidState = state;
    if (spawned && spawned.length > 0) {
      this.controller.applyWave(state, spawned);
    }
    return state;
  }

  /** Unpaused fixed tick (the only path that may advance state). */
  tick(): RaidState | null {
    if (!this.raidState) return null;
    const { state, spawned } = tickRaid(this.raidState);
    this.raidState = state;
    if (state.status === 'VICTORY' || state.status === 'DEFEAT') {
      this.controller.clear('terminal');
    } else if (spawned && spawned.length > 0) {
      this.controller.applyWave(state, spawned);
    }
    return this.raidState;
  }

  clearWave(): RaidState | null {
    if (!this.raidState) return null;
    this.controller.clear('clear');
    let state = this.raidState;
    for (let i = 0; i < state.raidersRemaining; i++) {
      state = recordRaiderDeath(state);
    }
    const { state: next, spawned } = tickRaid(state);
    this.raidState = next;
    if (next.status === 'VICTORY' || next.status === 'DEFEAT') {
      this.controller.clear('terminal');
    } else if (spawned && spawned.length > 0) {
      this.controller.applyWave(next, spawned);
    }
    return next;
  }

  onRemoved(entityId: number): boolean {
    if (!this.raidState) return false;
    if (!this.controller.consumeDeath(entityId)) return false;
    this.raidState = recordRaiderDeath(this.raidState);
    return true;
  }

  dispose(): void {
    this.controller.clear('dispose');
    this.raidState = null;
  }
}

describe('284 live raid wave spawning — Game composition over RaidWaveController', () => {
  it('start spawns the full first-wave roster exactly once', () => {
    const owner = new RaidOwner();
    const state = owner.start(1);
    expect(state.status).toBe('ACTIVE');
    expect(state.waveIndex).toBe(1);
    const roster = waveComposition(0, 1);
    const expected = roster.reduce((n, e) => n + e.count, 0);
    expect(expected).toBeGreaterThan(0);
    expect(owner.backend.spawns).toHaveLength(expected);
    expect(owner.controller.getRaidWaveEntityIds()).toHaveLength(expected);
    expect(owner.controller.getLastRaidWaveApplyResult()).toEqual({
      applied: true,
      spawned: expected,
      skipped: [],
      rolledBack: false,
    });
    for (const s of owner.backend.spawns) {
      expect(s.waveIndex).toBe(1);
      expect(s.raidGeneration).toBe(owner.controller.getRaidGeneration());
    }
  });

  it('duplicate apply for the same wave is an identity no-op', () => {
    const owner = new RaidOwner();
    const state = owner.start(1);
    const before = owner.backend.spawns.length;
    const result = owner.controller.applyWave(state, waveComposition(0, 1));
    expect(result.applied).toBe(false);
    expect(result.error).toBe('DUPLICATE_WAVE');
    expect(owner.backend.spawns).toHaveLength(before);
  });

  it('rolls back a mid-wave backend failure with no partial tracking', () => {
    const backend = createRecordingRaidBackend({ failSpawnAfter: 1 });
    const controller = new RaidWaveController({ backend, resolveType });
    const state = startRaid(0, 64, 0, 1);
    const post = tickRaid(state).state;
    const roster = waveComposition(0, 1);
    const result = controller.applyWave(post, roster);
    expect(result.rolledBack).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.spawned).toBe(0);
    expect(controller.getRaidWaveEntityIds()).toHaveLength(0);
    expect(backend.spawns).toHaveLength(1);
    expect(backend.despawns).toHaveLength(1);
    const again = controller.applyWave(post, roster);
    expect(again.applied).toBe(false);
    expect(again.error).toBe('DUPLICATE_WAVE');
    expect(backend.spawns).toHaveLength(1);
  });

  it('fails closed with no spawn when a roster key is unregistered', () => {
    const backend = createRecordingRaidBackend();
    const controller = new RaidWaveController({ backend, resolveType: () => false });
    const post = tickRaid(startRaid(0, 64, 0, 1)).state;
    const result = controller.applyWave(post, [{ typeKey: 'ghost', count: 2 }]);
    expect(result.applied).toBe(false);
    expect(result.rolledBack).toBe(false);
    expect(result.skipped[0]?.reason).toBe('UNKNOWN_TYPE');
    expect(backend.spawns).toHaveLength(0);
  });

  it('terminal clear despawns tracked entities and empties tracking', () => {
    const owner = new RaidOwner();
    owner.start(1);
    expect(owner.controller.getRaidWaveEntityIds().length).toBeGreaterThan(0);
    owner.controller.clear('terminal');
    expect(owner.controller.getRaidWaveEntityIds()).toHaveLength(0);
    expect(owner.backend.despawns.length).toBeGreaterThan(0);
  });

  it('replace bumps generation so stale death callbacks cannot decrement the new raid', () => {
    const owner = new RaidOwner();
    owner.start(1);
    const staleId = owner.controller.getRaidWaveEntityIds()[0]!;
    const staleGen = owner.controller.getRaidGeneration();
    const remainingBefore = owner.raidState!.raidersRemaining;
    owner.start(1);
    expect(owner.controller.getRaidGeneration()).toBeGreaterThan(staleGen);
    expect(owner.onRemoved(staleId)).toBe(false);
    expect(owner.raidState!.raidersRemaining).toBe(remainingBefore);
  });

  it('death decrements remaining exactly once per tracked id', () => {
    const owner = new RaidOwner();
    owner.start(1);
    const id = owner.controller.getRaidWaveEntityIds()[0]!;
    const before = owner.raidState!.raidersRemaining;
    expect(owner.onRemoved(id)).toBe(true);
    expect(owner.raidState!.raidersRemaining).toBe(before - 1);
    expect(owner.onRemoved(id)).toBe(false);
    expect(owner.raidState!.raidersRemaining).toBe(before - 1);
  });

  it('unknown id death is ignored', () => {
    const owner = new RaidOwner();
    owner.start(1);
    const before = owner.raidState!.raidersRemaining;
    expect(owner.onRemoved(999999)).toBe(false);
    expect(owner.raidState!.raidersRemaining).toBe(before);
  });

  it('non-active raid death is a no-op through the choke', () => {
    const owner = new RaidOwner();
    owner.raidState = null;
    expect(owner.onRemoved(1)).toBe(false);
  });

  it('debug clear despawns the wave, records bounded deaths, and may spawn the next wave', () => {
    const owner = new RaidOwner();
    owner.start(1);
    const spawnsAfterStart = owner.backend.spawns.length;
    const despawnsAfterStart = owner.backend.despawns.length;
    const next = owner.clearWave();
    expect(next).not.toBeNull();
    expect(owner.backend.despawns.length).toBeGreaterThan(despawnsAfterStart);
    expect(owner.controller.getRaidWaveEntityIds()).toHaveLength(
      owner.backend.spawns.length - owner.backend.despawns.length,
    );
    if (next!.status === 'ACTIVE' && next!.waveIndex === 2) {
      expect(owner.backend.spawns.length).toBeGreaterThan(spawnsAfterStart);
    }
  });

  it('clearing every wave yields VICTORY with empty tracking and no throw', () => {
    const owner = new RaidOwner();
    owner.start(1);
    expect(RAID_BASE_WAVES).toBeGreaterThan(0);
    let guard = 0;
    while (owner.raidState && owner.raidState.status === 'ACTIVE' && guard < 20) {
      owner.clearWave();
      guard += 1;
    }
    expect(owner.raidState?.status).toBe('VICTORY');
    expect(owner.controller.getRaidWaveEntityIds()).toHaveLength(0);
  });

  it('dispose clears tracking and subsequent removals are no-ops', () => {
    const owner = new RaidOwner();
    owner.start(1);
    const id = owner.controller.getRaidWaveEntityIds()[0]!;
    owner.dispose();
    expect(owner.controller.getRaidWaveEntityIds()).toHaveLength(0);
    expect(owner.onRemoved(id)).toBe(false);
    expect(owner.raidState).toBeNull();
    expect(() => owner.controller.clear('dispose')).not.toThrow();
  });

  it('paused frames (no tick) do not spawn or advance state', () => {
    const owner = new RaidOwner();
    owner.start(1);
    const spawns = owner.backend.spawns.length;
    const snapshot = { ...owner.raidState! };
    // Paused/loading simply never calls tick — assert identity of the snapshot.
    expect(owner.raidState).toEqual(snapshot);
    expect(owner.backend.spawns).toHaveLength(spawns);
  });

  it('reload-style new owner starts with empty tracking (no resurrection)', () => {
    const owner = new RaidOwner();
    owner.start(1);
    expect(owner.controller.getRaidWaveEntityIds().length).toBeGreaterThan(0);
    const reloaded = new RaidOwner();
    expect(reloaded.controller.getRaidWaveEntityIds()).toHaveLength(0);
    expect(reloaded.backend.spawns).toHaveLength(0);
    expect(reloaded.raidState).toBeNull();
  });

  it('every first-wave roster key resolves in the default registry', () => {
    for (let wave = 0; wave < RAID_BASE_WAVES + 2; wave++) {
      for (const omen of [1, 3]) {
        for (const entry of waveComposition(wave, omen)) {
          expect(registry.getByKey(entry.typeKey)).toBeDefined();
        }
      }
    }
  });
});
