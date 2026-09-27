import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultAttributeRegistry } from '../../src/data/AttributeRegistry';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createPotionContents, type PotionContents } from '../../src/data/PotionItemData';
import { createResourceId, tryParseResourceId } from '../../src/data/ResourceId';
import { createDefaultStatusEffectRegistry } from '../../src/data/StatusEffect';
import { StatusEffectManager } from '../../src/data/StatusEffectManager';
import { EntityManager } from '../../src/simulation/EntityManager';
import { depletesItems, type GameMode } from '../../src/simulation/GameModeFramework';
import { PLAYER_SENTINEL_ID } from '../../src/simulation/HostileMobBaseline';
import { RaiderCombatSystem, type WitchPotionThrow } from '../../src/simulation/RaiderCombatBehavior';
import {
  SplashPotionSystem,
  playerPotionSpawn,
  playerPotionThrowVelocity,
  splashThrowDecision,
  type SplashShatter,
  type SplashTarget,
} from '../../src/simulation/SplashPotion';
import { canInteract } from '../../src/simulation/SpectatorFramework';
import { CollisionResolver, type ShapeWorld } from '../../src/world/CollisionResolver';
import { VoxelShape } from '../../src/world/VoxelShape';

/**
 * Owner composition for 295: a harness that wires the real SplashPotionSystem,
 * RaiderCombatSystem (witch sink), StatusEffectManager and game-mode rules the
 * same way Game does (throw → consume rule → fixed-tick step → shatter apply),
 * plus source guards pinning the Game wiring.
 */

const floorWorld: ShapeWorld = {
  getCollisionShape: (_x: number, y: number) => (y < 64 ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY),
};
const resolver = new CollisionResolver();
const DIM = createResourceId('minecraft', 'overworld');

function splash(key: string, duration = 45, amplifier = 0): PotionContents {
  return createPotionContents({ kind: 'SPLASH', customEffects: [{ typeId: `minecraft:effect/${key}`, duration, amplifier }] });
}

class Harness {
  readonly registry = createDefaultEntityRegistry();
  readonly manager = new EntityManager(this.registry);
  readonly combat = new RaiderCombatSystem({ manager: this.manager, registry: this.registry });
  readonly potions = new SplashPotionSystem();
  readonly effects = new StatusEffectManager(createDefaultStatusEffectRegistry(), createDefaultAttributeRegistry());
  mode: GameMode = 'survival';
  health = 20;
  player = { x: 0.5, y: 64, z: 0.5, yaw: 0, pitch: 0 };
  hand: { count: number; contents: PotionContents | undefined; isPotion: boolean } = { count: 0, contents: undefined, isPotion: true };
  tracked: number[] = [];
  deaths: number[] = [];
  shatters: SplashShatter[] = [];
  simTick = 0;

  spawnRaider(key: string, x: number, z: number): number {
    const def = this.registry.getByKey(key)!;
    const e = this.manager.spawn(def.id, DIM, { x, y: 64, z, yaw: 0, pitch: 0 });
    this.tracked.push(e.id);
    return e.id;
  }

  throwHeld(): boolean {
    const d = splashThrowDecision({
      canInteract: canInteract(this.mode),
      deathScreenOpen: false,
      depletesItems: depletesItems(this.mode),
      stackCount: this.hand.count,
      isPotionItem: this.hand.isPotion,
      contents: this.hand.contents,
    });
    if (!d.throw || !this.hand.contents) return false;
    const v = playerPotionThrowVelocity(this.player.yaw, this.player.pitch)!;
    const p = this.potions.spawn({ ...playerPotionSpawn(this.player.x, this.player.y, this.player.z), velocity: v, contents: this.hand.contents, thrower: 'player', owner: { kind: 'player', entityId: PLAYER_SENTINEL_ID } });
    if (!p) return false;
    if (d.consume) this.hand.count -= 1;
    return true;
  }

  targets(): SplashTarget[] {
    const out: SplashTarget[] = [];
    if (this.health > 0 && canInteract(this.mode)) out.push({ kind: 'player', entityId: PLAYER_SENTINEL_ID, ...this.player, height: 1.8 });
    for (const id of this.tracked) {
      const e = this.manager.get(id);
      if (e && e.state === 'ACTIVE') out.push({ kind: 'raid', entityId: id, x: e.transform.x, y: e.transform.y, z: e.transform.z, height: 1.95 });
    }
    return out;
  }

  stepPotions(n: number): void {
    for (let i = 0; i < n && this.potions.count > 0; i++) {
      for (const s of this.potions.tick(floorWorld, resolver, this.targets())) this.apply(s);
    }
  }

