/**
 * Pure headless block interaction networking framework (230).
 *
 * Implements server-side authoritative validation for block breaking, placing,
 * and using against player reach distance, break progress sequencing, and
 * placement legality, along with client-side block prediction reconciliation.
 * Zero DOM or external dependencies; fully deterministic and unit-testable.
 */

export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
export type BlockBreakAction = 'start' | 'cancel' | 'finish' | 'instant';

export interface BlockCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PlayerPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BlockBreakRequest {
  readonly playerId: number;
  readonly action: BlockBreakAction;
  readonly position: BlockCoord;
  readonly face: Direction;
  readonly tick: number;
}

export interface BlockPlaceRequest {
  readonly playerId: number;
  readonly position: BlockCoord;
  readonly face: Direction;
  readonly blockStateId: number;
  readonly tick: number;
}

export interface BlockUseRequest {
  readonly playerId: number;
  readonly position: BlockCoord;
  readonly face: Direction;
  readonly cursor?: { readonly x: number; readonly y: number; readonly z: number };
  readonly tick: number;
}

export type InteractionResult =
  | {
      readonly accepted: true;
      readonly action: 'break' | 'place' | 'use';
      readonly position: BlockCoord;
      readonly blockStateId: number;
      readonly broadcast: boolean;
    }
  | {
      readonly accepted: false;
      readonly action: 'break' | 'place' | 'use';
      readonly position: BlockCoord;
      readonly authoritativeStateId: number;
      readonly reason: string;
    };

export interface BlockInteractionValidatorOptions {
  /** Maximum reach distance from player position to block center (default 6.0). */
  readonly maxReachDistance?: number;
  /** Minimum ticks required between start and finish for non-instant breaks (default 0). */
  readonly minBreakTicks?: number;
}

export interface ClientRollbackDirective {
  readonly position: BlockCoord;
  readonly rollbackStateId: number;
}

const DEFAULT_MAX_REACH = 6.0;
const DEFAULT_MIN_BREAK_TICKS = 0;

export const DIRECTION_OFFSETS: Record<Direction, { readonly dx: number; readonly dy: number; readonly dz: number }> = {
  up: { dx: 0, dy: 1, dz: 0 },
  down: { dx: 0, dy: -1, dz: 0 },
  north: { dx: 0, dy: 0, dz: -1 },
  south: { dx: 0, dy: 0, dz: 1 },
  west: { dx: -1, dy: 0, dz: 0 },
  east: { dx: 1, dy: 0, dz: 0 },
};

export function offsetByFace(pos: BlockCoord, face: Direction): BlockCoord {
  const offset = DIRECTION_OFFSETS[face];
  return {
    x: pos.x + offset.dx,
    y: pos.y + offset.dy,
    z: pos.z + offset.dz,
  };
}

export function blockCoordKey(pos: BlockCoord): string {
  return `${pos.x},${pos.y},${pos.z}`;
}

function validatePlayerId(id: unknown): number {
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0) {
    throw new Error('BlockInteraction: playerId must be a non-negative safe integer');
  }
  return id;
}

function validateBlockCoord(pos: unknown): BlockCoord {
  if (
    typeof pos !== 'object' ||
    pos === null ||
    typeof (pos as BlockCoord).x !== 'number' ||
    !Number.isSafeInteger((pos as BlockCoord).x) ||
    typeof (pos as BlockCoord).y !== 'number' ||
    !Number.isSafeInteger((pos as BlockCoord).y) ||
    typeof (pos as BlockCoord).z !== 'number' ||
    !Number.isSafeInteger((pos as BlockCoord).z)
  ) {
    throw new Error('BlockInteraction: coordinates must be integers');
  }
  return {
    x: (pos as BlockCoord).x,
    y: (pos as BlockCoord).y,
    z: (pos as BlockCoord).z,
  };
}

function validatePlayerPosition(pos: unknown): PlayerPosition {
  if (
    typeof pos !== 'object' ||
    pos === null ||
    typeof (pos as PlayerPosition).x !== 'number' ||
    !Number.isFinite((pos as PlayerPosition).x) ||
    typeof (pos as PlayerPosition).y !== 'number' ||
    !Number.isFinite((pos as PlayerPosition).y) ||
    typeof (pos as PlayerPosition).z !== 'number' ||
    !Number.isFinite((pos as PlayerPosition).z)
  ) {
    throw new Error('BlockInteraction: player position must be finite numbers');
  }
  return {
    x: (pos as PlayerPosition).x,
    y: (pos as PlayerPosition).y,
    z: (pos as PlayerPosition).z,
  };
}

function validateDirection(face: unknown): Direction {
  if (
    typeof face !== 'string' ||
    (face !== 'north' && face !== 'south' && face !== 'east' && face !== 'west' && face !== 'up' && face !== 'down')
  ) {
    throw new Error('BlockInteraction: invalid face direction');
  }
  return face;
}

