# Design — Exhaustive Repository Certification Campaign

## D1. Tool stacking destroys whole piles on break (F-INV-1, HIGH)

**Root cause:** tool definitions carry `stackSize: 64` while `applyDamage` zeroes the whole
stack count on break; `Inventory.addItem` merges pristine tools into a single shared-damage
stack. Using one tool of a 2-stack destroys both.

**Fix (root cause = wrong stack semantics for durable items):**
- Every item definition with `maxDurability > 0` gets `stackSize: 1` in
  `createDefaultItemRegistry` (vanilla-parity: durable items do not stack).
- Add a registry invariant test: any definition with `maxDurability > 0` must declare
  `stackSize === 1`, so future items cannot reintroduce the family.
- Characterization updates only where tests asserted the old 64 value.

## D2. Enchantments (and other components) silently destroyed by save/load (F-INV-2, HIGH)

**Root cause:** `Inventory.snapshot()` exports only ids/counts/durability numbers; all
`StackComponentMap` data except translated hotbar damage is dropped, and `restore()` rebuilds
damage only. The purpose-built enchantment serializers have no production caller.

**Fix (additive, backward-compatible):**
- `InventorySnapshot` gains optional `slotComponents?: Array<SerializedStackComponents | null>`
  aligned with `slots`, and storage entries gain optional `components`.
- Serialized form is JSON-safe by construction (`{ id: string, value }[]` from
  `StackComponentMap.entries()`, whose values are primitives/flat bags).
- `restore()` validates strictly (array lengths, registered component ids, per-type validators)
  and returns `false` — never throws — on malformed payloads; absent field = legacy snapshot.
- Serialized components overlay the legacy durability translation per slot.
- The constructor's storage rebuild preserves component maps (`copy()`), closing the same
  family for stacks routed through it.
- Tests: round-trip with enchanted + damaged + potion-bearing stacks; corrupt-component
  rejection; legacy-snapshot (no field) restore unchanged.

## D3. Stale enchanting session can overwrite an unrelated slot (F-INV-3, MEDIUM latent)

**Root cause:** `Game.openEnchanting` captures the held stack; nothing clears
`enchantingSession` on selection change and `applyEnchantingOffer` re-checks nothing, so a
later apply writes an enchanted copy of the captured stack into whatever slot is now selected
(duplication + destruction) and spends XP/lapis for it.

**Fix:** capture the selected slot index at open; `applyEnchantingOffer` no-ops (returns null,
spends nothing) when the selection moved off that slot or the live selected stack no longer
matches the captured identity (id + count + damage + enchantments); clear the session whenever
the hotbar selection changes. Test: open → change selection → apply must return null and leave
both slots untouched.

## D4. Hotbar icons/titles never refresh after boot (F-INV-7, MEDIUM)

**Root cause:** canvases and `title` are drawn once at construction from construction-time
ids; `render()` updates counts/durability/aria but never the icon or title. Restored saves and
first-pickup-into-empty-slot both leave stale visuals.

**Fix:** track last-drawn id per slot; `render()` redraws the canvas tile and title when the
slot's item id changed. `Game.applyInitialPlayerState` calls `hotbar.render()` after restore.
Tests: jsdom canvas-double assertions via redraw bookkeeping (item id change triggers redraw),
restore path renders.

## D5. stateOverlay unbounded across sessions / silent state reset on reload (F-W-1, MEDIUM)

**Evidence:** `stateOverlay` has no cap (editOverlay caps at 10k with LRU); entries survive
unload forever within a session and are lost on reload. Change 125 explicitly scoped reload
persistence out; PARITY_MATRIX C125 remains `exact` for the mechanic, and no user-facing doc
promises crop persistence. Disposition per campaign rules: **bound it + document the genuine
non-release limitation** (full persistence of block states would touch the most critical
subsystem immediately after a READY declaration; deferred as explicit debt, not hidden).

**Fix:**
- Give `stateOverlay` the same LRU discipline as `editOverlay` (10k-chunk cap, access-order
  eviction) so long exploration sessions cannot grow it without bound.
- README Known Limitations documents session-only crop/farmland/fire-age state.
- Unit test: inserting more than the cap distinct chunk keys evicts oldest entries.

## D6. GamePersistence.pendingEdits grows without prune during normal play (F-PERS-6, MEDIUM)

**Root cause:** `pendingEdits` entries are added on every `captureChunkEdits` but pruned only
inside facade `flush()`; the periodic autosave path drains via the coordinator's own tick,
which never prunes. Entries accumulate one full overlay copy per distinct edited chunk for the
whole session.

**Fix:** `AutosaveCoordinator` gains an optional `onUnitsCommitted(keys)` hook fired after each
productive drain; the facade passes a hook that drops pendingEdits entries whose unit key left
the queue. Facade `flush()` behavior unchanged. Test: capture → coordinator tick commits →
pending copy released; failed write retains it.

## D7. Governance: contradictory lowercase alias (GOV-STATE-ALIAS)

`openspec/program-state.json` still says `002 ACTIVE` while canonical
`openspec/PROGRAM_STATE.json` says COMPLETE/terminal. An older agent reading the alias resumes
a five-month-dead change.

**Fix:** reduce the alias to a non-state redirect (canonical pointer only; no per-change
fields), and make the strengthened validator enforce that the alias carries no stale state
fields that could contradict the canonical file.

## D8. Governance: validator blind to terminal-state contradictions (GOV-VALIDATOR)

`scripts/validate-state.mjs` only understands the pre-241 interlock; it cannot detect
terminal-program inconsistencies or alias contradictions.

**Fix:** add checks — terminal coherence (`status COMPLETE` ⇔ `nextChange null` ⇔
currentChangeStatus VERIFIED), completion percentage sanity for VERIFIED changes, alias
redirect conformance. Keep existing checks green. Regression tests drive invalid synthetic
states to exit 1 via a temp-dir harness parameterization of the validator paths.

## D9. Evidence generator assigns clean verdicts mechanically (AUDIT-EVIDENCE)

`scripts/gen-file-audit.mjs` writes `findings:'none'/status:'audited'/integration:'integrated'`
from path prefixes.

**Fix:** rewrite it as an inventory generator: emits one row per tracked file with
`status: 'pending'` and empty evidence fields, plus reviewed SHA; verdict fields are populated
only by human/agent review (this campaign's `file-audit-manifest.json`). Add
`scripts/validate-file-audit.mjs` enforcing bijection with `git ls-files`, no pending rows in
published manifests, and refusing auto-assigned clean verdicts. The old generator output is
superseded; historical manifest kept untouched.

## D10. Documentation drift (README)

Verified corrections: Node 20+; IndexedDB/GamePersistence authority with localStorage retained
for settings/keybindings/accessibility; hostile mobs + touch/gamepad support present; greedy
opaque merging implemented behind the disabled worker path while shipped meshing stays
face-culled; Shift=sneak / Ctrl=sprint control table fix; architecture tree updated.

## D11. E2E assertion that cannot fail (chunk streaming)

Replace `afterLoaded >= beforeLoaded` with real streaming proof: walk forward, require at least
one observed `pendingGeneration > 0` sample during movement AND queues fully drained afterwards
via the E2E seam, proving new chunks were actually generated (not just counted).
