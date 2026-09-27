import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultAttributeRegistry } from '../../src/data/AttributeRegistry';
import { createDefaultDamageTypeRegistry } from '../../src/data/DamageType';
import { createResourceId } from '../../src/data/ResourceId';
import { createDefaultStatusEffectRegistry } from '../../src/data/StatusEffect';
import { StatusEffectManager } from '../../src/data/StatusEffectManager';
import { PlayerEquipment, EquipmentSlot } from '../../src/inventory/Equipment';
import { ItemTypeRegistry, type ItemTypeDefinition } from '../../src/inventory/ItemRegistry';
import { ArmorProtection } from '../../src/player/ArmorProtection';
import { PLAYER_MAX_HEALTH, SurvivalSystem } from '../../src/player/SurvivalSystem';
import { FixedTickDriver } from '../../src/engine/FixedTickDriver';
import { createDeathPresentation } from '../../src/simulation/DeathRespawnPresentation';
import { survivalStatsDeplete, type GameMode } from '../../src/simulation/GameModeFramework';
import { tickPeriodicStatusEffects } from '../../src/simulation/PeriodicStatusEffects';
import { parsePlayerEffects, serializePlayerEffects } from '../../src/simulation/PlayerEffectsPersistence';

/**
 * Wiring oracles for 296 periodic status effects: a minimal owner mirroring
 * Game's exact composition (real StatusEffectManager + SurvivalSystem with
 * armor + the 265 hurtPlayer mode gate + the 294 respawn that clears effects
 * + the 280 death presentation + the 044 FixedTickDriver) plus Game source
 * guards. Game is DOM-bound (282/285/291/292/295 precedent), so routing is
 * covered here and in E2E.
 */

const POISON = createResourceId('minecraft', 'effect/poison');
const REGEN = createResourceId('minecraft', 'effect/regeneration');
const WITHER = createResourceId('minecraft', 'effect/wither');
const SPEED = createResourceId('minecraft', 'effect/speed');

const itemRegistry = new ItemTypeRegistry([
  {
    id: 100,
    resourceId: createResourceId('minecraft', 'chestplate'),
    key: 'chestplate',
    name: 'Chestplate',
    iconTile: 0,
    stackSize: 1,
    defensePoints: 20,
    toughness: 8,
    maxDurability: 100,
  } satisfies ItemTypeDefinition,
]);

class Owner {
  readonly registry = createDefaultStatusEffectRegistry();
  effects = new StatusEffectManager(this.registry, createDefaultAttributeRegistry());
  mode: GameMode = 'survival';
  deaths: string[] = [];
  deathScreen: string | null = null;
  readonly equipment = new PlayerEquipment();
  readonly survival: SurvivalSystem;
  readonly driver: FixedTickDriver;

  constructor() {
    this.survival = new SurvivalSystem(createDefaultDamageTypeRegistry(), (event, _amount, reason) => {
      if (event !== 'death') return;
      // Mirrors onSurvivalEvent('death') → respawnPlayer → showDeathScreen.
      this.deaths.push(reason ?? '');
      this.survival.consumeDeath();
      this.effects.clear();
      this.deathScreen = createDeathPresentation(reason, false).causeText;
    });
    this.survival.armor = new ArmorProtection(this.equipment, itemRegistry);
    this.driver = new FixedTickDriver({ tick: () => this.runFixedTick() });
  }

  /** Mirrors Game.hurtPlayer's 265 gate (no source → no shield leg). */
  hurtPlayer(amount: number, reason: string): void {
    if (!survivalStatsDeplete(this.mode)) return;
    this.survival.damage(amount, reason);
  }

  /** Mirrors runFixedTick step 6 (status part) / debugTickPeriodicStatusEffects. */
  runFixedTick(): void {
    const dt = 1 / 20;
    if (survivalStatsDeplete(this.mode)) this.survival.tickInvulnerability(dt);
    const survival = this.survival;
    tickPeriodicStatusEffects(this.effects, {
      get health() {
        return survival.health;
      },
      maxHealth: PLAYER_MAX_HEALTH,
      damage: (amount, reason) => this.hurtPlayer(amount, reason),
      heal: (amount) => survival.heal(amount),
    });
    this.effects.tick(dt);
  }

