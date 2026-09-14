/**
 * Change 276: project live wither boss bars through BossFramework snapshots + HudParity.
 * SPAWNING uses charge-aware {@link bossBarProgress}; ACTIVE/DEFEATED use snapshot progress.
 */
import { bossBarSnapshot, type BossDefinition } from '../simulation/BossFramework';
import { bossBarProgress, type WitherState } from '../simulation/WitherBoss';
import { projectHud, type HudBossBar, type HudBossBarView, type HudInputs } from './HudParity';

const HUD_BASE: Omit<HudInputs, 'bossBars'> = {
  health: 20,
  maxHealth: 20,
  hunger: 20,
  saturation: 0,
  armorPoints: 0,
  airLevel: 300,
  maxAir: 300,
  experienceLevel: 0,
  experienceProgress: 0,
  statusEffects: [],
  selectedSlot: 0,
};

/** Map live withers to HudParity boss-bar inputs (BossFramework color/name identity). */
export function witherBossBarInputs(
  withers: readonly WitherState[],
  definition: BossDefinition,
): HudBossBar[] {
  return withers
    .filter((w) => w.bossState.status !== 'DEFEATED')
    .map((w) => {
    const snap = bossBarSnapshot(w.bossState, definition);
    const progress =
      w.bossState.status === 'SPAWNING' ? bossBarProgress(w) : snap.progress;
    return {
      id: `wither-${w.id}`,
      progress,
      color: snap.color,
    };
  });
}

/** Project wither boss bars through {@link projectHud} (clamped views). */
export function projectWitherBossBars(
  withers: readonly WitherState[],
  definition: BossDefinition,
): readonly HudBossBarView[] {
  return projectHud({
    ...HUD_BASE,
    bossBars: witherBossBarInputs(withers, definition),
  }).bossBars;
}
