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
import { escalateRaid, resolveVillageOmenAction, type VillageOmenAction } from '../../src/simulation/RaidEscalation';
import {
  heroAmplifierFromBadOmen,
  heroDurationSeconds,
  shouldGrantHeroOfTheVillage,
} from '../../src/simulation/HeroOfTheVillage';
import {
  BAD_OMEN_DURATION_SECONDS,
  parsePlayerEffects,
  refreshBadOmenDuration,
  serializePlayerEffects,
  tickBadOmen,
} from '../../src/simulation/PlayerEffectsPersistence';
import { deserializeRaidPayload, serializeRaidPayload } from '../../src/simulation/RaidPersistence';
import { recordRaiderDeath, startRaid, tickRaid, type RaidState } from '../../src/simulation/RaidStateMachine';

/**
 * Wiring oracles for 292 player status-effect persistence: a minimal owner
 * mirroring Game's exact composition (real StatusEffectManager + 292 codec +
 * 285 BadOmenRules + 290 HOTV rules + 283 raid payload) over a JSON "disk",
 * plus Game source guards for the save points and dispose ordering. Game is
 * DOM-bound (282/285/291 precedent), so routing is covered here and in E2E.
 */

const HOTV = createResourceId('minecraft', 'effect/hero_of_the_village');

interface Disk {
  player: unknown | null; // the player-state record's effects payload
  raid: unknown | null;
}

class Owner {
  readonly registry = createDefaultStatusEffectRegistry();
  effects = new StatusEffectManager(this.registry, createDefaultAttributeRegistry());
  badOmen: BadOmenState = createBadOmen();
  badOmenRemaining = 0;
  raidState: RaidState | null = null;
  village: VillageContext | null = null;
  patrolAlive = false;
  patrolGrantCalls = 0;
  durableSaves = 0;

  constructor(readonly disk: Disk) {}

  // --- persistence (mirrors buildPlayerSnapshot / savePlayerStateDurable / saveRaid)
  savePlayerStateDurable(): void {
    this.durableSaves++;
    this.disk.player = JSON.parse(
      JSON.stringify(
        serializePlayerEffects(this.effects.serialize(), {
          level: this.badOmen.level,
          remainingSeconds: this.badOmenRemaining,
        }),
      ),
    );
  }
  saveRaid(): void {
    this.disk.raid = this.raidState ? JSON.parse(JSON.stringify(serializeRaidPayload(this.raidState))) : null;
  }
  /** Mirrors applyInitialPlayerState → restorePlayerEffects + 283 raid hydrate. */
  static load(disk: Disk): Owner {
    const g = new Owner(disk);
    const parsed = parsePlayerEffects(disk.player ?? undefined, g.registry);
    g.effects.deserialize(parsed.effects);
    g.badOmen = createBadOmen(parsed.badOmen.level);
    g.badOmenRemaining = g.badOmen.level > 0 ? parsed.badOmen.remainingSeconds : 0;
    g.raidState = deserializeRaidPayload(disk.raid ?? undefined);
    return g;
  }

  // --- omen (mirrors Game.grantBadOmen / clearBadOmen / tickBadOmenDuration)
  grantBadOmen(amount?: number): void {
    const add = amount === undefined ? 1 : amount;
    if (!Number.isFinite(add) || Math.floor(add) < 1) return;
    this.badOmen = grantBadOmen(this.badOmen, amount);
    this.badOmenRemaining = refreshBadOmenDuration(this.badOmen.level).remainingSeconds;
    this.savePlayerStateDurable();
  }
  tickBadOmenDuration(dt: number): void {
    if (this.badOmen.level <= 0) return;
    const next = tickBadOmen({ level: this.badOmen.level, remainingSeconds: this.badOmenRemaining }, dt);
    this.badOmenRemaining = next.remainingSeconds;
    if (next.level <= 0) {
      this.badOmen = clearBadOmen(this.badOmen);
      this.savePlayerStateDurable();
    }
  }

