# Spec: Live Furnace Integration (251)

## ADDED Requirements

### Requirement: Runtime block-entity composition

The live game SHALL own exactly one authoritative furnace state per placed furnace, held by a
runtime block-entity host over the 052 manager. A placed furnace SHALL instantiate its block
entity at the placement position; lifecycle coverage SHALL include placement, block
interaction, fixed-tick updates, chunk activation/deactivation, chunk unload/reload, world
save/load, furnace destruction, and Game disposal. UI, World, and persistence views of furnace
state MUST be derived from — and written back atomically to — that single authoritative state.

#### Scenario: Placement creates exactly one instance

- **WHEN** a player places a furnace item and the placement commits
- **THEN** the host contains exactly one tickable `furnace` instance at that position
- **AND** repeated placements at occupied positions cannot create duplicates

#### Scenario: Destruction removes exactly once

- **WHEN** a furnace block is broken
- **THEN** the runtime instance is removed exactly once and the final state is returned to the
  caller for drop computation
- **AND** subsequent breaks at the same position find no instance

### Requirement: Fixed-tick furnace simulation

Furnace processing SHALL advance via the existing pure 109/110 engine driven by the canonical
fixed-tick clock (20 TPS). Simulation SHALL occur only while the owning chunk is in the
simulating set; paused/loading/non-simulating states SHALL stop smelting without duplicate
ticking. Rendering frame rate MUST NOT alter smelting speed. Resume/reload MUST NOT
double-consume fuel or double-produce output beyond the last committed state boundary.

#### Scenario: Pause freezes smelting deterministically

- **WHEN** simulation becomes inactive with a lit furnace mid-cook
- **THEN** no tick advances burn or smelt timers until simulation resumes
- **AND** after resume the cook completes in exactly the remaining canonical ticks

#### Scenario: Reload never double-produces

- **WHEN** a furnace's committed snapshot records a completed smelt and the page reloads
- **THEN** hydration restores exactly that snapshot and the next output merge happens only
  after a further full canonical cook

### Requirement: Player interaction routing

Right-click/use targeting a furnace SHALL open the furnace container instead of placing the
held block. Opening/closing SHALL handle Esc/pause, focus loss, destruction while open,
death/world transition, and any product-mandated walk-away closure. Input MUST NOT leak
through an open container into mining/placement. Closing SHALL return the cursor stack to the
inventory or drop it when the inventory is full; it MUST NOT delete items.

#### Scenario: Furnace click does not place

- **WHEN** the player right-clicks a placed furnace with a placeable block selected
- **THEN** the furnace panel opens, the held stack is unchanged, and no block is placed

### Requirement: Furnace container UI

The furnace screen SHALL provide input, fuel, and output slots plus the player inventory/hotbar,
with burn and smelt progress indicators, built on the 106 transaction core and 203 screen
semantics (pickup/place, merge/swap, split-half/place-one, quick-move, hotbar interaction,
cursor stack). Output extraction SHALL be transactional with no duplication or deletion.

#### Scenario: Quick-move round trip is lossless

- **WHEN** a player shift-clicks a stack between the furnace region and the player region and
  back again
- **THEN** the combined item multiset equals the original exactly

### Requirement: Durable persistence

Live furnace state (input, fuel, output, burnTime, burnTimeTotal, smeltTime, smeltTimeTotal,
xp) SHALL persist through the IndexedDB block-entity store via full-snapshot dirty units.
Persistence SHALL survive ordinary autosave, explicit flush, page reload, chunk unload/reload,
an edit racing a write-in-flight (newest snapshot wins), and break-after-reload. localStorage
MUST NOT be used as authoritative world state.

#### Scenario: Reload restores all eight fields

- **WHEN** a furnace with non-default values in all eight fields is saved and the page reloads
- **THEN** hydration restores every field exactly

### Requirement: Breaking and drops

Breaking a furnace containing items SHALL follow one explicitly specified policy: contained
stacks are dropped into the world as item entities at the block center (Minecraft-like), the
furnace item itself drops through its normal loot path, accumulated xp is dropped as an orb,
the block entity is removed exactly once, the persistent record is invalidated, and an open UI
cannot retain a ghost reference to the destroyed furnace.

#### Scenario: Breaking drops contents without loss or duplication

- **WHEN** a furnace holding input/fuel/output stacks is broken
- **THEN** the spawned item entities carry exactly those stacks, no runtime instance remains,
  and reopening is impossible

### Requirement: Recovery and adversarial safety

Malformed persisted furnace payloads SHALL be skipped with a visible degraded-storage signal
and a fresh usable furnace state, never crashing boot. Stale records whose block is no longer
a furnace SHALL be ignored and lazily deleted. Full output stacks pause smelting, invalid fuel
is never consumed, insufficient inventory space on close drops rather than deletes, and
storage failure follows the facade's offline-first degradation.

#### Scenario: Corrupt payload degrades gracefully

- **WHEN** boot hydrates a furnace record failing strict validation
- **THEN** the record is quarantined, a warning is surfaced through storage health, and the
  game boots with a fresh-state furnace at that position
