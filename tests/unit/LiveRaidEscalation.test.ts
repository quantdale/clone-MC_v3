import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultAttributeRegistry } from '../../src/data/AttributeRegistry';
import { createResourceId } from '../../src/data/ResourceId';
import { createDefaultStatusEffectRegistry } from '../../src/data/StatusEffect';
import { StatusEffectManager } from '../../src/data/StatusEffectManager';
import {
  clearBadOmen,
  createBadOmen,
  grantBadOmen,
  type BadOmenState,
  type VillageContext,
} from '../../src/simulation/BadOmenRules';
import {
  heroAmplifierFromBadOmen,
  heroDurationSeconds,
  shouldGrantHeroOfTheVillage,
} from '../../src/simulation/HeroOfTheVillage';
import {
  parsePlayerEffects,
  refreshBadOmenDuration,
  serializePlayerEffects,
} from '../../src/simulation/PlayerEffectsPersistence';
import { escalateRaid, resolveVillageOmenAction, type VillageOmenAction } from '../../src/simulation/RaidEscalation';
import { deserializeRaidPayload, serializeRaidPayload } from '../../src/simulation/RaidPersistence';
import { recordRaiderDeath, startRaid, tickRaid, type RaidState } from '../../src/simulation/RaidStateMachine';

/**
 * Wiring oracles for 294: a minimal owner mirroring Game's exact composition
 * of the omen trigger (285 + 294 escalation), 291 patrol dismissal, 290 HOTV,
 * death (respawnPlayer) and the 283/292 durable saves over a JSON "disk",
 * plus Game source guards. Game is DOM-bound, so routing is covered here and
 * in browser E2E (282/285/291/292 precedent).
 */

const HOTV = createResourceId('minecraft', 'effect/hero_of_the_village');

interface Disk {
  player: unknown | null;
  raid: unknown | null;
  flushes: number;
}

class Owner {
  readonly registry = createDefaultStatusEffectRegistry();
  effects = new StatusEffectManager(this.registry, createDefaultAttributeRegistry());
  badOmen: BadOmenState = createBadOmen();
  badOmenRemaining = 0;
  raidState: RaidState | null = null;
  village: VillageContext | null = null;
  patrolAlive = false;
  /** Wave entity ids of the live wave (the controller is only cleared by starts/terminal outcomes). */
  waveEntities: number[] = [];
  private nextEntity = 1;
  private pendingRaid: unknown | null | undefined = undefined;

  constructor(readonly disk: Disk) {}

  saveRaid(): void {
    this.pendingRaid = this.raidState ? JSON.parse(JSON.stringify(serializeRaidPayload(this.raidState))) : null;
  }
  /** One flush commits the queued raid record and the player snapshot together. */
  savePlayerStateDurable(): void {
    this.disk.player = JSON.parse(
      JSON.stringify(
        serializePlayerEffects(this.effects.serialize(), { level: this.badOmen.level, remainingSeconds: this.badOmenRemaining }),
      ),
    );
    if (this.pendingRaid !== undefined) this.disk.raid = this.pendingRaid;
    this.pendingRaid = undefined;
    this.disk.flushes++;
  }
  static load(disk: Disk): Owner {
    const g = new Owner(disk);
    const parsed = parsePlayerEffects(disk.player ?? undefined, g.registry);
    g.effects.deserialize(parsed.effects);
    g.badOmen = createBadOmen(parsed.badOmen.level);
    g.badOmenRemaining = g.badOmen.level > 0 ? parsed.badOmen.remainingSeconds : 0;
    g.raidState = deserializeRaidPayload(disk.raid ?? undefined);
    return g;
  }

  grantBadOmen(amount: number): void {
    this.badOmen = grantBadOmen(this.badOmen, amount);
    this.badOmenRemaining = refreshBadOmenDuration(this.badOmen.level).remainingSeconds;
    this.savePlayerStateDurable();
  }

