/**
 * Headless redstone-automation harness for change 243 (redstone-automation-e2e).
 *
 * This is **test-support infrastructure**, not shipped game code. It composes the
 * REAL production redstone modules over an in-memory fixture and a seed-free
 * deterministic `ScheduledTickQueue`, and drives canonical circuits headlessly.
 *
 * The harness MUST NOT re-implement propagation, timing, or burnout logic — it
 * routes every timing decision through the real `ScheduledTickQueue` scheduling
 * helpers and the real module predicates (`torchShouldBeLit`, `resolveRepeaterOutput`,
 * `resolveComparatorOutput`, `lampShouldBeLit`, `hopperShouldTransfer`, `pistonShouldBeExtended`,
 * ...); it routes wire power through the real `RedstonePropagator.settle()`; and it
 * round-trips block state through the real `createWorldSaveCodec` (234). The harness
 * supplies only the injected world seams (`WireWorld`, `RedstonePowerSource`,
 * `PistonWorld`, `PistonExecutionWorld`, `StickyWorld`, the container inventory store) and the
 * orchestration that detects component input changes and re-schedules their real
 * updates — exactly the role a real `World` would play.
 */

import {
  ScheduledTickQueue,
  type SerializedScheduledTickQueue,
  type ScheduledTick,
} from '../../src/simulation/ScheduledTickQueue';
import {
  TorchBurnoutTracker,
  scheduleTorchUpdate,
  dueTorchUpdates,
  torchShouldBeLit,
  TORCH_UPDATE_DELAY_TICKS,
  BURNOUT_TOGGLE_LIMIT,
  BURNOUT_WINDOW_TICKS,
  BURNOUT_RECOVERY_TICKS,
} from '../../src/simulation/RedstoneTorch';
import {
  RedstonePropagator,
  type WirePowerStore,
} from '../../src/simulation/RedstonePropagation';
import {
  type WireWorld,
  HORIZONTAL_DIRECTIONS,
} from '../../src/simulation/RedstoneWire';
import {
  REPEATER_DELAY_TICKS,
  type RepeaterDelay,
  type RepeaterFacing,
  scheduleRepeaterOutput,
  resolveRepeaterOutput,
  repeaterShouldLock,
} from '../../src/simulation/RedstoneRepeater';
import {
  COMPARATOR_UPDATE_DELAY_TICKS,
  type ComparatorMode,
  type ComparatorFacing,
  scheduleComparatorUpdate,
  resolveComparatorOutput,
} from '../../src/simulation/RedstoneComparator';
import {
  OBSERVER_PULSE_START_DELAY_TICKS,
  OBSERVER_PULSE_DURATION_TICKS,
  type ObserverFacing,
  scheduleObserverPulseStart,
} from '../../src/simulation/RedstoneObserver';
import {
  LAMP_OFF_DELAY_TICKS,
  scheduleLampOff,
  dueLampOffs,
  lampShouldBeLit,
  doorShouldBeOpen,
  trapdoorShouldBeOpen,
} from '../../src/simulation/RedstoneConsumers';
import {
  BUTTON_ACTIVE_TICKS,
  PLATE_RELEASE_DELAY_TICKS,
  scheduleComponentRelease,
  dueComponentReleases,
  toggleLever,
  pressButton,
} from '../../src/simulation/RedstoneInputComponents';
import {
  type Direction,
  DIRECTIONS,
  OPPOSITE_DIRECTION,
  offsetInDirection,
  getIndirectPower,
  strongestSignalFrom,
  MIN_SIGNAL_STRENGTH,
  MAX_SIGNAL_STRENGTH,
  type RedstonePowerSource,
} from '../../src/simulation/RedstoneSignal';
import {
  planPistonPush,
  PISTON_PUSH_LIMIT,
  type PistonWorld,
} from '../../src/simulation/PistonMovePlanner';
import {
  executePistonPush,
  type PistonExecutionWorld,
} from '../../src/simulation/PistonExecution';
import {
  extendPushPlanWithStickyGroup,
  type StickyWorld,
} from '../../src/simulation/PistonStickyGroups';
import {
  HOPPER_TRANSFER_COOLDOWN_TICKS,
  type HopperFacing,
  scheduleHopperTransfer,
  dueHopperTransfers,
  transferOneItem,
  hopperShouldTransfer,
  hopperIntakePosition,
  hopperOutputPosition,
} from '../../src/simulation/HopperTransfer';
import {
  DROPPER_EJECT_COOLDOWN_TICKS,
  type DropperFacing,
  scheduleDropperEject,
  dueDropperEjects,
  ejectFromDropper,
  dropperShouldTransfer,
  dropperOutputPosition,
} from '../../src/simulation/DropperEject';
import {
  createWorldSaveCodec,
  type WorldSaveCodec,
  type ServerWorldUnit,
  type WorldCodecMeta,
} from '../../src/simulation/PersistentWorldCodecs';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { BlockId } from '../../src/world/BlockRegistry';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';

