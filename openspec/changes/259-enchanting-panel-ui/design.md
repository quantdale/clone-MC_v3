# Design: 259-enchanting-panel-ui

## Context/current state

- `src/inventory/EnchantingTable.ts` (120, VERIFIED): `createSession`
  builds three deterministic `EnchantOffer`s (`level/xpLevels/lapis` capped
  at 30 + `enchantments`) from `(stack, itemDef, bookShelves, playerLevel,
  seed, registry)`; `session.apply(index, { experience, lapisAvailable,
  registry })` is atomic (spends XP via `spendLevels` only on success,
  reports `lapisSpent` for the caller to remove); `enchantingTargetMatches`
  voids stale sessions (id/count/damage/enchantments identity).
- `Game` (`src/engine/Game.ts`): `openEnchanting()` (private, ~line 2780)
  builds the session from the held stack + `countBookshelves` 5×5×2 shell
  (clamped 15) + `experience.level` + world seed; `getEnchantingSession()`
  exposes it; `applyEnchantingOffer(i)` re-checks selection slot +
  identity, spends lapis via `inventory.removeItem(LapisLazuli, n)`, writes
  the enchanted stack via `setSelectedStack`. Selection moves void the
  session (`updateHotbar`, ~line 1863). No DOM exists: the session is
  headless-only. `PlayerInteraction` (~line 236) routes enchanting-table
  right-click to the `use` action, which calls `openEnchanting()`.
- `FurnacePanel` (251, VERIFIED) is the pattern to mirror: constructor over
  `requireElement` ids, `show/hide/isVisible`, `renderSignature` caching,
  per-frame `render()` from authoritative state, close settling
  (`takeCursor` → `returnStackToPlayer`), `Game` lifecycle (`openFurnace` /
  `closeFurnace`, walk-away distance 8, `onBlockBrokenAt` pre-close,
  focus-loss no-overlay-stack, relock closes, C-toggle closes, death
  closes, `dispose` closes).
- Exposure: `window.__voxelGame` is the live `Game` instance (used by
  `furnace.spec.ts` for setup/observation); new public getters/methods are
  automatically reachable from E2E.
- Ids (verified in source): item WoodenPickaxe=20 (enchantability 15),
  LapisLazuli=28, EnchantingTable item=31; block EnchantingTable=32,
  Bookshelf=33; `FURNACE_MAX_USE_DISTANCE = 8` reused for walk-away.

## Target state

- New `src/ui/EnchantingPanel.ts`: `EnchantingPanel` class + `EnchantingPanelDeps`.
- Extended `Game`: `enchantingOpen` flag + `enchantingPos`; `openEnchanting`
  takes `(x, y, z)` and opens the panel; `closeEnchanting()`; `isEnchantingOpen`
  + `enchantingSessionPosition` getters; per-frame upkeep (walk-away/destroy);
  all furnace-parity close sites (C toggle, relock, focus path, death,
  dispose, simulation-active gate).
- `index.html`: `#enchanting` shell (title, status, item line, three offer
  buttons, apply button, close button). `src/styles.css`: `enchanting-*`
  styles mirroring the furnace block.
- Tests: `tests/unit/EnchantingPanel.test.ts` (FakeElement shim, node env)
  + `tests/e2e/enchanting.spec.ts` (headed Chromium, real clicks).
- Docs: risk register R-3 → closed; `PARITY_MATRIX.md` enchanting note.

## Invariants

1. The panel owns no item/XP state. Every render derives from
   `deps.getSession()` (live `Game` session or null) + inventory/XP
   observers. Selection index is the only panel-local state.
2. Apply path adds no logic: the panel calls `deps.applyOffer(index)` →
   `Game.applyEnchantingOffer` → `session.apply`. Semantics (atomicity,
   guard) are 120's, unchanged and un-reimplemented.
3. A null session always renders as closed: `render()` with null session
   hides the panel and clears selection (never shows stale offers).
4. One container at a time: enchanting and furnace/crafting are mutually
   exclusive; opening one closes the other; the simulation-active gate
   treats `enchantingOpen` exactly like `furnaceOpen`.
5. No `Math.random` in panel or wiring (determinism); no new sounds/assets.

## API and data model