  apply(s: SplashShatter): void {
    this.shatters.push(s);
    for (const a of s.affected) {
      if (a.target.kind === 'player') {
        for (const e of a.application.effects) {
          const id = tryParseResourceId(e.typeId);
          if (!id) continue;
          try {
            this.effects.add(id, e.durationSeconds, e.amplifier);
          } catch {
            /* unregistered */
          }
        }
        this.health = Math.min(20, this.health + a.application.heal);
        if (a.application.damage > 0 && (this.mode === 'survival' || this.mode === 'adventure')) this.health -= a.application.damage;
      } else if (a.application.damage > 0) {
        this.combat.damageRaider(a.target.entityId, a.application.damage, (id) => {
          this.tracked = this.tracked.filter((t) => t !== id);
          this.deaths.push(id);
        });
      }
    }
  }

  combatTick(sink: boolean): void {
    this.combat.tick({
      dt: 0.05,
      simTick: this.simTick++,
      paused: false,
      center: { x: 0, y: 64, z: 0 },
      trackedIds: this.tracked,
      getPlayerTarget: () => ({ x: this.player.x, y: this.player.y, z: this.player.z }),
      world: floorWorld,
      resolver,
      onPlayerDamaged: (amount) => {
        this.health -= amount;
      },
      onRaiderDied: () => undefined,
      playerMeleeRequested: false,
      ...(sink
        ? {
            throwWitchPotion: (t: WitchPotionThrow) =>
              this.potions.spawn({ x: t.x, y: t.y, z: t.z, velocity: { vx: t.vx, vy: t.vy, vz: t.vz }, contents: t.contents, thrower: 'witch', owner: { kind: 'raid', entityId: t.ownerId } }) !== null,
            getPlayerPotionStatus: () => ({
              health: this.health,
              hasEffect: (k: string) => this.effects.get(createResourceId('minecraft', `effect/${k}`)) !== undefined,
            }),
          }
        : {}),
    });
  }

  effect(key: string) {
    return this.effects.get(createResourceId('minecraft', `effect/${key}`));
  }
}

describe('LiveSplashPotion composition (295)', () => {
  it('a survival throw at the feet consumes one and applies distance-scaled poison', () => {
    const h = new Harness();
    h.hand = { count: 1, contents: splash('poison', 45), isPotion: true };
    h.player.pitch = -Math.PI / 2;
    expect(h.throwHeld()).toBe(true);
    expect(h.hand.count).toBe(0);
    expect(h.throwHeld()).toBe(false); // empty hand
    h.stepPotions(40);
    const poison = h.effect('poison')!;
    expect(poison.duration).toBeGreaterThan(40);
    expect(poison.duration).toBeLessThanOrEqual(45);
    expect(h.shatters[0]!.cause).toBe('block');
  });

  it('creative keeps the potion; spectators cannot throw and are never splashed', () => {
    const h = new Harness();
    h.mode = 'creative';
    h.hand = { count: 1, contents: splash('instant_damage', 0), isPotion: true };
    h.player.pitch = -Math.PI / 2;
    expect(h.throwHeld()).toBe(true);
    expect(h.hand.count).toBe(1);
    h.stepPotions(40);
    expect(h.health).toBe(20); // creative exempt from damage
    h.mode = 'spectator';
    expect(h.throwHeld()).toBe(false);
    expect(h.targets().some((t) => t.kind === 'player')).toBe(false);
  });

  it('a healing splash heals, a regular potion is not throwable', () => {
    const h = new Harness();
    h.health = 10;
    h.hand = { count: 1, contents: splash('instant_health', 0, 1), isPotion: true };
    h.player.pitch = -Math.PI / 2;
    expect(h.throwHeld()).toBe(true);
    h.stepPotions(40);
    expect(h.health).toBeGreaterThan(15);
    h.hand = { count: 1, contents: createPotionContents({ customEffects: [{ typeId: 'minecraft:effect/speed', duration: 10, amplifier: 0 }] }), isPotion: true };
    expect(h.throwHeld()).toBe(false);
  });

  it('player harming kills a raid raider through the exactly-once death path', () => {
    const h = new Harness();
    const id = h.spawnRaider('pillager', 0.5, -2.5);
    h.combat.damageRaider(id, 20, () => undefined); // pillager 24 hp → 4 left
    h.hand = { count: 1, contents: splash('instant_damage', 0), isPotion: true };
    h.player.pitch = 0; // yaw 0 faces −Z toward the pillager
    expect(h.throwHeld()).toBe(true);
    h.stepPotions(60);
    expect(h.deaths).toEqual([id]);
    expect(h.manager.get(id)?.state).toBe('REMOVED');
    const hit = h.shatters[0]!.affected.find((a) => a.target.kind === 'raid')!;
    expect(hit.application.damage).toBeGreaterThanOrEqual(4);
  });

  it('a raid witch throws poison at a close healthy player through the sink; no fixed damage', () => {
    const h = new Harness();
    const witch = h.spawnRaider('witch', 5.5, 0.5);
    h.combatTick(true);
    expect(h.potions.count).toBe(1);
    expect(h.potions.getPotions()[0]!.thrower).toBe('witch');
    expect(h.health).toBe(20);
    h.stepPotions(60);
    const s = h.shatters[0]!;
    expect(s.thrower).toBe('witch');
    expect(s.affected.map((a) => a.target.kind)).toEqual(['player']);
    expect(h.effect('poison')!.duration).toBeGreaterThan(1);
    expect(h.manager.get(witch)?.state).toBe('ACTIVE');
    // Without a sink the witch never attacks (fallback retired).
    const h2 = new Harness();
    h2.spawnRaider('witch', 3.5, 0.5);
    for (let i = 0; i < 100; i++) h2.combatTick(false);
    expect(h2.health).toBe(20);
    expect(h2.potions.count).toBe(0);
  });
});