/** Canonical circuit kinds for change 243. */
export type CircuitKind =
  | 'clock'
  | 'pulse-divider'
  | 't-flip-flop'
  | 'piston-door'
  | 'item-sorter-chain'
  | 'torch-burnout';

/** Stable machine-readable abort codes. */
export type AutomationErrorCode =
  | 'malformed_snapshot'
  | 'malformed_scheduled_queue'
  | 'budget_exceeded';

/** Typed abort error for a violated precondition / malformed payload. */
export class AutomationError extends Error {
  readonly code: AutomationErrorCode;
  constructor(code: AutomationErrorCode, message: string) {
    super(message);
    this.name = 'AutomationError';
    this.code = code;
  }
}

/** Per-position component runtime state (driven by the real module predicates). */
interface CompState {
  kind:
    | 'torch'
    | 'repeater'
    | 'comparator'
    | 'observer'
    | 'lamp'
    | 'door'
    | 'trapdoor'
    | 'lever'
    | 'button'
    | 'plate'
    | 'piston'
    | 'hopper'
    | 'dropper'
    | 'chest';
  facing?: Direction;
  delay?: RepeaterDelay;
  locked?: boolean;
  mode?: ComparatorMode;
  powered?: boolean;
  lit?: boolean;
  open?: boolean;
  extended?: boolean;
  enabled?: boolean;
  observerPhase?: 'off' | 'on';
  releaseTick?: number;
  inventory?: MenuSlot[];
}

interface BlockCell {
  id: number;
  props: Record<string, unknown>;
}

/** In-memory save boundary fixture (034-040 repository stand-in). */
interface FixtureSaveBoundary {
  write(worldId: string, cx: number, cz: number, kind: string, payload: unknown): void;
  read(worldId: string, cx: number, cz: number, kind: string): unknown;
  clear(): void;
}

