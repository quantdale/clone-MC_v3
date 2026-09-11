# Spec: enchanting-panel-ui

## Contract

The enchanting panel is a thin DOM view over the verified headless
enchanting session (`src/inventory/EnchantingTable.ts`, changes 118–120).
It MUST NOT reimplement offer generation, cost calculation, atomic apply,
or session-identity semantics — it displays what the session provides and
routes player gestures to `Game.applyEnchantingOffer`. All MUST/SHALL
below are testable through the panel unit suite (FakeElement DOM) and the
browser E2E journey, except where a headless guard suite is cited.

## Definitions

- **Session**: the `EnchantingTableSession` built by `Game.openEnchanting`
  for the held stack: three `EnchantOffer`s plus the atomic `apply`.
- **Offer**: one of the three session offers: displayed level (= XP cost =
  lapis cost, capped at 30) plus granted enchantments.
- **Selected offer**: panel-local pending choice (`selectedOffer()`, -1
  when none). Reselect means changing it.
- **Held stack**: `inventory.getSelectedStack()` — the item being enchanted.
- **Walk-away**: player eye distance from the table center beyond 8 blocks
  (same constant as the furnace session).
- **Void**: the session-guard outcome: `applyEnchantingOffer` returns null
  and clears the session when the selection moved or the held stack
  identity changed.

## Invariants

- INV-1: The panel stores no item, XP, or lapis state; every render
  derives from `getSession()` + `getPlayerLevel()` + `getLapisCount()` +
  `getHeldName()`.
- INV-2: A null session MUST render as a hidden panel with selection -1.
- INV-3: Apply MUST delegate to `Game.applyEnchantingOffer` (hence to
  `session.apply`); the panel MUST NOT spend XP/lapis or mutate stacks
  itself.
- INV-4: Enchanting is mutually exclusive with furnace/crafting sessions.

## Requirements

### Requirement: PANEL-1 — Table use opens the panel

The panel SHALL open when the player uses (right-clicks) a placed
enchanting table while holding an item stack.

#### Scenario: PANEL-1.1 — Open on table use

- **GIVEN** a placed enchanting table under the crosshair and a held
  enchantable stack (e.g. wooden pickaxe)
- **WHEN** the player right-clicks the table
- **THEN** `#enchanting` becomes visible, shows the held item name, the
  player XP level, the lapis count, and three offer buttons
- **AND** pointer lock is released and the pause overlay stays hidden
  (the panel represents the paused state).

#### Scenario: PANEL-1.2 — No held item opens nothing

- **GIVEN** an empty selected hotbar slot aimed at an enchanting table
- **WHEN** the player right-clicks
- **THEN** the panel stays hidden and no session is created.

#### Scenario: PANEL-1.3 — Unenchantable held item

- **GIVEN** a held stack with no enchantability (e.g. sand)
- **WHEN** the player uses the table
- **THEN** the panel opens showing `No enchantments available for <name>.`
- **AND** the Apply button is disabled.

### Requirement: PANEL-2 — Offers displayed with costs

Each offer SHALL show its granted enchantments (name + roman level) and
its level cost; offers the player cannot afford SHALL be marked disabled.

#### Scenario: PANEL-2.1 — Three offers listed

- **GIVEN** an open panel for an enchantable held item
- **WHEN** rendered
- **THEN** exactly three offer buttons exist, each labelled with its
  enchantment names (or `no enchantment` when empty) and
  `cost <n> levels`.

#### Scenario: PANEL-2.2 — Unaffordable offers disabled

- **GIVEN** an offer costing more XP levels than owned (or more lapis
  than carried)
- **WHEN** rendered
- **THEN** that offer button is `disabled` with `aria-disabled="true"`.

### Requirement: PANEL-3 — Reselect offers

Clicking an offer SHALL make it the pending selection; clicking it again
SHALL deselect; empty or out-of-range offers SHALL NOT become selected.

#### Scenario: PANEL-3.1 — Select then reselect

- **GIVEN** an open panel with offers
- **WHEN** the player clicks offer 0, then clicks offer 2
- **THEN** `selectedOffer()` is 0 after the first click and 2 after the
  second, and the status line names the pending offer.

#### Scenario: PANEL-3.2 — Toggle off

