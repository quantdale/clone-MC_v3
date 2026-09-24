import { describe, expect, it } from 'vitest';
import {
  clearBadOmen,
  createBadOmen,
  grantBadOmen,
  resolveVillageRaidTrigger,
  type BadOmenState,
  type OmenTriggerDecision,
  type VillageContext,
} from '../../src/simulation/BadOmenRules';
import {
  startRaid,
  tickRaid,
  type RaidState,
} from '../../src/simulation/RaidStateMachine';

/**
 * Wiring oracles for live Bad Omen acquisition (285): exact composition of
 * Game.grantBadOmen / clearBadOmen / evaluateBadOmenVillageTrigger /
 * setVillageQuery over BadOmenRules + the 282 startRaid+tickRaid seam.
 * Game is DOM-bound (282/275 precedent), so routing is covered here at the
 * seam and in browser E2E.
 */

type VillageQuery = () => VillageContext | null;

/** Minimal owner mirroring Game's ephemeral omen + raid-start composition. */
class BadOmenOwner {
  badOmen: BadOmenState = createBadOmen();
  raidState: RaidState | null = null;
  villageQuery: VillageQuery = () => null;
  disposed = false;
  paused = false;
  /** When true, simulate a missing raid-start seam (fail-closed retain omen). */
  raidStartAvailable = true;

  getBadOmenLevel(): number {
    return this.badOmen.level;
  }

  grantBadOmen(amount?: number): void {
    this.badOmen = grantBadOmen(this.badOmen, amount);
  }

  clearBadOmen(): void {
    this.badOmen = clearBadOmen(this.badOmen);
  }

  setVillageQuery(query: VillageQuery | null): void {
    this.villageQuery = query ?? (() => null);
  }

  /** Exact Game.debugStartRaid composition at an explicit center. */
  startRaidAt(x: number, y: number, z: number, omen: number): RaidState | null {
    if (!this.raidStartAvailable) return null;
    const { state } = tickRaid(startRaid(x, y, z, omen));
    this.raidState = state;
    return state;
  }

  evaluateBadOmenVillageTrigger(): OmenTriggerDecision {
    if (this.disposed || this.paused) {
      return { kind: 'NONE', reason: 'NO_OMEN' };
    }
    const decision = resolveVillageRaidTrigger(this.badOmen, this.villageQuery());
    if (decision.kind !== 'START_RAID') return decision;
    const started = this.startRaidAt(
      decision.centerX,
      decision.centerY,
      decision.centerZ,
      decision.badOmenLevel,
    );
    if (!started) return decision; // retain omen (fail closed)
    this.badOmen = clearBadOmen(this.badOmen);
    return decision;
  }

  /** Unpaused fixed tick: evaluate omen then (optionally) tick an existing raid. */
  tick(): void {
    if (this.disposed || this.paused) return;
    this.evaluateBadOmenVillageTrigger();
  }

  dispose(): void {
    this.disposed = true;
    this.badOmen = createBadOmen();
    this.raidState = null;
  }
}

const fixtureVillage = (
  overrides: Partial<VillageContext> = {},
): VillageContext => ({
  centerX: 8,
  centerY: 64,
  centerZ: 8,
  containsPlayer: true,
  ...overrides,
});

describe('LiveBadOmen wiring (285)', () => {
  it('seams mutate and read one ephemeral level without persistence keys', () => {
    const g = new BadOmenOwner();
    expect(g.getBadOmenLevel()).toBe(0);
    g.grantBadOmen(2);
    expect(g.getBadOmenLevel()).toBe(2);
    g.clearBadOmen();
    expect(g.getBadOmenLevel()).toBe(0);
  });

  it('grant + fixture village starts a raid and clears omen exactly once', () => {
    const g = new BadOmenOwner();
    g.setVillageQuery(() => fixtureVillage());
    g.grantBadOmen(1);
    g.tick();
    expect(g.raidState).not.toBeNull();
    expect(g.raidState!.status).toBe('ACTIVE');
    expect(g.raidState!.badOmenLevel).toBe(1);
    expect(g.getBadOmenLevel()).toBe(0);
    const raidAfterFirst = g.raidState;
    g.tick();
    expect(g.getBadOmenLevel()).toBe(0);
    expect(g.raidState).toBe(raidAfterFirst); // no second start from this path
  });

  it('absence query retains omen across ticks', () => {
    const g = new BadOmenOwner();
    g.setVillageQuery(() => null);
    g.grantBadOmen(2);
    g.tick();
    g.tick();
    expect(g.getBadOmenLevel()).toBe(2);
    expect(g.raidState).toBeNull();
  });

  it('invalid center fails closed and retains omen', () => {
    const g = new BadOmenOwner();
    g.setVillageQuery(() => fixtureVillage({ centerY: Number.POSITIVE_INFINITY }));
    g.grantBadOmen(3);
    g.tick();
    expect(g.raidState).toBeNull();
    expect(g.getBadOmenLevel()).toBe(3);
  });

  it('pause freezes evaluation; resume performs start+clear', () => {
    const g = new BadOmenOwner();
    g.setVillageQuery(() => fixtureVillage());
    g.grantBadOmen(1);
    g.paused = true;
    g.tick();
    g.tick();
    expect(g.getBadOmenLevel()).toBe(1);
    expect(g.raidState).toBeNull();
    g.paused = false;
    g.tick();
    expect(g.getBadOmenLevel()).toBe(0);
    expect(g.raidState?.status).toBe('ACTIVE');
  });

  it('active-raid replacement via a new omen trigger uses the 282 start path', () => {
    const g = new BadOmenOwner();
    g.setVillageQuery(() => fixtureVillage());
    g.grantBadOmen(1);
    g.tick();
    const first = g.raidState!;
    g.grantBadOmen(2);
    g.tick();
    expect(g.raidState).not.toBe(first);
    expect(g.raidState!.badOmenLevel).toBe(2);
    expect(g.getBadOmenLevel()).toBe(0);
  });

  it('dispose clears omen; missing raid seam retains omen', () => {
    const g = new BadOmenOwner();
    g.grantBadOmen(4);
    g.dispose();
    expect(g.getBadOmenLevel()).toBe(0);
    expect(g.raidState).toBeNull();

    const g2 = new BadOmenOwner();
    g2.setVillageQuery(() => fixtureVillage());
    g2.raidStartAvailable = false;
    g2.grantBadOmen(2);
    const decision = g2.evaluateBadOmenVillageTrigger();
    expect(decision.kind).toBe('START_RAID');
    expect(g2.getBadOmenLevel()).toBe(2);
    expect(g2.raidState).toBeNull();
  });

  it('setVillageQuery(null) on the 285 owner mock restores absence (Game 287 restores live detector)', () => {
    const g = new BadOmenOwner();
    g.setVillageQuery(() => fixtureVillage());
    g.setVillageQuery(null);
    g.grantBadOmen(1);
    g.tick();
    expect(g.getBadOmenLevel()).toBe(1);
    expect(g.raidState).toBeNull();
  });
});
