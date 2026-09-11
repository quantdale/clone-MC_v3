# Design: 261-gamerule-settings-ui

## Context/current state

- 189 (`src/simulation/GameRuleFramework.ts`) is VERIFIED and complete as a
  headless layer: nine rules over `boolean`/`integer`/`string` kinds,
  `createDefaultGameRules`, kind-validated `setGameRule` (identity no-op on
  invalid), case-insensitive/strict/verbatim `parseGameRuleValue`, and
  versioned `serializeGameRules`/`deserializeGameRules` (exact known-key set,
  unknown keys rejected). Nothing in `src/` reads it except its own unit
  tests: `Game` holds no store, nothing persists it, and the two simulation
  functions that accept a gamerule-shaped flag never receive one from `Game`.
- Wither path: `WitherBoss.shouldWitherDestroyBlock(blockId, mobGriefing)`
  and `witherExplosionWorld(base, mobGriefing)` exist (252), but
  `Game.applyWitherExplosion` (Game.ts:2896) builds a bare `explosionWorld`
  whose `isDestroyable` ignores `mobGriefing` entirely, so every wither
  explosion (spawn blast + skull hits) destroys blocks unconditionally.
- Random-tick path: `Game.tickRandomBlocks` (Game.ts:1644) calls
  `randomTickSelector.selectEligible(...)` with the default count
  (`RANDOM_TICKS_PER_SUB_CHUNK` = 3, the Java default) and dispatches every hit
  to `behaviorRegistry.getBehavior(key).onRandomTick`. `FireBlockBehavior`
  (128) has no `doFireTick` gate. `Game` holds no `WeatherState` and never
  calls `tickWeather` (196); weather/daylight/mob-spawning/keepInventory/
  immediateRespawn/spawnRadius have no `Game` consumer at all.
- Persistence precedent: wither records live in the world-metadata
  IndexedDB store under the raw key `__wither__:<worldId>` via
  `WorldMetadataRepository.getWitherData/putWitherData` (bypassing
  `WorldMetadata` validation), bulk-loaded by `GamePersistence.open()` into
  `initialWithers`, written by `saveWithers`, deleted on the 257 reset path,
  and carried through `WorldArchive`/`WorldArchiver` as optional-tolerant
  `witherData`. Gamerules follow this exact shape.
- UI precedent: `EnchantingPanel`/`BrewingPanel` are pure views over `Game`
  state (`show`/`hide`/`isVisible`/`render`, deps interfaces, fail-fast
  missing-element checks, per-frame upkeep in `Game.update`), `index.html`
  carries one dialog block per screen, and `InputManager` queues hardcoded
  toggles (`KeyC` crafting, `KeyR` eat, `F3` debug) consumed once per frame by
  `Game`. `G` (code `KeyG`) follows the `KeyC` pattern; it is NOT a new 207
  remappable action, so the verified 23-action table is untouched.
- Command-layer finding: `CoreCommands.executeCoreCommand` (191) implements
  time/weather/gamemode/give/tp only — no `gamerule` command despite 189's
  docstring calling `parseGameRuleValue` "191's `/gamerule` entry point" — and
  single-player `Game` never executes chat commands (no `CommandEffect`
  consumer in `Game`; `ChatCommandRouter` effects serve the multiplayer server
  path). Adding a `gamerule` spec+effect with no applier would be dead
  surface and speculative scope, so 261 is UI-only; the parser entry point
  remains available for a future server-path change.

## Target state

- `Game` owns `private gameRules: GameRuleStore` (init: validated
  `persistenceImpl.initialGameRules` else `createDefaultGameRules()`),
  `getGameRules()` (immutable snapshot for panel/tests) and
  `setGameRule(key, value)` (framework-validated; invalid/unknown = identity
  no-op + `false` return; valid = new store + `saveGameRules` + panel
  re-render + `true` return). A `getGameRuleValue(key)` convenience feeds the
  tick paths without re-reading persistence.
- `applyWitherExplosion` wraps its local `explosionWorld` with
  `witherExplosionWorld(base, mobGriefing)`: with `mobGriefing=false`
  `computeExplosion` destroys nothing (the 32-cap clear loop no-ops) while
  player blast damage is unchanged; with `true` behavior is byte-identical to
  today.
- `tickRandomBlocks`: `const doFireTick = getGameRule(...,'doFireTick') !== false`
  (defensive: any non-false value, including the typed boolean, keeps fire
  live); when the selected block is Fire (`blockKey === fireKey`, resolved
  once via `blockRegistry.get(BlockId.Fire).key`) and `!doFireTick`, the
  `onRandomTick` call is skipped. `const tickCount =
  resolveRandomTickCount(gameRules)` where the pure helper clamps the
  `randomTickSpeed` integer to `>= 0` (default 3 reproduces today's call
  exactly) and passes it as the selector count.
