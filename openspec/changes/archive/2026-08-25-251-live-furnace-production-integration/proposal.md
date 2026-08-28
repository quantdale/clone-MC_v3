# Proposal: 251-live-furnace-production-integration

## Why

The numbered architecture program (001–250) is complete and every change is VERIFIED, but its
outcome is largely headless infrastructure: the fully verified furnace block-entity stack
(052 framework, 109 state machine, 110 recipes/fuels, 106 menu transactions, 203 screen
framework) has **no live consumer in the shipped browser game**. A player cannot place, open,
operate, persist, or break a furnace. `Game.getLiveResourceCounts()` literally reports
`blockEntities: 0` by construction.

This change converts that verified infrastructure into one real, player-visible, persistent,
end-to-end gameplay feature — the first campaign of the explicitly authorized post-terminal
epoch.

## Narrow outcome

Wire the existing furnace, block-entity, recipe/fuel, container transaction, fixed-tick, and
IndexedDB persistence infrastructure into the actual playable Game so a player can place,
open, operate, persist, unload/reload, and break a furnace without duplication, loss, timing
corruption, or headless-only shortcuts.

## What changes

- Production (`src/engine`, `src/world`, `src/storage`, `src/ui`, `index.html`):
  - A runtime block-entity host owning exactly one authoritative `FurnaceState` per placed
    furnace, hydrated from IndexedDB at boot and saved through the existing
    `block-entities` save-unit pipeline.
  - Fixed-tick furnace simulation restricted to simulating chunks (same policy as random
    ticks/mobs), driven by the existing `FixedTickDriver`.
  - Right-click routing: targeting a furnace opens its container instead of placing.
  - A DOM furnace panel built on 106 transactions + 203 screen semantics (input/fuel/output
    + player inventory, burn and smelt indicators, cursor stack).
  - Breaking drops contained items via the existing item-entity path and removes the record
    exactly once.
- Tests: new unit/integration coverage proving the *production wiring* (composition, tick
  ownership, pause, activation, persistence round-trips, destruction, stale-record recovery)
  plus one browser E2E furnace journey against the production artifact.
- Governance: this change is the first of the post-terminal epoch; PARITY_MATRIX gains a C251
  row; PROGRAM_STATE transitions from COMPLETE back to an ACTIVE change.

## Non-goals

- No Wither-like secondary boss (MP-19.4-1 stays deferred).
- No brewing-stand/chest UI integration beyond what furnace work forces (their cores stay as-is).
- No new smelting recipes/fuels (110 data unchanged).
- No multiplayer replication of furnace state.
- No weakening of any existing gate (visual/E2E/perf/persistence/state validation).

## Risks

See `design.md` §Risks and rollback. Headline risks: divergent furnace state copies (mitigated:
single authoritative instance payload), double-ticking across chunk boundaries (mitigated:
simulation-set gating identical to mob ticking), persistence races on write-in-flight edits
(mitigated: full-snapshot dirty units keyed per chunk, last-writer-wins with monotonic commits).