  // --- raid (mirrors startRaidAt incl. 291 patrol clear, 285 trigger, 290 grant)
  startRaidAt(v: VillageContext, omen: number): void {
    this.patrolAlive = false; // 291: raid start dismisses the patrol, grants nothing
    this.raidState = tickRaid(startRaid(v.centerX, v.centerY, v.centerZ, omen)).state;
  }
  evaluateBadOmenVillageTrigger(): VillageOmenAction {
    const decision = resolveVillageOmenAction(this.badOmen, this.village, this.raidState);
    if (decision.kind === 'ESCALATE_RAID') {
      // 294: an ACTIVE raid in the village absorbs the omen in place.
      const r = escalateRaid(this.raidState!, decision.badOmenLevel);
      if (!r.applied) return decision;
      this.patrolAlive = false;
      this.raidState = r.state;
      this.badOmen = clearBadOmen(this.badOmen);
      this.badOmenRemaining = 0;
      this.saveRaid();
      this.savePlayerStateDurable();
      return decision;
    }
    if (decision.kind !== 'START_RAID') return decision;
    this.startRaidAt(this.village!, decision.badOmenLevel);
    this.badOmen = clearBadOmen(this.badOmen);
    this.badOmenRemaining = 0;
    this.saveRaid();
    this.savePlayerStateDurable();
    return decision;
  }
  winRaid(): void {
    let state = this.raidState!;
    let guard = 0;
    while (state.status === 'ACTIVE' && guard++ < 20) {
      const prev = state.status;
      for (let i = state.raidersRemaining; i > 0; i--) state = recordRaiderDeath(state);
      state = tickRaid(state).state;
      this.raidState = state;
      this.maybeGrantHero(prev, state);
    }
  }
  maybeGrantHero(prev: RaidState['status'] | null, next: RaidState): void {
    if (!shouldGrantHeroOfTheVillage(prev, next.status)) return;
    this.effects.add(HOTV, heroDurationSeconds(), heroAmplifierFromBadOmen(next.badOmenLevel));
    this.saveRaid();
    this.savePlayerStateDurable();
  }
  /** One unpaused fixed tick: raid tick (with 290 predicate) → 285 evaluate → effects + omen tick. */
  fixedTick(dt = 1 / 20): void {
    if (this.raidState) {
      const prev = this.raidState.status;
      this.raidState = tickRaid(this.raidState).state;
      this.maybeGrantHero(prev, this.raidState);
    }
    this.evaluateBadOmenVillageTrigger();
    this.effects.tick(dt);
    this.tickBadOmenDuration(dt);
  }
  /** Mirrors onPageHide/dispose: final durable save with the live state. */
  pagehide(): void {
    this.savePlayerStateDurable();
    this.saveRaid();
    this.patrolAlive = false; // 291 patrols are transient
  }
}

const inside = (): VillageContext => ({ centerX: 8, centerY: 64, centerZ: 8, containsPlayer: true });