```ts
// src/ui/EnchantingPanel.ts
export interface EnchantingOfferView {
  index: number; level: number; xpLevels: number; lapis: number;
  names: string[];        // "Sharpness III" display strings
  affordable: boolean;    // xpLevels <= playerLevel && lapis <= lapisCount
}
export interface EnchantingPanelDeps {
  getSession(): EnchantingTableSession | null;
  getPlayerLevel(): number;
  getLapisCount(): number;
  getHeldName(): string;                       // item display name or ''
  applyOffer(index: number): EnchantApplyResult | null;
  onClose(): void;
  onChanged(): void;                           // hotbar/hud refresh hook
}
export class EnchantingPanel {
  constructor(el: HTMLElement, deps: EnchantingPanelDeps);
  show(): void; hide(): void; isVisible(): boolean;
  selectedOffer(): number;                     // -1 when none
  selectOffer(index: number): void;            // clamps to valid offers
  applySelected(): EnchantApplyResult | null;  // delegates + re-renders
  render(): void;                              // derive-from-session render
}
```

```ts
// Game additions (src/engine/Game.ts)
private enchantingPanel: EnchantingPanel;
private enchantingOpen = false;
private enchantingPos: { x: number; y: number; z: number } | null = null;
get isEnchantingOpen(): boolean;
get enchantingSessionPosition(): { x: number; y: number; z: number } | null;
openEnchanting(x: number, y: number, z: number): void;  // was private, argless
closeEnchanting(): void;
```

DOM ids: `enchanting`, `enchanting-title`, `enchanting-status`,
`enchanting-item`, `enchanting-offers` (container),
`enchanting-offer-0..2` (buttons), `enchanting-apply`,
`enchanting-close`. Offer buttons carry `data-offer-index` and
`aria-label` (`offer 1: <names>, cost <n> levels` or `offer 1: no
enchantment`).

## Control/data flow

- Open: right-click enchanting table → `PlayerInteraction` `use` (now with
  coords, same as the furnace hook) → `Game` `use`-case routes table +
  coords to `openEnchanting(x,y,z)` (non-table `use` keeps the old
  coordinate-free fallback via interaction target). `openEnchanting`
  closes furnace/crafting first, builds the session exactly as today,
  sets `enchantingOpen/Pos`, releases pointer lock, hides overlay /
  crosshair / hud / hotbar, clears target, `panel.show()`.
- Render: per-frame upkeep (mirror furnace): if table destroyed or player
  farther than 8 blocks → `closeEnchanting()`; else `panel.render()`.
  `render()` reads session/offers/XP/lapis, rebuilds offer buttons only
  when the signature changes, marks unaffordable offers `disabled` +
  `aria-disabled`, shows status (`Select an offer…` / `Need N more levels`
  / `Need lapis` / last apply reason).
- Apply: Apply button or double-click? Single Apply button only (explicit,
  testable). `applySelected()` → `deps.applyOffer(selected)`; on
  `{ ok:true }` the Game already wrote the stack + spent XP/lapis, so the
  panel re-derives: session offers are consumed → rebuild a fresh session
  for the still-held stack (same `openEnchanting` session-rebuild path,
  costs re-derived from the new level) and reset selection to -1; status
  shows `Enchanted with <names> (−N levels, −M lapis)`. On `{ ok:false }`
  status shows the reason (`Not enough XP`, `Need lapis`, `Offer empty`,
  `Session changed — reopen`) and spends nothing (120 guarantees it).
- Close: close button / C toggle / relock / walk-away / destroy / focus
  path / death / dispose → `closeEnchanting()`: clears
  session/slot/pos/flag, `panel.hide()`, `showOverlay('Click to play')`.
  No cursor exists (unlike furnace), so nothing needs settling; XP grant
  does not apply (no accumulated block-entity XP).

## Detailed behavior

- Offer display names resolve enchantment resource ids through the live
  `EnchantmentRegistry` (`get` by id → `key`, prettified) with roman-numeral
  levels (I–X, fallback to digits above 10); unknown ids render as the raw
  key, never throw.
- `selectOffer` clamps: out-of-range or empty-enchantment offers cannot
  become selected (selection stays or becomes -1); clicking the selected
  offer again deselects (toggle).
- Apply with no selection is a no-op with status `Select an offer first.`
- `render()` is cheap-idempotent via signature
  (`offers|level|lapis|heldName|selected|reason`) — safe to call per frame.
- Session voided mid-open (selection moved externally, stack changed):
  `getSession()` still returns the stale object but
  `Game.applyEnchantingOffer` returns null and clears it; the panel's next
  `render()` sees null (Game clears on failed guard) → hides itself. The
  per-frame `updateHotbar` void path additionally calls
  `closeEnchanting()` when open so the overlay returns promptly.

