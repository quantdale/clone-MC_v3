import { describe, it, expect } from 'vitest';
import {
  ChunkTicketType,
  createChunkTicket,
  isTickingLevel,
  isLoadedLevel,
  isHigherPriority,
  ChunkTicketManager,
  MAX_TICKET_LEVEL,
} from '../../src/world/ChunkTicket';

describe('ChunkTicket types, levels, and predicates', () => {
  it('assigns default hold levels per ticket type', () => {
    expect(createChunkTicket(ChunkTicketType.Player).level).toBe(31);
    expect(createChunkTicket(ChunkTicketType.Light).level).toBe(33);
    expect(createChunkTicket(ChunkTicketType.Unknown).level).toBe(44);
  });

  it('classifies levels by threshold', () => {
    expect(isTickingLevel(31)).toBe(true);
    expect(isTickingLevel(32)).toBe(false);
    expect(isLoadedLevel(33)).toBe(true);
    expect(isLoadedLevel(34)).toBe(false);
  });

  it('uses an explicit level when provided', () => {
    expect(createChunkTicket(ChunkTicketType.Player, 10).level).toBe(10);
  });

  it('compares priority by lower level', () => {
    const a = createChunkTicket(ChunkTicketType.Player); // 31
    const b = createChunkTicket(ChunkTicketType.Light); // 33
    expect(isHigherPriority(a, b)).toBe(true);
    expect(isHigherPriority(b, a)).toBe(false);
  });
});

describe('ChunkTicketManager', () => {
  it('derives effective level from a single ticket', () => {
    const m = new ChunkTicketManager();
    m.addTicket(0, 0, createChunkTicket(ChunkTicketType.Player));
    expect(m.getLevel(0, 0)).toBe(31);
    expect(m.isTicking(0, 0)).toBe(true);
    expect(m.isLoaded(0, 0)).toBe(true);
  });

  it('lets the most-important (lowest-level) ticket win', () => {
    const m = new ChunkTicketManager();
    m.addTicket(0, 0, createChunkTicket(ChunkTicketType.Player)); // 31
    m.addTicket(0, 0, createChunkTicket(ChunkTicketType.Light)); // 33
    expect(m.getLevel(0, 0)).toBe(31);
  });

  it('treats a chunk with no tickets as fully unloaded', () => {
    const m = new ChunkTicketManager();
    expect(m.getLevel(5, 5)).toBe(MAX_TICKET_LEVEL);
    expect(m.isLoaded(5, 5)).toBe(false);
    expect(m.isTicking(5, 5)).toBe(false);
  });

  it('returns to unloaded after the only ticket is removed', () => {
    const m = new ChunkTicketManager();
    m.addTicket(0, 0, createChunkTicket(ChunkTicketType.Player));
    m.removeTicket(0, 0, createChunkTicket(ChunkTicketType.Player));
    expect(m.getLevel(0, 0)).toBe(MAX_TICKET_LEVEL);
    expect(m.isTicking(0, 0)).toBe(false);
  });

  it('removing an absent ticket is a no-op', () => {
    const m = new ChunkTicketManager();
    m.addTicket(0, 0, createChunkTicket(ChunkTicketType.Player));
    expect(() => m.removeTicket(1, 1, createChunkTicket(ChunkTicketType.Player))).not.toThrow();
    expect(m.getLevel(0, 0)).toBe(31);
  });

  it('keeps coordinates independent', () => {
    const m = new ChunkTicketManager();
    m.addTicket(0, 0, createChunkTicket(ChunkTicketType.Player)); // 31
    m.addTicket(2, 2, createChunkTicket(ChunkTicketType.Light)); // 33
    expect(m.getLevel(0, 0)).toBe(31);
    expect(m.getLevel(2, 2)).toBe(33);
  });

  it('enumerates chunks that hold tickets', () => {
    const m = new ChunkTicketManager();
    m.addTicket(0, 0, createChunkTicket(ChunkTicketType.Player));
    m.addTicket(2, 2, createChunkTicket(ChunkTicketType.Light));
    const coords = [...m.chunks()].sort((a, b) => a[0] - b[0]);
    expect(coords).toEqual([
      [0, 0],
      [2, 2],
    ]);
  });
});