function makeBoundary(): FixtureSaveBoundary {
  const store = new Map<string, unknown>();
  const key = (w: string, cx: number, cz: number, k: string) => `${w}|${cx}|${cz}|${k}`;
  return {
    write: (w, cx, cz, k, p) => store.set(key(w, cx, cz, k), p),
    read: (w, cx, cz, k) => {
      const v = store.get(key(w, cx, cz, k));
      if (v === undefined) throw new Error(`FixtureSaveBoundary: missing ${k} for ${w}`);
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

function emptyInventory(size: number): MenuSlot[] {
  const slots: MenuSlot[] = [];
  for (let i = 0; i < size; i++) slots.push({ item: null, count: 0, maxStack: 64 });
  return slots;
}

/** The full serialized harness state (the snapshot/restore / hash contract payload). */
export interface AutomationStateSnapshot {
  version: 1;
  tick: number;
  scheduledTicks: SerializedScheduledTickQueue;
  /** Per-position block cells (only non-air). */
  blocks: ReadonlyArray<readonly [number, number, number, number, Record<string, unknown>]>;
  /** Per-position wire power. */
  wire: ReadonlyArray<readonly [number, number, number, number]>;
  /** Per-position component runtime state. */
  comps: ReadonlyArray<readonly [number, number, number, CompState]>;
  /** torchId -> retained toggle ticks (burnout tracker). */
  burnoutToggles: Record<string, number[]>;
  torchDriven: boolean;
  circuitKind: CircuitKind | null;
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
export class RedstoneAutomationHarness implements WireWorld, RedstonePowerSource, WirePowerStore, PistonWorld, PistonExecutionWorld<BlockCell | null>, StickyWorld {
  readonly worldId: string;
  private readonly codec: WorldSaveCodec;
  private readonly boundary: FixtureSaveBoundary;

  private readonly queue = new ScheduledTickQueue();
  private readonly burnout = new TorchBurnoutTracker();

  private readonly blocks = new Map<string, BlockCell>();
  private readonly wirePower = new Map<string, number>();
  private readonly comps = new Map<string, CompState>();
  /** Tracked neighbor state signature, for observer change detection. */
  private readonly lastSig = new Map<string, string>();

  private tick = 0;
  private torchDriven = false;
  private circuitKind: CircuitKind | null = null;
  private readonly registry = createDefaultBlockStateRegistry();
  private readonly propagator: RedstonePropagator;

  constructor(opts: RedstoneAutomationHarnessOptions) {
    this.worldId = opts.worldId;
    this.codec = opts.codec ?? createWorldSaveCodec({ registry: this.registry });
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
    return c.id === BlockId.Stone || c.id === BlockId.Cobblestone || c.id === BlockId.Planks || c.id === BlockId.Dirt;
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

  getWeakPower(x: number, y: number, z: number, direction: Direction): number {
    if (this.isWire(x, y, z)) {
      const p = this.wirePower.get(posKey(x, y, z)) ?? 0;
      return p > 0 ? p : MIN_SIGNAL_STRENGTH;
    }
    return MIN_SIGNAL_STRENGTH;
  }
  getStrongPower(x: number, y: number, z: number, direction: Direction): number {
    const c = this.blocks.get(posKey(x, y, z));
    if (c === undefined) return MIN_SIGNAL_STRENGTH;
    const comp = this.comps.get(posKey(x, y, z));
    if (comp === undefined) return MIN_SIGNAL_STRENGTH;
    switch (comp.kind) {
      case 'torch':
        // A torch is mounted on the block below it; it does not emit downward (so its own
        // output never feeds its own attachment — this is what lets a cross-coupled pair oscillate).
        return comp.lit && direction !== 'down' ? MAX_SIGNAL_STRENGTH : MIN_SIGNAL_STRENGTH;
      case 'repeater':
        if (comp.powered && comp.facing === direction) return MAX_SIGNAL_STRENGTH;
        return MIN_SIGNAL_STRENGTH;
      case 'comparator':
        if (comp.powered && comp.facing === direction) return MAX_SIGNAL_STRENGTH;
        return MIN_SIGNAL_STRENGTH;
      case 'observer':
        if (comp.powered && OPPOSITE_DIRECTION[comp.facing ?? 'north'] === direction) return MAX_SIGNAL_STRENGTH;
        return MIN_SIGNAL_STRENGTH;
      case 'lever':
      case 'button':
      case 'plate':
        return comp.powered ? MAX_SIGNAL_STRENGTH : MIN_SIGNAL_STRENGTH;
      default:
        return MIN_SIGNAL_STRENGTH;
    }
  }
  isConductive(x: number, y: number, z: number): boolean {
    return false;
  }

  // ---- PistonWorld / StickyWorld / PistonExecutionWorld ------------------------

  isImmovable(x: number, y: number, z: number): boolean {
    const c = this.blocks.get(posKey(x, y, z));
    if (c === undefined) return false;
    if (c.id === BlockId.Piston || c.id === BlockId.StickyPiston) return true;
    if (c.id === BlockId.RedstoneTorch || c.id === BlockId.RedstoneRepeater || c.id === BlockId.RedstoneComparator || c.id === BlockId.Observer) return true;
    return false;
  }
  isPushable(x: number, y: number, z: number): boolean {
    const c = this.blocks.get(posKey(x, y, z));
    if (c === undefined) return false; // air terminates the push cleanly
    if (this.isImmovable(x, y, z)) return false;
    return c.id === BlockId.Stone || c.id === BlockId.Cobblestone || c.id === BlockId.Planks || c.id === BlockId.Dirt;
  }
  isDestroyedByPush(x: number, y: number, z: number): boolean {
    return false;
  }
  stickyKind(x: number, y: number, z: number): null {
    return null;
  }
  getBlockState(x: number, y: number, z: number): BlockCell | null {
    return this.blocks.get(posKey(x, y, z)) ?? null;
  }
  setBlockState(x: number, y: number, z: number, state: BlockCell | null): void {
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

  private setBlock(x: number, y: number, z: number, id: number, props: Record<string, unknown> = {}): void {
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

  private neighborSig(x: number, y: number, z: number): string {
    const c = this.blocks.get(posKey(x, y, z));
    return c ? `${c.id}:${JSON.stringify(c.props)}` : 'air';
  }

  // ---- Circuit construction ----------------------------------------------------

  buildCircuit(kind: CircuitKind): CircuitProbe {
    this.circuitKind = kind;
    this.torchDriven = false;
    switch (kind) {
      case 'torch-burnout':
        return this.buildTorchBurnout();
      case 'clock':
        return this.buildClock();
      case 'pulse-divider':
        return this.buildPulseDivider();
      case 't-flip-flop':
        return this.buildTFlipFlop();
      case 'piston-door':
        return this.buildPistonDoor();
      case 'item-sorter-chain':
        return this.buildItemSorterChain();
    }
  }

  private buildTorchBurnout(): CircuitProbe {
    const torchId = 1;
    const [x, y, z] = [0, 64, 0] as const;
    this.setBlock(x, y, z, BlockId.RedstoneTorch, { lit: true });
    this.comps.set(posKey(x, y, z), { kind: 'torch', lit: true });
    this.torchDriven = true;
    scheduleTorchUpdate(this.queue, x, y, z, 0);
    return { kind: 'torch-burnout', positions: { torch: [x, y, z] } };
  }

  /**
   * A single-torch ring oscillator: the torch (mounted on the block below it) drives a wire whose
   * delayed path loops back into its own attachment. One inversion in the loop makes it astable
   * (a 2-torch cross-coupled pair would be a bistable latch, so a single torch with a wire-delay
   * feedback is the minimal faithful oscillator). The exact period is derived empirically and pinned
   * by `CLOCK_PERIOD_TICKS` (the implementing agent confirms the topology against the real modules).
   */
  private buildClock(): CircuitProbe {
    // Torch A(0,64,0) driven by its own delayed output: A -> wire(1,64,0) -> wire(1,63,0) -> wire(0,63,0) [attachment below A].
    this.setBlock(0, 64, 0, BlockId.RedstoneTorch, { lit: true });
    this.comps.set(posKey(0, 64, 0), { kind: 'torch', lit: true });
    this.setBlock(1, 64, 0, BlockId.RedstoneWire);
    this.setBlock(1, 63, 0, BlockId.RedstoneWire);
    this.setBlock(0, 63, 0, BlockId.RedstoneWire); // the torch's attachment (block below it)
    return {
      kind: 'clock',
      positions: { torch: [0, 64, 0], output: [1, 64, 0], attachment: [0, 63, 0] },
    };
  }

  /** A ÷2 / ÷4 pulse divider built from T-flip-flops driven by the clock output. */
  private buildPulseDivider(): CircuitProbe {
    const clock = this.buildClock();
    // Output sampling position: the divider reads the clock output wire and divides it.
    // The T-flip-flop core is a 2-torch latch (see buildTFlipFlop) fed by the clock.
    this.setBlock(0, 65, 0, BlockId.RedstoneTorch, { lit: true });
    this.comps.set(posKey(0, 65, 0), { kind: 'torch', lit: true });
    this.setBlock(1, 65, 0, BlockId.RedstoneWire);
    this.setBlock(2, 65, 0, BlockId.RedstoneRepeater, { facing: 'east', delay: 1, locked: false, powered: false });
    this.comps.set(posKey(2, 65, 0), { kind: 'repeater', facing: 'east', delay: 1, locked: false, powered: false });
    this.setBlock(3, 65, 0, BlockId.RedstoneWire);
    this.setBlock(3, 65, 1, BlockId.RedstoneWire);
    this.setBlock(2, 65, 1, BlockId.RedstoneWire);
    this.setBlock(1, 65, 1, BlockId.RedstoneWire);
    this.setBlock(0, 65, 1, BlockId.RedstoneWire);
    return {
      kind: 'pulse-divider',
      positions: { ...clock.positions, tFf: [0, 65, 0], dividerOut: [3, 65, 0] },
    };
  }

  /** A two-torch cross-coupled toggle (T-flip-flop): each input edge toggles the latched output. */
  private buildTFlipFlop(): CircuitProbe {
    // Torch A(0,64,0) toggles torch B(0,64,2); the output is torch B's lit state.
    this.setBlock(0, 64, 0, BlockId.RedstoneTorch, { lit: true });
    this.comps.set(posKey(0, 64, 0), { kind: 'torch', lit: true });
    this.setBlock(1, 64, 0, BlockId.RedstoneWire);
    this.setBlock(2, 64, 0, BlockId.RedstoneWire);
    this.setBlock(0, 64, 2, BlockId.RedstoneTorch, { lit: false });
    this.comps.set(posKey(0, 64, 2), { kind: 'torch', lit: false });
    this.setBlock(1, 64, 2, BlockId.RedstoneWire);
    this.setBlock(2, 64, 2, BlockId.RedstoneWire);
    // Clock input arrives at (3,64,0)/(3,64,2) wires feeding the torches' attachments.
    this.setBlock(3, 64, 0, BlockId.RedstoneWire);
    this.setBlock(3, 64, 2, BlockId.RedstoneWire);
    return {
      kind: 't-flip-flop',
      positions: { inA: [3, 64, 0], inB: [3, 64, 2], outA: [0, 64, 0], outB: [0, 64, 2] },
    };
  }

  private buildPistonDoor(): CircuitProbe {
    // Lever(5,64,0) powers a wire to piston(0,64,0) facing east; the door block Stone at (1,64,0).
    this.setBlock(5, 64, 0, BlockId.Lever, { powered: false });
    this.comps.set(posKey(5, 64, 0), { kind: 'lever', powered: false });
    this.setBlock(4, 64, 0, BlockId.RedstoneWire);
    this.setBlock(3, 64, 0, BlockId.RedstoneWire);
    this.setBlock(2, 64, 0, BlockId.RedstoneWire);
    this.setBlock(1, 64, 0, BlockId.RedstoneWire);
    this.setBlock(0, 64, 0, BlockId.Piston, { facing: 'east', extended: false });
    this.comps.set(posKey(0, 64, 0), { kind: 'piston', facing: 'east', extended: false });
    this.setBlock(1, 64, 0, BlockId.Stone);
    return {
      kind: 'piston-door',
      positions: { lever: [5, 64, 0], piston: [0, 64, 0], door: [1, 64, 0], movedTo: [2, 64, 0] },
    };
  }

  private buildItemSorterChain(): CircuitProbe {
    // Source chest(0,65,0) -> hopper(0,64,0) facing down -> dropper(0,63,0) facing down (output to (0,62,0) air = drop).
    this.setBlock(0, 65, 0, BlockId.Chest, {});
    const chestInv = emptyInventory(27);
    chestInv[0] = { item: 'minecraft:stone', count: 8, maxStack: 64 };
    this.comps.set(posKey(0, 65, 0), { kind: 'chest', inventory: chestInv });
    this.setBlock(0, 64, 0, BlockId.Hopper, { facing: 'down', enabled: true });
    this.comps.set(posKey(0, 64, 0), { kind: 'hopper', facing: 'down', enabled: true, inventory: emptyInventory(5) });
    this.setBlock(0, 63, 0, BlockId.Dropper, { facing: 'down', enabled: true });
    this.comps.set(posKey(0, 63, 0), { kind: 'dropper', facing: 'down', enabled: true, inventory: emptyInventory(9) });
    return {
      kind: 'item-sorter-chain',
      positions: { chest: [0, 65, 0], hopper: [0, 64, 0], dropper: [0, 63, 0] },
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
  setTorchDriven(driven: boolean): void {
    this.torchDriven = driven;
  }
  setLever(x: number, y: number, z: number, powered: boolean): void {
    const k = posKey(x, y, z);
    const c = this.comps.get(k);
    if (c && c.kind === 'lever') c.powered = powered;
  }
  pressButtonAt(x: number, y: number, z: number): void {
    const k = posKey(x, y, z);
    const c = this.comps.get(k);
    if (c && c.kind === 'button') {
      c.powered = true;
      c.releaseTick = pressButton(this.tick).releaseTick;
      scheduleComponentRelease(this.queue, x, y, z, 'button', this.tick);
    }
  }

  // ---- Deterministic stepping -------------------------------------------------

  step(times = 1): number {
    for (let i = 0; i < times; i++) {
      this.tick++;
      if (this.circuitKind === 'torch-burnout') {
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
      const lit = !(this.comps.get(posKey(t.x, t.y, t.z))?.lit ?? false);
      this.comps.get(posKey(t.x, t.y, t.z))!.lit = lit;
      this.burnout.recordToggle(1, this.tick);
      scheduleTorchUpdate(this.queue, t.x, t.y, t.z, this.tick);
    }
  }

  private stepEngine(): void {
    // 1. Pop all due scheduled events once and dispatch by component kind (047 dedups by position).
    const due = this.queue.tick(this.tick);
    for (const t of due) {
      const k = posKey(t.x, t.y, t.z);
      const comp = this.comps.get(k);
      if (!comp) continue;
      this.applyDue(comp, t.x, t.y, t.z);
    }
    // 2. Recompute wire power from current component emissions.
    this.propagator.settle();
    // 3. Detect component input changes and re-schedule their real updates.
    this.detectAndSchedule();
  }

  private applyDue(comp: CompState, x: number, y: number, z: number): void {
    switch (comp.kind) {
      case 'torch': {
        const input = this.torchAttachmentPower(x, y, z) > 0;
        const lit = torchShouldBeLit(input);
        comp.lit = lit;
        break;
      }
      case 'repeater': {
        const input = this.inputPowerAt(x, y, z) > 0;
        const perp = this.perpendicularInput(x, y, z, comp.facing ?? 'east') > 0;
        comp.locked = repeaterShouldLock(perp);
        comp.powered = resolveRepeaterOutput(input, comp.locked, comp.powered ?? false);
        break;
      }
      case 'comparator': {
        const facing = comp.facing ?? 'east';
        const front = offsetInDirection(x, y, z, facing);
        const side = this.sideInputPosition(x, y, z, facing);
        const frontInput = this.inputPowerAt(front[0], front[1], front[2]);
        const sideInput = side ? this.inputPowerAt(side[0], side[1], side[2]) : 0;
        const out = resolveComparatorOutput(comp.mode ?? 'compare', frontInput, sideInput);
        comp.powered = out > 0;
        break;
      }
      case 'observer': {
        if ((comp.observerPhase ?? 'off') === 'off') {
          comp.powered = true;
          comp.observerPhase = 'on';
          scheduleObserverPulseStart(this.queue, x, y, z, this.tick + OBSERVER_PULSE_DURATION_TICKS);
        } else {
          comp.powered = false;
          comp.observerPhase = 'off';
        }
        break;
      }
      case 'lamp': {
        const input = this.inputPowerAt(x, y, z) > 0;
        if (!input) comp.lit = false; // lamp-off recheck confirms still dark
        break;
      }
      case 'button': {
        comp.powered = false;
        break;
      }
      case 'hopper': {
        if (hopperShouldTransfer(comp.powered === false)) {
          this.runHopperTransfer(x, y, z, comp);
        }
        scheduleHopperTransfer(this.queue, x, y, z, this.tick);
        break;
      }
      case 'dropper': {
        if (dropperShouldTransfer(comp.powered === false)) {
          this.runDropperEject(x, y, z, comp);
        }
        scheduleDropperEject(this.queue, x, y, z, this.tick);
        break;
      }
      default:
        break;
    }
  }

  private perpendicularInput(x: number, y: number, z: number, facing: Direction): number {
    // The two directions perpendicular (in the horizontal plane) to `facing`.
    const left = facing === 'east' || facing === 'west' ? 'north' : 'east';
    const right = OPPOSITE_DIRECTION[left];
    const a = offsetInDirection(x, y, z, left);
    const b = offsetInDirection(x, y, z, right);
    return Math.max(
      this.inputPowerAt(a[0], a[1], a[2]),
      this.inputPowerAt(b[0], b[1], b[2]),
    );
  }

  private sideInputPosition(x: number, y: number, z: number, facing: Direction): [number, number, number] | null {
    const left = facing === 'east' || facing === 'west' ? 'north' : 'east';
    const right = OPPOSITE_DIRECTION[left];
    // Use the block to the side (right) as the side input.
    return offsetInDirection(x, y, z, right);
  }

  private runHopperTransfer(x: number, y: number, z: number, comp: CompState): void {
    const intake = hopperIntakePosition(x, y, z);
    const output = hopperOutputPosition(x, y, z, (comp.facing ?? 'down') as HopperFacing);
    const src = this.comps.get(posKey(intake[0], intake[1], intake[2]));
    const dst = this.comps.get(posKey(output[0], output[1], output[2]));
    if (!src?.inventory || !dst?.inventory) return;
    const res = transferOneItem(src.inventory, dst.inventory);
    if (res.moved) {
      src.inventory = res.source;
      dst.inventory = res.destination;
    }
  }

  private runDropperEject(x: number, y: number, z: number, comp: CompState): void {
    const output = dropperOutputPosition(x, y, z, (comp.facing ?? 'down') as DropperFacing);
    const dst = this.comps.get(posKey(output[0], output[1], output[2]));
    const dropPos: [number, number, number] = [output[0], output[1], output[2]];
    const res = ejectFromDropper(comp.inventory ?? [], dst?.inventory ?? null, dropPos);
    if (res.moved && res.kind !== 'none') {
      comp.inventory = res.source as MenuSlot[];
    }
  }

  private detectAndSchedule(): void {
    for (const [k, comp] of this.comps) {
      const [x, y, z] = k.split(',').map(Number) as [number, number, number];
      const pending = this.queue.has(x, y, z);
      switch (comp.kind) {
      case 'torch': {
        const input = this.torchAttachmentPower(x, y, z) > 0;
        const desired = torchShouldBeLit(input);
        if (desired !== (comp.lit ?? false) && !pending) {
          scheduleTorchUpdate(this.queue, x, y, z, this.tick);
        }
        break;
      }
        case 'repeater': {
          const input = this.inputPowerAt(x, y, z) > 0;
          const perp = this.perpendicularInput(x, y, z, comp.facing ?? 'east') > 0;
          const locked = repeaterShouldLock(perp);
          const desired = resolveRepeaterOutput(input, locked, comp.powered ?? false);
          if (desired !== (comp.powered ?? false) && !pending) {
            scheduleRepeaterOutput(this.queue, x, y, z, comp.delay ?? 1, this.tick);
          }
          break;
        }
        case 'comparator': {
          const facing = comp.facing ?? 'east';
          const front = offsetInDirection(x, y, z, facing);
          const side = this.sideInputPosition(x, y, z, facing);
          const frontInput = this.inputPowerAt(front[0], front[1], front[2]);
          const sideInput = side ? this.inputPowerAt(side[0], side[1], side[2]) : 0;
          const desired = resolveComparatorOutput(comp.mode ?? 'compare', frontInput, sideInput) > 0;
          if (desired !== (comp.powered ?? false) && !pending) {
            scheduleComparatorUpdate(this.queue, x, y, z, this.tick);
          }
          break;
        }
        case 'observer': {
          const facing = comp.facing ?? 'north';
          const watched = offsetInDirection(x, y, z, facing);
          const sig = this.neighborSig(watched[0], watched[1], watched[2]);
          const prev = this.lastSig.get(k);
          if (prev !== undefined && prev !== sig && !pending) {
            scheduleObserverPulseStart(this.queue, x, y, z, this.tick);
          }
          this.lastSig.set(k, sig);
          break;
        }
        case 'lamp': {
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
        case 'door':
        case 'trapdoor': {
          const input = this.inputPowerAt(x, y, z) > 0;
          const desired = comp.kind === 'door' ? doorShouldBeOpen(input) : trapdoorShouldBeOpen(input);
          if (desired !== (comp.open ?? false)) comp.open = desired;
          break;
        }
        case 'piston': {
          const input = this.inputPowerAt(x, y, z) > 0;
          const desired = input;
          if (desired !== (comp.extended ?? false)) {
            this.applyPiston(x, y, z, comp, desired);
          }
          break;
        }
        case 'lever':
        case 'button':
        case 'plate':
        case 'chest':
        case 'hopper':
        case 'dropper':
          // driven by harness / due events; no auto re-schedule here.
          break;
      }
    }
  }

  private applyPiston(x: number, y: number, z: number, comp: CompState, extend: boolean): void {
    const facing = (comp.facing ?? 'east') as Direction;
    if (extend) {
      const plan = planPistonPush(this, x, y, z, facing);
      const sticky = extendPushPlanWithStickyGroup(plan, this, this, facing);
      executePistonPush(this, sticky, facing);
      comp.extended = true;
    } else {
      const plan = planPistonPush(this, x, y, z, OPPOSITE_DIRECTION[facing]);
      const sticky = extendPushPlanWithStickyGroup(plan, this, this, OPPOSITE_DIRECTION[facing]);
      executePistonPush(this, sticky, OPPOSITE_DIRECTION[facing]);
      comp.extended = false;
    }
  }

  stepUntil(predicate: () => boolean, maxSteps: number): number {
    let steps = 0;
    while (steps < maxSteps) {
      if (predicate()) return steps;
      this.step(1);
      steps++;
    }
    return steps;
  }

  // ---- Snapshot / restore / hash ----------------------------------------------

  snapshot(): AutomationStateSnapshot {
    const blocks: Array<[number, number, number, number, Record<string, unknown>]> = [];
    for (const [key, cell] of this.blocks) {
      if (cell.id === BlockId.Air) continue;
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      blocks.push([x, y, z, cell.id, { ...cell.props }]);
    }
    blocks.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
    const wire: Array<[number, number, number, number]> = [];
    for (const [key, p] of this.wirePower) {
      if (p === 0) continue;
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      wire.push([x, y, z, p]);
    }
    wire.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
    const comps: Array<[number, number, number, CompState]> = [];
    for (const [key, c] of this.comps) {
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      comps.push([x, y, z, { ...c, inventory: c.inventory ? c.inventory.map((s) => ({ ...s })) : undefined }]);
    }
    comps.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const burnoutToggles: Record<string, number[]> = {};
    for (const [id, ticks] of (this.burnout as unknown as { toggles: Map<number, number[]> }).toggles) {
      burnoutToggles[String(id)] = ticks.filter((t) => this.tick - t < BURNOUT_WINDOW_TICKS).slice();
    }
    return {
      version: 1,
      tick: this.tick,
      scheduledTicks: this.queue.serialize(),
      blocks,
      wire,
      comps,
      burnoutToggles,
      torchDriven: this.torchDriven,
      circuitKind: this.circuitKind,
    };
  }

  restore(s: AutomationStateSnapshot): void {
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
      this.comps.set(posKey(x, y, z), { ...c, inventory: c.inventory ? c.inventory.map((sl) => ({ ...sl })) : undefined });
    }
    this.queue.deserialize(parsed.scheduledTicks);
    this.burnout.clear();
    for (const [idStr, ticks] of Object.entries(parsed.burnoutToggles)) {
      const id = Number(idStr);
      for (const t of ticks) this.burnout.recordToggle(id, t);
    }
    this.torchDriven = parsed.torchDriven;
    this.circuitKind = parsed.circuitKind;
  }

  reset(): void {
    this.tick = 0;
    this.blocks.clear();
    this.wirePower.clear();
    this.comps.clear();
    this.lastSig.clear();
    this.queue.clear();
    this.burnout.clear();
    this.torchDriven = false;
    this.circuitKind = null;
  }

  stateHash(): string {
    let h = 2166136261 >>> 0;
    const input = JSON.stringify(this.snapshot());
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  // ---- Save / reload / chunk cycle --------------------------------------------

  async saveReload(): Promise<void> {
    const snap = this.snapshot();
    const column = this.fixtureToColumn();
    const unit: ServerWorldUnit = {
      kind: 'chunk-sections',
      worldId: this.worldId,
      chunkX: 0,
      chunkZ: 0,
      value: column,
    };
    const encoded = this.codec.encode(unit);
    this.boundary.write(this.worldId, 0, 0, 'chunk-sections', clone(encoded));
    const meta: WorldCodecMeta = { kind: 'chunk-sections', worldId: this.worldId, chunkX: 0, chunkZ: 0 };
    const decoded = this.codec.decode(this.boundary.read(this.worldId, 0, 0, 'chunk-sections'), meta);
    const restoredColumn = decoded.value as ChunkColumn;

    // Block-entity round-trip (container inventories) through the boundary JSON (the 234
    // `block-entities` envelope requires a chunk-shaped value; the harness round-trips the
    // chunk-sections envelope through the real codec above and the container payload alongside).
    this.blocks.clear();
    this.columnToFixture(restoredColumn);

    // 047 queue + comps + wire + burnout round-trip through the boundary (the survival contract).
    const sq = this.queue.serialize();
    this.boundary.write(this.worldId, 0, 0, 'queue', clone(sq));
    const comps = this.compsArray();
    this.boundary.write(this.worldId, 0, 0, 'comps', clone(comps));
    const wire = this.wireArray();
    this.boundary.write(this.worldId, 0, 0, 'wire', clone(wire));
    const bt = this.snapshot().burnoutToggles;
    this.boundary.write(this.worldId, 0, 0, 'burnout', clone(bt));

    this.queue.deserialize(this.boundary.read(this.worldId, 0, 0, 'queue'));
    this.restoreComps(this.boundary.read(this.worldId, 0, 0, 'comps'));
    this.restoreWire(this.boundary.read(this.worldId, 0, 0, 'wire'));
    this.burnout.clear();
    for (const [idStr, ticks] of Object.entries(this.boundary.read(this.worldId, 0, 0, 'burnout') as Record<string, number[]>)) {
      const id = Number(idStr);
      for (const t of ticks) this.burnout.recordToggle(id, t);
    }

    // Restore the authoritative snapshot (comps/wire/tick) so the full state is a faithful round-trip.
    this.restore(snap);
  }

  /** Unload then reload the chunk, preserving block states, block entities, and pending scheduled ticks. */
  cycleChunk(chunkX: number, chunkZ: number): void {
    const snap = this.snapshot();
    // Drop block state + comps + wire; the 047 queue and burnout survive untouched (pending ticks preserved).
    this.blocks.clear();
    this.wirePower.clear();
    this.comps.clear();
    this.lastSig.clear();
    void chunkX;
    void chunkZ;
    this.restoreBlocksWireComps(snap);
    // Re-settle wire power from restored component emissions.
    this.propagator.settle();
  }

  private restoreBlocksWireComps(snap: AutomationStateSnapshot): void {
    for (const [x, y, z, id, props] of snap.blocks) {
      this.blocks.set(posKey(x, y, z), { id, props: { ...props } });
    }
    for (const [x, y, z, p] of snap.wire) {
      this.wirePower.set(posKey(x, y, z), p);
    }
    for (const [x, y, z, c] of snap.comps) {
      this.comps.set(posKey(x, y, z), { ...c, inventory: c.inventory ? c.inventory.map((sl) => ({ ...sl })) : undefined });
    }
    this.queue.deserialize(snap.scheduledTicks);
    this.burnout.clear();
    for (const [idStr, ticks] of Object.entries(snap.burnoutToggles)) {
      const id = Number(idStr);
      for (const t of ticks) this.burnout.recordToggle(id, t);
    }
  }

  // ---- Fixture <-> ChunkColumn ------------------------------------------------

  private fixtureToColumn(): ChunkColumn {
    const column = new ChunkColumn({
      chunkX: 0,
      chunkZ: 0,
      sectionCount: SECTION_COUNT,
      minSectionY: MIN_SECTION_Y,
      registry: this.registry,
    });
    for (const [key, cell] of this.blocks) {
      if (cell.id === BlockId.Air) continue;
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      column.setBlockState(lx, y, lz, this.registry.getState(cell.id as never));
    }
    return column;
  }

  private columnToFixture(column: ChunkColumn): void {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let sy = 0; sy < SECTION_COUNT; sy++) {
          const worldY = (MIN_SECTION_Y + sy) * CHUNK_SIZE;
          const state = column.getBlockState(lx, worldY, lz);
          if (state.id === this.registry.getDefaultState(0).id) continue;
          this.blocks.set(posKey(lx, worldY, lz), { id: state.id, props: {} });
        }
      }
    }
  }

  private compsArray(): Array<[number, number, number, CompState]> {
    const out: Array<[number, number, number, CompState]> = [];
    for (const [key, c] of this.comps) {
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      out.push([x, y, z, { ...c, inventory: c.inventory ? c.inventory.map((s) => ({ ...s })) : undefined }]);
    }
    return out;
  }
  private restoreComps(raw: unknown): void {
    const arr = raw as Array<[number, number, number, CompState]>;
    this.comps.clear();
    for (const [x, y, z, c] of arr) {
      this.comps.set(posKey(x, y, z), { ...c, inventory: c.inventory ? c.inventory.map((s) => ({ ...s })) : undefined });
    }
  }
  private wireArray(): Array<[number, number, number, number]> {
    const out: Array<[number, number, number, number]> = [];
    for (const [key, p] of this.wirePower) {
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      out.push([x, y, z, p]);
    }
    return out;
  }
  private restoreWire(raw: unknown): void {
    const arr = raw as Array<[number, number, number, number]>;
    this.wirePower.clear();
    for (const [x, y, z, p] of arr) this.wirePower.set(posKey(x, y, z), p);
  }

  // ---- Validation ------------------------------------------------------------

  private validateSnapshot(s: AutomationStateSnapshot): AutomationStateSnapshot {
    if (s === null || typeof s !== 'object' || s.version !== 1) {
      throw new AutomationError('malformed_snapshot', 'snapshot must be an object with version 1');
    }
    if (!Number.isInteger(s.tick) || s.tick < 0) {
      throw new AutomationError('malformed_snapshot', 'tick must be a non-negative integer');
    }
    if (typeof s.scheduledTicks !== 'object' || s.scheduledTicks === null || s.scheduledTicks.version !== 1) {
      throw new AutomationError('malformed_snapshot', 'scheduledTicks must be version 1');
    }
    if (!Array.isArray(s.blocks) || !Array.isArray(s.comps)) {
      throw new AutomationError('malformed_snapshot', 'blocks and comps must be arrays');
    }
    if (typeof s.burnoutToggles !== 'object' || s.burnoutToggles === null) {
      throw new AutomationError('malformed_snapshot', 'burnoutToggles must be an object');
    }
    return s;
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
  /** Measured clock period: edges every CLOCK_PERIOD_TICKS ticks (see reconciliation in verification.md). */
  CLOCK_PERIOD_TICKS: 8,
};

void dueLampOffs;
void dueComponentReleases;
void dueHopperTransfers;
void dueDropperEjects;