describe('Game splash potion source guards (295)', () => {
  const game = readFileSync(resolve(__dirname, '../../src/engine/Game.ts'), 'utf8');
  const interaction = readFileSync(resolve(__dirname, '../../src/player/PlayerInteraction.ts'), 'utf8');
  const combat = readFileSync(resolve(__dirname, '../../src/simulation/RaiderCombatBehavior.ts'), 'utf8');

  it('the 288 witch fallback is gone', () => {
    for (const src of [game, combat]) expect(src).not.toMatch(/WITCH_RANGED_FALLBACK_DAMAGE/);
    expect(combat).toMatch(/typeKey === 'witch' \? 0 :/);
  });

  it('tick 5.10 steps potions after the raid and patrol ticks', () => {
    const raid = game.indexOf('    this.tickRaidFeedback();\n    // 5.8');
    const patrol = game.indexOf('    this.tickPillagerPatrol();\n    // 5.10');
    const potions = game.indexOf('    this.tickSplashPotions();\n\n    // 6. Survival');
    expect(raid).toBeGreaterThan(-1);
    expect(patrol).toBeGreaterThan(raid);
    expect(potions).toBeGreaterThan(patrol);
  });

  it('raid combat hands witches the potion sink and the player status', () => {
    const body = game.slice(game.indexOf('  private tickRaiderCombat(): void {'), game.indexOf('  private spawnWitchPotion('));
    expect(body).toMatch(/throwWitchPotion: \(t\) => this\.spawnWitchPotion\(t\)/);
    expect(body).toMatch(/getPlayerPotionStatus: \(\) => \(\{/);
    expect(game).toMatch(/thrower: 'witch',\s*owner: \{ kind: 'raid', entityId: t\.ownerId \}/);
  });

  it('throw path: decision → spawn → consume only when the decision says so', () => {
    const body = game.slice(game.indexOf('  tryThrowSelectedSplashPotion(): boolean {'), game.indexOf('  private splashTargets('));
    const decide = body.indexOf('splashThrowDecision({');
    const spawn = body.indexOf('this.splashPotions.spawn({');
    const consume = body.indexOf('if (decision.consume) this.inventory.consumeSelected();');
    expect(decide).toBeGreaterThan(-1);
    expect(spawn).toBeGreaterThan(decide);
    expect(consume).toBeGreaterThan(spawn);
    expect(body).toMatch(/if \(!spawned\) return false;/);
    expect(body).toMatch(/depletesItems: depletesItems\(this\.gameMode\.mode\)/);
  });

  it('shatter application routes damage through hurtPlayer/damageRaider/damageMember', () => {
    const body = game.slice(game.indexOf('  private applySplashShatter('), game.indexOf('  testGrantSplashPotion('));
    expect(body).toMatch(/this\.hurtPlayer\(application\.damage, 'magic'\)/);
    expect(body).toMatch(/this\.survival\.heal\(application\.heal\)/);
    expect(body).toMatch(/this\.playerEffects\.add\(id, effect\.durationSeconds, effect\.amplifier\)/);
    expect(body).toMatch(/this\.raiderCombat\.damageRaider\(target\.entityId, application\.damage,[\s\S]*this\.onRaidEntityRemoved\(id\)/);
    expect(body).toMatch(/this\.pillagerPatrol\.damageMember\(target\.entityId, application\.damage/);
  });

  it('in-flight potions are cleared on dispose and pagehide (transient)', () => {
    expect(game.match(/this\.splashPotions\.clear\(\);/g)?.length).toBe(2);
  });

  it('PlayerInteraction offers item use in the air and before placement, after container uses', () => {
    const code = interaction.replace(/\r\n/g, '\n');
    const bone = code.indexOf('selectedId === ItemId.BoneMeal');
    const use = code.indexOf('} else if (this.onUseItem?.()) {');
    const place = code.indexOf('} else if (this.placeBlock()) {');
    expect(bone).toBeGreaterThan(-1);
    expect(use).toBeGreaterThan(bone);
    expect(place).toBeGreaterThan(use);
    expect(code.lastIndexOf('} else if (this.onUseItem?.()) {')).toBeGreaterThan(place);
  });
});
