/**
 * HUD parity (205): the pure HUD projection. `projectHud(inputs)` maps a snapshot of the player
 * systems (health, hunger, armor, air, XP, status effects, selection, boss bars) into the exact
 * icon states the HUD draws. Total, clamping, and headless-safe: no DOM access, no mutation of
 * inputs, no throws.
 *
 * Conventions (vanilla-inspired):
 * - Hearts/hunger/armor use half icons: `full = floor(v/2)`, `half` on odd values; clamped to
 *   their maxima.
 * - Air shows 10 bubbles at full air (`ceil(air / maxAir * 10)`, clamped to [0, 10]).
 * - Effects blink when `durationTicks < 200` (the ~10-second warning window at 20 tps);
 *   `remainingFraction = clamp(durationTicks / 600, 0, 1)`.
 * - The selected hotbar slot clamps to [0, 8]; boss-bar progress clamps to [0, 1].
 */
export interface HudStatusEffect {
  readonly id: string;
  readonly amplifier: number;
  readonly durationTicks: number;
}

export interface HudBossBar {
  readonly id: string;
  readonly progress: number;
  readonly color: string;
}

/** A plain snapshot of the player systems (the wiring collects it each frame). */
export interface HudInputs {
  readonly health: number;
  readonly maxHealth: number;
  readonly hunger: number;
  readonly saturation: number;
  readonly armorPoints: number;
  readonly airLevel: number;
  readonly maxAir: number;
  readonly experienceLevel: number;
  readonly experienceProgress: number;
  readonly statusEffects: readonly HudStatusEffect[];
  readonly selectedSlot: number;
  readonly bossBars: readonly HudBossBar[];
}

/** Whole/half icon counts (1 hp = half an icon). */
export interface HudBars {
  readonly full: number;
  readonly half: boolean;
}

export interface HudEffectView {
  readonly id: string;
  readonly amplifier: number;
  readonly durationTicks: number;
  readonly remainingFraction: number;
  readonly blinking: boolean;
}

export interface HudBossBarView {
  readonly id: string;
  readonly progress: number;
  readonly color: string;
}

/** The projected HUD state the renderer draws. */
export interface HudState {
  readonly hearts: HudBars;
  readonly hunger: HudBars;
  readonly armor: HudBars;
  readonly airBubbles: number;
  readonly experience: { readonly level: number; readonly progress: number };
  readonly effects: readonly HudEffectView[];
  readonly selectedSlot: number;
  readonly bossBars: readonly HudBossBarView[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function bars(value: number, max: number): HudBars {
  const clamped = clamp(value, 0, max);
  return { full: Math.floor(clamped / 2), half: clamped % 2 === 1 };
}

/**
 * Project a player snapshot into HUD icon states. A total function: every input is clamped,
 * never thrown on.
 */
export function projectHud(inputs: HudInputs): HudState {
  const airBubbles =
    inputs.maxAir <= 0
      ? 0
      : clamp(Math.ceil((clamp(inputs.airLevel, 0, inputs.maxAir) / inputs.maxAir) * 10), 0, 10);

  const effects: HudEffectView[] = inputs.statusEffects.map((effect) => ({
    id: effect.id,
    amplifier: effect.amplifier,
    durationTicks: effect.durationTicks,
    remainingFraction: clamp(effect.durationTicks / 600, 0, 1),
    blinking: effect.durationTicks < 200,
  }));

  const bossBars: HudBossBarView[] = inputs.bossBars.map((bar) => ({
    id: bar.id,
    progress: clamp(bar.progress, 0, 1),
    color: bar.color,
  }));

  return {
    hearts: bars(inputs.health, inputs.maxHealth),
    hunger: bars(inputs.hunger, 20),
    armor: bars(inputs.armorPoints, 20),
    airBubbles,
    experience: {
      level: Math.max(0, Math.floor(clamp(inputs.experienceLevel, 0, Number.MAX_SAFE_INTEGER))),
      progress: clamp(inputs.experienceProgress, 0, 1),
    },
    effects,
    selectedSlot: clamp(Math.round(inputs.selectedSlot), 0, 8),
    bossBars,
  };
}
