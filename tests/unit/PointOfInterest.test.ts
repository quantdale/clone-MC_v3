import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import { PointOfInterestManager } from '../../src/simulation/PointOfInterest';

const BED = createResourceId('minecraft', 'bed');
const WORKSTATION = createResourceId('minecraft', 'workstation');

describe('PointOfInterestManager', () => {
  describe('add', () => {
    it('registers a new, unclaimed POI at a free position', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 1, 2, 3);
      expect(manager.get(1, 2, 3)).toEqual({ type: BED, x: 1, y: 2, z: 3, claimed: false });
    });

    it('throws and leaves the manager unchanged for a duplicate position', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 1, 2, 3);
      expect(() => manager.add(WORKSTATION, 1, 2, 3)).toThrow();
      expect(manager.get(1, 2, 3)!.type).toEqual(BED);
    });

    it('throws for non-integer coordinates', () => {
      const manager = new PointOfInterestManager();
      expect(() => manager.add(BED, 1.5, 2, 3)).toThrow();
    });
  });

  describe('claim / release', () => {
    it('claim succeeds on an unclaimed POI', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 1, 2, 3);
      expect(manager.claim(1, 2, 3)).toBe(true);
      expect(manager.get(1, 2, 3)!.claimed).toBe(true);
    });

    it('claim fails on an already-claimed POI', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 1, 2, 3);
      manager.claim(1, 2, 3);
      expect(manager.claim(1, 2, 3)).toBe(false);
      expect(manager.get(1, 2, 3)!.claimed).toBe(true);
    });

    it('release fails on an unclaimed POI', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 1, 2, 3);
      expect(manager.release(1, 2, 3)).toBe(false);
    });

    it('release succeeds on a claimed POI', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 1, 2, 3);
      manager.claim(1, 2, 3);
      expect(manager.release(1, 2, 3)).toBe(true);
      expect(manager.get(1, 2, 3)!.claimed).toBe(false);
    });

    it('claim and release both fail on a nonexistent position', () => {
      const manager = new PointOfInterestManager();
      expect(manager.claim(9, 9, 9)).toBe(false);
      expect(manager.release(9, 9, 9)).toBe(false);
    });
  });

  describe('findNearestUnclaimed', () => {
    it('returns the nearer of two qualifying POIs', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 10, 0, 0);
      manager.add(BED, 2, 0, 0);
      const found = manager.findNearestUnclaimed(BED, 0, 0, 0, 100);
      expect(found).toMatchObject({ x: 2, y: 0, z: 0 });
    });

    it('excludes a nearer claimed POI in favor of a farther unclaimed one', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 2, 0, 0);
      manager.claim(2, 0, 0);
      manager.add(BED, 10, 0, 0);
      const found = manager.findNearestUnclaimed(BED, 0, 0, 0, 100);
      expect(found).toMatchObject({ x: 10, y: 0, z: 0 });
    });

    it('excludes a nearer different-type POI', () => {
      const manager = new PointOfInterestManager();
      manager.add(WORKSTATION, 2, 0, 0);
      manager.add(BED, 10, 0, 0);
      const found = manager.findNearestUnclaimed(BED, 0, 0, 0, 100);
      expect(found).toMatchObject({ x: 10, y: 0, z: 0 });
    });

    it('returns null when the only qualifying POI is out of range', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 50, 0, 0);
      expect(manager.findNearestUnclaimed(BED, 0, 0, 0, 10)).toBeNull();
    });

    it('returns null when no POI qualifies at all', () => {
      const manager = new PointOfInterestManager();
      expect(manager.findNearestUnclaimed(BED, 0, 0, 0, 100)).toBeNull();
    });
  });

  describe('getInChunk / serializeChunk / deserializeChunk / forgetChunk', () => {
    it('getInChunk filters to the requested chunk only', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 1, 5, 1); // chunk (0,0)
      manager.add(BED, 20, 5, 1); // chunk (1,0)
      expect(manager.getInChunk(0, 0).length).toBe(1);
      expect(manager.getInChunk(1, 0).length).toBe(1);
    });

    it('round-trips a valid batch through serializeChunk/deserializeChunk', () => {
      const source = new PointOfInterestManager();
      source.add(BED, 1, 5, 2);
      source.add(WORKSTATION, 3, 6, 4);
      source.claim(3, 6, 4);
      const serialized = source.serializeChunk(0, 0);

      const target = new PointOfInterestManager();
      const count = target.deserializeChunk(0, 0, serialized);

      expect(count).toBe(2);
      expect(target.get(1, 5, 2)).toEqual({ type: BED, x: 1, y: 5, z: 2, claimed: false });
      expect(target.get(3, 6, 4)).toEqual({ type: WORKSTATION, x: 3, y: 6, z: 4, claimed: true });
    });

    it('rejects a malformed batch atomically', () => {
      const manager = new PointOfInterestManager();
      const batch = [
        { schemaVersion: 1, typeKey: 'minecraft:bed', x: 1, y: 1, z: 1, claimed: false },
        { schemaVersion: 1, typeKey: 'minecraft:bed', x: 1.5, y: 1, z: 1, claimed: false },
      ];
      expect(() => manager.deserializeChunk(0, 0, batch)).toThrow();
      expect(manager.get(1, 1, 1)).toBeUndefined();
    });

    it('forgetChunk evicts only the targeted chunk', () => {
      const manager = new PointOfInterestManager();
      manager.add(BED, 1, 5, 1); // chunk (0,0)
      manager.add(BED, 20, 5, 1); // chunk (1,0)

      const removed = manager.forgetChunk(0, 0);

      expect(removed).toBe(1);
      expect(manager.getInChunk(0, 0).length).toBe(0);
      expect(manager.getInChunk(1, 0).length).toBe(1);
    });
  });
});