function validateTick(tick: unknown): number {
  if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 0) {
    throw new Error('BlockInteraction: tick must be a non-negative safe integer');
  }
  return tick;
}

function validateBlockStateId(id: unknown): number {
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0) {
    throw new Error('BlockInteraction: blockStateId must be a non-negative safe integer');
  }
  return id;
}

function validateMaxReach(reach?: number): number {
  const r = reach ?? DEFAULT_MAX_REACH;
  if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0) {
    throw new Error('BlockInteraction: maxReachDistance must be a positive finite number');
  }
  return r;
}

function validateMinBreakTicks(ticks?: number): number {
  const t = ticks ?? DEFAULT_MIN_BREAK_TICKS;
  if (typeof t !== 'number' || !Number.isSafeInteger(t) || t < 0) {
    throw new Error('BlockInteraction: minBreakTicks must be a non-negative safe integer');
  }
  return t;
}

export interface ActiveBreakInfo {
  readonly position: BlockCoord;
  readonly face: Direction;
  readonly startTick: number;
}

/**
 * Server-authoritative validator for block break, place, and use interactions.
 */
export class BlockInteractionValidator {
  private readonly maxReachDistance: number;
  private readonly minBreakTicks: number;
  private readonly activeBreaks = new Map<number, ActiveBreakInfo>();

  constructor(options: BlockInteractionValidatorOptions = {}) {
    this.maxReachDistance = validateMaxReach(options.maxReachDistance);
    this.minBreakTicks = validateMinBreakTicks(options.minBreakTicks);
  }

  /** Number of players currently in an active break sequence. */
  get activeBreakingCount(): number {
    return this.activeBreaks.size;
  }

  /** Retrieve active break info for a player or null. */
  getBreakProgress(playerId: number): ActiveBreakInfo | null {
    const info = this.activeBreaks.get(playerId);
    return info ? { ...info, position: { ...info.position } } : null;
  }

  /** Check if block center is within reach of player position. */
  isWithinReach(playerPos: PlayerPosition, blockPos: BlockCoord): boolean {
    const bx = blockPos.x + 0.5;
    const by = blockPos.y + 0.5;
    const bz = blockPos.z + 0.5;
    const dx = playerPos.x - bx;
    const dy = playerPos.y - by;
    const dz = playerPos.z - bz;
    return Math.hypot(dx, dy, dz) <= this.maxReachDistance;
  }

  /**
   * Validate a block break request.
   */
  validateBreak(
    playerPos: PlayerPosition,
    request: BlockBreakRequest,
    getBlockState: (pos: BlockCoord) => number,
  ): InteractionResult {
    const pPos = validatePlayerPosition(playerPos);
    if (typeof request !== 'object' || request === null) {
      throw new Error('BlockInteraction: request must be an object');
    }
    const playerId = validatePlayerId(request.playerId);
    const bPos = validateBlockCoord(request.position);
    const face = validateDirection(request.face);
    const tick = validateTick(request.tick);

    const currentState = validateBlockStateId(getBlockState(bPos));

    if (!this.isWithinReach(pPos, bPos)) {
      this.activeBreaks.delete(playerId);
      return {
        accepted: false,
        action: 'break',
        position: bPos,
        authoritativeStateId: currentState,
        reason: 'out_of_reach',
      };
    }

    if (request.action === 'instant') {
      this.activeBreaks.delete(playerId);
      return {
        accepted: true,
        action: 'break',
        position: bPos,
        blockStateId: 0,
        broadcast: true,
      };
    }

    if (request.action === 'start') {
      this.activeBreaks.set(playerId, { position: bPos, face, startTick: tick });
      return {
        accepted: true,
        action: 'break',
        position: bPos,
        blockStateId: currentState,
        broadcast: false,
      };
    }

    if (request.action === 'cancel') {
      this.activeBreaks.delete(playerId);
      return {
        accepted: true,
        action: 'break',
        position: bPos,
        blockStateId: currentState,
        broadcast: false,
      };
    }

    if (request.action === 'finish') {
      const active = this.activeBreaks.get(playerId);
      if (!active || active.position.x !== bPos.x || active.position.y !== bPos.y || active.position.z !== bPos.z) {
        return {
          accepted: false,
          action: 'break',
          position: bPos,
          authoritativeStateId: currentState,
          reason: 'no_active_break',
        };
      }

      if (tick - active.startTick < this.minBreakTicks) {
        return {
          accepted: false,
          action: 'break',
          position: bPos,
          authoritativeStateId: currentState,
          reason: 'break_too_fast',
        };
      }

      this.activeBreaks.delete(playerId);
      return {
        accepted: true,
        action: 'break',
        position: bPos,
        blockStateId: 0,
        broadcast: true,
      };
    }

    throw new Error('BlockInteraction: invalid break action');
  }