## Failure modes

| Failure | Behavior |
|---|---|
| No held item / unknown item def | `openEnchanting` returns without opening (as today); no panel. |
| Held item not enchantable | Session builds with empty offers; panel opens showing `No enchantments available for <name>.` Apply disabled. |
| Insufficient XP / lapis | `apply` returns typed reason; status shows it; nothing spent (120 atomicity). |
| Offer index invalid | `bad_offer`; status; nothing spent. |
| Table broken while open | `onBlockBrokenAt`-style pre-close; panel can never ghost-reference. |
| Panel DOM missing ids | `requireElement` throws at construction (fail-fast, same as furnace). |
| Unknown enchantment id in offer | Raw key displayed; apply still routes (registry validates). |

## Compatibility/migration

None required: no storage formats change. The enchanted stack is ordinary
`ENCHANTMENTS_COMPONENT` data inside the existing inventory snapshot;
XP is the existing experience snapshot. Reload persistence is proven by
the new E2E (pagehide → reload → stack/XP match).

## Performance/resource constraints

Panel render is signature-gated (no DOM churn per frame); offer buttons
(3) are reused, not recreated, when the signature matches. No per-frame
allocation beyond the signature string. No new timers/listeners beyond
three offer buttons + apply + close + mousemove-free (no cursor chip).

## Testing seams

- Unit (`tests/unit/EnchantingPanel.test.ts`, node + FakeElement shim
  following `FurnacePanelTransactions.test.ts`): construction throws on
  missing ids; render lists 3 offers with names/costs; reselect toggles;
  empty offers unselectable; apply delegates index + re-renders success
  (fresh session) vs reason display on failure; null session hides;
  `isVisible/show/hide`.
- Headless guard (existing `EnchantingSessionGuard` suite, untouched)
  continues to pin `applyEnchantingOffer` void semantics.
- E2E (`tests/e2e/enchanting.spec.ts`, headed Chromium, furnace-harness
  shape): (1) place→open→reselect→apply→reload-persists→close journey;
  (2) walk-away closes; focus-loss keeps panel without overlay stacking
  (furnace parity).

## Observability/debugging

- Status line (`#enchanting-status`) is the user-visible signal; E2E
  asserts its text transitions.
- Getters `isEnchantingOpen` / `enchantingSessionPosition` /
  `getEnchantingSession` are the automation surface (setup + observation
  only; the apply under test goes through real DOM clicks).
- Warn-free close paths: no console warnings on any lifecycle (E2E can
  fail on unexpected console errors if the harness supports it).

## Affected files/symbols

- NEW `src/ui/EnchantingPanel.ts` (`EnchantingPanel`, `EnchantingPanelDeps`,
  `EnchantingOfferView`).
- NEW `tests/unit/EnchantingPanel.test.ts`, NEW `tests/e2e/enchanting.spec.ts`.
- EDIT `src/engine/Game.ts`: import + field + construct panel; `openEnchanting`
  signature `(x,y,z)`; `closeEnchanting`; getters; `use`-case coords routing;
  upkeep in `update()`; simulation gate; C-toggle; relock; focus path;
  `onBlockBrokenAt`-adjacent enchanting pre-close; death; dispose.
- EDIT `src/player/PlayerInteraction.ts`: pass coords on enchanting-table
  `use` (mirror furnace).
- EDIT `index.html`: `#enchanting` shell. EDIT `src/styles.css`:
  `enchanting-*` styles.
- EDIT `openspec/hardening/2026-08-23-exhaustive-repository-certification/risk-register.md`
  (R-3 closed), `PARITY_MATRIX.md` (enchanting-panel note).

## Rejected alternatives

- Moving the item into panel slots (furnace-style 39-slot menu): rejected —
  the held-stack model with the hardened identity guard is already verified;
  moving stacks would need a new transaction core + cursor settling for zero
  player benefit and real item-loss risk.
- Auto-apply on offer click (no Apply button): rejected — clicks are
  fallible; an explicit Apply keeps affordances testable and prevents
  accidental 30-level spends.
- Regenerating offers on every reselect: rejected — 120 sessions are
  cached/deterministic per interaction; reselect is pure view state.

## Downstream dependencies

None inside this change. Future brewing/advancement UI may reuse the
panel shell conventions (ids, status line, signature-gated render) but
nothing depends on this change landing first.