- **GIVEN** offer 1 selected
- **WHEN** the player clicks offer 1 again
- **THEN** `selectedOffer()` is -1 and Apply reports
  `Select an offer first.` when pressed.

#### Scenario: PANEL-3.3 — Empty offer not selectable

- **GIVEN** an offer with zero enchantments
- **WHEN** the player clicks it
- **THEN** selection is unchanged and Apply stays unarmed for it.

### Requirement: PANEL-4 — Apply spends XP/lapis and enchants

Applying the selected offer SHALL delegate to
`Game.applyEnchantingOffer(selected)`; on success the held stack gains
the enchantments and XP levels + lapis are deducted; on failure nothing
is spent and the reason is shown.

#### Scenario: PANEL-4.1 — Successful apply (E2E)

- **GIVEN** an open panel, an affordable selected offer, sufficient XP
  and lapis
- **WHEN** the player clicks Apply
- **THEN** the held stack carries the offered enchantments, XP level
  drops by the offer cost, lapis count drops by the offer cost
- **AND** the status shows `Enchanted with <names> (−N levels, −M lapis)`
- **AND** fresh offers for the still-held stack are shown with selection
  reset to -1.

#### Scenario: PANEL-4.2 — Insufficient XP

- **GIVEN** a selected offer costing more levels than owned
- **WHEN** the player clicks Apply
- **THEN** the result is `{ ok:false, reason:'insufficient_xp' }`, the
  status shows `Not enough XP (need N levels).`, and XP, lapis, and the
  held stack are unchanged.

#### Scenario: PANEL-4.3 — Insufficient lapis

- **GIVEN** sufficient XP but lapis below the offer cost
- **WHEN** the player clicks Apply
- **THEN** the result is `{ ok:false, reason:'insufficient_lapis' }`,
  the status shows `Need lapis (N).`, and nothing is spent or changed.

#### Scenario: PANEL-4.4 — No selection

- **GIVEN** no offer selected
- **WHEN** the player clicks Apply
- **THEN** no delegate call happens and the status shows
  `Select an offer first.`

### Requirement: PANEL-5 — Session guard preserved

Moving the hotbar selection or changing the held stack identity SHALL
void the session; the panel SHALL close and a subsequent apply SHALL
spend nothing.

#### Scenario: PANEL-5.1 — Selection move voids (E2E-adjacent, unit-pinned)

- **GIVEN** an open panel with a live session
- **WHEN** the hotbar selection moves to another slot
- **THEN** the session is cleared, the panel hides, the overlay returns,
  and `applyEnchantingOffer` returns null.

#### Scenario: PANEL-5.2 — Stale render hides

- **GIVEN** a panel whose session became null (voided externally)
- **WHEN** `render()` runs
- **THEN** the panel hides and selection resets to -1 (no stale offers
  ever displayed).

### Requirement: PANEL-6 — Lifecycle safety

The panel SHALL close without losing items, XP, or overlay coherence on:
close button, C toggle, pointer relock, walk-away, table destruction,
focus loss path, death/respawn, and dispose.

#### Scenario: PANEL-6.1 — Close button

- **GIVEN** an open panel
- **WHEN** the player clicks Close
- **THEN** the panel hides, the session clears, and the overlay shows
  `Click to play`.

#### Scenario: PANEL-6.2 — Walk-away closes (E2E)

- **GIVEN** an open panel
- **WHEN** the player moves more than 8 blocks from the table center
- **THEN** the panel closes exactly like PANEL-6.1.

#### Scenario: PANEL-6.3 — Table destroyed while open

- **GIVEN** an open panel for a table at P
- **WHEN** the block at P stops being an enchanting table
- **THEN** the panel closes before any destruction toast/drops, and a
  later render never references P.

#### Scenario: PANEL-6.4 — Focus loss and relock (furnace parity)

- **GIVEN** an open panel
- **WHEN** the window blurs
- **THEN** the panel stays visible and the pause overlay stays hidden;
- **WHEN** pointer lock re-engages
- **THEN** the panel closes (a panel never stays stuck over live input).

#### Scenario: PANEL-6.5 — C toggle and death

- **GIVEN** an open panel
- **WHEN** the player presses C (crafting toggle) or dies
- **THEN** the panel closes (C closes instead of stacking crafting;
  death closes before respawn relocation).

