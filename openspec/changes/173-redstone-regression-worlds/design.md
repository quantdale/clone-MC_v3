# Design: 173-redstone-regression-worlds

## Context/current state
- 154-172 produced ten independently-tested pure modules plus the 055 `SimulationHarness`. No
  test composes the modules into circuits. 173 is the section-closing change: a test-only suite of
  canonical fixtures whose assertions are the section's cross-module regression contract.

## Target state
- `tests/unit/RedstoneRegressionWorlds.test.ts` with eight canonical fixtures, each composing pure
  modules against in-memory worlds/queues and asserting tick-exact timelines.

## Invariants
- Every timing fixture asserts BOTH the not-due tick and the due tick (no off-by-one drift).
- Fixtures use only exported module APIs (the same surfaces 154-172's own tests use) — no private
  access.
- No fixture mutates shared state; each is self-contained.

## Fixture contracts (normative assertions)

### F1 repeater delay chain (159)
- `REPEATER_DELAY_TICKS[1] === 2`.
- `resolveRepeaterOutput(true, false, false) === true`.
- Scheduling repeater 1 at tick 0 yields nothing at tick 1 and `(1,0,0)` at tick 2; scheduling
  repeater 2 at tick 2 yields `(2,0,0)` at tick 4.

### F2 comparator modes + delay (160)
- `resolveComparatorOutput('compare', 8, 3) === 8`, `('compare', 3, 8) === 0`,
  `('subtract', 8, 3) === 5`, `('subtract', 3, 8) === 0`.
- `COMPARATOR_UPDATE_DELAY_TICKS === 2`; an update scheduled at tick 0 is due exactly at tick 2.

### F3 torch inversion + burnout (158)
- `torchShouldBeLit(true) === false`, `torchShouldBeLit(false) === true`;
  `torchSignalStrength(true) === 15`, `torchSignalStrength(false) === 0`.
- `BURNOUT_TOGGLE_LIMIT === 8`; 9 toggles within the window burn out, exactly 8 do not.

### F4 piston push chain (163/164)
- `planPistonPush` over a three-block chain returns `canPush: true` with `blocksToMove` ordered
  farthest-first `[[3,0,0],[2,0,0],[1,0,0]]`.
- `executePistonPush` lands the farthest block at the push target and shifts the rest; the source
  position is cleared. `pistonStateProperties('east', true)` is `{ facing: 'east', extended: true }`.

### F5 hopper→dropper item pipeline (166/167)
- A hopper transfer scheduled at tick 0 is due at tick 8 (not 7); `transferOneItem` moves exactly one
  item.
- A dropper drop scheduled at tick 8 is due at tick 16 (not 15); `ejectFromDropper(source, null,
  pos)` returns a `drop` with the descriptor and a source decremented by one.

### F6 dispenser plain-item parity (168)
- `dispenseFromDispenser` with a plain item and a container returns `kind: 'container'` with the
  merge applied — identical to `ejectFromDropper` semantics.

### F7 TNT detonation timeline (169/170)
- Redstone-primed TNT at fuse 1 is not due; at fuse 0 it is due.
- `explodePrimedTnt` destroys the stone at `(1,0,0)` and resolves its `minecraft:cobblestone` drop.

### F8 rail traversal + minecart timing (171/172)
- On `north_south`, a cart's `vx` is zeroed and `vz` is kept at `MINECART_MAX_SPEED`; `z` advances by
  the speed. `railShapeConnections('north_south')` is `['north', 'south']`.
- On `corner_north_east`, a cart arriving north (`vz < 0`) exits east (`vx = -vz`, `vz = 0`).

## Detailed behavior
- Fixtures are plain `describe/it` blocks over the pure APIs; the 047 `ScheduledTickQueue` provides
  the timing spine for F1/F2/F5/F7.
- In-memory worlds (`PistonWorld`, `ExplosionWorld<string>`, `MinecartWorld`) mirror each module's
  own test seams.

## Failure modes
- Any fixture failure indicates either a regression in a 154-172 module or a contract drift; the
  fixture's name and assertions localize it to one module surface.

## Compatibility/migration
- Test-only; no production surface changes.

## Performance/resource constraints
- Fixtures run in milliseconds (pure O(1)/O(n) module calls).

## Testing seams
- The suite IS the seam: module APIs are exercised exactly as their consumers will use them.

## Observability/debugging
- Fixture names are the canonical scenario names (F1-F8), matching the proposal.

## Affected files/symbols
- `tests/unit/RedstoneRegressionWorlds.test.ts` (new). No other files.

## Rejected alternatives
- **Building a generic circuit simulator**: rejected — the pure modules are already the executable
  model; a simulator would duplicate their logic and drift.
- **Extending the 055 `SimulationHarness`**: rejected — the harness targets wiring/tick systems;
  these fixtures target pure module composition, which is simpler and directly assertable.

## Downstream dependencies
- 243 (`redstone-automation-e2e`) reuses these canonical scenarios as its headless baseline; 248's
  parity matrix cites F1-F8 as the section's evidence.
