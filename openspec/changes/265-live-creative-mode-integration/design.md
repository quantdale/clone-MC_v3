# Design: 265-live-creative-mode-integration

## Context/current state

- 192 (`src/simulation/GameModeFramework.ts:19-110`) is VERIFIED and frozen:
  `GAME_MODES`, immutable `GameModeState` (default `survival`), identity-no-op
  `setGameMode`, case-insensitive `parseGameMode`, predicates (`canFly`:
  creative+spectator; `instantBlockBreak`: creative; `depletesItems`:
  survival+adventure; `survivalStatsDeplete`: survival+adventure), and strict
  versioned `serialize/deserializeGameModeState` (exact-keys, throws).
- Live `Game` (`src/engine/Game.ts`, 4183 lines) has zero game-mode references.
  Save path precedent (261–264): raw `__<ns>__:<worldId>` records in
  `WorldMetadataRepository` (`putXData`/`getXData`), facade bulk-load in
  `GamePersistence.open()` (absent → null; corrupt → null + recorded error),
  `initialX` getters, `saveX` fire-and-forget with `disposed`/`resetCompleted`
  guards, Game hydrate for injected (`selfOpenPromise === null`) and late-load
  paths, reset deletes, `WorldArchive` optional fields + `WorldArchiver`
  passthrough.
- Interaction: `PlayerInteraction.placeBlock` consumes via
  `selector.consumeSelected()` (`PlayerInteraction.ts:544`); mining progresses in
  `advanceBreak` via `getBreakDuration` (`:334-352,480-498`); `finishBreak`
  (`:354-460`) resolves loot → item entities, XP, and tool durability.
- Survival: `Game.runFixedTick` calls `survival.update(...)` unconditionally
  (`Game.ts:1746-1756`); `tryEatSelected` (`:4107-4120`) consumes the held stack;
  scattered `survival.damage` call sites (explosion, hostile, hazard paths).
- Movement: `controller.update(dt)` then `physics.update(player, dt)`
  (`Game.ts:1691-1692`); `PlayerPhysics.update` always applies gravity
  (`PlayerPhysics.ts:156-169`); jump from `input.jump`, sneak from
  `input.sneaking` (`PlayerController.ts:48-50,131-137`).
- Panels (261–263 parity): `GameRulePanel`/`RecipeBookPanel`/`AdvancementPanel`
  are pure DOM views; Game owns `XOpen` flags, `openX/closeX` with
  one-container closes, HUD chip buttons (`gamerule-open`, `advancements-open`),
  `KeyG` toggle via `InputManager.consumeGameruleToggle()`, tick upkeep +
  simulation gate + dispose/respawn closes, E2E seams (`isXOpen`, getters).
- Registries: `ItemRegistry.all()` (`ItemRegistry.ts:217`) with
  `placeBlock?: ResourceId`, `stackSize`, `name`, `key`; `BlockRegistry.all()`
  (`BlockRegistry.ts:409`).

## Target state

`Game` owns `gameMode: GameModeState` (192 type, default survival), persisted via
`__gamemode__`, switchable via `setGameMode` / `setGameModeFromText` / HUD chip,
applied live to interaction (deplete/instant/drops), survival (tick + damage),
movement (flight), and surfaced through a searchable grant menu
(`CreativeMenuPanel` + `creative-open` HUD chip + `KeyE`).

## Invariants

1. Survival is the default: absent/corrupt payloads, fresh worlds, and archives
   without the field all boot `survival`.
2. All mode-rule hooks default to legacy (survival) behavior when unwired.
3. Mode switches apply within one tick with no restart and persist immediately.
4. Identity switches (`survival`→`survival`, invalid text) are no-ops: no state
   churn, no persistence write, no toast.
5. The creative menu never crafts, never consumes, never rolls loot: grants are
   `inventory.addItem(id, stackSize)` + `hotbar.render()`.
6. Adventure/spectator persist and inherit the shared 192 predicates only;
   193/194/195 deeper semantics stay rule-level (documented deferral).

## API and data model