  private applyWave(n: number): void {
    this.waveEntities = Array.from({ length: n }, () => this.nextEntity++);
  }
  startRaidAt(x: number, y: number, z: number, omen: number): void {
    this.patrolAlive = false;
    this.waveEntities = [];
    const { state, spawned } = tickRaid(startRaid(x, y, z, omen));
    this.raidState = state;
    if (spawned) this.applyWave(state.raidersRemaining);
  }
  /** Mirrors Game.evaluateBadOmenVillageTrigger (285 + 294). */
  evaluateBadOmenVillageTrigger(): VillageOmenAction {
    const decision = resolveVillageOmenAction(this.badOmen, this.village, this.raidState);
    if (decision.kind === 'ESCALATE_RAID') {
      if (!this.raidState) return decision;
      const result = escalateRaid(this.raidState, decision.badOmenLevel);
      if (!result.applied) return decision;
      this.patrolAlive = false;
      this.raidState = result.state;
      this.badOmen = clearBadOmen(this.badOmen);
      this.badOmenRemaining = 0;
      this.saveRaid();
      this.savePlayerStateDurable();
      return decision;
    }
    if (decision.kind !== 'START_RAID') return decision;
    this.startRaidAt(decision.centerX, decision.centerY, decision.centerZ, decision.badOmenLevel);
    this.badOmen = clearBadOmen(this.badOmen);
    this.badOmenRemaining = 0;
    this.saveRaid();
    this.savePlayerStateDurable();
    return decision;
  }
  /** Mirrors debugClearRaidWave: kill the wave, one tickRaid, 290 grant, controller rules. */
  clearWave(): RaidState {
    const prev = this.raidState!.status;
    let s = this.raidState!;
    for (let i = s.raidersRemaining; i > 0; i--) s = recordRaiderDeath(s);
    const { state, spawned } = tickRaid(s);
    this.raidState = state;
    if (state.status === 'VICTORY' || state.status === 'DEFEAT') this.waveEntities = [];
    else if (spawned && spawned.length > 0) this.applyWave(state.raidersRemaining);
    if (shouldGrantHeroOfTheVillage(prev, state.status)) {
      this.effects.add(HOTV, heroDurationSeconds(), heroAmplifierFromBadOmen(state.badOmenLevel));
      this.saveRaid();
      this.savePlayerStateDurable();
    }
    return state;
  }
  /** Mirrors onSurvivalEvent('death') → [ACTIVE raid → DEFEAT] → respawnPlayer. */
  die(): void {
    if (this.raidState?.status === 'ACTIVE') {
      this.raidState = { ...this.raidState, status: 'DEFEAT' };
      this.waveEntities = [];
      this.saveRaid();
    }
    this.effects.clear();
    this.badOmen = createBadOmen();
    this.badOmenRemaining = 0;
    this.savePlayerStateDurable();
  }
}

const inside = (): VillageContext => ({ centerX: 8, centerY: 64, centerZ: 8, containsPlayer: true });
const newDisk = (): Disk => ({ player: null, raid: null, flushes: 0 });