  ticks(n: number): void {
    for (let i = 0; i < n; i++) this.runFixedTick();
  }
}

describe('LivePeriodicStatusEffects: survival composition (296)', () => {
  it('a 45 s splash-strength poison lowers health over time and stops at exactly 1 HP', () => {
    const g = new Owner();
    g.effects.add(POISON, 45, 0);
    g.ticks(100);
    expect(g.survival.health).toBe(16);
    const samples: number[] = [];
    for (let i = 0; i < 9; i++) {
      g.ticks(100);
      samples.push(g.survival.health);
    }
    g.ticks(10);
    expect(samples.every((h, i) => i === 0 || h <= samples[i - 1]!)).toBe(true);
    expect(g.survival.health).toBe(1);
    expect(g.deaths).toEqual([]);
    expect(g.effects.get(POISON)).toBeUndefined();
  });

  it('poison and wither ignore armor (magic / wither bypass, no armor wear)', () => {
    const g = new Owner();
    g.equipment.setEquipment(EquipmentSlot.Chest, { id: 100, count: 1 });
    g.effects.add(POISON, 10, 0); // 200 ticks: hits at 200, 175, ...
    g.ticks(1);
    expect(g.survival.health).toBe(19);
    g.ticks(25);
    expect(g.survival.health).toBe(18);
    g.effects.remove(POISON);
    g.ticks(20); // let the 0.55 s i-frames of the poison hit expire
    g.effects.add(WITHER, 4, 0); // 80 ticks: hits at 80, 40
    g.ticks(80);
    expect(g.survival.health).toBe(16);
    expect(g.equipment.getEquipment(EquipmentSlot.Chest)?.components).toBeUndefined();
    // 295 instant harming is magic damage too: 6 exact through heavy armor,
    // while an armor-reducible hit of the same size is mitigated.
    g.ticks(20); // i-frames long expired
    g.hurtPlayer(6, 'magic');
    expect(g.survival.health).toBe(10);
    g.ticks(20);
    g.hurtPlayer(6, 'mob');
    expect(g.survival.health).toBeGreaterThan(4);
  });

  it('regeneration heals over time and caps at max health', () => {
    const g = new Owner();
    g.survival.health = 14;
    g.effects.add(REGEN, 30, 1); // every 25 ticks
    g.ticks(1);
    expect(g.survival.health).toBe(15); // 600 % 25 = 0
    g.ticks(600);
    expect(g.survival.health).toBe(PLAYER_MAX_HEALTH);
  });

  it('wither kills: one real death, death screen "Wither", respawn at 20 with effects cleared', () => {
    const g = new Owner();
    g.survival.health = 3;
    g.effects.add(WITHER, 30, 0);
    g.effects.add(SPEED, 30, 0);
    g.ticks(81); // remaining 600, 560, 520 → 3 hits
    expect(g.deaths).toEqual(['wither']);
    expect(g.deathScreen).toBe('Wither');
    expect(g.survival.health).toBe(20);
    expect(g.effects.getAll()).toHaveLength(0);
    g.ticks(200);
    expect(g.deaths).toHaveLength(1);
    expect(g.survival.health).toBe(20);
  });

  it('poison can never kill even stacked with 1-HP starts', () => {
    const g = new Owner();
    g.survival.health = 1;
    g.effects.add(POISON, 60, 4); // every tick
    g.ticks(1200);
    expect(g.survival.health).toBe(1);
    expect(g.deaths).toEqual([]);
  });

  it('creative and spectator take no periodic damage; durations still count down; regen still heals', () => {
    for (const mode of ['creative', 'spectator'] as GameMode[]) {
      const g = new Owner();
      g.mode = mode;
      g.effects.add(POISON, 5, 2);
      g.effects.add(WITHER, 5, 2);
      g.ticks(60);
      expect(g.survival.health).toBe(20);
      expect(g.effects.get(POISON)!.duration).toBeCloseTo(2, 5);
      g.survival.health = 10;
      g.effects.add(REGEN, 5, 0);
      g.ticks(1);
      expect(g.survival.health).toBe(11);
    }
  });

  it('adventure mode takes periodic damage like survival', () => {
    const g = new Owner();
    g.mode = 'adventure';
    g.effects.add(WITHER, 2, 0);
    g.ticks(1);
    expect(g.survival.health).toBe(19);
  });

  it('pause: a paused FixedTickDriver runs no ticks, so nothing is applied or counted down', () => {
    const g = new Owner();
    g.effects.add(POISON, 45, 0);
    g.driver.advance(0.001); // anchor
    g.driver.pause();
    for (let i = 0; i < 100; i++) g.driver.advance(0.1);
    expect(g.survival.health).toBe(20);
    expect(g.effects.get(POISON)!.duration).toBe(45);
    g.driver.resume();
    g.driver.advance(0.05);
    g.driver.advance(0.05);
    expect(g.survival.health).toBe(19);
  });

  it('reload: 292-persisted effects continue on the same cadence', () => {
    const straight = new Owner();
    straight.effects.add(POISON, 45, 1);
    straight.ticks(137);
    const reloaded = new Owner();
    reloaded.effects.add(POISON, 45, 1);
    reloaded.ticks(137);
    const disk = JSON.parse(
      JSON.stringify(serializePlayerEffects(reloaded.effects.serialize(), { level: 0, remainingSeconds: 0 })),
    );
    const fresh = new Owner();
    fresh.survival.health = reloaded.survival.health;
    fresh.effects.deserialize(parsePlayerEffects(disk, fresh.registry).effects);
    const logA: number[] = [];
    const logB: number[] = [];
    for (let i = 0; i < 400; i++) {
      straight.runFixedTick();
      fresh.runFixedTick();
      logA.push(straight.survival.health);
      logB.push(fresh.survival.health);
    }
    expect(logB).toEqual(logA);
    expect(logA[0]).toBeGreaterThan(logA[399]!);
  });
});

