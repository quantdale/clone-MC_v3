import { describe, expect, it } from 'vitest';
import {
  compareChunkCoordinates,
  compareChunkWork,
  compareChunkWorkPriority,
  createChunkWorkPriority,
} from '../../src/world/ChunkWorkPriority';
import { ChunkStreamPriority } from '../../src/world/ChunkTicket';

describe('ChunkWorkPriority', () => {
  it('orders the normative urgency/visibility/movement/simulation/LOD/distance tuple lexicographically', () => {
    const baseline = createChunkWorkPriority(ChunkStreamPriority.Rings, 1, 3, 1, 1, 8);
    const dimensions = [
      createChunkWorkPriority(ChunkStreamPriority.ForwardCorridor, 99, 99, 99, 99, 99),
      createChunkWorkPriority(ChunkStreamPriority.Rings, 0, 99, 99, 99, 99),
      createChunkWorkPriority(ChunkStreamPriority.Rings, 1, 0, 99, 99, 99),
      createChunkWorkPriority(ChunkStreamPriority.Rings, 1, 3, 0, 99, 99),
      createChunkWorkPriority(ChunkStreamPriority.Rings, 1, 3, 1, 0, 99),
      createChunkWorkPriority(ChunkStreamPriority.Rings, 1, 3, 1, 1, 7),
    ];

    for (const candidate of dimensions) {
      expect(compareChunkWorkPriority(candidate, baseline)).toBeLessThan(0);
    }
  });

  it('uses age before canonical coordinates and coordinates as the final deterministic tie-break', () => {
    const priority = createChunkWorkPriority(ChunkStreamPriority.Rings, 0, 0, 0, 0, 4);
    const older = { cx: 10, cy: 0, cz: 0, priorityDetails: priority, enqueuedAtMs: 1 };
    const newer = { cx: -10, cy: 0, cz: 0, priorityDetails: priority, enqueuedAtMs: 2 };
    expect(compareChunkWork(older, newer)).toBeLessThan(0);
    expect(compareChunkCoordinates({ cx: -1, cy: 0, cz: 0 }, { cx: 1, cy: 0, cz: 0 })).toBeLessThan(0);
    expect(compareChunkWork(
      { cx: -1, cy: 0, cz: 0, priorityDetails: priority, enqueuedAtMs: 1 },
      { cx: 1, cy: 0, cz: 0, priorityDetails: priority, enqueuedAtMs: 1 },
    )).toBeLessThan(0);
  });

  it('rejects invalid negative distance dimensions', () => {
    expect(() => createChunkWorkPriority(ChunkStreamPriority.Rings, 0, 0, 0, 0, -1)).toThrow(RangeError);
  });
});