```ts
// New pure helpers (src/simulation/CreativeInventory.ts — no DOM, no Game import)
export interface CreativeItemView { id: number; key: string; name: string; blockId: number | null; stackSize: number; }
export function listCreativeItems(itemRegistry: ItemRegistry, blockRegistry: BlockRegistry): CreativeItemView[];
export function searchCreativeItems(views: readonly CreativeItemView[], query: string): CreativeItemView[];

// New pure resolver (src/player/CreativeFlight.ts — no DOM)
export interface CreativeFlightInput { jump: boolean; sneak: boolean; }
export function resolveCreativeFlightVelocity(mode: GameMode, input: CreativeFlightInput, flySpeed: number): { flying: boolean; verticalVelocity: number };

// PlayerInteraction options (additive, all optional, defaults = legacy)
export interface PlayerInteractionOptions {
  depletesItems?: () => boolean;  // default () => true
  instantBreak?: () => boolean;   // default () => false
  dropsLoot?: () => boolean;      // default () => true
}

// PlayerPhysics options (additive)
export interface PlayerPhysicsOptions {
  isFlying?: () => boolean;       // default undefined (= never); skips gravity + fall accumulation
}

// Game seams (E2E + UI)
getGameMode(): GameMode; isCreativeOpen(): boolean;
setGameMode(mode: GameMode): boolean;            // false on identity/invalid, no write
setGameModeFromText(text: string): boolean;      // 192 parse; false on unknown, no write
getCreativeItems(): CreativeItemView[]; searchCreative(query: string): CreativeItemView[];
grantCreativeItem(itemId: number): boolean;      // addItem full stack; false when unknown/full
toggleGameMode(): GameMode;                      // survival ⇄ creative (HUD chip)
```

`listCreativeItems`: iterate `itemRegistry.all()` in registration order, keep
entries with `placeBlock` set, resolve `blockId` via
`blockRegistry.getByResourceId(placeBlock)` (null when unresolvable — row still
listed, place path reports blocked as today). `searchCreativeItems`: trim +
lowercase substring over `name`/`key`; blank query returns all in order (204
search parity).

`resolveCreativeFlightVelocity`: `flying = canFly(mode)` (192 import); when not
flying returns `{flying:false, verticalVelocity: NaN-as-untouched}` — contract:
caller MUST ignore `verticalVelocity` when `flying` is false (use `0` fill only
under `flying`). When flying: `jump && !sneak → +flySpeed`; `sneak && !jump →
-flySpeed`; both/neither → `0` (hover). `flySpeed` constant
`CREATIVE_FLY_SPEED = 8.0` blocks/s (documented; ~2× sprint, below terminal).

## Control/data flow

- Boot: facade `open()` bulk-loads `__gamemode__` → `initialGameMode`
  (validated `GameModeState`, null when absent/corrupt). Game constructor takes
  it (injected) or applies it on `selfOpenPromise` settle (late-load, with panel
  re-render when open). Corrupt → survival + `bootSaveDegraded`-style banner via
  the existing save-status path (quarantine, never crash).
- Switch (`setGameMode`): 192 `setGameMode` identity check → on change assign,
  `saveGameMode(serializeGameModeState(...))`, re-render open creative panel,
  update HUD chip label, toast `Game mode: Creative|Survival`. Invalid input
  (untyped caller) → identity → false.
- Tick (`runFixedTick`): `controller.update(dt)` →
  `if (resolveCreativeFlightVelocity(...).flying) player.velocity.y = v`
  → `physics.update` (with `isFlying: () => canFly(mode)` suppressing gravity)
  → post-physics `if (flying) player.fallDistance = 0` →
  `interaction.update` (reads live `depletesItems/instantBreak/dropsLoot`
  closures over `this.gameMode`) →
  `if (survivalStatsDeplete(mode)) survival.update(...)` + HUD refresh (HUD keeps
  last values in creative; hearts/hunger stay full as drained-never).