describe('LiveRaidEscalation (294) — omen during an ACTIVE raid', () => {
  it('escalates the running raid in place, dismisses the patrol and saves raid + consumed omen in one flush', () => {
    const disk = newDisk();
    const g = new Owner(disk);
    g.village = inside();
    g.grantBadOmen(1);
    expect(g.evaluateBadOmenVillageTrigger().kind).toBe('START_RAID');
    const wave1 = [...g.waveEntities];
    const before = g.raidState!;
    g.patrolAlive = true; // a forced patrol appeared after the raid began
    g.grantBadOmen(2);
    const flushes = disk.flushes;
    const action = g.evaluateBadOmenVillageTrigger();
    expect(action).toMatchObject({
      kind: 'ESCALATE_RAID',
      badOmenLevel: 2,
      raidLevelBefore: 1,
      raidLevelAfter: 3,
      totalWavesBefore: 3,
      totalWavesAfter: 5,
    });
    expect(g.raidState).toMatchObject({ status: 'ACTIVE', badOmenLevel: 3, totalWaves: 5, waveIndex: before.waveIndex });
    expect(g.raidState!.raidersRemaining).toBe(before.raidersRemaining);
    expect(g.waveEntities).toEqual(wave1); // no respawn
    expect(g.patrolAlive).toBe(false);
    expect(g.badOmen.level).toBe(0);
    expect(g.badOmenRemaining).toBe(0);
    expect(disk.flushes).toBe(flushes + 1);

    // Crash right after (no pagehide): both are durable together.
    const c = Owner.load(disk);
    expect(c.badOmen.level).toBe(0);
    expect(c.raidState).toMatchObject({ status: 'ACTIVE', badOmenLevel: 3, totalWaves: 5, waveIndex: before.waveIndex });
    c.village = inside();
    expect(c.evaluateBadOmenVillageTrigger()).toEqual({ kind: 'NONE', reason: 'NO_OMEN' });
  });

  it('escalated victory takes the extra waves and grants HOTV at the escalated level', () => {
    const g = new Owner(newDisk());
    g.village = inside();
    g.grantBadOmen(1);
    g.evaluateBadOmenVillageTrigger();
    g.grantBadOmen(2);
    g.evaluateBadOmenVillageTrigger();
    let waves = 0;
    for (let i = 0; i < 20 && g.raidState!.status === 'ACTIVE'; i++) {
      g.clearWave();
      waves = Math.max(waves, g.raidState!.waveIndex);
    }
    expect(g.raidState!.status).toBe('VICTORY');
    expect(waves).toBe(5);
    expect(g.effects.get(HOTV)?.amplifier).toBe(2);
    const reloaded = Owner.load(g.disk);
    expect(reloaded.effects.get(HOTV)?.amplifier).toBe(2);
    expect(reloaded.raidState?.status).toBe('VICTORY');
  });

  it('at the cap the omen is still consumed; repeated triggers never farm levels', () => {
    const g = new Owner(newDisk());
    g.village = inside();
    g.grantBadOmen(5);
    g.evaluateBadOmenVillageTrigger();
    expect(g.raidState).toMatchObject({ badOmenLevel: 5, totalWaves: 7 });
    for (let i = 0; i < 3; i++) {
      g.grantBadOmen(1);
      expect(g.evaluateBadOmenVillageTrigger().kind).toBe('ESCALATE_RAID');
      expect(g.badOmen.level).toBe(0);
    }
    expect(g.raidState).toMatchObject({ badOmenLevel: 5, totalWaves: 7 });
  });

  it('a raid 96+ blocks away is still replaced (single raid slot); a finished raid restarts', () => {
    const g = new Owner(newDisk());
    g.startRaidAt(8 + 150, 64, 8, 1);
    g.village = inside();
    g.grantBadOmen(2);
    expect(g.evaluateBadOmenVillageTrigger().kind).toBe('START_RAID');
    expect(g.raidState).toMatchObject({ centerX: 8, badOmenLevel: 2, waveIndex: 1, totalWaves: 4 });
    while (g.raidState!.status === 'ACTIVE') g.clearWave();
    g.grantBadOmen(1);
    expect(g.evaluateBadOmenVillageTrigger().kind).toBe('START_RAID');
    expect(g.raidState).toMatchObject({ status: 'ACTIVE', badOmenLevel: 1, waveIndex: 1 });
  });
});

