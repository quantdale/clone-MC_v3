/**
 * Game-side raid wave controller (284): applies `RaidStateMachine` spawn
 * rosters through an injectable {@link RaidEntityBackend} with generation
 * tracking, per-wave duplicate guards, all-or-nothing rollback, and
 * exactly-once death consumption. Never throws across the fixed-tick path.
 *
 * Pure of Game/DOM; Game owns one instance and feeds it `tickRaid` spawn
 * events + death/removal chokes. `RaidStateMachine` remains the sole mutator
 * of `RaidState` counters — this controller only reports whether a death
 * should be recorded.
 */
import type { RaidWaveEntry, RaidState } from './RaidStateMachine';
import { planRaidWaveSpawn, type RaidPlanSkip } from './RaidWaveSpawnPlan';
import type { RaidEntityBackend, RaidEntityHandle } from './RaidEntityBackend';

/** Why tracked wave entities are being cleared. */
export type RaidWaveClearReason = 'wave' | 'terminal' | 'clear' | 'dispose' | 'replace';

/** Structured result of one wave-apply attempt (never thrown). */
export interface RaidWaveApplyResult {
  readonly applied: boolean;
  readonly spawned: number;
  readonly skipped: readonly RaidPlanSkip[];
  readonly rolledBack: boolean;
  readonly error?: string;
}

/** Construction options for {@link RaidWaveController}. */
export interface RaidWaveControllerOptions {
  readonly backend: RaidEntityBackend;
  /** Registry key resolver; false means the typeKey is unknown (fail-closed plan). */
  readonly resolveType: (typeKey: string) => boolean;
  /** Initial raid generation (default 0). */
  readonly generation?: number;
}

/**
 * One generation's wave-entity tracking. `beginGeneration` bumps the token so
 * stale death/despawn callbacks from a prior raid cannot affect the new one.
 */
export class RaidWaveController {
  private readonly backend: RaidEntityBackend;
  private readonly resolveType: (typeKey: string) => boolean;
  private generation: number;
  private readonly tracked = new Map<number, RaidEntityHandle>();
  private readonly appliedWaves = new Set<number>();
  private readonly consumedDeaths = new Set<number>();
  private lastApply: RaidWaveApplyResult | null = null;

  constructor(opts: RaidWaveControllerOptions) {
    this.backend = opts.backend;
    this.resolveType = opts.resolveType;
    this.generation = opts.generation ?? 0;
  }

  /** Current raid generation token. */
  getRaidGeneration(): number {
    return this.generation;
  }

  /** Read-only snapshot of currently tracked wave entity ids. */
  getRaidWaveEntityIds(): readonly number[] {
    return [...this.tracked.keys()];
  }

  /** Last wave-apply result (null before the first attempt). */
  getLastRaidWaveApplyResult(): RaidWaveApplyResult | null {
    return this.lastApply;
  }

  /**
   * Bump the generation and clear all tracking/applied/consumed sets after
   * despawning every tracked handle. Used on raid start/replacement.
   */
  beginGeneration(): number {
    this.clearTracked();
    this.generation += 1;
    this.appliedWaves.clear();
    this.consumedDeaths.clear();
    this.lastApply = null;
    return this.generation;
  }

  /**
   * Despawn and clear every tracked handle for the active generation.
   * Idempotent: empty tracking is a no-op. Dispose/replace also bump the
   * generation and reset wave/death sets so stale callbacks cannot fire.
   */
  clear(reason: RaidWaveClearReason): void {
    this.clearTracked();
    if (reason === 'dispose' || reason === 'replace') {
      this.generation += 1;
      this.appliedWaves.clear();
      this.consumedDeaths.clear();
      this.lastApply = null;
    }
  }

  /**
   * Apply one wave spawn event at most once per `(generation, waveIndex)`.
   * Duplicate applies are identity no-ops. Plan failure or backend throw
   * rolls back partial spawns (all-or-nothing) and never throws. The wave is
   * marked applied even on failure so the same roster event is not auto-retried.
   */
  applyWave(
    state: RaidState,
    roster: readonly RaidWaveEntry[],
    raidGeneration = this.generation,
  ): RaidWaveApplyResult {
    if (raidGeneration !== this.generation) {
      return this.finish({ applied: false, spawned: 0, skipped: [], rolledBack: false, error: 'STALE_GENERATION' });
    }
    const waveIndex = state.waveIndex;
    if (this.appliedWaves.has(waveIndex)) {
      return this.finish({ applied: false, spawned: 0, skipped: [], rolledBack: false, error: 'DUPLICATE_WAVE' });
    }
    if (roster.length === 0) {
      return this.finish({ applied: false, spawned: 0, skipped: [], rolledBack: false });
    }

    // Prior-wave leftovers of the same generation (normally empty when counts align).
    this.clearTracked();

    const plan = planRaidWaveSpawn(
      { x: state.centerX, y: state.centerY, z: state.centerZ },
      waveIndex,
      roster,
      this.resolveType,
    );
    if (!plan.ok || plan.placements.length === 0) {
      this.appliedWaves.add(waveIndex);
      return this.finish({
        applied: false,
        spawned: 0,
        skipped: plan.skipped,
        rolledBack: false,
        error: plan.skipped.length > 0 ? 'PLAN_SKIPPED' : 'PLAN_EMPTY',
      });
    }

    const spawnedThisAttempt: RaidEntityHandle[] = [];
    try {
      for (const placement of plan.placements) {
        const handle = this.backend.spawn({
          typeKey: placement.typeKey,
          x: placement.x,
          y: placement.y,
          z: placement.z,
          yaw: placement.yaw,
          waveIndex,
          raidGeneration: this.generation,
        });
        spawnedThisAttempt.push(handle);
        this.tracked.set(handle.entityId, handle);
      }
      this.appliedWaves.add(waveIndex);
      return this.finish({
        applied: true,
        spawned: spawnedThisAttempt.length,
        skipped: [],
        rolledBack: false,
      });
    } catch (err) {
      for (const handle of spawnedThisAttempt) {
        this.tracked.delete(handle.entityId);
        try {
          this.backend.despawn(handle);
        } catch {
          // Rollback despawn must not mask the original failure.
        }
      }
      this.appliedWaves.add(waveIndex);
      return this.finish({
        applied: false,
        spawned: 0,
        skipped: plan.skipped,
        rolledBack: true,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Consume one death for a tracked entity of the current generation.
   * Returns true exactly once per `(generation, entityId)` so the caller can
   * invoke `recordRaiderDeath`. Unknown ids, already-consumed ids, and stale
   * generations are identity no-ops returning false.
   */
  consumeDeath(entityId: number, raidGeneration = this.generation): boolean {
    if (raidGeneration !== this.generation) return false;
    const handle = this.tracked.get(entityId);
    if (!handle) return false;
    if (handle.raidGeneration !== this.generation) return false;
    if (this.consumedDeaths.has(entityId)) return false;
    this.consumedDeaths.add(entityId);
    this.tracked.delete(entityId);
    return true;
  }

  private clearTracked(): void {
    if (this.tracked.size === 0) return;
    for (const handle of this.tracked.values()) {
      try {
        this.backend.despawn(handle);
      } catch {
        // Idempotent despawn; a backend throw must not break clear/dispose.
      }
    }
    this.tracked.clear();
  }

  private finish(result: RaidWaveApplyResult): RaidWaveApplyResult {
    this.lastApply = result;
    return result;
  }
}
