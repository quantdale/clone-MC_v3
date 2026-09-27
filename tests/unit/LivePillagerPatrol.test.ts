import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import {
  BAD_OMEN_MAX_LEVEL,
  createBadOmen,
  grantBadOmen,
  type BadOmenState,
} from '../../src/simulation/BadOmenRules';
import { EntityManager } from '../../src/simulation/EntityManager';
import {
  BAD_OMEN_PER_CAPTAIN,
  PATROL_MIN_WORLD_TICKS,
  PillagerPatrolSystem,
  type PatrolAttemptContext,
} from '../../src/simulation/PillagerPatrol';
import { createEntityManagerRaidBackend } from '../../src/simulation/RaidEntityBackend';
import { RaidWaveController } from '../../src/simulation/RaidWaveController';
import { RaiderCombatSystem } from '../../src/simulation/RaiderCombatBehavior';
import {
  recordRaiderDeath,
  startRaid,
  tickRaid,
  type RaidState,
} from '../../src/simulation/RaidStateMachine';
import { createNamedRng } from '../../src/simulation/SeedRng';

const registry = createDefaultEntityRegistry();
const dimension = createResourceId('minecraft', 'overworld');

/**
 * Seam oracle mirroring Game's 284/285/288/291 composition: raid waves + raid
 * combat in one EntityManager, patrols in a dedicated one, Bad Omen via the
 * pure 285 helper (Game.grantBadOmen delegates to it), captain → +1.
 */
class PatrolGameOwner {
  badOmen: BadOmenState = createBadOmen();
  raidState: RaidState | null = null;
  grantCalls = 0;
  readonly raidManager = new EntityManager(registry);
  readonly raidController = new RaidWaveController({
    backend: createEntityManagerRaidBackend({ manager: this.raidManager, registry, dimension }),
    resolveType: (k) => registry.getByKey(k) !== undefined,
  });
  readonly raidCombat = new RaiderCombatSystem({ manager: this.raidManager, registry });
  readonly patrolManager = new EntityManager(registry);
  readonly patrol = new PillagerPatrolSystem({
    manager: this.patrolManager,
    registry,
    dimension,
    rng: createNamedRng(2026, 'pillager-patrol'),
  });

  grantBadOmen(amount?: number): void {
    this.grantCalls++;
    this.badOmen = grantBadOmen(this.badOmen, amount);
  }

  onPatrolCaptainKilled(): void {
    this.grantBadOmen(BAD_OMEN_PER_CAPTAIN);
  }

  startRaidAt(omen: number): RaidState {
    this.patrol.clear('raid-start');
    this.raidController.clear('replace');
    this.raidCombat.clear();
    const { state, spawned } = tickRaid(startRaid(0, 64, 0, omen));
    this.raidState = state;
    if (spawned && spawned.length > 0) this.raidController.applyWave(state, spawned);
    return state;
  }

  onRaidEntityRemoved(entityId: number): boolean {
    if (!this.raidState) return false;
    if (!this.raidController.consumeDeath(entityId)) return false;
    this.raidState = recordRaiderDeath(this.raidState);
    return true;
  }

  killRaidEntity(id: number): boolean {
    return this.raidCombat.damageRaider(id, 10_000, (eid) => this.onRaidEntityRemoved(eid)).died;
  }

  killPatrolMember(id: number): boolean {
    return this.patrol.damageMember(id, 10_000, () => this.onPatrolCaptainKilled());
  }

  context(overrides: Partial<PatrolAttemptContext> = {}): PatrolAttemptContext {
    return {
      doMobSpawning: true,
      difficulty: 'normal',
      spectator: false,
      worldTicks: PATROL_MIN_WORLD_TICKS,
      dayTick: 1000,
      raidActive: this.raidState?.status === 'ACTIVE',
      patrolAlive: this.patrol.isAlive(),
      nearVillage: false,
      playerX: 0.5,
      playerY: 64,
      playerZ: 0.5,
      surfaceY: () => 64,
      ...overrides,
    };
  }

  spawnPatrolWithAtLeast(n: number): void {
    let guard = 0;
    do {
      this.patrol.forceSpawn(this.context());
    } while (this.patrol.getMemberIds().length < n && guard++ < 50);
  }
}

