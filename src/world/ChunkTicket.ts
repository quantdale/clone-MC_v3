/**
 * Typed chunk-ticket model: the reasons a chunk column is kept resident and simulating, and the level at which it is
 * held. Independent of `ChunkColumn.status` (030) — status answers "how generated?", tickets answer "why kept loaded
 * or ticking?". Level semantics follow Minecraft: lower number = higher priority (chunk held more fully); a chunk with
 * no tickets is fully unloaded. Runtime-only coordination state, not persisted.
 */
export const enum ChunkTicketType {
  Unknown = 0,
  Player = 1,
  Portal = 2,
  Light = 3,
  Generation = 4,
  Migration = 5,
  Structure = 6,
  /** Collision/simulation neighborhood hold (audit 04 streaming tier 2). */
  Simulation = 7,
  /** Interaction target neighborhood (streaming tier 3). */
  Interaction = 8,
  /** Speculative/preload work (lowest streaming tier 6). */
  Preload = 9,
}

/** Default hold level each ticket reason keeps a chunk at. Lower = more loaded/ticking. */
export const CHUNK_TICKET_DEFAULT_LEVEL: Record<ChunkTicketType, number> = {
  [ChunkTicketType.Unknown]: 44,
  [ChunkTicketType.Player]: 31,
  [ChunkTicketType.Portal]: 31,
  [ChunkTicketType.Light]: 33,
  [ChunkTicketType.Generation]: 33,
  [ChunkTicketType.Migration]: 33,
  [ChunkTicketType.Structure]: 34,
  [ChunkTicketType.Simulation]: 31,
  [ChunkTicketType.Interaction]: 32,
  [ChunkTicketType.Preload]: 40,
};

/**
 * Streaming work priorities (audit 04 "Streaming priorities"). Lower value = dispatched first.
 * These order queue dispatch; ticket *levels* order residency. The two are related but distinct:
 * a preload ticket keeps a chunk resident at a weak level and its jobs also run last.
 */
export const enum ChunkStreamPriority {
  /** Visible/front-facing sections near the camera. */
  VisibleNear = 0,
  /** Collision/simulation neighborhood. */
  Simulation = 1,
  /** Interaction target neighborhood. */
  Interaction = 2,
  /** Forward movement corridor. */
  ForwardCorridor = 3,
  /** Remaining render-distance rings. */
  Rings = 4,
  /** Speculative/preload work. */
  Preload = 5,
}

/** Default streaming priority each ticket type contributes to queued work. */
export const CHUNK_TICKET_DEFAULT_PRIORITY: Record<ChunkTicketType, ChunkStreamPriority> = {
  [ChunkTicketType.Unknown]: ChunkStreamPriority.Rings,
  [ChunkTicketType.Player]: ChunkStreamPriority.VisibleNear,
  [ChunkTicketType.Portal]: ChunkStreamPriority.ForwardCorridor,
  [ChunkTicketType.Light]: ChunkStreamPriority.Simulation,
  [ChunkTicketType.Generation]: ChunkStreamPriority.Simulation,
  [ChunkTicketType.Migration]: ChunkStreamPriority.Preload,
  [ChunkTicketType.Structure]: ChunkStreamPriority.Rings,
  [ChunkTicketType.Simulation]: ChunkStreamPriority.Simulation,
  [ChunkTicketType.Interaction]: ChunkStreamPriority.Interaction,
  [ChunkTicketType.Preload]: ChunkStreamPriority.Preload,
};

/** A chunk at or below this level ticks. */
export const TICKING_LEVEL = 31;
/** A chunk at or below this level has its terrain/features loaded. */
export const LOADED_LEVEL = 33;
/** Highest valid ticket level; a chunk with no tickets is held at this (unloaded) level. */
export const MAX_TICKET_LEVEL = 44;

/** A chunk-ticket level in `[0, MAX_TICKET_LEVEL]`. */
export type ChunkTicketLevel = number;

/** A single reason a chunk is kept loaded/ticking, at a specific level. */
export interface ChunkTicket {
  type: ChunkTicketType;
  level: ChunkTicketLevel;
  /** Streaming priority for work queued under this ticket; defaults from the ticket type. */
  priority?: ChunkStreamPriority;
  /**
   * Generation/version token this ticket was issued against. When the chunk's lifecycle
   * generation counter moves past it (regeneration, eviction), the ticket is stale and must be
   * re-acquired rather than reused.
   */
  version?: number;
  /** Epoch ms when the ticket was issued; used with `expiresAt` for expiry. */
  issuedAt?: number;
  /** Epoch ms after which the ticket no longer holds the chunk; omitted = never expires. */
  expiresAt?: number;
}