#### Scenario: PANEL-6.6 — Dispose closes

- **GIVEN** an open panel
- **WHEN** `Game.dispose()` runs
- **THEN** the panel is closed/hidden before persistence flush, with no
  exception when the DOM is torn down.

### Requirement: PANEL-7 — Result persists

An applied enchantment SHALL survive a pagehide+reload through the
existing player-snapshot path (inventory components + XP).

#### Scenario: PANEL-7.1 — Reload keeps the enchanted stack (E2E)

- **GIVEN** a successfully applied offer (stack enchanted, XP/lapis spent)
- **WHEN** the page fires pagehide and reloads
- **THEN** the selected slot still carries the same enchantments and the
  XP level equals the post-apply value.

### Requirement: PANEL-8 — Original assets only

The panel SHALL introduce no Mojang-proprietary art, textures, or sounds;
offer/item visuals reuse the existing atlas-icon cell renderer.

#### Scenario: PANEL-8.1 — No new binary assets

- **GIVEN** the implemented change
- **WHEN** listing added files by extension
- **THEN** no `.png`, `.ogg`, `.mp3`, `.wav`, or font files exist among
  them.

## Error and failure behavior

- `EnchantingPanel` construction throws `Enchanting element missing: #<id>`
  when a required DOM id is absent (fail-fast, furnace parity).
- Unknown enchantment resource ids render as raw keys; rendering never
  throws on registry misses.
- All apply failure reasons (`bad_offer`, `insufficient_xp`,
  `insufficient_lapis`, `incompatible`, `empty`, null-session) map to a
  human status string; none throw out of the click handler.
- Out-of-bounds offer indices from the DOM are clamped/ignored, never
  forwarded to `session.apply`.

## Performance and resource bounds

- `render()` MUST be signature-gated: identical session/offers/XP/lapis/
  selection/status state performs zero DOM writes.
- At most 3 offer buttons + apply + close + status nodes; no per-frame
  allocation beyond one signature string.
- No timers, no animation frames, no network, no RNG calls in the panel.

## Compatibility and migration

No stored or network formats change. The enchanted stack persists as
standard `ENCHANTMENTS_COMPONENT` payload inside the existing inventory
snapshot (version 1, unchanged); XP persists in the existing experience
snapshot (version 1, unchanged). Worlds saved before this change load
unchanged; any placed enchanting table opens the panel.

## Security and integrity

- The panel performs no validation of its own: affordability display is
  advisory only; the authoritative spend check stays inside
  `session.apply` (server-truthful shape for future multiplayer).
- No `innerHTML` with dynamic content: offer/status text uses
  `textContent`; no injection surface.
- No item duplication: the panel never creates, copies, or moves stacks —
  the only mutation path is `Game.applyEnchantingOffer`, which writes the
  session-produced stack into the selected slot.

## Observability

- `#enchanting-status` text is the user signal; E2E asserts its content
  at open/select/apply/close transitions.
- `Game.isEnchantingOpen`, `Game.enchantingSessionPosition`, and
  `Game.getEnchantingSession` are the automation/observation surface.

## Verification mapping

| Requirement | Unit test | E2E / other |
|---|---|---|
| PANEL-1.1 | render lists offers (name/level/lapis) | enchanting.spec journey: open visible |
| PANEL-1.2 | — | journey setup asserts; Game unit path unchanged |
| PANEL-1.3 | empty offers render + apply disabled | — (unit) |
| PANEL-2.1 | 3 buttons with names/costs | journey asserts offer buttons |
| PANEL-2.2 | disabled flags on unaffordable | journey selects affordable offer |
| PANEL-3.1–3.3 | select/reselect/toggle/empty-block | journey clicks offer then another |
| PANEL-4.1 | delegate + success re-render | journey: real Apply click, stack/XP/lapis asserts |
| PANEL-4.2–4.4 | reason strings, no-spend | — (unit) |
| PANEL-5.1–5.2 | null-session hides | existing `EnchantingSessionGuard` suite (unchanged, must stay green) |
| PANEL-6.1–6.6 | close/hide semantics | journey close; walk-away test; focus test; dispose/death by code path (furnace-parity hunks) |
| PANEL-7.1 | — | journey reload asserts |
| PANEL-8.1 | — | file-extension audit in verification |