describe('Live pillager patrol → Bad Omen (291)', () => {
  it('non-captain kill keeps omen; captain kill grants +1 from 0', () => {
    const g = new PatrolGameOwner();
    g.spawnPatrolWithAtLeast(2);
    const captain = g.patrol.getCaptainId()!;
    const other = g.patrol.getMemberIds().find((id) => id !== captain)!;
    expect(g.killPatrolMember(other)).toBe(true);
    expect(g.badOmen.level).toBe(0);
    expect(g.killPatrolMember(captain)).toBe(true);
    expect(g.badOmen.level).toBe(1);
    expect(g.grantCalls).toBe(1);
  });

  it('successive patrol captains stack omen and cap at 5', () => {
    const g = new PatrolGameOwner();
    for (let i = 1; i <= 7; i++) {
      g.patrol.forceSpawn(g.context());
      g.killPatrolMember(g.patrol.getCaptainId()!);
      expect(g.badOmen.level).toBe(Math.min(i, BAD_OMEN_MAX_LEVEL));
    }
    expect(g.badOmen.level).toBe(5);
  });

  it('captain kill leaves an existing raid state object untouched', () => {
    const g = new PatrolGameOwner();
    g.startRaidAt(1);
    // Drive the raid to VICTORY through the raid path only.
    let guard = 0;
    while (g.raidState && g.raidState.status === 'ACTIVE' && guard++ < 200) {
      for (const id of [...g.raidController.getRaidWaveEntityIds()]) g.killRaidEntity(id);
      const { state, spawned } = tickRaid(g.raidState);
      g.raidState = state;
      if (state.status === 'ACTIVE' && spawned && spawned.length > 0) {
        g.raidController.applyWave(state, spawned);
      }
    }
    expect(g.raidState?.status).toBe('VICTORY');
    const raidRef = g.raidState;
    const snapshot = JSON.stringify(raidRef);
    g.patrol.forceSpawn(g.context());
    g.killPatrolMember(g.patrol.getCaptainId()!);
    expect(g.raidState).toBe(raidRef);
    expect(JSON.stringify(g.raidState)).toBe(snapshot);
    expect(g.badOmen.level).toBe(1);
  });

  it('raid wave kills never grant Bad Omen', () => {
    const g = new PatrolGameOwner();
    g.startRaidAt(1);
    const ids = [...g.raidController.getRaidWaveEntityIds()];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(g.killRaidEntity(id)).toBe(true);
    expect(g.badOmen.level).toBe(0);
    expect(g.grantCalls).toBe(0);
  });

  it('raid start dismisses a live patrol without granting omen', () => {
    const g = new PatrolGameOwner();
    g.spawnPatrolWithAtLeast(1);
    const ids = g.patrol.getMemberIds();
    g.startRaidAt(1);
    expect(g.patrol.isAlive()).toBe(false);
    for (const id of ids) expect(g.patrolManager.get(id)?.state === 'ACTIVE').toBe(false);
    expect(g.badOmen.level).toBe(0);
  });

  it('natural attempts skip during an ACTIVE raid', () => {
    const g = new PatrolGameOwner();
    g.startRaidAt(1);
    expect(g.patrol.runAttempt(g.context())).toEqual({ kind: 'SKIP', reason: 'RAID_ACTIVE' });
  });

  it('patrol entities live in a separate manager from raid waves', () => {
    const g = new PatrolGameOwner();
    g.startRaidAt(1);
    const raidIds = new Set(g.raidController.getRaidWaveEntityIds());
    g.patrol.forceSpawn(g.context({ raidActive: false }));
    // Raid start cleared nothing here (patrol spawned after), ids are manager-local.
    for (const id of g.patrol.getMemberIds()) {
      expect(g.patrolManager.get(id)?.state).toBe('ACTIVE');
    }
    // Killing a patrol member does not consume any raid wave death.
    const before = g.raidState!.raidersRemaining;
    g.killPatrolMember(g.patrol.getMemberIds()[0]!);
    expect(g.raidState!.raidersRemaining).toBe(before);
    expect(g.raidController.getRaidWaveEntityIds().length).toBe(raidIds.size);
  });
});

describe('Game source isolation guards (291)', () => {
  const src = readFileSync(resolve(__dirname, '../../src/engine/Game.ts'), 'utf8');

  function methodBody(signature: string): string {
    const start = src.indexOf(signature);
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let i = src.indexOf('{', start);
    const open = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    return src.slice(open, i + 1);
  }

  it('raid death choke never grants Bad Omen', () => {
    const body = methodBody('onRaidEntityRemoved(entityId: number): boolean');
    expect(body).not.toMatch(/grantBadOmen|badOmen/);
  });

  it('patrol captain handler never touches raid state', () => {
    const body = methodBody('private onPatrolCaptainKilled(): void');
    expect(body).toMatch(/grantBadOmen\(BAD_OMEN_PER_CAPTAIN\)/);
    expect(body).not.toMatch(/raidState|recordRaiderDeath|raidWaveController/);
  });

  it('patrol module has no RaidState dependency', () => {
    const patrolSrc = readFileSync(
      resolve(__dirname, '../../src/simulation/PillagerPatrol.ts'),
      'utf8',
    );
    expect(patrolSrc).not.toMatch(/from '\.\/RaidStateMachine'/);
    expect(patrolSrc).not.toMatch(/recordRaiderDeath\(|forceRaidDefeat\(/);
  });

  it('raid start dismisses patrols and pagehide/dispose clear them', () => {
    expect(methodBody('private startRaidAt(')).toMatch(/pillagerPatrol\.clear\('raid-start'\)/);
    expect(src).toMatch(/pillagerPatrol\.clear\('pagehide'\)/);
    expect(src).toMatch(/pillagerPatrol\.clear\('dispose'\)/);
  });
});