describe('LivePeriodicStatusEffects: Game source guards (296)', () => {
  const src = readFileSync(resolve(__dirname, '../../src/engine/Game.ts'), 'utf8');
  const body = (name: string): string => {
    const start = src.indexOf(`  ${name}(`);
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf('\n  }\n', start);
    return src.slice(start, end);
  };

  it('runs the pass in runFixedTick step 6 before the duration count-down', () => {
    const tick = body('private runFixedTick');
    const pass = tick.indexOf('this.tickPeriodicStatusEffects();');
    const countDown = tick.indexOf('this.playerEffects.tick(dt);');
    const survival = tick.indexOf('this.survival.update(dt');
    expect(pass).toBeGreaterThan(0);
    expect(countDown).toBeGreaterThan(pass);
    expect(pass).toBeGreaterThan(survival);
    expect(src.match(/this\.tickPeriodicStatusEffects\(\);/g)).toHaveLength(2); // fixed tick + seam
  });

  it('routes damage through hurtPlayer and healing through survival.heal with the max-health cap', () => {
    const pass = body('private tickPeriodicStatusEffects');
    expect(pass).toMatch(/damage: \(amount, reason\) => this\.hurtPlayer\(amount, reason\)/);
    expect(pass).toMatch(/heal: \(amount\) => survival\.heal\(amount\)/);
    expect(pass).toMatch(/maxHealth: PLAYER_MAX_HEALTH/);
    expect(body('private hurtPlayer')).toMatch(/if \(!survivalStatsDeplete\(this\.gameMode\.mode\)\) return;/);
  });

  it('retires the 252 global-tick wither-effect stand-in', () => {
    expect(src).not.toMatch(/WITHER_EFFECT_PERIOD_TICKS/);
    expect(body('private tickWithers')).not.toMatch(/hurtPlayer\(1, 'wither'\)/);
  });

  it('the status-only seam mirrors step 6 ordering and caps its work', () => {
    const seam = body('debugTickPeriodicStatusEffects');
    expect(seam).toMatch(/Math\.min\(20_000/);
    const iframes = seam.indexOf('this.survival.tickInvulnerability(dt)');
    const pass = seam.indexOf('this.tickPeriodicStatusEffects();');
    const countDown = seam.indexOf('this.playerEffects.tick(dt);');
    expect(iframes).toBeGreaterThan(0);
    expect(pass).toBeGreaterThan(iframes);
    expect(countDown).toBeGreaterThan(pass);
  });
});
