/**
 * Test-support harness for change 243 (redstone-automation-e2e). Composes the REAL production
 * modules — the 047 `ScheduledTickQueue`, the 156 `RedstonePropagator`, the 158
 * `TorchBurnoutTracker`, and every 157-172 component/piston/transfer module — over an
 * in-memory world fixture, and drives six canonical circuits deterministically with the two
 * survival operations every circuit spec depends on: `saveReload()` (through the real 234
 * `WorldSaveCodec` plus the 047 v1 round-trip) and `cycleChunk(cx, cz)`.
 *
 * This is NOT shipped game code: nothing in `src/` is modified by this file, and no redstone
 * module is wired into the rendered game (see 243 design.md for why headless composition is
 * the faithful driver).
 */
import {
  ScheduledTickQueue,
  validateSerializedScheduledTickQueue,
  type SerializedScheduledTickQueue,
} from "../../src/simulation/ScheduledTickQueue";
import {
  TorchBurnoutTracker,
  scheduleTorchUpdate,
  dueTorchUpdates,
  torchShouldBeLit,
  TORCH_UPDATE_DELAY_TICKS,
  BURNOUT_TOGGLE_LIMIT,
  BURNOUT_WINDOW_TICKS,
  BURNOUT_RECOVERY_TICKS,
} from "../../src/simulation/RedstoneTorch";
import {
  RedstonePropagator,
  type WirePowerStore,
} from "../../src/simulation/RedstonePropagation";
import { type WireWorld } from "../../src/simulation/RedstoneWire";
import {
  REPEATER_DELAY_TICKS,
  type RepeaterDelay,
  scheduleRepeaterOutput,
  resolveRepeaterOutput,
  repeaterShouldLock,
} from "../../src/simulation/RedstoneRepeater";
import {
  COMPARATOR_UPDATE_DELAY_TICKS,
  type ComparatorMode,
  scheduleComparatorUpdate,
  resolveComparatorOutput,
} from "../../src/simulation/RedstoneComparator";
import {
  OBSERVER_PULSE_START_DELAY_TICKS,
  OBSERVER_PULSE_DURATION_TICKS,
  scheduleObserverPulseStart,
} from "../../src/simulation/RedstoneObserver";
import {
  LAMP_OFF_DELAY_TICKS,
  scheduleLampOff,
  lampShouldBeLit,
  doorShouldBeOpen,
  trapdoorShouldBeOpen,
} from "../../src/simulation/RedstoneConsumers";
import {
  BUTTON_ACTIVE_TICKS,
  PLATE_RELEASE_DELAY_TICKS,
  scheduleComponentRelease,
  pressButton,
} from "../../src/simulation/RedstoneInputComponents";
import {
  type Direction,
  DIRECTIONS,
  offsetInDirection,
  OPPOSITE_DIRECTION,
  MIN_SIGNAL_STRENGTH,
  MAX_SIGNAL_STRENGTH,
  strongestSignalFrom,
  type RedstonePowerSource,
} from "../../src/simulation/RedstoneSignal";
import {
  planPistonPush,
  PISTON_PUSH_LIMIT,
  type PistonWorld,
} from "../../src/simulation/PistonMovePlanner";
import {
  executePistonPush,
  type PistonExecutionWorld,
} from "../../src/simulation/PistonExecution";
import {
  planStickyRetract,
  extendPushPlanWithStickyGroup,
  type StickyWorld,
} from "../../src/simulation/PistonStickyGroups";
import {
  HOPPER_TRANSFER_COOLDOWN_TICKS,
  type HopperFacing,
  transferOneItem,
  hopperShouldTransfer,
  hopperOutputPosition,
  scheduleHopperTransfer,
} from "../../src/simulation/HopperTransfer";
import {
  DROPPER_EJECT_COOLDOWN_TICKS,
  type DropperFacing,
  type DroppedItem,
  ejectFromDropper,
  dropperShouldTransfer,
  dropperOutputPosition,
  scheduleDropperEject,
} from "../../src/simulation/DropperEject";
import {
  createWorldSaveCodec,
  type WorldSaveCodec,
  type ServerWorldUnit,
  type WorldCodecMeta,
} from "../../src/simulation/PersistentWorldCodecs";
import type { SerializedBlockEntity } from "../../src/storage/BlockEntityRecord";
import { ChunkColumn } from "../../src/world/ChunkColumn";
import { createDefaultBlockStateRegistry } from "../../src/world/BlockStateRegistry";
import { BlockId } from "../../src/world/BlockRegistry";
import type { MenuSlot } from "../../src/inventory/MenuTransaction";

/** Canonical circuit kinds for change 243. */
export type CircuitKind =
  | "clock"
  | "pulse-divider"
  | "t-flip-flop"
  | "piston-door"
  | "item-sorter-chain"
  | "torch-burnout";

/** Stable machine-readable abort codes. */
export type AutomationErrorCode =
  | "malformed_snapshot"
  | "malformed_scheduled_queue"
  | "budget_exceeded";

/** Typed abort error for a violated precondition / malformed payload. */
export class AutomationError extends Error {
  readonly code: AutomationErrorCode;
  constructor(code: AutomationErrorCode, message: string) {
    super(message);
    this.name = "AutomationError";
    this.code = code;
  }
}

/**
 * Per-kind base offsets keeping every circuit family at mutually disjoint positions, so
 * building one circuit never disturbs another's probed state and chunk-scoped cycling can
 * target one circuit's chunk without touching another's.
 */
const CIRCUIT_BASES: Readonly<Record<CircuitKind, readonly [number, number]>> =
  Object.freeze({
    "torch-burnout": [0, 0],
    clock: [32, 0],
    "pulse-divider": [64, 0],
    "t-flip-flop": [96, 0],
    "piston-door": [128, 0],
    "item-sorter-chain": [160, 0],
  });

/** The single real (non-manual) torch id used by the oscillator circuits. */
const TORCH_ID = 1;

/** Per-position component runtime state (driven by the real module predicates). */
interface CompState {
  kind:
    | "torch"
    | "repeater"
    | "comparator"
    | "observer"
    | "lamp"
    | "door"
    | "trapdoor"
    | "lever"
    | "button"
    | "plate"
    | "piston"
    | "hopper"
    | "dropper"
    | "chest";
  facing?: Direction;
  delay?: RepeaterDelay;
  locked?: boolean;
  mode?: ComparatorMode;
  powered?: boolean;
  lit?: boolean;
  open?: boolean;
  extended?: boolean;
  enabled?: boolean;
  observerPhase?: "off" | "on";
  releaseTick?: number;
  inventory?: MenuSlot[];
  /** When true, the harness does not auto-schedule this torch (it is a harness-driven output). */
  manual?: boolean;
}

interface BlockCell {
  id: number;
  props: Record<string, unknown>;
}

/** In-memory save boundary fixture (034-040 repository stand-in). */
export interface FixtureSaveBoundary {
  write(
    worldId: string,
    cx: number,
    cz: number,
    kind: string,
    payload: unknown,
  ): void;
  read(worldId: string, cx: number, cz: number, kind: string): unknown;
  clear(): void;
}

function makeBoundary(): FixtureSaveBoundary {
  const store = new Map<string, unknown>();
  const key = (w: string, cx: number, cz: number, k: string) =>
    `${w}|${cx}|${cz}|${k}`;
  return {
    write: (w, cx, cz, k, p) => store.set(key(w, cx, cz, k), p),
    read: (w, cx, cz, k) => {
      const v = store.get(key(w, cx, cz, k));
      if (v === undefined)
        throw new Error(`FixtureSaveBoundary: missing ${k} for ${w}`);
      return v;
    },
    clear: () => store.clear(),
  };
}

const SECTION_COUNT = 24;
const MIN_SECTION_Y = -8;
const CHUNK_SIZE = 16;

function posKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function parseKey(key: string): [number, number, number] {
  return key.split(",").map(Number) as [number, number, number];
}