  /**
   * Validate a block place request.
   */
  validatePlace(
    playerPos: PlayerPosition,
    request: BlockPlaceRequest,
    getBlockState: (pos: BlockCoord) => number,
    canPlace?: (pos: BlockCoord, stateId: number) => boolean,
  ): InteractionResult {
    const pPos = validatePlayerPosition(playerPos);
    if (typeof request !== 'object' || request === null) {
      throw new Error('BlockInteraction: request must be an object');
    }
    validatePlayerId(request.playerId);
    const clickedPos = validateBlockCoord(request.position);
    const face = validateDirection(request.face);
    const placeStateId = validateBlockStateId(request.blockStateId);
    validateTick(request.tick);

    const clickedState = validateBlockStateId(getBlockState(clickedPos));

    // Target block must be in reach
    if (!this.isWithinReach(pPos, clickedPos)) {
      return {
        accepted: false,
        action: 'place',
        position: clickedPos,
        authoritativeStateId: clickedState,
        reason: 'out_of_reach',
      };
    }

    const placePos = offsetByFace(clickedPos, face);
    const targetState = validateBlockStateId(getBlockState(placePos));

    if (!this.isWithinReach(pPos, placePos)) {
      return {
        accepted: false,
        action: 'place',
        position: placePos,
        authoritativeStateId: targetState,
        reason: 'out_of_reach',
      };
    }

    if (canPlace && !canPlace(placePos, placeStateId)) {
      return {
        accepted: false,
        action: 'place',
        position: placePos,
        authoritativeStateId: targetState,
        reason: 'cannot_place',
      };
    }

    return {
      accepted: true,
      action: 'place',
      position: placePos,
      blockStateId: placeStateId,
      broadcast: true,
    };
  }

  /**
   * Validate a block use request.
   */
  validateUse(
    playerPos: PlayerPosition,
    request: BlockUseRequest,
    getBlockState: (pos: BlockCoord) => number,
  ): InteractionResult {
    const pPos = validatePlayerPosition(playerPos);
    if (typeof request !== 'object' || request === null) {
      throw new Error('BlockInteraction: request must be an object');
    }
    validatePlayerId(request.playerId);
    const bPos = validateBlockCoord(request.position);
    validateDirection(request.face);
    validateTick(request.tick);

    const currentState = validateBlockStateId(getBlockState(bPos));

    if (!this.isWithinReach(pPos, bPos)) {
      return {
        accepted: false,
        action: 'use',
        position: bPos,
        authoritativeStateId: currentState,
        reason: 'out_of_reach',
      };
    }

    return {
      accepted: true,
      action: 'use',
      position: bPos,
      blockStateId: currentState,
      broadcast: true,
    };
  }

  /**
   * Reset all active break states.
   */
  reset(): void {
    this.activeBreaks.clear();
  }
}

/**
 * Client-side prediction tracker and reconciliation resolver.
 */
export class ClientBlockReconciler {
  private readonly pendingPredictions = new Map<
    string,
    {
      position: BlockCoord;
      predictedStateId: number;
      previousStateId: number;
      tick: number;
    }
  >();

  /** Number of pending unconfirmed predictions. */
  get pendingCount(): number {
    return this.pendingPredictions.size;
  }

  /** Check if a block position has an unconfirmed prediction. */
  hasPending(pos: BlockCoord): boolean {
    return this.pendingPredictions.has(blockCoordKey(pos));
  }

  /** Record a client-side prediction. */
  predict(pos: BlockCoord, predictedStateId: number, previousStateId: number, tick: number): void {
    const position = validateBlockCoord(pos);
    const predState = validateBlockStateId(predictedStateId);
    const prevState = validateBlockStateId(previousStateId);
    const t = validateTick(tick);

    this.pendingPredictions.set(blockCoordKey(position), {
      position,
      predictedStateId: predState,
      previousStateId: prevState,
      tick: t,
    });
  }

  /**
   * Reconcile a server interaction result.
   * Returns a rollback directive if the server rejected the action, or null if accepted.
   */
  reconcile(result: InteractionResult): ClientRollbackDirective | null {
    if (typeof result !== 'object' || result === null) {
      throw new Error('BlockInteraction: result must be an object');
    }
    const key = blockCoordKey(result.position);
    this.pendingPredictions.delete(key);

    if (!result.accepted) {
      return {
        position: { ...result.position },
        rollbackStateId: result.authoritativeStateId,
      };
    }

    return null;
  }

  /**
   * Reset all pending predictions.
   */
  reset(): void {
    this.pendingPredictions.clear();
  }
}