- Damage: every direct `this.survival.damage(...)` site is preceded by
  `if (!survivalStatsDeplete(this.gameMode.mode)) return/skip` (single choke
  helper `hurtPlayer(amount, cause)` where call sites already funnel; per-site
  guard where they do not).
- Eat/use: `tryEatSelected` keeps behavior (full hunger ⇒ `eat` false ⇒ no
  consume); `useBonemeal` consume gated on `depletesItems(mode)` (skip consume,
  still apply effect — vanilla creative bonemeal is not consumed).
- Menu: `openCreative` (one-container closes incl. new `closeCreative` in every
  `openX`, crafting toggle, respawn, dispose) → panel `show()+render()` with
  current query preserved across renders; row click → `grantCreativeItem` →
  status line narrates granted/full/unknown; `KeyE` toggles; HUD chip
  `creative-open` opens; blur/focus-loss closes? No — 261–263 panels stay open on
  blur (overlay returns on click); creative follows (lifecycle E2E pins close via
  toggle/button/crafting-toggle/dispose-path only).
- Save: mode saves on switch; `saveGameMode()` also joins dispose + `onPageHide`
  + 5 s autosave? Decision: switch-save is authoritative; dispose/pagehide
  include it for crash-durability parity (cheap, idempotent). Autosave 5 s covers
  it only if dirty-flagged — simpler: include unconditionally beside
  `saveItemAndXpEntities()` (payload is 2 fields; cost negligible).

## Detailed behavior

- `placeBlock` (`PlayerInteraction.ts:544`): `if (this.depletesItems() === false)
  skip consumeSelected` (still require non-empty selection — an empty hand
  cannot place; the `getSlotCount` empty-guard stays).
- `advanceBreak`: after the breakable guard, `if (this.instantBreak() === true)
  { this.finishBreak(blockId); return; }` (progress events: emit `1` once via
  existing `onBreakProgress` path inside `finishBreak`? `finishBreak` calls
  `resetBreakProgress` which emits `0`; the E2E asserts block-gone, not bar
  values — no new events).
- `finishBreak`: wrap loot/XP/durability in `if (this.dropsLoot() !== false)`:
  creative instant-breaks clear the world cell with no spawns and no tool wear.
  `onAction('break', primaryDropId)` still fires with `undefined` drop (toast
  "Collected block"? `onInteractionAction` toasts `Collected ${name}` where name
  falls back to 'block' — acceptable; Game keeps behavior, no special-case).
- Flight hover: with no vertical input `velocity.y = 0` pre-physics and gravity
  suppressed → position holds; horizontal walk/sprint unchanged; step-up/sneak
  edge-safety unchanged; landing sets grounded normally; jumping from ground in
  creative ascends (no `onGround` requirement — direct velocity set).
- HUD chip `gamemode-toggle`: label `Mode: Survival|Creative|Adventure|Spectator`
  (aria-live polite); click toggles survival ⇄ creative only (other modes only
  via text seam; chip never cycles into adventure/spectator accidentally).
- Menu rows: `data-creative-row="<id>"`, name + key subtitle + "Grant" affordance
  (whole row clickable, button semantics via `<button>`); search input
  `#creative-search`; status `#creative-status`; list `#creative-list`.

## Failure modes

- Corrupt `__gamemode__` (wrong version/mode/keys/non-object): facade catches →
  null + recorded error → Game boots survival + degraded banner. Covered by
  facade unit tests (4+ corrupt shapes).
- Unknown/invalid `setGameMode` input or text: false, state identical, no write,
  no toast. Covered by unit tests (Game seams are DOM-bound → pinned via E2E
  invalid-text case + pure 192 suites for the underlying rule).
- Grant with unknown id or full inventory: false + status line; inventory
  byte-identical (addItem leftover path). Covered by E2E + helper unit tests.
- `blockRegistry` drift (placeBlock rid unresolvable): row listed with
  `blockId: null`; grant still works (item form); placing reports blocked via
  existing path. Covered by helper unit test with a stub registry.

## Compatibility/migration

- Zero schema/store changes; new `__gamemode__` namespace only.
- `WorldArchive.gameModeData?: unknown | null` (missing reads null); archiver
  export/import passthrough; `GamePersistence.reset` deletes the key.