- `GameRulePanel` (`src/ui/GameRulePanel.ts`): deps
  `{ getRules(), describeRule(key), setRule(key, text), onClose() }`; renders
  one row per `gameRuleDefinitions()` entry (boolean: `<button
  aria-pressed>` toggling true/false; integer: `<input type=number>` parsed
  via `parseGameRuleValue`; string: `<input type=text>` verbatim); invalid
  text → `setRule` returns null → status line explains, store untouched;
  panel owns no rule state (only `status` text + render signature).
- Open/close: `InputManager` gains `gameruleToggleQueued` +
  `consumeGameruleToggle()` (`KeyG` down, cleared on blur/unlock with the
  other queues, included in `preventDefault`); `Game.update` toggles
  `openGamerule()`/`closeGamerule()`; a HUD button `#gamerule-open` opens it
  for mouse/touch; `C` closes it under the one-container rule; close button,
  death (`respawnPlayer`), and `dispose()` close it; blur/visibility keep it
  open without stacking (furnace parity).
- Persistence: `WorldMetadataRepository.getGameRuleData/putGameRuleData`
  (`__gamerules__:<worldId>` raw record `{ worldId, payload, updatedAt }`);
  `GamePersistence` loads at `open()` (step beside the 252 wither hydration:
  `deserializeGameRules` on a non-null payload, catch → defaults + recorded
  error), exposes `initialGameRules: unknown` (raw payload, null when
  absent), `saveGameRules(payload: unknown)` fire-and-forget write with
  recorded errors, reset-path `deleteRaw('__gamerules__:' + worldId)`;
  `WorldArchive.gameruleData: unknown[] | null` optional (missing → null) +
  `WorldArchiver` export/import passthrough via the new repository methods.
- Shell: `index.html` `#gamerule` dialog block (title, status, rows
  container, close button) + `src/styles.css` `gamerule-*` styles mirrored on
  the enchanting/brewing dialog treatment. Additive only; no binaries.

## Invariants

- I1: The 189 registry is the single source of rows: the panel renders
  exactly `gameRuleDefinitions()` in order; no rule list is duplicated in UI
  code.
- I2: Invalid edits never touch the store (`setGameRule` identity no-op;
  `setRule` text path returns null on `parseGameRuleValue` null; panel shows
  status, never throws).
- I3: Defaults reproduce today: fresh worlds behave exactly as pre-261
  (`mobGriefing` true, `doFireTick` true, `randomTickSpeed` 3).
- I4: Persistence failures never break boot: corrupt/absent payloads →
  defaults; write failures are recorded, not thrown.
- I5: One container at a time: opening gamerule closes
  crafting/furnace/brewing/enchanting and vice versa.
- I6: 258 untouched: no headed FPS work, no GPU evidence, 258 never VERIFIED
  by this track. 259/260 untouched unless a gamerule regression blocks 261.

## API and data model

```ts
// WorldMetadataRepository (additive)
putGameRuleData(worldId: string, payload: unknown): Promise<void>;
getGameRuleData(worldId: string): Promise<unknown | null>;

// GamePersistence (additive)
get initialGameRules(): unknown;            // raw payload, null when absent
saveGameRules(payload: unknown): void;      // fire-and-forget + recordError

// Game (additive)
getGameRules(): GameRuleStore;
setGameRule(key: string, value: GameRuleValue): boolean;
isGameruleOpen(): boolean;
openGamerule(): void; closeGamerule(): void;

// UI (new)
new GameRulePanel(el: HTMLElement, deps: GameRulePanelDeps): GameRulePanel;
// show/hide/isVisible/render/selectedStatus

// Pure wiring helper (new, unit-testable without Game)
resolveRandomTickCount(store: GameRuleStore): number; // clamp(randomTickSpeed, >=0)
```

`GameRulePanelDeps`: `getRules(): GameRuleStore`;
`describeRule(key): { kind, defaultValue }`;
`setRule(key, text): boolean` (parse + set + persist; false = invalid no-op);
`onChanged(): void`; `onClose(): void`.

## Control/data flow

- Frame: `Game.update` consumes `consumeGameruleToggle()` → toggle panel;
  per-frame upkeep re-renders the open panel (signature-gated).
- Edit: panel control → `Game.setGameRule` → framework validate → new store +
  `persistenceImpl.saveGameRules(serializeGameRules(store))` → panel render.
- Boot: `main.ts` opens persistence → `Game` constructor reads
  `initialGameRules` → `deserializeGameRules` (valid) else defaults.
- Tick: `tickRandomBlocks` reads the in-memory store (no I/O); wither
  explosions read `mobGriefing` at blast time (mid-session toggles apply to
  the next explosion, never retroactively).

## Detailed behavior

- Boolean rows show current value + `aria-pressed`; clicking flips and
  persists immediately.
- Integer rows parse with `parseGameRuleValue` (strict `/^-?\d+$/`,
  safe-integer); non-numeric/unsafe text is a no-op with status
  `"<key>: '<text>' is not a valid integer — value unchanged."`.
- String rules accept verbatim text (none registered today; path covered by a
  unit test against a synthetic definition only where the framework allows —
  otherwise noted as unreached kind with the boolean/integer paths pinned).