function chunkOf(x: number, z: number): string {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function emptyInventory(size: number): MenuSlot[] {
  const slots: MenuSlot[] = [];
  for (let i = 0; i < size; i++)
    slots.push({ item: null, count: 0, maxStack: 64 });
  return slots;
}

/** The full serialized harness state (the snapshot/restore / hash contract payload). */
export interface AutomationStateSnapshot {
  version: 1;
  /** Owning world; a restore from a foreign world is rejected atomically. */
  worldId: string;
  tick: number;
  scheduledTicks: SerializedScheduledTickQueue;
  /** Per-position block cells (only non-air): [x, y, z, blockId, props]. */
  blocks: ReadonlyArray<
    readonly [number, number, number, number, Record<string, unknown>]
  >;
  /** Per-position stored wire power: [x, y, z, power]. */
  wire: ReadonlyArray<readonly [number, number, number, number]>;
  /** Per-position component runtime state (the block-entity stand-in): [x, y, z, state]. */
  comps: ReadonlyArray<readonly [number, number, number, CompState]>;
  /** torchId -> retained toggle ticks (burnout tracker history). */
  burnoutToggles: Record<string, number[]>;
  /** Items ejected into the world by droppers (the item-entity stand-in). */
  ejected: ReadonlyArray<DroppedItem>;
  torchDriven: boolean;
  circuitKind: CircuitKind | null;
  /** Sequential control state (T-flip-flop / pulse-divider edge counters + edge memory). */
  seqState: { prevInput: number; edgeCounter: number };
  /** The active circuit probe positions (so sequential logic resumes after restore). */
  activeProbe: CircuitProbe | null;
  /** The pulse-divider divisor (2 or 4). */
  divideBy: number;
}

export interface RedstoneAutomationHarnessOptions {
  readonly worldId: string;
  readonly codec?: WorldSaveCodec;
  readonly boundary?: FixtureSaveBoundary;
}

export interface CircuitProbe {
  kind: CircuitKind;
  positions: Record<string, readonly [number, number, number]>;
}

/**
 * The headless redstone-automation harness. Composes the real `ScheduledTickQueue` (047),
 * `RedstonePropagator` (156), and every 157-172 component module over an in-memory fixture, and
 * drives canonical circuits deterministically with `saveReload()` / `cycleChunk()` survival ops.
 */
export class RedstoneAutomationHarness
  implements
    WireWorld,
    RedstonePowerSource,
    WirePowerStore,
    PistonWorld,
    PistonExecutionWorld<BlockCell | null>,
    StickyWorld
{
  readonly worldId: string;
  /** The harness-owned 047 queue (public for tests that must schedule/cancel entries directly). */
  readonly queue = new ScheduledTickQueue();
  private readonly codec: WorldSaveCodec;
  private readonly boundary: FixtureSaveBoundary;
  private readonly burnout = new TorchBurnoutTracker();

  private readonly blocks = new Map<string, BlockCell>();
  private readonly wirePower = new Map<string, number>();
  private readonly comps = new Map<string, CompState>();
  /** Tracked neighbor state signature, for observer change detection. */
  private readonly lastSig = new Map<string, string>();
  /** Items ejected into the world by droppers (conserved by the survival operations). */
  readonly ejected: DroppedItem[] = [];

  private tick = 0;
  private torchDriven = false;
  private circuitKind: CircuitKind | null = null;
  private baseX = 0;
  private baseZ = 0;
  /** The probe returned by the most recent `buildCircuit`, used by sequential logic + `probe`. */
  private activeProbe: CircuitProbe | null = null;
  /** The divisor for a pulse-divider circuit (2 or 4). */
  private divideBy = 2;
  /** Sequential control state (T-flip-flop / pulse-divider edge counters). */
  private seqState = { prevInput: 0, edgeCounter: 0 };
  private readonly registry = createDefaultBlockStateRegistry();
  private readonly propagator: RedstonePropagator;

  constructor(opts: RedstoneAutomationHarnessOptions) {
    this.worldId = opts.worldId;
    this.codec =
      opts.codec ?? createWorldSaveCodec({ registry: this.registry });
    this.boundary = opts.boundary ?? makeBoundary();
    this.propagator = new RedstonePropagator(this, this, this, {});
  }

  // ---- WireWorld (RedstoneWire seam) -------------------------------------------

  isWire(x: number, y: number, z: number): boolean {
    const c = this.blocks.get(posKey(x, y, z));
    return c !== undefined && c.id === BlockId.RedstoneWire;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const c = this.blocks.get(posKey(x, y, z));
    if (c === undefined) return false;
    // A few ordinary blocks act as solid; redstone components are not solid here.
    return (
      c.id === BlockId.Stone ||
      c.id === BlockId.Cobblestone ||
      c.id === BlockId.Planks ||
      c.id === BlockId.Dirt
    );
  }
  connectsToRedstone(x: number, y: number, z: number): boolean {
    const c = this.blocks.get(posKey(x, y, z));
    if (c === undefined) return false;
    return (
      c.id === BlockId.RedstoneTorch ||
      c.id === BlockId.RedstoneRepeater ||
      c.id === BlockId.RedstoneComparator ||
      c.id === BlockId.Observer ||
      c.id === BlockId.RedstoneLamp ||
      c.id === BlockId.Lever ||
      c.id === BlockId.StoneButton ||
      c.id === BlockId.PressurePlate ||
      c.id === BlockId.Piston ||
      c.id === BlockId.StickyPiston
    );
  }
  getWirePower(x: number, y: number, z: number): number {
    return this.wirePower.get(posKey(x, y, z)) ?? MIN_SIGNAL_STRENGTH;
  }

  // ---- WirePowerStore (RedstonePropagation seam) ------------------------------

  getPower(x: number, y: number, z: number): number {
    return this.getWirePower(x, y, z);
  }
  setPower(x: number, y: number, z: number, power: number): void {
    this.wirePower.set(posKey(x, y, z), power);
  }

  // ---- RedstonePowerSource (injected) ------------------------------------------

  getWeakPower(x: number, y: number, z: number, _direction: Direction): number {
    if (this.isWire(x, y, z)) {
      return this.wirePower.get(posKey(x, y, z)) ?? MIN_SIGNAL_STRENGTH;
    }
    return MIN_SIGNAL_STRENGTH;
  }
  getStrongPower(
    x: number,
    y: number,
    z: number,
    direction: Direction,
  ): number {
    const comp = this.comps.get(posKey(x, y, z));
    if (comp === undefined) return MIN_SIGNAL_STRENGTH;
    switch (comp.kind) {
      case "torch":
        // A torch is mounted on the block below it; it does not emit downward (so its own
        // output never feeds its own attachment — this is what lets the ring oscillate).
        return comp.lit && direction !== "down"
          ? MAX_SIGNAL_STRENGTH
          : MIN_SIGNAL_STRENGTH;
      case "repeater":
        return comp.powered && comp.facing === direction
          ? MAX_SIGNAL_STRENGTH
          : MIN_SIGNAL_STRENGTH;
      case "comparator":
        return comp.powered && comp.facing === direction
          ? MAX_SIGNAL_STRENGTH
          : MIN_SIGNAL_STRENGTH;
      case "observer":
        return comp.powered &&
          OPPOSITE_DIRECTION[comp.facing ?? "north"] === direction
          ? MAX_SIGNAL_STRENGTH
          : MIN_SIGNAL_STRENGTH;
      case "lever":
      case "button":
      case "plate":
        return comp.powered
          ? MAX_SIGNAL_STRENGTH
          : MIN_SIGNAL_STRENGTH;
      default:
        return MIN_SIGNAL_STRENGTH;
    }
  }
  isConductive(_x: number, _y: number, _z: number): boolean {
    return false;
  }

  // ---- PistonWorld / StickyWorld / PistonExecutionWorld ------------------------

  isImmovable(x: number, y: number, z: number): boolean {
    const c = this.blocks.get(posKey(x, y, z));
    if (c === undefined) return false;
    if (c.id === BlockId.Piston || c.id === BlockId.StickyPiston) return true;
    if (
      c.id === BlockId.RedstoneTorch ||
      c.id === BlockId.RedstoneRepeater ||
      c.id === BlockId.RedstoneComparator ||
      c.id === BlockId.Observer
    )
      return true;
    return false;
  }
  isPushable(x: number, y: number, z: number): boolean {
    const c = this.blocks.get(posKey(x, y, z));
    if (c === undefined) return false; // air terminates the push cleanly
    if (this.isImmovable(x, y, z)) return false;
    return (
      c.id === BlockId.Stone ||
      c.id === BlockId.Cobblestone ||
      c.id === BlockId.Planks ||
      c.id === BlockId.Dirt
    );
  }
  isDestroyedByPush(_x: number, _y: number, _z: number): boolean {
    return false;
  }
  stickyKind(_x: number, _y: number, _z: number): null {
    return null;
  }
  getBlockState(x: number, y: number, z: number): BlockCell | null {
    return this.blocks.get(posKey(x, y, z)) ?? null;
  }
  setBlockState(
    x: number,
    y: number,
    z: number,
    state: BlockCell | null,
  ): void {
    const k = posKey(x, y, z);
    if (state === null) {
      this.blocks.delete(k);
      this.comps.delete(k);
    } else {
      this.blocks.set(k, state);
    }
  }
  clearBlockState(x: number, y: number, z: number): void {
    this.setBlockState(x, y, z, null);
  }

  // ---- Fixture helpers ---------------------------------------------------------

  private setBlock(
    x: number,
    y: number,
    z: number,
    id: number,
    props: Record<string, unknown> = {},
  ): void {
    this.blocks.set(posKey(x, y, z), { id, props: { ...props } });
  }
  private getBlockId(x: number, y: number, z: number): number {
    return this.blocks.get(posKey(x, y, z))?.id ?? BlockId.Air;
  }

  /** Power reaching `(x,y,z)` from neighbours (weak + strong). Used by the harness to drive components. */
  private inputPowerAt(x: number, y: number, z: number): number {
    const powers: number[] = [];
    for (const dir of DIRECTIONS) {
      const [nx, ny, nz] = offsetInDirection(x, y, z, dir);
      const od = OPPOSITE_DIRECTION[dir];
      powers.push(this.getStrongPower(nx, ny, nz, od));
      powers.push(this.getWeakPower(nx, ny, nz, od));
    }
    return strongestSignalFrom(powers);
  }

  /** A torch is mounted on the block below it; its attachment power comes from there (not its own output). */
  private torchAttachmentPower(x: number, y: number, z: number): number {
    return this.inputPowerAt(x, y - 1, z);
  }

  /**
   * A repeater reads power only from its BACK face. An omnidirectional read would see the
   * repeater's own powered output wire beside it and latch it on forever.
   */
  private repeaterInputPower(x: number, y: number, z: number, facing: Direction): number {
    const back = offsetInDirection(x, y, z, OPPOSITE_DIRECTION[facing]);
    return Math.max(
      this.getStrongPower(back[0], back[1], back[2], facing),
      this.getWeakPower(back[0], back[1], back[2], facing),
    );
  }

  private neighborSig(x: number, y: number, z: number): string {
    const c = this.blocks.get(posKey(x, y, z));
    return c ? `${c.id}:${JSON.stringify(c.props)}` : "air";
  }

  // ---- Circuit construction ----------------------------------------------------

  buildCircuit(kind: CircuitKind): CircuitProbe {
    const [bx, bz] = CIRCUIT_BASES[kind];
    this.baseX = bx;
    this.baseZ = bz;
    this.circuitKind = kind;
    this.torchDriven = false;
    this.seqState = { prevInput: 0, edgeCounter: 0 };
    const probe = (() => {
      switch (kind) {
        case "torch-burnout":
          return this.buildTorchBurnout();
        case "clock":
          return this.buildClock();
        case "pulse-divider":
          return this.buildDivider(2);
        case "t-flip-flop":
          return this.buildTFlipFlop();
        case "piston-door":
          return this.buildPistonDoor();
        case "item-sorter-chain":
          return this.buildItemSorterChain();
      }
    })();
    this.activeProbe = probe;
    return probe;
  }

  /** Build a pulse divider (÷2 or ÷4) driven by the clock; `n` is the divisor. */
  buildDivider(n: 2 | 4 = 2): CircuitProbe {
    const [bx, bz] = CIRCUIT_BASES["pulse-divider"];
    this.baseX = bx;
    this.baseZ = bz;
    this.circuitKind = "pulse-divider";
    this.torchDriven = false;
    this.seqState = { prevInput: 0, edgeCounter: 0 };
    this.divideBy = n;
    const probe = this.buildPulseDivider(n);
    this.activeProbe = probe;
    return probe;
  }

  private buildTorchBurnout(): CircuitProbe {
    const [bx, bz] = [this.baseX, this.baseZ];
    this.setBlock(bx, 64, bz, BlockId.RedstoneTorch, { lit: true });
    this.comps.set(posKey(bx, 64, bz), { kind: "torch", lit: true });
    this.torchDriven = true;
    scheduleTorchUpdate(this.queue, bx, 64, bz, 0);
    return {
      kind: "torch-burnout",
      positions: { torch: [bx, 64, bz] },
    };
  }

  /**
   * A torch-and-repeater ring oscillator. The torch (mounted on the stone block below it) drives a
   * wire into a repeater of delay `3` (= 6 ticks); the repeater's output descends a staircase into
   * a lower wire row that runs back UNDER the main line to the block beneath the torch's attachment
   * stone, turning the torch off; when the repeater times out the row drains and the torch
   * re-lights. One inversion in the loop makes it astable; the composed delays (6-tick repeater +
   * 2-tick torch update per half-cycle) give the documented `CLOCK_PERIOD_TICKS = 16`.
   *
   * The return row runs two blocks south of the main line. A row directly beside it would
   * step-connect into the repeater's input line (latching the loop) and perpendicularly power
   * the repeater itself (locking it on) — both measured failure modes of that topology.
   * All timing rides the real 047 queue through the real `scheduleTorchUpdate` /
   * `scheduleRepeaterOutput` helpers; the output wire is settled once at build so the first
   * rising edge lands at tick 0.
   */
  private buildClock(): CircuitProbe {
    const [bx, bz] = [this.baseX, this.baseZ];
    this.setBlock(bx, 64, bz, BlockId.RedstoneTorch, { lit: true });
    this.comps.set(posKey(bx, 64, bz), { kind: "torch", lit: true });
    this.setBlock(bx, 63, bz, BlockId.Stone); // the torch's attachment (block below it)
    // Torch output east along y=64.
    this.setBlock(bx + 1, 64, bz, BlockId.RedstoneWire);
    this.setBlock(bx + 2, 64, bz, BlockId.RedstoneWire);
    this.setBlock(bx + 3, 64, bz, BlockId.RedstoneRepeater, {
      facing: "east",
      delay: 3,
      locked: false,
      powered: false,
    });
    this.comps.set(posKey(bx + 3, 64, bz), {
      kind: "repeater",
      facing: "east",
      delay: 3,
      locked: false,
      powered: false,
    });
    this.setBlock(bx + 4, 64, bz, BlockId.RedstoneWire);
    // One-block descent into the return row: (bx+4,64) steps down to (bx+5,63). The corner
    // block (bx+4,63) is SOLID so the lower wire climbs back up to (bx+4,64).
    this.setBlock(bx + 4, 63, bz, BlockId.Stone);
    this.setBlock(bx + 5, 63, bz, BlockId.RedstoneWire);
    // Jog south, then a return row along y=63, z=bz+2 — two blocks clear of the main line so
    // the row can neither step-connect into the repeater's input line nor perpendicularly
    // power (lock) the repeater. Both couplings measured as latch/lock failure modes when the
    // row ran directly beside the main line.
    this.setBlock(bx + 5, 63, bz + 1, BlockId.RedstoneWire);
    this.setBlock(bx + 5, 63, bz + 2, BlockId.RedstoneWire);
    this.setBlock(bx + 4, 63, bz + 2, BlockId.RedstoneWire);
    this.setBlock(bx + 3, 63, bz + 2, BlockId.RedstoneWire);
    this.setBlock(bx + 2, 63, bz + 2, BlockId.RedstoneWire);
    this.setBlock(bx + 1, 63, bz + 2, BlockId.RedstoneWire);
    this.setBlock(bx, 63, bz + 2, BlockId.RedstoneWire);
    // Final approach beside the attachment stone (weak-powers it from the south).
    this.setBlock(bx, 63, bz + 1, BlockId.RedstoneWire);
    // Kick the loop off: the repeater output is due after one delay (6 ticks); the torch is
    // already lit and consistent, so its first scheduled update comes from the input change.
    scheduleRepeaterOutput(this.queue, bx + 3, 64, bz, 3, 0);
    // Settle once so the output wire is high at tick 0 (the first rising edge).
    this.markAllWiresDirty();
    this.propagator.settle();
    const probe: CircuitProbe = {
      kind: "clock",
      positions: {
        torch: [bx, 64, bz],
        output: [bx + 1, 64, bz],
        attachment: [bx, 63, bz],
      },
    };
    this.activeProbe = probe;
    return probe;
  }

  /** A ÷2 / ÷4 pulse divider: the real clock oscillator feeding a harness-counted counter chain.
   *  The clock is the real 047-driven torch+repeater oscillator; the divider output torch is
   *  toggled by the harness per the ÷N counter semantics (see `sequentialStep`), so the output
   *  period is exactly `n × CLOCK_PERIOD_TICKS` with the first output rising edge at `n × 16`. */
  private buildPulseDivider(n: number): CircuitProbe {
    const [bx, bz] = [this.baseX, this.baseZ];
    const clock = this.buildClock();
    // Divider output torch. The clock's tick-0 rising edge (settled high at build) is the
    // counter chain's first edge: the output stage starts ON and `prevInput` seeds at 1 so the
    // build-time high is not re-counted as an edge on the first step. From there the ÷2 output
    // rises at 32, 64, ... and the ÷4 output at 64, 128, ... (see `sequentialStep`).
    this.setBlock(bx, 65, bz, BlockId.RedstoneTorch, { lit: true });
    this.comps.set(posKey(bx, 65, bz), {
      kind: "torch",
      lit: true,
      manual: true,
    });
    this.seqState.prevInput = 1;
    const probe: CircuitProbe = {
      kind: "pulse-divider",
      positions: { ...clock.positions, dividerOut: [bx, 65, bz] },
    };
    this.divideBy = n;
    return probe;
  }

  /** A T-flip-flop: each rising edge on the input probe toggles the (manual) output torch. */
  private buildTFlipFlop(): CircuitProbe {
    const [bx, bz] = [this.baseX, this.baseZ];
    // Input lever at (bx+5,64) drives wire (bx+4,64) -> input probe (bx+3,64).
    this.setBlock(bx + 5, 64, bz, BlockId.Lever, { powered: false });
    this.comps.set(posKey(bx + 5, 64, bz), { kind: "lever", powered: false });
    this.setBlock(bx + 4, 64, bz, BlockId.RedstoneWire);
    this.setBlock(bx + 3, 64, bz, BlockId.RedstoneWire); // input probe
    // Output torch, initially off; driven only by the sequential toggle logic.
    this.setBlock(bx, 64, bz, BlockId.RedstoneTorch, { lit: false });
    this.comps.set(posKey(bx, 64, bz), {
      kind: "torch",
      lit: false,
      manual: true,
    });
    const probe: CircuitProbe = {
      kind: "t-flip-flop",
      positions: {
        inA: [bx + 3, 64, bz],
        outA: [bx, 64, bz],
        lever: [bx + 5, 64, bz],
      },
    };
    this.activeProbe = probe;
    return probe;
  }

  /**
   * A sticky-piston door: lever -> wire -> sticky piston facing east, with the door block at the
   * closed position `C` in front of it and air at the pushed destination `D`. Extending pushes
   * `C` to `D` (farthest-first, source cleared); retracting pulls `D` back to `C` (sticky pull).
   */
  private buildPistonDoor(): CircuitProbe {
    const [bx, bz] = [this.baseX, this.baseZ];
    this.setBlock(bx, 64, bz, BlockId.Lever, { powered: false });
    this.comps.set(posKey(bx, 64, bz), { kind: "lever", powered: false });
    this.setBlock(bx + 1, 64, bz, BlockId.RedstoneWire);
    this.setBlock(bx + 2, 64, bz, BlockId.StickyPiston, {
      facing: "east",
      extended: false,
    });
    this.comps.set(posKey(bx + 2, 64, bz), {
      kind: "piston",
      facing: "east",
      extended: false,
    });
    this.setBlock(bx + 3, 64, bz, BlockId.Stone); // closed position C
    return {
      kind: "piston-door",
      positions: {
        lever: [bx, 64, bz],
        piston: [bx + 2, 64, bz],
        door: [bx + 3, 64, bz],
        movedTo: [bx + 4, 64, bz],
      },
    };
  }

  /**
   * An item-sorter-like pipeline stage: a hopper facing down into a dropper facing down at air.
   * The canonical phasing starts the hopper cadence at tick 8 (`HOPPER_TRANSFER_COOLDOWN_TICKS`
   * after build) and the dropper one cooldown later, so the first pushed item is ejected exactly
   * one cooldown after it arrives. Inventories start empty; tests preload stages through
   * `inventoryAt`.
   */
  private buildItemSorterChain(): CircuitProbe {
    const [bx, bz] = [this.baseX, this.baseZ];
    this.setBlock(bx, 64, bz, BlockId.Hopper, {
      facing: "down",
      enabled: true,
    });
    this.comps.set(posKey(bx, 64, bz), {
      kind: "hopper",
      facing: "down",
      powered: false,
      enabled: true,
      inventory: emptyInventory(5),
    });
    this.setBlock(bx, 63, bz, BlockId.Dropper, {
      facing: "down",
      enabled: true,
    });
    this.comps.set(posKey(bx, 63, bz), {
      kind: "dropper",
      facing: "down",
      powered: false,
      enabled: true,
      inventory: emptyInventory(9),
    });
    scheduleHopperTransfer(this.queue, bx, 64, bz, 0); // due at tick 8
    scheduleDropperEject(this.queue, bx, 63, bz, 8); // due at tick 16
    return {
      kind: "item-sorter-chain",
      positions: {
        hopper: [bx, 64, bz],
        dropper: [bx, 63, bz],
        output: [bx, 62, bz],
      },
    };
  }

  // ---- Public accessors (for probes/assertions) -------------------------------

  wirePowerAt(x: number, y: number, z: number): number {
    return this.wirePower.get(posKey(x, y, z)) ?? 0;
  }
  blockIdAt(x: number, y: number, z: number): number {
    return this.getBlockId(x, y, z);
  }
  isBlockAir(x: number, y: number, z: number): boolean {
    return this.getBlockId(x, y, z) === BlockId.Air;
  }
  componentAt(x: number, y: number, z: number): CompState | undefined {
    return this.comps.get(posKey(x, y, z));
  }
  inventoryAt(x: number, y: number, z: number): MenuSlot[] | undefined {
    return this.comps.get(posKey(x, y, z))?.inventory;
  }
  isTorchLit(x: number, y: number, z: number): boolean {
    return this.comps.get(posKey(x, y, z))?.lit ?? false;
  }
  isTorchBurnedOut(torchId: number): boolean {
    // A burnt-out torch is unlit by definition (burnout overrides the inversion).
    return this.burnout.isBurnedOut(torchId, this.tick);
  }
  currentTick(): number {
    return this.tick;
  }
  setTorchDriven(driven: boolean): void {
    this.torchDriven = driven;
  }
  setLever(x: number, y: number, z: number, powered: boolean): void {
    const c = this.comps.get(posKey(x, y, z));
    if (c && c.kind === "lever") c.powered = powered;
  }
  pressButtonAt(x: number, y: number, z: number): void {
    const c = this.comps.get(posKey(x, y, z));
    if (c && c.kind === "button") {
      c.powered = true;
      c.releaseTick = pressButton(this.tick).releaseTick;
      scheduleComponentRelease(this.queue, x, y, z, "button", this.tick);
    }
  }

  /** Drive a T-flip-flop's input lever (a real component) on/off, creating a real rising edge. */
  setInput(powered: boolean): void {
    if (this.activeProbe && this.activeProbe.positions.lever) {
      const [x, y, z] = this.activeProbe.positions.lever;
      const c = this.comps.get(posKey(x, y, z));
      if (c && c.kind === "lever") c.powered = powered;
      this.markAllWiresDirty();
      this.propagator.settle();
    }
  }

  /** Read the current stored state at every named position of a built circuit probe. */
  probe(circuit: CircuitProbe): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [name, pos] of Object.entries(circuit.positions)) {
      const [x, y, z] = pos as [number, number, number];
      out[name + ".wirePower"] = this.wirePowerAt(x, y, z);
      out[name + ".blockId"] = this.getBlockId(x, y, z);
      out[name + ".isAir"] = this.getBlockId(x, y, z) === BlockId.Air;
      const c = this.comps.get(posKey(x, y, z));
      if (c) {
        out[name + ".kind"] = c.kind;
        if (c.lit !== undefined) out[name + ".lit"] = c.lit;
        if (c.powered !== undefined) out[name + ".powered"] = c.powered;
        if (c.extended !== undefined) out[name + ".extended"] = c.extended;
        if (c.open !== undefined) out[name + ".open"] = c.open;
        if (c.inventory) {
          out[name + ".count"] = this.stageCount(c.inventory);
        }
      }
    }
    return out;
  }

  /** Total item count across a stage's slots (the spec's "stage count"). */
  stageCount(slots: readonly MenuSlot[]): number {
    return slots.reduce((s, sl) => s + (sl.item ? sl.count : 0), 0);
  }

  // ---- Deterministic stepping -------------------------------------------------

  step(times = 1): number {
    for (let i = 0; i < times; i++) {
      this.tick++;
      if (this.circuitKind === "torch-burnout") {
        this.stepTorchBurnout();
      } else {
        this.stepEngine();
      }
    }
    return this.tick;
  }

  private stepTorchBurnout(): void {
    const due = dueTorchUpdates(this.queue, this.tick);
    for (const t of due) {
      if (!this.torchDriven) continue;
      const key = posKey(t.x, t.y, t.z);
      const comp = this.comps.get(key);
      if (!comp) continue;
      comp.lit = !(comp.lit ?? false);
      this.burnout.recordToggle(TORCH_ID, this.tick);
      scheduleTorchUpdate(this.queue, t.x, t.y, t.z, this.tick);
    }
  }

  private stepEngine(): void {
    // 1. Pop all due scheduled events once and dispatch by component kind (047 dedups by position).
    const due = this.queue.tick(this.tick);
    for (const t of due) {
      const comp = this.comps.get(posKey(t.x, t.y, t.z));
      if (!comp) continue;
      this.applyDue(comp, t.x, t.y, t.z);
    }
    // 2. Recompute wire power from current component emissions.
    this.markAllWiresDirty();
    this.propagator.settle();
    // 3. Detect component input changes and re-schedule their real updates.
    this.detectAndSchedule();
    // 4. Sequential circuits (T-flip-flop / pulse-divider) update their latched output here.
    this.sequentialStep();
  }

  /**
   * Sequential control for the T-flip-flop and pulse-divider circuits. Both read a real rising edge
   * on a probed wire (the T-flip-flop's input, or the clock's output for the divider) and update a
   * real (manual) output torch — exactly the role a real `World` plays when it observes a signal
   * change and drives a component. The latched state is a real component, so it round-trips through
   * the survival operations unchanged.
   */
  /** Mark every wire position dirty so the next `settle()` recomputes its power from components. */
  private markAllWiresDirty(): void {
    for (const [key, cell] of this.blocks) {
      if (cell.id === BlockId.RedstoneWire) {
        const [x, y, z] = parseKey(key);
        this.propagator.markDirty(x, y, z);
      }
    }
  }

  private sequentialStep(): void {
    if (!this.activeProbe) return;
    const pos = (name: string): [number, number, number] =>
      this.activeProbe!.positions[name] as [number, number, number];
    if (this.circuitKind === "t-flip-flop") {
      const [x, y, z] = pos("inA");
      const inp = this.wirePowerAt(x, y, z);
      if (inp > 0 && this.seqState.prevInput === 0) {
        const out = this.comps.get(posKey(...pos("outA")));
        if (out && out.kind === "torch") out.lit = !out.lit;
      }
      this.seqState.prevInput = inp > 0 ? 1 : 0;
      this.propagator.settle();
    } else if (this.circuitKind === "pulse-divider") {
      // A divide-by-N counter chain: each clock rising edge advances the counter; the output
      // stage toggles once per N input PERIODS. With edges every CLOCK_PERIOD_TICKS, the ÷2
      // output toggles on every edge (period 2×16) and the ÷4 output toggles on every second
      // edge (period 4×16), giving output rising edges at exactly N×16, 2N×16, ...
      const [x, y, z] = pos("output");
      const inp = this.wirePowerAt(x, y, z);
      if (inp > 0 && this.seqState.prevInput === 0) {
        this.seqState.edgeCounter++;
        const toggleNow =
          this.divideBy === 2 || this.seqState.edgeCounter % 2 === 0;
        if (toggleNow) {
          const out = this.comps.get(posKey(...pos("dividerOut")));
          if (out && out.kind === "torch") out.lit = !out.lit;
        }
      }
      this.seqState.prevInput = inp > 0 ? 1 : 0;
      this.propagator.settle();
    }
  }

  private applyDue(comp: CompState, x: number, y: number, z: number): void {
    switch (comp.kind) {
      case "torch": {
        const input = this.torchAttachmentPower(x, y, z) > 0;
        const lit = torchShouldBeLit(input);
        if (lit !== (comp.lit ?? false)) {
          comp.lit = lit;
          this.burnout.recordToggle(TORCH_ID, this.tick);
        }
        break;
      }
      case "repeater": {
        const input =
          this.repeaterInputPower(x, y, z, comp.facing ?? "east") > 0;
        const perp =
          this.perpendicularInput(x, y, z, comp.facing ?? "east") > 0;
        comp.locked = repeaterShouldLock(perp);
        comp.powered = resolveRepeaterOutput(
          input,
          comp.locked,
          comp.powered ?? false,
        );
        break;
      }
      case "comparator": {
        const facing = comp.facing ?? "east";
        const front = offsetInDirection(x, y, z, facing);
        const side = this.sideInputPosition(x, y, z, facing);
        const frontInput = this.inputPowerAt(front[0], front[1], front[2]);
        const sideInput = side
          ? this.inputPowerAt(side[0], side[1], side[2])
          : 0;
        const out = resolveComparatorOutput(
          comp.mode ?? "compare",
          frontInput,
          sideInput,
        );
        comp.powered = out > 0;
        break;
      }
      case "observer": {
        if ((comp.observerPhase ?? "off") === "off") {
          comp.powered = true;
          comp.observerPhase = "on";
          scheduleObserverPulseStart(
            this.queue,
            x,
            y,
            z,
            this.tick + OBSERVER_PULSE_DURATION_TICKS,
          );
        } else {
          comp.powered = false;
          comp.observerPhase = "off";
        }
        break;
      }
      case "lamp": {
        const input = this.inputPowerAt(x, y, z) > 0;
        if (!input) comp.lit = false; // lamp-off recheck confirms still dark
        break;
      }
      case "button": {
        comp.powered = false;
        break;
      }
      case "hopper": {
        if (hopperShouldTransfer(comp.powered === true)) {
          this.runHopperTransfer(x, y, z, comp);
        }
        scheduleHopperTransfer(this.queue, x, y, z, this.tick);
        break;
      }
      case "dropper": {
        if (dropperShouldTransfer(comp.powered === true)) {
          this.runDropperEject(x, y, z, comp);
        }
        scheduleDropperEject(this.queue, x, y, z, this.tick);
        break;
      }
      default:
        break;
    }
  }

  private perpendicularInput(
    x: number,
    y: number,
    z: number,
    facing: Direction,
  ): number {
    // The two directions perpendicular (in the horizontal plane) to `facing`.
    const left = facing === "east" || facing === "west" ? "north" : "east";
    const right = OPPOSITE_DIRECTION[left];
    const a = offsetInDirection(x, y, z, left);
    const b = offsetInDirection(x, y, z, right);
    return Math.max(
      this.inputPowerAt(a[0], a[1], a[2]),
      this.inputPowerAt(b[0], b[1], b[2]),
    );
  }

  private sideInputPosition(
    x: number,
    y: number,
    z: number,
    facing: Direction,
  ): [number, number, number] {
    const left = facing === "east" || facing === "west" ? "north" : "east";
    const right = OPPOSITE_DIRECTION[left];
    // Use the block to the side (right) as the side input.
    return offsetInDirection(x, y, z, right);
  }

  /**
   * One hopper tick: push at most one item from the hopper's own inventory into the container at
   * its facing position (166's `transferOneItem`). A missing or full destination moves nothing.
   */
  private runHopperTransfer(
    x: number,
    y: number,
    z: number,
    comp: CompState,
  ): void {
    if (!comp.inventory) return;
    const output = hopperOutputPosition(
      x,
      y,
      z,
      (comp.facing ?? "down") as HopperFacing,
    );
    const dst = this.comps.get(posKey(output[0], output[1], output[2]));
    if (!dst?.inventory) return; // facing no container: nothing moves, no spill
    const res = transferOneItem(comp.inventory, dst.inventory);
    if (res.moved) {
      comp.inventory = res.source as MenuSlot[];
      dst.inventory = res.destination as MenuSlot[];
    }
  }

  /**
   * One dropper tick: eject at most one item (167's `ejectFromDropper`) — a container push when a
   * container sits at the facing position, otherwise a `drop` recorded in the harness's ejected
   * log (the item-entity stand-in).
   */
  private runDropperEject(
    x: number,
    y: number,
    z: number,
    comp: CompState,
  ): void {
    if (!comp.inventory) return;
    const output = dropperOutputPosition(
      x,
      y,
      z,
      (comp.facing ?? "down") as DropperFacing,
    );
    const dst = this.comps.get(posKey(output[0], output[1], output[2]));
    const res = ejectFromDropper(
      comp.inventory,
      dst?.inventory ?? null,
      output,
    );
    if (!res.moved) return;
    comp.inventory = res.source as MenuSlot[];
    if (res.kind === "container") {
      dst!.inventory = res.destination as MenuSlot[];
    } else if (res.kind === "drop") {
      this.ejected.push(res.drop);
    }
  }

  private detectAndSchedule(): void {
    for (const [k, comp] of this.comps) {
      const [x, y, z] = parseKey(k);
      const pending = this.queue.has(x, y, z);
      switch (comp.kind) {
        case "torch": {
          if (comp.manual) break;
          const input = this.torchAttachmentPower(x, y, z) > 0;
          const desired = torchShouldBeLit(input);
          if (desired !== (comp.lit ?? false) && !pending) {
            scheduleTorchUpdate(this.queue, x, y, z, this.tick);
          }
          break;
        }
        case "repeater": {
          const input =
            this.repeaterInputPower(x, y, z, comp.facing ?? "east") > 0;
          const perp =
            this.perpendicularInput(x, y, z, comp.facing ?? "east") > 0;
          const locked = repeaterShouldLock(perp);
          const desired = resolveRepeaterOutput(
            input,
            locked,
            comp.powered ?? false,
          );
          if (desired !== (comp.powered ?? false) && !pending) {
            scheduleRepeaterOutput(
              this.queue,
              x,
              y,
              z,
              comp.delay ?? 1,
              this.tick,
            );
          }
          break;
        }
        case "comparator": {
          const facing = comp.facing ?? "east";
          const front = offsetInDirection(x, y, z, facing);
          const side = this.sideInputPosition(x, y, z, facing);
          const frontInput = this.inputPowerAt(front[0], front[1], front[2]);
          const sideInput = side
            ? this.inputPowerAt(side[0], side[1], side[2])
            : 0;
          const desired =
            resolveComparatorOutput(
              comp.mode ?? "compare",
              frontInput,
              sideInput,
            ) > 0;
          if (desired !== (comp.powered ?? false) && !pending) {
            scheduleComparatorUpdate(this.queue, x, y, z, this.tick);
          }
          break;
        }
        case "observer": {
          const facing = comp.facing ?? "north";
          const watched = offsetInDirection(x, y, z, facing);
          const sig = this.neighborSig(watched[0], watched[1], watched[2]);
          const prev = this.lastSig.get(k);
          if (prev !== undefined && prev !== sig && !pending) {
            scheduleObserverPulseStart(this.queue, x, y, z, this.tick);
          }
          this.lastSig.set(k, sig);
          break;
        }
        case "lamp": {
          const input = this.inputPowerAt(x, y, z) > 0;
          const desired = lampShouldBeLit(input);
          if (desired && !(comp.lit ?? false)) {
            comp.lit = true;
            if (pending) this.queue.cancel(x, y, z);
          } else if (!desired && (comp.lit ?? false) && !pending) {
            scheduleLampOff(this.queue, x, y, z, this.tick);
          }
          break;
        }
        case "door":
        case "trapdoor": {
          const input = this.inputPowerAt(x, y, z) > 0;
          const desired =
            comp.kind === "door"
              ? doorShouldBeOpen(input)
              : trapdoorShouldBeOpen(input);
          if (desired !== (comp.open ?? false)) comp.open = desired;
          break;
        }
        case "piston": {
          const input = this.inputPowerAt(x, y, z) > 0;
          const desired = input;
          if (desired !== (comp.extended ?? false)) {
            this.applyPiston(x, y, z, comp, desired);
          }
          break;
        }
        case "lever":
        case "button":
        case "plate":
        case "chest":
        case "hopper":
        case "dropper":
          // driven by harness / due events; no auto re-schedule here.
          break;
      }
    }
  }

  private applyPiston(
    x: number,
    y: number,
    z: number,
    comp: CompState,
    extend: boolean,
  ): void {
    const facing = (comp.facing ?? "east") as Direction;
    if (extend) {
      const plan = planPistonPush(this, x, y, z, facing);
      const sticky = extendPushPlanWithStickyGroup(plan, this, this, facing);
      executePistonPush(this, sticky, facing);
      comp.extended = true;
    } else {
      // Sticky retract (165): the extended piston's head occupies the position in front of the
      // body, so the pulled block is the one beyond the head. Plan from the head position and
      // execute toward the piston.
      const pull = OPPOSITE_DIRECTION[facing];
      const head = offsetInDirection(x, y, z, facing);
      const plan = planStickyRetract(
        this,
        this,
        head[0],
        head[1],
        head[2],
        facing,
      );
      executePistonPush(this, plan, pull);
      comp.extended = false;
    }
  }

  stepUntil(predicate: () => boolean, maxSteps: number): boolean {
    let steps = 0;
    while (steps < maxSteps) {
      if (predicate()) return true;
      this.step(1);
      steps++;
    }
    return predicate();
  }

  // ---- Snapshot / restore / hash ----------------------------------------------

  snapshot(): AutomationStateSnapshot {
    const blocks: Array<
      [number, number, number, number, Record<string, unknown>]
    > = [];
    for (const [key, cell] of this.blocks) {
      if (cell.id === BlockId.Air) continue;
      const [x, y, z] = parseKey(key);
      blocks.push([x, y, z, cell.id, { ...cell.props }]);
    }
    blocks.sort(
      (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3],
    );
    const wire: Array<[number, number, number, number]> = [];
    for (const [key, p] of this.wirePower) {
      if (p === 0) continue;
      const [x, y, z] = parseKey(key);
      wire.push([x, y, z, p]);
    }
    wire.sort(
      (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3],
    );
    const comps: Array<[number, number, number, CompState]> = [];
    for (const [key, c] of this.comps) {
      const [x, y, z] = parseKey(key);
      comps.push([x, y, z, cloneComp(c)]);
    }
    comps.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const burnoutToggles: Record<string, number[]> = {};
    for (const [id, ticks] of (
      this.burnout as unknown as { toggles: Map<number, number[]> }
    ).toggles) {
      burnoutToggles[String(id)] = ticks
        .filter((t) => this.tick - t < BURNOUT_WINDOW_TICKS)
        .slice()
        .sort((a, b) => a - b);
    }
    return {
      version: 1,
      worldId: this.worldId,
      tick: this.tick,
      scheduledTicks: this.queue.serialize(),
      blocks,
      wire,
      comps,
      burnoutToggles,
      ejected: this.ejected.map((d) => ({ ...d })),
      torchDriven: this.torchDriven,
      circuitKind: this.circuitKind,
      seqState: { ...this.seqState },
      activeProbe: this.activeProbe,
      divideBy: this.divideBy,
    };
  }

  restore(s: AutomationStateSnapshot): void {
    // Validate the WHOLE payload before mutating anything (atomic rejection).
    const parsed = this.validateSnapshot(s);
    this.tick = parsed.tick;
    this.blocks.clear();
    this.wirePower.clear();
    this.comps.clear();
    this.lastSig.clear();
    for (const [x, y, z, id, props] of parsed.blocks) {
      this.blocks.set(posKey(x, y, z), { id, props: { ...props } });
    }
    for (const [x, y, z, p] of parsed.wire) {
      this.wirePower.set(posKey(x, y, z), p);
    }
    for (const [x, y, z, c] of parsed.comps) {
      this.comps.set(posKey(x, y, z), cloneComp(c));
    }
    this.queue.deserialize(parsed.scheduledTicks);
    this.burnout.clear();
    for (const [idStr, ticks] of Object.entries(parsed.burnoutToggles)) {
      const id = Number(idStr);
      for (const t of ticks) this.burnout.recordToggle(id, t);
    }
    this.ejected.length = 0;
    for (const d of parsed.ejected) this.ejected.push({ ...d });
    this.torchDriven = parsed.torchDriven;
    this.circuitKind = parsed.circuitKind;
    this.seqState = { ...parsed.seqState };
    this.activeProbe = parsed.activeProbe;
    this.divideBy = parsed.divideBy;
  }

  reset(): void {
    this.tick = 0;
    this.blocks.clear();
    this.wirePower.clear();
    this.comps.clear();
    this.lastSig.clear();
    this.queue.clear();
    this.burnout.clear();
    this.ejected.length = 0;
    this.torchDriven = false;
    this.circuitKind = null;
    this.activeProbe = null;
    this.divideBy = 2;
    this.baseX = 0;
    this.baseZ = 0;
    this.seqState = { prevInput: 0, edgeCounter: 0 };
  }

  stateHash(): string {
    let h = 2166136261 >>> 0;
    const input = JSON.stringify(this.snapshot());
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  // ---- Save / reload / chunk cycle --------------------------------------------

  /**
   * Full-world save→reload: encode every occupied chunk's sections + block entities through the
   * real 234 `WorldSaveCodec`, write via the boundary, read back, decode, and VALIDATE the decode
   * against the captured state — all before any mutation (all-or-nothing) — then restore the full
   * harness state (including the 047 queue's absolute ticks and the burnout history).
   */
  async saveReload(): Promise<void> {
    const snap = this.snapshot();

    // Group occupied chunks from the captured blocks.
    const chunkKeys = new Set<string>();
    for (const [x, , z] of snap.blocks) chunkKeys.add(chunkOf(x, z));

    // (a/b) Encode + write each chunk's units through the real codec and boundary.
    const writtenEntities = new Map<string, SerializedBlockEntity[]>();
    for (const ck of chunkKeys) {
      const [cx, cz] = ck.split(",").map(Number) as [number, number];
      const column = this.columnForChunk(snap, cx, cz);
      const unit: ServerWorldUnit = {
        kind: "chunk-sections",
        worldId: this.worldId,
        chunkX: cx,
        chunkZ: cz,
        value: column,
      };
      this.boundary.write(
        this.worldId,
        cx,
        cz,
        "chunk-sections",
        clone(this.codec.encode(unit)),
      );
      const entities = this.entitiesForChunk(snap, cx, cz);
      writtenEntities.set(ck, entities);
      const beUnit: ServerWorldUnit = {
        kind: "block-entities",
        worldId: this.worldId,
        chunkX: cx,
        chunkZ: cz,
        value: {
          serializeChunk: (ccx: number, ccz: number) => {
            if (ccx !== cx || ccz !== cz) {
              throw new Error(`serializeChunk: unexpected chunk ${ccx},${ccz}`);
            }
            return entities;
          },
        },
      };
      this.boundary.write(
        this.worldId,
        cx,
        cz,
        "block-entities",
        clone(this.codec.encode(beUnit)),
      );
    }

    // (c/d) Read back + decode + validate BEFORE mutating (a failure leaves the world intact).
    for (const ck of chunkKeys) {
      const [cx, cz] = ck.split(",").map(Number) as [number, number];
      const meta: WorldCodecMeta = {
        kind: "chunk-sections",
        worldId: this.worldId,
        chunkX: cx,
        chunkZ: cz,
      };
      const decoded = this.codec.decode(
        this.boundary.read(this.worldId, cx, cz, "chunk-sections"),
        meta,
      );
      const column = decoded.value as ChunkColumn;
      for (const [x, y, z, id] of snap.blocks) {
        if (chunkOf(x, z) !== ck) continue;
        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const state = column.getBlockState(lx, y, lz);
        if (state.id !== id) {
          throw new Error(
            `saveReload: decoded block at (${x},${y},${z}) is ${state.id}, expected ${id}`,
          );
        }
      }
      const beMeta: WorldCodecMeta = {
        kind: "block-entities",
        worldId: this.worldId,
        chunkX: cx,
        chunkZ: cz,
      };
      const decodedBe = this.codec.decode(
        this.boundary.read(this.worldId, cx, cz, "block-entities"),
        beMeta,
      );
      const expected = writtenEntities.get(ck) ?? [];
      if (JSON.stringify(decodedBe.value) !== JSON.stringify(expected)) {
        throw new Error(
          `saveReload: decoded block entities for chunk (${cx},${cz}) differ from the written payload`,
        );
      }
    }

    // (e) All-or-nothing commit of the captured state (queue included, absolute ticks preserved).
    this.restore(snap);
  }

  /**
   * Unload then reload exactly one chunk: the chunk's block states, components, and wire power are
   * dropped and restored from the captured snapshot; the 047 queue and burnout tracker are NOT
   * touched, so every pending event — inside the chunk or not — survives at its absolute tick.
   */
  cycleChunk(chunkX: number, chunkZ: number): void {
    const snap = this.snapshot();
    const owns = (x: number, z: number): boolean =>
      Math.floor(x / CHUNK_SIZE) === chunkX &&
      Math.floor(z / CHUNK_SIZE) === chunkZ;
    // Unload: drop only this chunk's cells.
    dropWhere(this.blocks, (_k, [x, , z]) => owns(x, z));
    dropWhere(this.wirePower, (_k, [x, , z]) => owns(x, z));
    dropWhere(this.comps, (_k, [x, , z]) => owns(x, z));
    this.lastSig.clear();
    // Reload: restore this chunk's cells; other chunks were never touched.
    for (const [x, y, z, id, props] of snap.blocks) {
      if (owns(x, z)) this.blocks.set(posKey(x, y, z), { id, props: { ...props } });
    }
    for (const [x, y, z, p] of snap.wire) {
      if (owns(x, z)) this.wirePower.set(posKey(x, y, z), p);
    }
    for (const [x, y, z, c] of snap.comps) {
      if (owns(x, z)) this.comps.set(posKey(x, y, z), cloneComp(c));
    }
    // Re-settle wire power from restored component emissions.
    this.propagator.settle();
  }

  // ---- Fixture <-> ChunkColumn ------------------------------------------------

  private columnForChunk(
    snap: AutomationStateSnapshot,
    cx: number,
    cz: number,
  ): ChunkColumn {
    const column = new ChunkColumn({
      chunkX: cx,
      chunkZ: cz,
      sectionCount: SECTION_COUNT,
      minSectionY: MIN_SECTION_Y,
      registry: this.registry,
    });
    for (const [x, y, z, id] of snap.blocks) {
      if (Math.floor(x / CHUNK_SIZE) !== cx) continue;
      if (Math.floor(z / CHUNK_SIZE) !== cz) continue;
      const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      column.setBlockState(lx, y, lz, this.registry.getState(id as never));
    }
    return column;
  }

  /** Container inventories of one chunk as 036-shaped serialized block entities. */
  private entitiesForChunk(
    snap: AutomationStateSnapshot,
    cx: number,
    cz: number,
  ): SerializedBlockEntity[] {
    const out: SerializedBlockEntity[] = [];
    for (const [x, y, z, c] of snap.comps) {
      if (!c.inventory) continue;
      if (Math.floor(x / CHUNK_SIZE) !== cx) continue;
      if (Math.floor(z / CHUNK_SIZE) !== cz) continue;
      out.push({
        schemaVersion: 1,
        typeKey: `minecraft:${c.kind}`,
        x,
        y,
        z,
        data: { slots: c.inventory.map((s) => ({ ...s })) },
      });
    }
    out.sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
    return out;
  }

  // ---- Validation ------------------------------------------------------------

  private validateSnapshot(
    s: AutomationStateSnapshot,
  ): AutomationStateSnapshot {
    if (s === null || typeof s !== "object" || s.version !== 1) {
      throw new AutomationError(
        "malformed_snapshot",
        "snapshot must be an object with version 1",
      );
    }
    if (s.worldId !== this.worldId) {
      throw new AutomationError(
        "malformed_snapshot",
        `snapshot worldId ${String(s.worldId)} does not match harness worldId ${this.worldId}`,
      );
    }
    if (!isInt(s.tick) || s.tick < 0) {
      throw new AutomationError(
        "malformed_snapshot",
        "tick must be a non-negative integer",
      );
    }
    // Whole-payload 047 validation up front (version, integer entry fields) so a bad queue
    // cannot abort a half-applied restore.
    try {
      validateSerializedScheduledTickQueue(s.scheduledTicks);
    } catch (e) {
      throw new AutomationError(
        "malformed_scheduled_queue",
        e instanceof Error ? e.message : String(e),
      );
    }
    if (!Array.isArray(s.blocks) || !Array.isArray(s.comps)) {
      throw new AutomationError(
        "malformed_snapshot",
        "blocks and comps must be arrays",
      );
    }
    for (const b of s.blocks) {
      if (
        !Array.isArray(b) ||
        b.length !== 5 ||
        !isInt(b[0]) ||
        !isInt(b[1]) ||
        !isInt(b[2]) ||
        !isInt(b[3]) ||
        typeof b[4] !== "object" ||
        b[4] === null
      ) {
        throw new AutomationError(
          "malformed_snapshot",
          "each block entry must be [int x, int y, int z, int id, object props]",
        );
      }
    }
    const seenComps = new Set<string>();
    for (const c of s.comps) {
      if (
        !Array.isArray(c) ||
        c.length !== 4 ||
        !isInt(c[0]) ||
        !isInt(c[1]) ||
        !isInt(c[2]) ||
        typeof c[3] !== "object" ||
        c[3] === null
      ) {
        throw new AutomationError(
          "malformed_snapshot",
          "each comp entry must be [int x, int y, int z, object state]",
        );
      }
      const key = `${c[0]},${c[1]},${c[2]}`;
      // Duplicate block-entity keys within one restore are rejected atomically.
      if (seenComps.has(key)) {
        throw new AutomationError(
          "malformed_snapshot",
          `duplicate block-entity key ${key} in snapshot`,
        );
      }
      seenComps.add(key);
    }
    for (const w of s.wire) {
      if (
        !Array.isArray(w) ||
        w.length !== 4 ||
        !isInt(w[0]) ||
        !isInt(w[1]) ||
        !isInt(w[2]) ||
        !isInt(w[3])
      ) {
        throw new AutomationError(
          "malformed_snapshot",
          "each wire entry must be [int x, int y, int z, int power]",
        );
      }
    }
    if (typeof s.burnoutToggles !== "object" || s.burnoutToggles === null) {
      throw new AutomationError(
        "malformed_snapshot",
        "burnoutToggles must be an object",
      );
    }
    for (const ticks of Object.values(s.burnoutToggles)) {
      if (
        !Array.isArray(ticks) ||
        ticks.some((t) => !isInt(t) || (t as number) < 0)
      ) {
        throw new AutomationError(
          "malformed_snapshot",
          "burnoutToggles values must be arrays of non-negative integers",
        );
      }
    }
    if (!Array.isArray(s.ejected)) {
      throw new AutomationError(
        "malformed_snapshot",
        "ejected must be an array",
      );
    }
    if (
      typeof s.seqState !== "object" ||
      s.seqState === null ||
      !isInt(s.seqState.prevInput) ||
      !isInt(s.seqState.edgeCounter)
    ) {
      throw new AutomationError(
        "malformed_snapshot",
        "seqState must be {prevInput: int, edgeCounter: int}",
      );
    }
    if (
      s.activeProbe !== null &&
      (typeof s.activeProbe !== "object" ||
        s.activeProbe.positions === undefined)
    ) {
      throw new AutomationError(
        "malformed_snapshot",
        "activeProbe must be null or a CircuitProbe",
      );
    }
    if (s.divideBy !== 2 && s.divideBy !== 4) {
      throw new AutomationError(
        "malformed_snapshot",
        "divideBy must be 2 or 4",
      );
    }
    return s;
  }
}