describe('LiveRaidEscalation (294) — death clears Bad Omen', () => {
  it('death clears omen and effects durably; reload shows omen 0', () => {
    const disk = newDisk();
    const g = new Owner(disk);
    g.grantBadOmen(3);
    g.effects.add(HOTV, 100, 1);
    expect(Owner.load(disk).badOmen.level).toBe(3);
    g.die();
    expect(g.badOmen.level).toBe(0);
    expect(g.badOmenRemaining).toBe(0);
    const r = Owner.load(disk);
    expect(r.badOmen.level).toBe(0);
    expect(r.badOmenRemaining).toBe(0);
    expect(r.effects.get(HOTV)).toBeUndefined();
  });

  it('death during an ACTIVE raid defeats it, grants no HOTV and clears omen in the same flush', () => {
    const disk = newDisk();
    const g = new Owner(disk);
    g.village = inside();
    g.grantBadOmen(1);
    g.evaluateBadOmenVillageTrigger();
    g.village = null;
    g.grantBadOmen(2); // outside the village: held, not absorbed
    expect(g.badOmen.level).toBe(2);
    g.die();
    const r = Owner.load(disk);
    expect(r.raidState?.status).toBe('DEFEAT');
    expect(r.badOmen.level).toBe(0);
    expect(r.effects.get(HOTV)).toBeUndefined();
  });
});

describe('Game source guards (294)', () => {
  const src = readFileSync(resolve(__dirname, '../../src/engine/Game.ts'), 'utf8');

  function methodBody(signature: string): string {
    const start = src.indexOf(signature);
    expect(start, signature).toBeGreaterThan(-1);
    let depth = 0;
    let i = src.indexOf('{', start + signature.length - 1);
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
  function inOrder(body: string, parts: string[]): void {
    let at = -1;
    for (const p of parts) {
      const next = body.indexOf(p, at + 1);
      expect(next, `expected "${p}" after index ${at}`).toBeGreaterThan(at);
      at = next;
    }
  }

  it('the omen trigger resolves through the 294 action resolver with the live raid', () => {
    const body = methodBody('evaluateBadOmenVillageTrigger(): VillageOmenAction {');
    expect(body).toMatch(/resolveVillageOmenAction\(this\.badOmen, this\.resolveVillageQuery\(\), this\.raidState\)/);
    expect(src).not.toMatch(/resolveVillageRaidTrigger\(/);
  });

  it('ESCALATE_RAID escalates in place, dismisses patrols and saves raid + omen together', () => {
    const body = methodBody('evaluateBadOmenVillageTrigger(): VillageOmenAction {');
    const escalate = body.slice(body.indexOf("if (decision.kind === 'ESCALATE_RAID')"), body.indexOf("if (decision.kind !== 'START_RAID')"));
    inOrder(escalate, [
      'escalateRaid(this.raidState, decision.badOmenLevel)',
      'if (!result.applied) return decision;',
      "this.pillagerPatrol.clear('raid-start');",
      'this.raidState = result.state;',
      'this.badOmen = clearBadOmenState(this.badOmen);',
      'this.badOmenRemainingSeconds = 0;',
      'this.syncRaidFeedbackHud();',
      'this.saveRaid();',
      'this.savePlayerStateDurable();',
    ]);
    expect(escalate).not.toMatch(/startRaidAt|raidWaveController|raiderCombat|applyWave/);
  });

  it('respawnPlayer clears Bad Omen after the effects clear and before the durable save', () => {
    inOrder(methodBody('private respawnPlayer(): void'), [
      'this.playerEffects.clear();',
      'this.badOmen = createBadOmen();',
      'this.badOmenRemainingSeconds = 0;',
      'this.savePlayerStateDurable();',
    ]);
    expect(src).not.toMatch(/Bad Omen is retained on death/);
  });

  it('every death routes through respawnPlayer', () => {
    const body = methodBody('private onSurvivalEvent(event: SurvivalEvent, amount?: number, reason?: string): void');
    inOrder(body, ["event === 'death'", 'forceRaidDefeat(this.raidState)', 'this.respawnPlayer();']);
    expect(src.match(/this\.respawnPlayer\(\);/g)).toHaveLength(1);
  });
});
