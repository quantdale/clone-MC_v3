import { CONFIG } from '../config';
import { Player } from './Player';

export interface SurvivalSnapshot {
  version: 1;
  health: number;
  hunger: number;
  saturation: number;
}

export type SurvivalEvent = 'damage' | 'heal' | 'hunger' | 'death';

/**
 * Lightweight survival rules: health, hunger, fall damage, drowning, and
 * natural regeneration. It is intentionally independent of rendering so the
 * same rules can be exercised in unit tests and later extended with mobs.
 */
export class SurvivalSystem {
  health = 20;
  hunger = 20;
  saturation = 5;

  private hungerClock = 0;
  private regenClock = 0;
  private drowningClock = 0;
  private lavaClock = 0;
  private invulnerability = 0;
  private dead = false;

  constructor(private readonly onEvent?: (event: SurvivalEvent, amount?: number) => void) {}

  update(
    dt: number,
    player: Player,
    options: { sprinting: boolean; headSubmerged: boolean; inLava: boolean; landingDistance: number },
  ): void {
    if (this.dead) return;
    const d = Math.max(0, Math.min(dt, CONFIG.maxDeltaTime));
    this.invulnerability = Math.max(0, this.invulnerability - d);

    if (options.landingDistance > 3) {
      this.damage(Math.ceil((options.landingDistance - 3) * 1.5), 'fall');
    }

    if (options.headSubmerged) {
      this.drowningClock += d;
      if (this.drowningClock >= 1.5) {
        this.drowningClock = 0;
        this.damage(2, 'drowning');
      }
    } else {
      this.drowningClock = 0;
    }

    if (options.inLava) {
      this.lavaClock += d;
      if (this.lavaClock >= 0.7) {
        this.lavaClock = 0;
        this.damage(4, 'lava');
      }
    } else {
      this.lavaClock = 0;
    }

    this.hungerClock += d * (options.sprinting ? 0.22 : 0.035);
    while (this.hungerClock >= 1) {
      this.hungerClock -= 1;
      if (this.saturation > 0) {
        this.saturation = Math.max(0, this.saturation - 1);
      } else if (this.hunger > 0) {
        this.hunger = Math.max(0, this.hunger - 1);
        this.onEvent?.('hunger', 1);
      } else {
        this.damage(1, 'starvation');
      }
    }

    if (this.hunger >= 18 && this.health < 20) {
      this.regenClock += d;
      if (this.regenClock >= 4 && this.saturation >= 1) {
        this.regenClock = 0;
        this.saturation = Math.max(0, this.saturation - 1);
        this.heal(1);
      }
    } else {
      this.regenClock = 0;
    }

    // Prevent a dead player's velocity from carrying them through the world
    // before the composition root performs its respawn transition.
    if (this.dead) {
      player.velocity.set(0, 0, 0);
    }
  }

  damage(amount: number, _reason = 'damage'): void {
    if (this.dead || this.invulnerability > 0) return;
    const applied = Math.max(0, Math.ceil(amount));
    if (applied === 0) return;
    this.health = Math.max(0, this.health - applied);
    this.invulnerability = 0.55;
    this.onEvent?.('damage', applied);
    if (this.health <= 0) {
      this.dead = true;
      this.onEvent?.('death');
    }
  }

  heal(amount: number): void {
    const applied = Math.max(0, Math.min(20 - this.health, Math.ceil(amount)));
    if (applied === 0) return;
    this.health += applied;
    this.onEvent?.('heal', applied);
  }

  eat(food: { hunger: number; saturation: number }): boolean {
    if (this.hunger >= 20) return false;
    this.hunger = Math.min(20, this.hunger + Math.max(0, food.hunger));
    this.saturation = Math.min(20, this.saturation + Math.max(0, food.saturation));
    return true;
  }

  consumeDeath(): boolean {
    if (!this.dead) return false;
    this.dead = false;
    this.health = 20;
    this.hunger = 20;
    this.saturation = 5;
    this.hungerClock = 0;
    this.regenClock = 0;
    this.drowningClock = 0;
    this.lavaClock = 0;
    this.invulnerability = 1;
    return true;
  }

  snapshot(): SurvivalSnapshot {
    return { version: 1, health: this.health, hunger: this.hunger, saturation: this.saturation };
  }

  restore(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<SurvivalSnapshot>;
    if (
      candidate.version !== 1 ||
      typeof candidate.health !== 'number' ||
      typeof candidate.hunger !== 'number' ||
      typeof candidate.saturation !== 'number' ||
      !Number.isFinite(candidate.health) ||
      !Number.isFinite(candidate.hunger) ||
      !Number.isFinite(candidate.saturation)
    ) {
      return false;
    }
    this.health = Math.max(0, Math.min(20, candidate.health));
    this.hunger = Math.max(0, Math.min(20, candidate.hunger));
    this.saturation = Math.max(0, Math.min(20, candidate.saturation));
    this.dead = this.health <= 0;
    return true;
  }
}