- Interaction/physics option callbacks are optional; legacy and headless callers
  construct without them (defaults pinned by existing suites, untouched-green).

## Performance/resource constraints

- Menu render is signature-guarded (261–263 `lastSignature` pattern) so per-tick
  upkeep while open is O(1) no-op when nothing changed; list built once per
  query change (registries are small: hundreds of entries; filter is linear).
- Flight adds one predicate call + one float store per tick; physics adds one
  predicate call per update. No allocations in the hot path (resolver returns a
  fresh 2-field object only at the Game call site — one alloc/tick, negligible;
  physics predicate is a closure read).
- Mode save payload is `{version, mode}`; saves are event-driven (switch) plus
  piggyback on existing dispose/pagehide/autosave sites (no new timers).

## Testing seams

- `window.__voxelGame` (existing VITE_E2E gate) exposes: `getGameMode`,
  `setGameMode`, `setGameModeFromText`, `isCreativeOpen`, `getCreativeItems`,
  `searchCreative` (via set query + getter), `grantCreativeItem`,
  `getPlayerPosition`, inventory read/add (`getItemCount`, `addItem`), plus
  existing world/game handles. Check `main.ts`/`Game` exposure pattern for
  263 (`fireAdvancementTrigger`) and mirror.
- Unit seams stay pure: `CreativeInventory.ts`, `CreativeFlight.ts`,
  facade/reader validation, physics `isFlying`, interaction option callbacks.

## Observability/debugging

- Switch toast (`Game mode: X`); HUD chip label; debug overlay unchanged.
- Facade `recordError('load gamemode: ...')` surfaces through the save-status
  banner (existing path).

## Affected files/symbols

- NEW: `src/simulation/CreativeInventory.ts`, `src/player/CreativeFlight.ts`,
  `src/ui/CreativeMenuPanel.ts`, `tests/unit/CreativeInventory.test.ts`,
  `tests/unit/CreativeFlight.test.ts`, `tests/unit/GameModePersistence.test.ts`,
  `tests/e2e/creative-mode.spec.ts`.
- EDIT: `src/storage/WorldMetadataRepository.ts` (put/getGameModeData),
  `src/storage/GamePersistence.ts` (load/getter/save/reset),
  `src/storage/WorldArchive.ts` + `WorldArchiver.ts` (passthrough),
  `src/player/PlayerInteraction.ts` (3 callbacks + 3 application sites),
  `src/player/PlayerPhysics.ts` (`isFlying` + gravity/fall guards),
  `src/engine/Game.ts` (store, hydrate, switch, tick gates, menu, chip, saves),
  `src/engine/InputManager.ts` (`creativeToggleQueued`, `KeyE`),
  `index.html` (chips + dialog), `src/styles.css` (menu styles),
  `tests/unit/PlayerInteraction.test.ts` (extend),
  `tests/unit/PlayerPhysics.test.ts` (extend),
  file-audit manifest, `PARITY_MATRIX.md` (C265 row on VERIFIED only),
  `openspec/PROGRAM_STATE.*`.

## Rejected alternatives

- Double-tap-space fly toggle: fiddly to detect deterministically across
  keyboard/touch/gamepad; always-on hover in creative is simpler, safe, and
  matches the order's "minimal safe fly" guidance.
- Full chat/command UI for `/gamemode`: a chat system is a later-change feature;
  the text seam + HUD toggle covers switching without that scope.
- Suppressing the break toast in creative: special-casing UI text adds branches
  for zero player value; the cell clears instantly which is the asserted behavior.
- Storing mode inside the player snapshot: world-scoped raw records are the
  261–264 convention (reset/archive/delete parity); the player snapshot stays
  untouched.

## Downstream dependencies

- Future spectator overhaul (195 follow-up) reuses `canFly` flight + persisted
  mode; adventure enforcement (194 follow-up) reuses the persisted mode +
  `setGameModeFromText`; none are unblocked-required by this change.