- `randomTickSpeed` 0 is legal (no random ticks that session) and persists;
  negative/clamped only at the selector call site, never rewritten in the
  store (store keeps exactly what the user set; kind-valid integers only).
- `mobGriefing=false` also gates the spawn-blast and every skull-hit blast
  through the same `applyWitherExplosion` path (single choke point).
- Reset world (257 flow) deletes the gamerule record so a fresh world boots
  defaults; export/import carries it.

## Failure modes

- Corrupt gamerule payload (bad version, missing keys, wrong kinds, unknown
  keys): `deserializeGameRules` throws inside a try/catch at load → defaults +
  `recordError('load gamerules: ...')` + degraded banner path unchanged.
- IndexedDB write failure on edit: recorded via `recordError`, banner
  surfaces, in-memory store keeps the user's value for the session (next boot
  re-reads durable state — documented, matches wither behavior).
- Missing panel element: constructor throws `Gamerule element missing`
  (fail-fast, 259/260 parity).
- `setGameRule` with unknown key or wrong-kind value: returns false, store
  identical, status surfaced; never throws.

## Compatibility/migration

- Absent record → defaults (old saves unaffected). No version bump of any
  store; the raw namespace needs none (payload carries 189's own version).
- `WorldArchive`: optional `gameruleData` (unknown, null default); v1/v2
  archives without it validate and import as null; export includes it.
- `SaveRecoveryMatrix` wither-data rejection probes untouched; gamerule
  methods are not part of the matrix's sink surface.

## Performance/resource constraints

- Tick paths read the in-memory store (no IndexedDB on the hot path); per
  random-tick-cell work adds one boolean compare + (for Fire only) one key
  compare; explosion path adds one boolean read. No allocations beyond the
  existing spread.
- Panel render is signature-gated (no DOM churn when rules unchanged).
- Persistence writes are debounced by edit (one put per successful edit, same
  as wither save batching).

## Testing seams

- `window.__voxelGame` (existing DEV/VITE_E2E seam): `getGameRules()`,
  `setGameRule()`, `isGameruleOpen()`, public `applyWitherExplosion`
  (already public), plus world block access via the existing test patterns.
- Unit seams: `GameRulePanel` FakeElement harness (259/260 pattern);
  in-memory IndexedDB factory injection for repository/persistence tests;
  pure `resolveRandomTickCount` + `witherExplosionWorld` gating tests.

## Observability/debugging

- Status line in the panel (`#gamerule-status`, `aria-live="polite"`)
  reports every applied edit and every rejected input with the reason.
- Persistence errors flow through `GamePersistence.errors` → save-status
  banner (no new banner surface).

## Affected files/symbols

- New: `src/ui/GameRulePanel.ts`, `tests/unit/GameRulePanel.test.ts`,
  `tests/unit/GameRulesPersistence.test.ts`,
  `tests/unit/GameRuleWiring.test.ts`, `tests/e2e/gamerule.spec.ts`,
  `openspec/changes/261-gamerule-settings-ui/*`.
- Edit: `src/storage/WorldMetadataRepository.ts` (+2 methods),
  `src/storage/GamePersistence.ts` (load/save/reset/getter),
  `src/storage/WorldArchive.ts` + `src/storage/WorldArchiver.ts`
  (optional passthrough), `src/engine/Game.ts` (store, panel, wiring,
  lifecycle), `src/engine/InputManager.ts` (`KeyG` queue),
  `index.html` (`#gamerule` block + HUD button), `src/styles.css`
  (`gamerule-*`), `PARITY_MATRIX.md` (C261 row + counts + note),
  `openspec/PROGRAM_STATE.json`/`.md`, `openspec/CHANGE_SEQUENCE.md`,
  `openspec/CHANGE_SEQUENCE_OVERRIDES.md`.
- Untouched: 189 framework, 190/191/233 command path, 207 table, 252 wither
  module, 128 fire module, 196 weather module, 259/260 panels and specs,
  258 files.

## Rejected alternatives

- New 207 remappable `open_gamerules` action: churns the VERIFIED 23-action
  table + persistence + conflict surface for one screen; hardcoded `KeyG`
  matches `KeyC` precedent with zero table risk.
- Storing gamerules inside `WorldMetadata` record: would force a schema
  version bump + migration chain for every world; the raw-namespace precedent
  (252) avoids it.
- Wiring `doWeatherCycle` by adding a `WeatherState` to `Game`: invents a
  simulation system (no consumer exists); explicitly deferred with rationale
  instead.
- Adding a `/gamerule` command with no applier: dead surface; deferred until
  a live command-execution path exists.

## Downstream dependencies

- Future server-path work may consume `parseGameRuleValue` + the persisted
  store for authoritative rules; the 261 store shape (`SerializedGameRules`)
  is already the wire-compatible payload.
- A future weather-simulation change can read `doWeatherCycle` from this
  store through the same `getGameRuleValue` pattern.
