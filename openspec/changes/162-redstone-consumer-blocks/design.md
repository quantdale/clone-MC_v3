# Design: 162-redstone-consumer-blocks

## Context/current state
- 154-161 built only *producers*: every component reads power in and computes a signal it emits
  back out through 154's `RedstonePowerSource` (once a future adapter exists). None of them changes
  its own persistent visible state as an end in itself. This change is the first *consumer*: a
  lamp/door/trapdoor reads power in and changes its own state, full stop — there is nothing to emit
  back out, which is why this module has no dependency on 154's `RedstoneSignal.ts` at all (no
  signal-strength domain, no clamping — just a plain `powered: boolean`).
- 157/158 established that a purely-visual property (facing/attachment) is omitted from the schema
  when it doesn't affect the block's redstone behavior. Door/trapdoor facing is exactly that kind of
  property here (it determines swing direction, not whether the block reacts to power), so it is
  omitted by the same reasoning — this change does not revisit that precedent, it applies it.
- 157's `POWERED_SCHEMA` is already shared by three distinct blocks (lever/button/plate). This change
  reuses that same pattern for door/trapdoor's `open` property (one schema instance, two block
  definitions) rather than defining two structurally-identical schemas.

## Target state
- Three new blocks — `redstone_lamp` (`lit`), `door` (`open`), `trapdoor` (`open`) — each 2 states,
  each with a placing item, and `src/simulation/RedstoneConsumers.ts` holding the three named
  predicates, the lamp's off-delay scheduling bridge, and the three state projections.

## Invariants
- `lampShouldBeLit(powered)`, `doorShouldBeOpen(powered)`, `trapdoorShouldBeOpen(powered)` are each
  exactly the identity function on `powered` — there is one underlying rule, only the name differs
  per block kind (matching vanilla's own per-block property naming: `lit` vs. `open`).
- `scheduleLampOff`/`dueLampOffs` behave identically to 157-161's 047 bridges.
- No function in this module reads or clamps a signal strength; `powered` is a plain boolean
  supplied by the caller (a future wiring change derives it from 154's power model).

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const LAMP_SCHEMA = new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]);
export const OPEN_SCHEMA = new BlockPropertySchema([{ kind: 'boolean', name: 'open' }]);
// BlockId.RedstoneLamp = 45; BlockId.Door = 46; BlockId.Trapdoor = 47
// door and trapdoor both use OPEN_SCHEMA — the same shared-schema pattern as POWERED_SCHEMA.

// src/simulation/RedstoneConsumers.ts (new)
export const LAMP_OFF_DELAY_TICKS = 4;

export function lampShouldBeLit(powered: boolean): boolean;
export function scheduleLampOff(queue: ScheduledTickQueue, x: number, y: number, z: number, currentTick: number): void;
export function dueLampOffs(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[];

export function doorShouldBeOpen(powered: boolean): boolean;
export function trapdoorShouldBeOpen(powered: boolean): boolean;

export function lampStateProperties(lit: boolean): Record<string, boolean>;
export function doorStateProperties(open: boolean): Record<string, boolean>;
export function trapdoorStateProperties(open: boolean): Record<string, boolean>;
```

## Control/data flow
1. **Lamp turning on**: a future wiring change detects `powered` became `true` and sets `lit = true`
   immediately (no scheduling call) — matching vanilla's instant-on.
2. **Lamp turning off**: the same caller detects `powered` became `false` and calls
   `scheduleLampOff(queue, x, y, z, now)`. At the due tick, `dueLampOffs` returns the position; the
   caller re-samples the *current* power at that moment and sets `lit = false` only if it is still
   unpowered — a fresh pulse arriving before the scheduled tick naturally keeps the lamp lit, since
   the caller would simply not have anything stale to apply (the same "caller re-derives truth at
   fire time" discipline 159's repeater and 158's torch already use).
3. **Door/trapdoor**: a future wiring change sets `open = doorShouldBeOpen(powered)` (or the
   trapdoor equivalent) immediately on every power change — no scheduling, matching vanilla.

## Detailed behavior
- The lamp's asymmetry (instant-on, delayed-off) is the one piece of real behavior in this change;
  everything else is the trivial identity rule. `lampShouldBeLit` itself carries no delay logic at
  all — the delay is entirely a caller-side scheduling decision, kept out of the predicate so the
  predicate stays trivially, independently correct (matching 158's explicit separation of the
  one-line inversion rule from the stateful burnout heuristic layered on top by the caller).
- `doorShouldBeOpen`/`trapdoorShouldBeOpen` are named distinctly rather than sharing one exported
  `consumerShouldBeActive` function, for call-site clarity and vanilla-naming parity (`open` reads
  naturally for a door/trapdoor, `lit` for a lamp) — mirroring 160's choice to name `mode` rather
  than use an anonymous boolean.
- No `facing` property on door/trapdoor: it determines swing direction/visual orientation only, not
  whether the block reacts to power — the same reasoning 157/158 already applied to lever, button,
  pressure plate, and torch.
- No signal re-emission: unlike 154-161, these blocks are pure sinks. There is no
  `*SignalStrength`-shaped function in this module, because there is nothing to emit.

## Failure modes
- No function throws for well-formed inputs; a non-finite tick is treated as `0` (157-161's
  convention).
- 007 throws at construction if the default state is missing — a test asserts the exact 2-state
  enumeration and the `{lit: false}`/`{open: false}` defaults for all three blocks.

## Compatibility/migration
- Three additive block ids and three additive item ids; one new simulation file; the four
  documented characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Every function is O(1); `dueLampOffs` is 047's own bounded pop. 6 new block states total (2 + 2 +
  2, a cumulative registry total of 1450 + 6 = 1456).

## Testing seams
- The whole module is tested with plain booleans and a real 047 queue (for the lamp only) — no
  `World` of any kind.
- Registration is tested against the real block/item/state registries.

## Observability/debugging
- `lampStateProperties`/`doorStateProperties`/`trapdoorStateProperties` are the standard
  stateful-block records.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/RedstoneConsumers.ts` (new).
- Tests: `tests/unit/RedstoneConsumers.test.ts` (new) + the four characterization updates.

## Rejected alternatives
- **A single generic `consumerShouldBeActive` exported for all three blocks**: rejected — see
  Detailed behavior; three named entry points read better at call sites and match vanilla's
  per-block property naming.
- **Modeling door/trapdoor `facing` for parity with vanilla's real blockstate**: rejected — facing
  is purely visual here (no redstone behavior depends on it), the same reasoning 157/158 already
  applied; adding it would be unjustified state bloat with no behavioral effect, which this
  codebase's schema decisions consistently avoid.
- **Modeling the full two-block door with hinge/half state**: rejected — that is placement/
  rendering geometry, out of scope for a "redstone consumer" change; flagged as a non-goal rather
  than silently dropped.
- **Giving the door/trapdoor a scheduling delay symmetric to the lamp**: rejected — vanilla's real
  doors/trapdoors toggle immediately in both directions; only the lamp has the flicker-guard
  off-delay.

## Downstream dependencies
- A future wiring change drives `powered` from real block edits (reading 154's power model at the
  consumer's position) and applies these predicates' results to the live block state.
- This is the first *consumer*, closing the conceptual producer-to-consumer loop 154-161 opened;
  163 (piston-move-planner) moves into a different redstone-adjacent mechanic (block movement)
  entirely.
