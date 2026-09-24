import { describe, expect, it } from 'vitest';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import { EntityManager } from '../../src/simulation/EntityManager';
import { createEntityManagerRaidBackend } from '../../src/simulation/RaidEntityBackend';
import { RaidWaveController } from '../../src/simulation/RaidWaveController';
import {
  forceRaidDefeat,
  RaiderCombatSystem,
} from '../../src/simulation/RaiderCombatBehavior';
import {
  recordRaiderDeath,
  startRaid,
  tickRaid,
  type RaidState,
} from '../../src/simulation/RaidStateMachine';
import { CollisionResolver, type ShapeWorld } from '../../src/world/CollisionResolver';
import { VoxelShape } from '../../src/world/VoxelShape';

const emptyWorld: ShapeWorld = { getCollisionShape: () => VoxelShape.EMPTY };
const registry = createDefaultEntityRegistry();
const dimension = createResourceId('minecraft', 'overworld');
const resolver = new CollisionResolver();

/**
 * Seam oracle mirroring Game's 284+288 composition: wave controller over a
 * real EntityManager backend + RaiderCombatSystem + exactly-once death choke.
 */
class CombatRaidOwner {
  raidState: RaidState | null = null;
  readonly manager = new EntityManager(registry);
  readonly backend = createEntityManagerRaidBackend({
    manager: this.manager,
    registry,
    dimension,
  });
  readonly controller = new RaidWaveController({
    backend: this.backend,
    resolveType: (k) => registry.getByKey(k) !== undefined,
  });
  readonly combat = new RaiderCombatSystem({ manager: this.manager, registry });
  playerHits = 0;
  lastHit = 0;
  simTick = 0;
  player = { x: 1, y: 64, z: 1 };
  paused = false;

  start(omen = 1): RaidState {
    this.controller.clear('replace');
    this.combat.clear();
    const { state, spawned } = tickRaid(startRaid(0, 64, 0, omen));
    this.raidState = state;
    if (spawned && spawned.length > 0) {
      this.controller.applyWave(state, spawned);
    }
    return state;
  }

  onRemoved(entityId: number): boolean {
    if (!this.raidState) return false;
    if (!this.controller.consumeDeath(entityId)) return false;
    this.raidState = recordRaiderDeath(this.raidState);
    return true;
  }

  tickCombat(playerMelee = false): void {
    if (!this.raidState || this.raidState.status !== 'ACTIVE') return;
    this.simTick++;
    this.combat.tick({
      dt: 0.05,
      simTick: this.simTick,
      paused: this.paused,
      center: {
        x: this.raidState.centerX,
        y: this.raidState.centerY,
        z: this.raidState.centerZ,
      },
      trackedIds: this.controller.getRaidWaveEntityIds(),
      getPlayerTarget: () => (this.paused ? null : this.player),
      world: emptyWorld,
      resolver,
      onPlayerDamaged: (amount) => {
        this.playerHits++;
        this.lastHit = amount;
      },
      onRaiderDied: (id) => {
        this.onRemoved(id);
      },
      playerMeleeRequested: playerMelee,
    });
  }

  killAllTracked(): number {
    let killed = 0;
    for (const id of [...this.controller.getRaidWaveEntityIds()]) {
      const died = this.combat.damageRaider(id, 10_000, (eid) => {
        if (this.onRemoved(eid)) killed++;
      });
      if (died.died) {
        /* counted in callback */
      }
    }
    return killed;
  }

  advanceRaid(): RaidState | null {
    if (!this.raidState) return null;
    const { state, spawned } = tickRaid(this.raidState);
    this.raidState = state;
    if (state.status === 'VICTORY' || state.status === 'DEFEAT') {
      this.controller.clear('terminal');
      this.combat.clear();
    } else if (spawned && spawned.length > 0) {
      this.controller.applyWave(state, spawned);
    }
    return this.raidState;
  }

  playerDeathDefeat(): void {
    if (!this.raidState || this.raidState.status !== 'ACTIVE') return;
    this.raidState = forceRaidDefeat(this.raidState);
    this.controller.clear('terminal');
    this.combat.clear();
  }
}

describe('LiveRaiderCombat seam', () => {
  it('spawns wave entities that can damage the player', () => {
    const owner = new CombatRaidOwner();
    owner.start(1);
    expect(owner.controller.getRaidWaveEntityIds().length).toBeGreaterThan(0);
    // Place player on top of first raider for melee contact
    const id = owner.controller.getRaidWaveEntityIds()[0]!;
    const e = owner.manager.get(id)!;
    owner.player = { x: e.transform.x + 0.5, y: e.transform.y, z: e.transform.z + 0.5 };
    for (let i = 0; i < 30; i++) owner.tickCombat();
    expect(owner.playerHits).toBeGreaterThan(0);
    expect(owner.lastHit).toBeGreaterThan(0);
  });

  it('killing all raiders decrements remaining exactly once toward VICTORY', () => {
    const owner = new CombatRaidOwner();
    owner.start(1);
    const totalWaves = owner.raidState!.totalWaves;
    let guard = 0;
    while (owner.raidState && owner.raidState.status === 'ACTIVE' && guard++ < 200) {
      owner.killAllTracked();
      owner.advanceRaid();
    }
    expect(owner.raidState?.status).toBe('VICTORY');
    expect(totalWaves).toBeGreaterThanOrEqual(3);
    // Double-kill after victory is a no-op path
    expect(owner.controller.getRaidWaveEntityIds()).toHaveLength(0);
  });

  it('double death on same id is exactly-once', () => {
    const owner = new CombatRaidOwner();
    owner.start(1);
    const id = owner.controller.getRaidWaveEntityIds()[0]!;
    const before = owner.raidState!.raidersRemaining;
    const first = owner.combat.damageRaider(id, 10_000, (eid) => owner.onRemoved(eid));
    expect(first.died).toBe(true);
    expect(owner.raidState!.raidersRemaining).toBe(before - 1);
    expect(owner.onRemoved(id)).toBe(false);
    expect(owner.raidState!.raidersRemaining).toBe(before - 1);
  });

  it('pause freezes combat damage', () => {
    const owner = new CombatRaidOwner();
    owner.start(1);
    const id = owner.controller.getRaidWaveEntityIds()[0]!;
    const e = owner.manager.get(id)!;
    owner.player = { x: e.transform.x, y: e.transform.y, z: e.transform.z };
    owner.paused = true;
    for (let i = 0; i < 20; i++) owner.tickCombat();
    expect(owner.playerHits).toBe(0);
  });

  it('player death forces DEFEAT and clears entities', () => {
    const owner = new CombatRaidOwner();
    owner.start(1);
    expect(owner.controller.getRaidWaveEntityIds().length).toBeGreaterThan(0);
    owner.playerDeathDefeat();
    expect(owner.raidState?.status).toBe('DEFEAT');
    expect(owner.controller.getRaidWaveEntityIds()).toHaveLength(0);
  });
});
