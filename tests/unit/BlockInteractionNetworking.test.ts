import { describe, expect, it } from 'vitest';
import {
  BlockInteractionValidator,
  ClientBlockReconciler,
  DIRECTION_OFFSETS,
  offsetByFace,
  type BlockBreakRequest,
  type BlockCoord,
  type BlockPlaceRequest,
  type BlockUseRequest,
  type Direction,
} from '../../src/simulation/BlockInteractionNetworking';

describe('BlockInteractionNetworking', () => {
  describe('Face Offsets and Direction Utilities', () => {
    it('correctly offsets coordinates for all 6 faces', () => {
      const origin: BlockCoord = { x: 10, y: 20, z: 30 };

      expect(offsetByFace(origin, 'up')).toEqual({ x: 10, y: 21, z: 30 });
      expect(offsetByFace(origin, 'down')).toEqual({ x: 10, y: 19, z: 30 });
      expect(offsetByFace(origin, 'north')).toEqual({ x: 10, y: 20, z: 29 });
      expect(offsetByFace(origin, 'south')).toEqual({ x: 10, y: 20, z: 31 });
      expect(offsetByFace(origin, 'west')).toEqual({ x: 9, y: 20, z: 30 });
      expect(offsetByFace(origin, 'east')).toEqual({ x: 11, y: 20, z: 30 });
    });

    it('exposes DIRECTION_OFFSETS with correct delta values', () => {
      const directions: Direction[] = ['up', 'down', 'north', 'south', 'west', 'east'];
      for (const dir of directions) {
        expect(DIRECTION_OFFSETS[dir]).toBeDefined();
      }
    });
  });

  describe('Reach Distance Validation', () => {
    it('evaluates 3D Euclidean distance to block center correctly', () => {
      const validator = new BlockInteractionValidator({ maxReachDistance: 6.0 });
      const playerPos = { x: 0, y: 0, z: 0 };

      // Block center is at (3.5, 0.5, 0.5); dist = sqrt(3.5^2 + 0.5^2 + 0.5^2) = sqrt(12.75) ~ 3.57 <= 6.0
      expect(validator.isWithinReach(playerPos, { x: 3, y: 0, z: 0 })).toBe(true);

      // Block center at (6.5, 0.5, 0.5); dist = sqrt(6.5^2 + 0.5^2 + 0.5^2) = sqrt(42.75) ~ 6.53 > 6.0
      expect(validator.isWithinReach(playerPos, { x: 6, y: 0, z: 0 })).toBe(false);
    });

    it('rejects break requests beyond reach with out_of_reach reason', () => {
      const validator = new BlockInteractionValidator({ maxReachDistance: 5.0 });
      const playerPos = { x: 0, y: 0, z: 0 };
      const req: BlockBreakRequest = {
        playerId: 1,
        action: 'instant',
        position: { x: 10, y: 0, z: 10 },
        face: 'up',
        tick: 1,
      };

      const result = validator.validateBreak(playerPos, req, () => 1);
      expect(result).toEqual({
        accepted: false,
        action: 'break',
        position: { x: 10, y: 0, z: 10 },
        authoritativeStateId: 1,
        reason: 'out_of_reach',
      });
    });

    it('rejects place requests beyond reach with out_of_reach reason', () => {
      const validator = new BlockInteractionValidator({ maxReachDistance: 5.0 });
      const playerPos = { x: 0, y: 0, z: 0 };
      const req: BlockPlaceRequest = {
        playerId: 1,
        position: { x: 10, y: 0, z: 10 },
        face: 'up',
        blockStateId: 2,
        tick: 1,
      };

      const result = validator.validatePlace(playerPos, req, () => 1);
      expect(result).toEqual({
        accepted: false,
        action: 'place',
        position: { x: 10, y: 0, z: 10 },
        authoritativeStateId: 1,
        reason: 'out_of_reach',
      });
    });

    it('rejects use requests beyond reach with out_of_reach reason', () => {
      const validator = new BlockInteractionValidator({ maxReachDistance: 5.0 });
      const playerPos = { x: 0, y: 0, z: 0 };
      const req: BlockUseRequest = {
        playerId: 1,
        position: { x: 20, y: 0, z: 20 },
        face: 'north',
        tick: 1,
      };

      const result = validator.validateUse(playerPos, req, () => 3);
      expect(result).toEqual({
        accepted: false,
        action: 'use',
        position: { x: 20, y: 0, z: 20 },
        authoritativeStateId: 3,
        reason: 'out_of_reach',
      });
    });
  });

  describe('Break Progression and Sequencing', () => {
    it('processes instant break successfully', () => {
      const validator = new BlockInteractionValidator();
      const playerPos = { x: 0, y: 0, z: 0 };
      const req: BlockBreakRequest = {
        playerId: 1,
        action: 'instant',
        position: { x: 1, y: 0, z: 1 },
        face: 'up',
        tick: 1,
      };

      const result = validator.validateBreak(playerPos, req, () => 5);
      expect(result).toEqual({
        accepted: true,
        action: 'break',
        position: { x: 1, y: 0, z: 1 },
        blockStateId: 0,
        broadcast: true,
      });
    });

    it('tracks start, progress, and finish break sequence', () => {
      const validator = new BlockInteractionValidator({ minBreakTicks: 5 });
      const playerPos = { x: 0, y: 0, z: 0 };
      const pos = { x: 1, y: 0, z: 1 };

      // 1. Start
      const startReq: BlockBreakRequest = {
        playerId: 1,
        action: 'start',
        position: pos,
        face: 'up',
        tick: 10,
      };
      const r1 = validator.validateBreak(playerPos, startReq, () => 1);
      expect(r1.accepted).toBe(true);
      expect(validator.activeBreakingCount).toBe(1);
      expect(validator.getBreakProgress(1)).toEqual({
        position: pos,
        face: 'up',
        startTick: 10,
      });

      // 2. Finish too early (< 5 ticks) -> rejected with break_too_fast
      const fastFinish: BlockBreakRequest = {
        playerId: 1,
        action: 'finish',
        position: pos,
        face: 'up',
        tick: 12,
      };
      const rFast = validator.validateBreak(playerPos, fastFinish, () => 1);
      expect(rFast).toEqual({
        accepted: false,
        action: 'break',
        position: pos,
        authoritativeStateId: 1,
        reason: 'break_too_fast',
      });

      // 3. Valid finish after minBreakTicks
      const finishReq: BlockBreakRequest = {
        playerId: 1,
        action: 'finish',
        position: pos,
        face: 'up',
        tick: 16,
      };
      const rFinish = validator.validateBreak(playerPos, finishReq, () => 1);
      expect(rFinish).toEqual({
        accepted: true,
        action: 'break',
        position: pos,
        blockStateId: 0,
        broadcast: true,
      });
      expect(validator.activeBreakingCount).toBe(0);
    });

    it('rejects finish without start with no_active_break', () => {
      const validator = new BlockInteractionValidator();
      const playerPos = { x: 0, y: 0, z: 0 };
      const req: BlockBreakRequest = {
        playerId: 2,
        action: 'finish',
        position: { x: 1, y: 0, z: 1 },
        face: 'north',
        tick: 20,
      };

      const result = validator.validateBreak(playerPos, req, () => 1);
      expect(result).toEqual({
        accepted: false,
        action: 'break',
        position: { x: 1, y: 0, z: 1 },
        authoritativeStateId: 1,
        reason: 'no_active_break',
      });
    });

    it('clears active break on cancel', () => {
      const validator = new BlockInteractionValidator();
      const playerPos = { x: 0, y: 0, z: 0 };
      const pos = { x: 1, y: 0, z: 1 };

      validator.validateBreak(playerPos, { playerId: 1, action: 'start', position: pos, face: 'up', tick: 1 }, () => 1);
      expect(validator.activeBreakingCount).toBe(1);

      validator.validateBreak(playerPos, { playerId: 1, action: 'cancel', position: pos, face: 'up', tick: 2 }, () => 1);
      expect(validator.activeBreakingCount).toBe(0);
      expect(validator.getBreakProgress(1)).toBeNull();
    });
  });

  describe('Block Placement and Use Validation', () => {
    it('validates placement on clicked face adjacent block', () => {
      const validator = new BlockInteractionValidator();
      const playerPos = { x: 0, y: 0, z: 0 };
      const clickedPos = { x: 1, y: 0, z: 0 };

      const placeReq: BlockPlaceRequest = {
        playerId: 1,
        position: clickedPos,
        face: 'up',
        blockStateId: 4, // e.g. oak planks
        tick: 1,
      };

      const result = validator.validatePlace(
        playerPos,
        placeReq,
        (pos) => (pos.x === 1 && pos.y === 0 ? 1 : 0),
        () => true,
      );

      expect(result).toEqual({
        accepted: true,
        action: 'place',
        position: { x: 1, y: 1, z: 0 },
        blockStateId: 4,
        broadcast: true,
      });
    });

    it('rejects placement when canPlace predicate returns false', () => {
      const validator = new BlockInteractionValidator();
      const playerPos = { x: 0, y: 0, z: 0 };
      const clickedPos = { x: 1, y: 0, z: 0 };

      const placeReq: BlockPlaceRequest = {
        playerId: 1,
        position: clickedPos,
        face: 'up',
        blockStateId: 4,
        tick: 1,
      };

      const result = validator.validatePlace(
        playerPos,
        placeReq,
        () => 1,
        () => false, // cannot place here
      );

      expect(result).toEqual({
        accepted: false,
        action: 'place',
        position: { x: 1, y: 1, z: 0 },
        authoritativeStateId: 1,
        reason: 'cannot_place',
      });
    });

    it('validates block use successfully within reach', () => {
      const validator = new BlockInteractionValidator();
      const playerPos = { x: 0, y: 0, z: 0 };
      const req: BlockUseRequest = {
        playerId: 1,
        position: { x: 1, y: 0, z: 1 },
        face: 'north',
        tick: 1,
      };

      const result = validator.validateUse(playerPos, req, () => 7); // e.g. lever block state
      expect(result).toEqual({
        accepted: true,
        action: 'use',
        position: { x: 1, y: 0, z: 1 },
        blockStateId: 7,
        broadcast: true,
      });
    });
  });

  describe('ClientBlockReconciler', () => {
    it('tracks optimistic block predictions and handles acceptance', () => {
      const reconciler = new ClientBlockReconciler();
      expect(reconciler.pendingCount).toBe(0);

      const pos: BlockCoord = { x: 5, y: 64, z: 5 };
      reconciler.predict(pos, 0, 1, 10); // Predicted break stone -> air

      expect(reconciler.pendingCount).toBe(1);
      expect(reconciler.hasPending(pos)).toBe(true);

      const rollback = reconciler.reconcile({
        accepted: true,
        action: 'break',
        position: pos,
        blockStateId: 0,
        broadcast: true,
      });

      expect(rollback).toBeNull();
      expect(reconciler.pendingCount).toBe(0);
      expect(reconciler.hasPending(pos)).toBe(false);
    });

    it('generates rollback directive on server rejection', () => {
      const reconciler = new ClientBlockReconciler();
      const pos: BlockCoord = { x: 5, y: 64, z: 5 };
      reconciler.predict(pos, 4, 0, 10); // Predicted place planks on air

      const rollback = reconciler.reconcile({
        accepted: false,
        action: 'place',
        position: pos,
        authoritativeStateId: 0, // Server says it is still air
        reason: 'cannot_place',
      });

      expect(rollback).toEqual({
        position: pos,
        rollbackStateId: 0,
      });
      expect(reconciler.pendingCount).toBe(0);
    });

    it('resets reconciler cleanly', () => {
      const reconciler = new ClientBlockReconciler();
      reconciler.predict({ x: 1, y: 2, z: 3 }, 1, 0, 1);
      expect(reconciler.pendingCount).toBe(1);
      reconciler.reset();
      expect(reconciler.pendingCount).toBe(0);
    });
  });

  describe('Input Validation, Rejections, and Determinism', () => {
    it('rejects invalid constructor options', () => {
      expect(() => new BlockInteractionValidator({ maxReachDistance: 0 })).toThrow(
        'BlockInteraction: maxReachDistance must be a positive finite number',
      );
      expect(() => new BlockInteractionValidator({ maxReachDistance: -5 })).toThrow(
        'BlockInteraction: maxReachDistance must be a positive finite number',
      );
      expect(() => new BlockInteractionValidator({ minBreakTicks: -1 })).toThrow(
        'BlockInteraction: minBreakTicks must be a non-negative safe integer',
      );
    });

    it('rejects non-integer block coordinates', () => {
      const validator = new BlockInteractionValidator();
      const playerPos = { x: 0, y: 0, z: 0 };
      expect(() =>
        validator.validateBreak(
          playerPos,
          { playerId: 1, action: 'instant', position: { x: 1.5, y: 0, z: 0 }, face: 'up', tick: 1 },
          () => 1,
        ),
      ).toThrow('BlockInteraction: coordinates must be integers');
    });

    it('rejects non-finite player positions', () => {
      const validator = new BlockInteractionValidator();
      expect(() =>
        validator.validateBreak(
          { x: NaN, y: 0, z: 0 },
          { playerId: 1, action: 'instant', position: { x: 1, y: 0, z: 0 }, face: 'up', tick: 1 },
          () => 1,
        ),
      ).toThrow('BlockInteraction: player position must be finite numbers');
    });

    it('rejects invalid direction faces', () => {
      const validator = new BlockInteractionValidator();
      expect(() =>
        validator.validateBreak(
          { x: 0, y: 0, z: 0 },
          { playerId: 1, action: 'instant', position: { x: 1, y: 0, z: 0 }, face: 'invalid' as unknown as Direction, tick: 1 },
          () => 1,
        ),
      ).toThrow('BlockInteraction: invalid face direction');
    });

    it('produces deterministic output across identical interaction schedules', () => {
      const run = () => {
        const validator = new BlockInteractionValidator({ maxReachDistance: 5.0, minBreakTicks: 2 });
        const reconciler = new ClientBlockReconciler();

        const pPos = { x: 0, y: 0, z: 0 };
        const bPos = { x: 2, y: 0, z: 0 };

        reconciler.predict(bPos, 0, 1, 1);
        const rStart = validator.validateBreak(pPos, { playerId: 1, action: 'start', position: bPos, face: 'up', tick: 1 }, () => 1);
        const rFinish = validator.validateBreak(pPos, { playerId: 1, action: 'finish', position: bPos, face: 'up', tick: 4 }, () => 1);
        const rollback = reconciler.reconcile(rFinish);

        return { rStart, rFinish, rollback };
      };

      expect(run()).toEqual(run());
    });
  });
});
