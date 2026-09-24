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
  detectVillage,
  shouldResampleVillage,
  VILLAGE_MOVE_RESAMPLE,
  VILLAGE_RESAMPLE_TICKS,
  type VillageBlockProbe,
} from '../../src/simulation/VillageDetectionRules';
import { startRaid, tickRaid, type RaidState } from '../../src/simulation/RaidStateMachine';
import { sectionIndex } from '../../src/math/SectionCoordinate';

const BED = 63;

/**
 * Wiring oracle for live village detection (287): mirrors Game's live-default
 * VillageQuery, override bypass, rate-limited cache, and fail-closed probe.
 */
class VillageRaidOwner {
  badOmen: BadOmenState = createBadOmen();
  raidState: RaidState | null = null;
  override: (() => VillageContext | null) | null = null;
  cache: VillageContext | null = null;
  sampleTick = -1;
  samplePx = 0;
  samplePy = 0;
  samplePz = 0;
  simTick = 0;
  player = { x: 0.5, y: 64.1, z: 0.5 };
  disposed = false;
  paused = false;
  probe: VillageBlockProbe;

  constructor(probe: VillageBlockProbe) {
    this.probe = probe;
  }

  setVillageQuery(query: (() => VillageContext | null) | null): void {
    this.override = query;
    if (query === null) this.clearCache();
  }

  clearCache(): void {
    this.cache = null;
    this.sampleTick = -1;
    this.samplePx = 0;
    this.samplePy = 0;
    this.samplePz = 0;
  }

  queryLive(): VillageContext | null {
    if (this.disposed) return null;
    const { x, y, z } = this.player;
    if (
      !shouldResampleVillage(
        this.sampleTick,
        this.simTick,
        this.samplePx,
        this.samplePy,
        this.samplePz,
        x,
        y,
        z,
      )
    ) {
      return this.cache;
    }
    let result: VillageContext | null = null;
    try {
      result = detectVillage(x, y, z, this.probe, BED);
    } catch {
      result = null;
    }
    this.cache = result;
    this.sampleTick = this.simTick;
    this.samplePx = Math.floor(x);
    this.samplePy = Math.floor(y);
    this.samplePz = Math.floor(z);
    return result;
  }

  resolveVillage(): VillageContext | null {
    if (this.override) {
      try {
        return this.override();
      } catch {
        return null;
      }
    }
    return this.queryLive();
  }

  grant(amount = 1): void {
    this.badOmen = grantBadOmen(this.badOmen, amount);
  }

  evaluate(): OmenTriggerDecision {
    if (this.disposed || this.paused) return { kind: 'NONE', reason: 'NO_OMEN' };
    const decision = resolveVillageRaidTrigger(this.badOmen, this.resolveVillage());
    if (decision.kind !== 'START_RAID') return decision;
    const { state } = tickRaid(
      startRaid(decision.centerX, decision.centerY, decision.centerZ, decision.badOmenLevel),
    );
    this.raidState = state;
    this.badOmen = clearBadOmen(this.badOmen);
    return decision;
  }

  tick(): void {
    if (this.disposed || this.paused) return;
    this.simTick += 1;
    this.evaluate();
  }

  dispose(): void {
    this.disposed = true;
    this.badOmen = createBadOmen();
    this.raidState = null;
    this.override = null;
    this.clearCache();
  }
}

function bedWorld(beds: Array<[number, number, number]>, loadedAll = true): VillageBlockProbe {
  const map = new Map(beds.map(([x, y, z]) => [`${x}|${y}|${z}`, BED] as const));
  const loaded = new Set(beds.map(([x, , z]) => `${sectionIndex(x)}|${sectionIndex(z)}`));
  return {
    getBlock(x, y, z) {
      return map.get(`${x}|${y}|${z}`) ?? 0;
    },
    hasColumn(cx, cz) {
      return loadedAll || loaded.has(`${cx}|${cz}`);
    },
  };
}

describe('LiveVillageDetection wiring (287)', () => {
  it('live default detects a placed bed and starts a raid without fixtures', () => {
    const g = new VillageRaidOwner(bedWorld([[0, 64, 0]]));
    g.grant(1);
    g.tick();
    expect(g.raidState?.status).toBe('ACTIVE');
    expect(g.badOmen.level).toBe(0);
    expect(g.raidState!.centerX).toBe(0);
  });

  it('no beds means no raid and omen is retained', () => {
    const g = new VillageRaidOwner(bedWorld([]));
    g.grant(2);
    g.tick();
    g.tick();
    expect(g.raidState).toBeNull();
    expect(g.badOmen.level).toBe(2);
  });

  it('explicit null override bypasses live beds', () => {
    const g = new VillageRaidOwner(bedWorld([[0, 64, 0]]));
    g.setVillageQuery(() => null);
    g.grant(1);
    g.tick();
    expect(g.raidState).toBeNull();
    expect(g.badOmen.level).toBe(1);
  });

  it('setVillageQuery(null) restores the live detector', () => {
    const g = new VillageRaidOwner(bedWorld([[0, 64, 0]]));
    g.setVillageQuery(() => null);
    g.setVillageQuery(null);
    g.grant(1);
    g.tick();
    expect(g.raidState?.status).toBe('ACTIVE');
    expect(g.badOmen.level).toBe(0);
  });

  it('cache skips resample until tick or move threshold', () => {
    let reads = 0;
    const base = bedWorld([[0, 64, 0]]);
    const probe: VillageBlockProbe = {
      getBlock(x, y, z) {
        reads += 1;
        return base.getBlock(x, y, z);
      },
      hasColumn: (cx, cz) => base.hasColumn(cx, cz),
    };
    const g = new VillageRaidOwner(probe);
    g.queryLive();
    const afterFirst = reads;
    expect(afterFirst).toBeGreaterThan(0);
    g.simTick += 1;
    g.queryLive();
    expect(reads).toBe(afterFirst); // cached
    g.simTick += VILLAGE_RESAMPLE_TICKS;
    g.queryLive();
    expect(reads).toBeGreaterThan(afterFirst);
  });

  it('move threshold forces resample', () => {
    let reads = 0;
    const base = bedWorld([[0, 64, 0]]);
    const probe: VillageBlockProbe = {
      getBlock(x, y, z) {
        reads += 1;
        return base.getBlock(x, y, z);
      },
      hasColumn: (cx, cz) => base.hasColumn(cx, cz),
    };
    const g = new VillageRaidOwner(probe);
    g.queryLive();
    const afterFirst = reads;
    g.player.x = VILLAGE_MOVE_RESAMPLE + 0.5;
    g.queryLive();
    expect(reads).toBeGreaterThan(afterFirst);
  });

  it('pause freezes; dispose clears cache and omen', () => {
    const g = new VillageRaidOwner(bedWorld([[0, 64, 0]]));
    g.grant(1);
    g.paused = true;
    g.tick();
    expect(g.raidState).toBeNull();
    expect(g.badOmen.level).toBe(1);
    g.paused = false;
    g.tick();
    expect(g.raidState?.status).toBe('ACTIVE');
    g.dispose();
    expect(g.badOmen.level).toBe(0);
    expect(g.sampleTick).toBe(-1);
    expect(g.cache).toBeNull();
  });

  it('throwing probe fails closed to null', () => {
    const probe: VillageBlockProbe = {
      getBlock() {
        throw new Error('boom');
      },
      hasColumn() {
        return true;
      },
    };
    const g = new VillageRaidOwner(probe);
    g.grant(1);
    g.tick();
    expect(g.raidState).toBeNull();
    expect(g.badOmen.level).toBe(1);
  });
});