describe('LiveStatusEffectPersistence (292) — save → reload', () => {
  it('HOTV and Bad Omen survive pagehide + reload with resumed durations', () => {
    const disk: Disk = { player: null, raid: null };
    const a = new Owner(disk);
    a.startRaidAt(inside(), 2);
    a.winRaid();
    expect(a.raidState?.status).toBe('VICTORY');
    expect(a.effects.get(HOTV)?.amplifier).toBe(1);
    a.grantBadOmen(3);
    for (let i = 0; i < 2000; i++) a.fixedTick(); // 100 s of play
    const heroBefore = a.effects.get(HOTV)!.duration;
    const omenBefore = a.badOmenRemaining;
    expect(heroBefore).toBeCloseTo(heroDurationSeconds() - 100, 6);
    expect(omenBefore).toBeCloseTo(BAD_OMEN_DURATION_SECONDS - 100, 6);
    a.pagehide();

    const b = Owner.load(disk);
    expect(b.effects.get(HOTV)?.amplifier).toBe(1);
    expect(b.effects.get(HOTV)?.duration).toBe(heroBefore);
    expect(b.badOmen.level).toBe(3);
    expect(b.badOmenRemaining).toBe(omenBefore);
    expect(b.raidState?.status).toBe('VICTORY');
    // Hydrated VICTORY ticks never re-grant (290 predicate unchanged).
    b.fixedTick();
    expect(b.effects.get(HOTV)!.amplifier).toBe(1);
    expect(b.effects.get(HOTV)!.duration).toBeLessThan(heroBefore);
  });

  it('pre-292 disk (no effects payload) loads as no effects, omen 0', () => {
    const b = Owner.load({ player: null, raid: null });
    expect(b.effects.serialize()).toEqual([]);
    expect(b.badOmen.level).toBe(0);
    expect(b.badOmenRemaining).toBe(0);
  });

  it('omen expiry is durable: reload after expiry has no omen', () => {
    const disk: Disk = { player: null, raid: null };
    const a = new Owner(disk);
    a.grantBadOmen(2);
    a.tickBadOmenDuration(BAD_OMEN_DURATION_SECONDS - 1);
    a.pagehide();
    const b = Owner.load(disk);
    expect(b.badOmen.level).toBe(2);
    expect(b.badOmenRemaining).toBe(1);
    const saves = b.durableSaves;
    b.tickBadOmenDuration(1);
    expect(b.badOmen.level).toBe(0);
    expect(b.durableSaves).toBe(saves + 1);
    const c = Owner.load(disk);
    expect(c.badOmen.level).toBe(0);
  });

  it('valid grants refresh the duration (also at cap); invalid amounts are no-ops', () => {
    const a = new Owner({ player: null, raid: null });
    a.grantBadOmen(1);
    a.tickBadOmenDuration(5990);
    expect(a.badOmenRemaining).toBe(10);
    a.grantBadOmen(1);
    expect(a.badOmen.level).toBe(2);
    expect(a.badOmenRemaining).toBe(6000);
    a.grantBadOmen(10);
    a.tickBadOmenDuration(100);
    a.grantBadOmen(1);
    expect(a.badOmen.level).toBe(5);
    expect(a.badOmenRemaining).toBe(6000);
    const saves = a.durableSaves;
    for (const bad of [0, -1, 0.5, Number.NaN]) a.grantBadOmen(bad);
    expect(a.durableSaves).toBe(saves);
  });
});

describe('LiveStatusEffectPersistence (292) — restored omen × 285 trigger × 291 patrol', () => {
  it('restored omen inside a village starts a raid on the next tick, dismisses the patrol, consumes omen durably', () => {
    const disk: Disk = { player: null, raid: null };
    const a = new Owner(disk);
    a.grantBadOmen(1);
    a.pagehide();

    const b = Owner.load(disk);
    expect(b.badOmen.level).toBe(1);
    b.patrolAlive = true;
    b.village = inside();
    b.fixedTick();
    expect(b.raidState?.status).toBe('ACTIVE');
    expect(b.raidState?.badOmenLevel).toBe(1);
    expect(b.patrolAlive).toBe(false);
    expect(b.patrolGrantCalls).toBe(0);
    expect(b.badOmen.level).toBe(0);

    // Crash right after (no pagehide): the event save already made both durable.
    const c = Owner.load(disk);
    expect(c.badOmen.level).toBe(0);
    expect(c.raidState?.status).toBe('ACTIVE');
    // Nothing left to trigger a second raid.
    c.village = inside();
    const raidBefore = c.raidState;
    c.fixedTick();
    expect(c.evaluateBadOmenVillageTrigger()).toEqual({ kind: 'NONE', reason: 'NO_OMEN' });
    expect(c.raidState?.badOmenLevel).toBe(raidBefore?.badOmenLevel);
  });

  it('restored omen outside a village is retained across ticks and starts nothing', () => {
    const disk: Disk = { player: null, raid: null };
    const a = new Owner(disk);
    a.grantBadOmen(2);
    a.pagehide();
    const b = Owner.load(disk);
    b.village = null;
    for (let i = 0; i < 100; i++) b.fixedTick();
    expect(b.badOmen.level).toBe(2);
    expect(b.raidState).toBeNull();
    b.village = { ...inside(), containsPlayer: false };
    b.fixedTick();
    expect(b.badOmen.level).toBe(2);
    expect(b.raidState).toBeNull();
  });
});

