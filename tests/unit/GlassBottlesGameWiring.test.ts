import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Game wiring source guards (298): the held-item use dispatcher order, the
 * fixed-tick drink step, mainhand-over-shield priority, durable saves on the
 * new inventory mutations, creative/bottle handling and the respawn reset.
 * Behaviour is covered end to end by tests/e2e/glass-bottles-drinkable-potions.spec.ts.
 */

const src = readFileSync(resolve(__dirname, '../../src/engine/Game.ts'), 'utf8');

function body(name: string): string {
  const start = src.indexOf(`  ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = src.indexOf('\n  }\n', start);
  return src.slice(start, next);
}

describe('Game wiring (298)', () => {
  it('right-click use dispatches fill → drink → splash throw', () => {
    expect(src).toContain('onUseItem: () => this.useSelectedItem(),');
    expect(src).not.toContain('onUseItem: () => this.tryThrowSelectedSplashPotion(),');
    expect(body('private useSelectedItem')).toContain(
      'return this.tryFillSelectedBottle() || this.tryStartDrinkingSelected() || this.tryThrowSelectedSplashPotion();',
    );
  });

  it('the drink step runs once per fixed tick right after interaction', () => {
    expect(src).toMatch(/this\.interaction\.update\(dt\);\n(?:\s*\/\/[^\n]*\n)*\s*this\.tickDrinking\(\);/);
    expect(src.match(/this\.tickDrinking\(\)/g)).toHaveLength(1);
  });

  it('a drinkable mainhand potion (or an active drink) owns right-click over the shield', () => {
    expect(body('private updateShieldRaised')).toContain('!this.mainhandDrinkOwnsUse()');
    const owns = body('private mainhandDrinkOwnsUse');
    expect(owns).toContain('if (this.drinkState) return true;');
    expect(owns).toContain('isDrinkablePotion(');
  });

  it('fill uses the fluid raycast at reach and saves durably', () => {
    const fill = body('tryFillSelectedBottle');
    expect(fill).toContain('fluidRaycast(');
    expect(fill).toContain('CONFIG.reach');
    expect(fill).toContain('depletesItems: depletesItems(this.gameMode.mode)');
    expect(fill).toContain('this.insertBrewingStackPreservingComponents(water)');
    expect(fill).toContain('this.savePlayerStateDurable();');
  });

  it('drink completion applies effects, returns a bottle only when depleting, saves durably', () => {
    const finish = body('private finishDrinking');
    expect(finish).toContain('resolveDrinkOutcome(contents, depletesItems(this.gameMode.mode))');
    expect(finish).toContain('this.playerEffects.add(id, effect.durationSeconds, effect.amplifier)');
    expect(finish).toContain("this.hurtPlayer(outcome.damage, 'magic')");
    expect(finish).toContain('this.survival.heal(outcome.heal)');
    expect(finish).toContain('if (outcome.consumePotion) {');
    expect(finish).toContain("getByKey('glass_bottle')");
    expect(finish).toContain('this.savePlayerStateDurable();');
  });

  it('drink ticks check real held input and pointer lock; a death clears the drink', () => {
    const tick = body('private tickDrinking');
    expect(tick).toContain('useHeld: this.input.isUseHeld()');
    expect(tick).toContain('inputAvailable: this.pointerLocked && this.shieldInteractionAvailable()');
    expect(body('private respawnPlayer')).toContain('this.drinkState = null;');
  });

  it('the awkward-bottle seam stays test-only and documents the survival path', () => {
    const i = src.indexOf('testGrantAwkwardBottle(): number');
    const doc = src.slice(src.lastIndexOf('/**', i), i);
    expect(doc).toContain('Test-only');
    expect(doc).toContain('filling a glass bottle at water');
    expect(doc).not.toContain('water\n   * bottles / creative menu are future work');
  });
});