/** Create a ticket for `type`, using its default level unless `level` is supplied. */
export function createChunkTicket(type: ChunkTicketType, level?: ChunkTicketLevel): ChunkTicket {
  return { type, level: level ?? CHUNK_TICKET_DEFAULT_LEVEL[type] };
}

/** True when `level` keeps the chunk ticking. */
export function isTickingLevel(level: ChunkTicketLevel): boolean {
  return level <= TICKING_LEVEL;
}

/** True when `level` keeps the chunk loaded. */
export function isLoadedLevel(level: ChunkTicketLevel): boolean {
  return level <= LOADED_LEVEL;
}

/** True when ticket `a` has higher priority (lower level) than `b`. */
export function isHigherPriority(a: ChunkTicket, b: ChunkTicket): boolean {
  return a.level < b.level;
}

/** Effective streaming priority of a ticket (its explicit value or its type's default). */
export function ticketPriority(ticket: ChunkTicket): ChunkStreamPriority {
  return ticket.priority ?? CHUNK_TICKET_DEFAULT_PRIORITY[ticket.type];
}

/** True when the ticket carries a version token that no longer matches `currentVersion`. */
export function isTicketStale(ticket: ChunkTicket, currentVersion: number): boolean {
  return ticket.version !== undefined && ticket.version !== currentVersion;
}

/** True when the ticket has an expiry that has passed at `nowMs`. Non-expiring tickets are never stale by time. */
export function isTicketExpired(ticket: ChunkTicket, nowMs: number): boolean {
  return ticket.expiresAt !== undefined && nowMs >= ticket.expiresAt;
}

/**
 * Aggregates chunk tickets per coordinate into an effective level. The most-important (lowest-level) ticket wins; a
 * coordinate with no tickets is held at `MAX_TICKET_LEVEL` (fully unloaded).
 */
export class ChunkTicketManager {
  private readonly tickets = new Map<string, ChunkTicket[]>();

  private static key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /** Add a ticket for the chunk at `(cx, cz)`. */
  addTicket(cx: number, cz: number, ticket: ChunkTicket): void {
    const key = ChunkTicketManager.key(cx, cz);
    const list = this.tickets.get(key);
    if (list === undefined) {
      this.tickets.set(key, [ticket]);
    } else {
      list.push(ticket);
    }
  }

  /** Remove the first ticket matching `ticket` (by type and level) at `(cx, cz)`. No-op if absent. */
  removeTicket(cx: number, cz: number, ticket: ChunkTicket): void {
    const list = this.tickets.get(ChunkTicketManager.key(cx, cz));
    if (list === undefined) return;
    const idx = list.findIndex((t) => t.type === ticket.type && t.level === ticket.level);
    if (idx >= 0) list.splice(idx, 1);
  }

  /** Effective level of the chunk: min ticket level, or `MAX_TICKET_LEVEL` when there are no tickets. */
  getLevel(cx: number, cz: number): ChunkTicketLevel {
    const list = this.tickets.get(ChunkTicketManager.key(cx, cz));
    if (list === undefined || list.length === 0) return MAX_TICKET_LEVEL;
    const first = list[0];
    if (first === undefined) return MAX_TICKET_LEVEL;
    let min = first.level;
    for (let i = 1; i < list.length; i++) {
      const t = list[i];
      if (t !== undefined && t.level < min) min = t.level;
    }
    return min;
  }

  /** Whether the chunk is held loaded (terrain/features). */
  isLoaded(cx: number, cz: number): boolean {
    return isLoadedLevel(this.getLevel(cx, cz));
  }

  /** Whether the chunk is held ticking. */
  isTicking(cx: number, cz: number): boolean {
    return isTickingLevel(this.getLevel(cx, cz));
  }

  /** Current tickets for the chunk (snapshot). */
  getTickets(cx: number, cz: number): readonly ChunkTicket[] {
    return [...(this.tickets.get(ChunkTicketManager.key(cx, cz)) ?? [])];
  }

  /** Coordinates that currently hold at least one ticket. */
  chunks(): IterableIterator<[number, number]> {
    const result: [number, number][] = [];
    for (const key of this.tickets.keys()) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      result.push([cx, cz]);
    }
    return result[Symbol.iterator]();
  }

  /** Drop all tickets. */
  clear(): void {
    this.tickets.clear();
  }
}