describe('Game source guards (292)', () => {
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

  it('buildPlayerSnapshot writes the effects payload with omen level + remaining', () => {
    const body = methodBody('private buildPlayerSnapshot(): GamePlayerSnapshot');
    inOrder(body, ['effects: serializePlayerEffects(this.playerEffects.serialize()', 'this.badOmen.level', 'this.badOmenRemainingSeconds']);
  });

  it('applyInitialPlayerState restores effects after experience; restore never grants', () => {
    inOrder(methodBody('private applyInitialPlayerState(state: GamePlayerSnapshot | null): void'), [
      'this.experience.restore(state.experience);',
      'this.restorePlayerEffects(state.effects);',
    ]);
    const body = methodBody('private restorePlayerEffects(payload: unknown): void');
    expect(body).toMatch(/parsePlayerEffects\(payload, this\.statusEffectRegistry\)/);
    expect(body).not.toMatch(/maybeGrantHeroOfTheVillage|grantBadOmen|playerEffects\.add|savePlayerState/);
  });

  it('dispose resets Bad Omen only after the final durable save', () => {
    const body = methodBody('  dispose(): void {');
    inOrder(body, ['this.savePlayerStateDurable();', 'this.badOmen = createBadOmen();', 'this.badOmenRemainingSeconds = 0;']);
    const beforeSave = body.slice(0, body.indexOf('this.savePlayerStateDurable();'));
    expect(beforeSave).not.toMatch(/this\.badOmen = /);
  });

  it('pagehide still saves player state durably', () => {
    expect(methodBody('private readonly onPageHide = (): void =>')).toMatch(/this\.savePlayerStateDurable\(\);/);
  });

  it('omen consumption at raid start is saved with the raid record', () => {
    inOrder(methodBody('evaluateBadOmenVillageTrigger(): VillageOmenAction {'), [
      'this.startRaidAt(',
      'this.badOmen = clearBadOmenState(this.badOmen);',
      'this.badOmenRemainingSeconds = 0;',
      'this.saveRaid();',
      'this.savePlayerStateDurable();',
    ]);
  });

  it('HOTV grant saves the raid and player state durably', () => {
    inOrder(methodBody('private maybeGrantHeroOfTheVillage('), [
      'shouldGrantHeroOfTheVillage(prevStatus, next.status)',
      'this.playerEffects.add(',
      'this.saveRaid();',
      'this.savePlayerStateDurable();',
    ]);
  });

  it('grant/clear/expiry/respawn/debug-clear are durable save points', () => {
    inOrder(methodBody('grantBadOmen(amount?: number): void {'), ['refreshBadOmenDuration(', 'this.savePlayerStateDurable();']);
    expect(methodBody('clearBadOmen(): void {')).toMatch(/if \(changed\) this\.savePlayerStateDurable\(\);/);
    inOrder(methodBody('private tickBadOmenDuration(dt: number): void'), ['tickBadOmen(', 'this.savePlayerStateDurable();']);
    // 294: death clears Bad Omen too, inside the same durable save.
    inOrder(methodBody('private respawnPlayer(): void'), [
      'this.playerEffects.clear();',
      'this.badOmen = createBadOmen();',
      'this.badOmenRemainingSeconds = 0;',
      'this.savePlayerStateDurable();',
    ]);
    expect(methodBody('debugClearHeroOfTheVillage(): boolean')).toMatch(/if \(removed\) this\.savePlayerStateDurable\(\);/);
  });

  it('fixed tick counts the omen down beside the status-effect tick', () => {
    expect(src).toMatch(/this\.playerEffects\.tick\(dt\);\n\s*\/\/ 292[^\n]*\n\s*this\.tickBadOmenDuration\(dt\);/);
  });
});