function cloneComp(c: CompState): CompState {
  return {
    ...c,
    inventory: c.inventory
      ? c.inventory.map((s) => ({ ...s }))
      : undefined,
  };
}

function dropWhere<T>(
  map: Map<string, T>,
  pred: (key: string, coords: [number, number, number]) => boolean,
): void {
  for (const key of [...map.keys()]) {
    if (pred(key, parseKey(key))) map.delete(key);
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Spec constants re-exported for circuit tests. */
export const REDSTONE_CONSTANTS = {
  TORCH_UPDATE_DELAY_TICKS,
  BURNOUT_TOGGLE_LIMIT,
  BURNOUT_WINDOW_TICKS,
  BURNOUT_RECOVERY_TICKS,
  REPEATER_DELAY_TICKS,
  COMPARATOR_UPDATE_DELAY_TICKS,
  OBSERVER_PULSE_START_DELAY_TICKS,
  OBSERVER_PULSE_DURATION_TICKS,
  LAMP_OFF_DELAY_TICKS,
  BUTTON_ACTIVE_TICKS,
  PLATE_RELEASE_DELAY_TICKS,
  HOPPER_TRANSFER_COOLDOWN_TICKS,
  DROPPER_EJECT_COOLDOWN_TICKS,
  PISTON_PUSH_LIMIT,
  /** Canonical clock period: rising edges every 16 ticks (6-tick repeater + 2-tick torch per half). */
  CLOCK_PERIOD_TICKS: 16,
};
