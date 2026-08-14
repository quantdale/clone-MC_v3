/**
 * Spatial distinction between the rendering radius (how far chunk columns are loaded,
 * generated, meshed, and drawn) and the simulation/ticking radius (how far chunks are
 * actively simulated). Independent of `ChunkTicket` (031) — tickets answer *why* a
 * chunk is held; this answers *how far* around the player each radius reaches.
 * Runtime-only coordination state, not persisted.
 */
import { CONFIG } from '../config';

/** Chebyshev chunk distance between two chunk coordinates. */
export function chebyshevDistance(cx: number, cz: number, pcx: number, pcz: number): number {
  return Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
}

/**
 * Holds the two independent radii and classifies whether an arbitrary chunk falls
 * within each, relative to a player chunk coordinate. Distance is Chebyshev, matching
 * the streaming `±rd` loops in `World`.
 */
export class RenderSimulationDistance {
  constructor(
    public readonly renderDistance: number,
    public readonly simulationDistance: number,
  ) {
    if (renderDistance < 0 || simulationDistance < 0) {
      throw new Error(
        `Radii must be non-negative: renderDistance=${renderDistance}, simulationDistance=${simulationDistance}`,
      );
    }
  }

  /** True when chunk (cx,cz) is within `renderDistance` of (pcx,pcz). */
  isWithinRenderDistance(cx: number, cz: number, pcx: number, pcz: number): boolean {
    return chebyshevDistance(cx, cz, pcx, pcz) <= this.renderDistance;
  }

  /** True when chunk (cx,cz) is within `simulationDistance` of (pcx,pcz). */
  isWithinSimulationDistance(cx: number, cz: number, pcx: number, pcz: number): boolean {
    return chebyshevDistance(cx, cz, pcx, pcz) <= this.simulationDistance;
  }

  /**
   * Build from config, overriding either radius. Defaults match `CONFIG` so behavior
   * is unchanged unless a caller passes a different value.
   */
  static fromConfig(partial?: { renderDistance?: number; simulationDistance?: number }): RenderSimulationDistance {
    const renderDistance = partial?.renderDistance ?? CONFIG.renderDistance;
    const simulationDistance = partial?.simulationDistance ?? CONFIG.simulationDistance;
    return new RenderSimulationDistance(renderDistance, simulationDistance);
  }
}
